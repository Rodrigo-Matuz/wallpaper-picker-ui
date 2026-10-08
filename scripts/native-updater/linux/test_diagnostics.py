"""Pure fixture /proc only; never inspect host processes or launch native code."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import feasibility


class MountedDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        # Explicit injected scratch/hosted runner root, never an OS temp fallback.
        root = os.environ.get("TMPDIR") or os.environ.get("RUNNER_TEMP")
        self.assertIsNotNone(root, "Set TMPDIR (local scratch) or RUNNER_TEMP (hosted pure tests)")
        self.fixture = tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(self.fixture.cleanup)
        self.proc = Path(self.fixture.name)
        self.image = "/run/case/app/Wallpaper.AppImage"
        self.tmp = "/run/case/tmp"
        self.appdir = self.tmp + "/.mount_Wall12"

    def process(self, pid=101, uid=1001, appdir=None, exe=None, mounts=None):
        appdir = self.appdir if appdir is None else appdir
        entry = self.proc / str(pid)
        entry.mkdir()
        (entry / "status").write_text(
            f"Name:\tfixture\nState:\tS (sleeping)\nPPid:\t1\nUid:\t{uid}\t{uid}\t{uid}\t{uid}\n"
        )
        (entry / "environ").write_bytes(
            f"APPIMAGE={self.image}\0APPDIR={appdir}\0TMPDIR={self.tmp}\0SECRET=DO-NOT-LOG\0".encode()
        )
        (entry / "mountinfo").write_text(
            mounts
            if mounts is not None
            else f"31 22 0:44 / {appdir} ro,nosuid - fuse.AppImage Wallpaper.AppImage ro\n"
        )
        (entry / "cmdline").write_bytes(b"fixture\0")
        return entry, exe or appdir + "/usr/bin/wallpaper-picker-ui"

    def scan(self, entries):
        diagnostics = {}
        exes = {str(entry / "exe"): exe for entry, exe in entries}
        with (
            patch("pathlib.Path.iterdir", return_value=iter([entry for entry, _ in entries])),
            patch("os.getsid", return_value=101, create=True),
            patch("os.getuid", return_value=1001, create=True),
            patch("os.readlink", side_effect=lambda path: exes[str(path)]),
            patch.object(feasibility, "snapshot", return_value={"sha256": "fixture"}),
        ):
            result = feasibility.owned_processes(
                101, self.image, self.tmp, diagnostics=diagnostics, proc_root=self.proc
            )
        return result, diagnostics

    def test_enumeration_failure_retains_errno_without_external_paths(self):
        from unittest.mock import Mock

        app = Mock(pid=101)
        app.poll.return_value = None
        evidence = {}
        with (
            patch("os.getuid", return_value=1001, create=True),
            patch("pathlib.Path.iterdir", side_effect=PermissionError(13, "DO-NOT-LOG")),
            patch("time.monotonic", return_value=0),
        ):
            with self.assertRaises(PermissionError):
                feasibility.wait_for_mounted_identity(app, self.image, self.tmp, evidence)
        observed = evidence["mountedIdentityDiagnostics"]["lastScan"]
        self.assertEqual(
            observed["enumerationError"], {"errorType": "PermissionError", "errno": 13}
        )
        self.assertNotIn("DO-NOT-LOG", json.dumps(evidence))

    def test_foreign_session_is_skipped_before_any_file_detail(self):
        entry, _ = self.process()
        diagnostics = {}
        with (
            patch("os.getsid", return_value=999, create=True),
            patch("os.getuid", return_value=1001, create=True),
            patch.object(feasibility, "read_bounded", side_effect=AssertionError("foreign detail")),
        ):
            self.assertEqual(
                feasibility.owned_processes(
                    101, self.image, self.tmp, diagnostics=diagnostics, proc_root=self.proc
                ),
                [],
            )
        self.assertEqual(diagnostics["processes"], [])

    def test_foreign_or_missing_uid_never_reads_environment_exe_or_mounts(self):
        entry, _ = self.process(uid=2002)
        for status in ("Uid:\t2002 2002 2002 2002\n", "State:\tS\n", "Uid:\t1001\n"):
            (entry / "status").write_text(status)
            diagnostics = {}
            with (
                self.subTest(status=status),
                patch("os.getsid", return_value=101, create=True),
                patch("os.getuid", return_value=1001, create=True),
                patch.object(feasibility, "read_bounded", wraps=feasibility.read_bounded) as read,
                patch("os.readlink", side_effect=AssertionError("unowned exe")),
            ):
                self.assertEqual(
                    feasibility.owned_processes(
                        101, self.image, self.tmp, diagnostics=diagnostics, proc_root=self.proc
                    ),
                    [],
                )
                self.assertEqual([call.args[0].name for call in read.call_args_list], ["status"])
                self.assertEqual(
                    diagnostics["processes"][0]["reason"], "uid-mismatch-or-unavailable"
                )

    def test_proc_field_size_limit_is_reported_at_owned_stage(self):
        from diagnostics import MAX_ENVIRONMENT_BYTES

        entry, exe = self.process()
        (entry / "environ").write_bytes(b"x" * (MAX_ENVIRONMENT_BYTES + 1))
        result, diagnostics = self.scan([(entry, exe)])
        self.assertEqual(result, [])
        self.assertEqual(diagnostics["processes"][0]["stage"], "environ")
        self.assertEqual(diagnostics["processes"][0]["reason"], "proc-field-size-limit")
        self.assertNotIn("environment", diagnostics["processes"][0])

    def test_bounded_reader_requests_only_limit_plus_one(self):
        from unittest.mock import MagicMock

        path = MagicMock()
        stream = MagicMock()
        stream.__enter__.return_value = stream
        stream.read.return_value = b"abcde"
        path.open.return_value = stream
        with self.assertRaisesRegex(ValueError, "proc-field-size-limit"):
            feasibility.read_bounded(path, 4)
        path.open.assert_called_once_with("rb")
        stream.read.assert_called_once_with(5)

    def test_diagnostic_reasons_agree_with_strict_guard_for_fixture_variants(self):
        from diagnostics import MAX_MOUNTS, MAX_TEXT, identity_diagnostic
        from helpers import mounted_identity

        env = {"APPIMAGE": self.image, "APPDIR": self.appdir, "TMPDIR": self.tmp}
        exe = self.appdir + "/usr/bin/wallpaper-picker-ui"
        mount = f"31 22 0:44 / {self.appdir} ro - fuse.AppImage image ro"
        cases = [
            (env, exe, mount, "correlated"),
            ({**env, "APPIMAGE": "/wrong"}, exe, mount, "appimage-mismatch"),
            ({"APPIMAGE": self.image}, exe, mount, "appdir-missing"),
            ({**env, "APPDIR": "/tmp/foreign"}, exe, mount, "appdir-outside-task-tmp"),
            (env, exe + ".other", mount, "executable-mismatch"),
            (env, exe, mount.replace("fuse.AppImage", "ext4"), "no-matching-fuse-mount"),
            (env, exe, "31 22 0:44 / broken ro extra extra extra -", "no-matching-fuse-mount"),
            (env, exe, "", "no-matching-fuse-mount"),
        ]
        for observed_env, observed_exe, text, reason in cases:
            with self.subTest(reason=reason):
                observed = identity_diagnostic(
                    observed_env, observed_exe, text, self.image, self.tmp
                )
                self.assertEqual(observed["reason"], reason)
                self.assertEqual(
                    reason == "correlated",
                    mounted_identity(observed_env, observed_exe, text, self.image, self.tmp),
                )
        many = "\n".join([mount] * (MAX_MOUNTS + 2))
        bounded = identity_diagnostic(
            {**env, "TMPDIR": "x" * (MAX_TEXT + 1)}, exe, many, self.image, self.tmp
        )
        self.assertEqual(len(bounded["scopedMounts"]), MAX_MOUNTS)
        self.assertEqual(bounded["scopedMountsOmitted"], 2)
        self.assertEqual(len(bounded["environment"]["TMPDIR"]), MAX_TEXT)
        escaped_dir = self.appdir + " space"
        escaped_mount = mount.replace(self.appdir, escaped_dir.replace(" ", r"\040"))
        escaped_env = {**env, "APPDIR": escaped_dir}
        self.assertEqual(
            identity_diagnostic(
                escaped_env,
                escaped_dir + "/usr/bin/wallpaper-picker-ui",
                escaped_mount,
                self.image,
                self.tmp,
            )["reason"],
            "correlated",
        )

    def test_poll_leader_exit_remains_failure_with_retained_owned_evidence(self):
        from unittest.mock import Mock

        app = Mock(pid=101)
        app.poll.return_value = 7
        evidence = {}
        with (
            patch.object(feasibility, "owned_processes", return_value=[]),
            patch("time.monotonic", return_value=0),
            patch("time.sleep", side_effect=AssertionError("should fail immediately")),
        ):
            with self.assertRaisesRegex(RuntimeError, "before mounted identity: 7"):
                feasibility.wait_for_mounted_identity(app, self.image, self.tmp, evidence)
        self.assertEqual(evidence["mountedIdentityDiagnostics"]["lastScan"]["leaderReturncode"], 7)
        self.assertNotIn("mountedProcesses", evidence)

    def test_poll_correlated_identity_does_not_grant_acceptance(self):
        from unittest.mock import Mock

        app = Mock(pid=101)
        evidence = {"acceptancePassed": False, "nativeUpdaterInvocations": 0}
        with (
            patch.object(feasibility, "owned_processes", return_value=[{"pid": 101}]),
            patch("time.monotonic", return_value=0),
        ):
            feasibility.wait_for_mounted_identity(app, self.image, self.tmp, evidence)
        self.assertEqual(evidence["mountedProcesses"], [{"pid": 101}])
        self.assertFalse(evidence["acceptancePassed"])
        self.assertEqual(evidence["nativeUpdaterInvocations"], 0)

    def test_session_change_after_uid_check_prevents_sensitive_reads(self):
        entry, _ = self.process()
        diagnostics = {}
        with (
            patch("os.getsid", side_effect=[101, 999], create=True),
            patch("os.getuid", return_value=1001, create=True),
            patch.object(feasibility, "read_bounded", wraps=feasibility.read_bounded) as read,
            patch("os.readlink", side_effect=AssertionError("foreign exe read")),
        ):
            self.assertEqual(
                feasibility.owned_processes(
                    101, self.image, self.tmp, diagnostics=diagnostics, proc_root=self.proc
                ),
                [],
            )
        self.assertEqual([call.args[0].name for call in read.call_args_list], ["status"])
        self.assertEqual(diagnostics["processes"][0]["reason"], "session-changed")

    def test_diagnostic_cap_does_not_hide_a_later_strictly_correlated_process(self):
        entries = [
            self.process(pid=pid, exe=self.appdir + "/not-native") for pid in range(101, 134)
        ]
        entries.append(self.process(pid=134))
        result, diagnostics = self.scan(entries)
        self.assertEqual([item["pid"] for item in result], [134])
        self.assertEqual(len(diagnostics["processes"]), 32)
        self.assertEqual(diagnostics["ownedOmitted"], 2)

    def test_exe_read_error_preserves_allowlisted_environment_and_errno(self):
        entry, _ = self.process()
        diagnostics = {}
        with (
            patch("os.getsid", return_value=101, create=True),
            patch("os.getuid", return_value=1001, create=True),
            patch("os.readlink", side_effect=PermissionError(13, "SECRET-PATH")),
        ):
            result = feasibility.owned_processes(
                101, self.image, self.tmp, diagnostics=diagnostics, proc_root=self.proc
            )
        self.assertEqual(result, [])
        item = diagnostics["processes"][0]
        self.assertEqual(item["stage"], "exe")
        self.assertEqual(item["errno"], 13)
        self.assertEqual(item["environment"]["APPIMAGE"], self.image)
        self.assertNotIn("SECRET", json.dumps(diagnostics))

    def test_poll_timeout_retains_first_and_last_scans_before_cleanup(self):
        from unittest.mock import Mock

        self.assertTrue(
            callable(getattr(feasibility, "wait_for_mounted_identity", None)),
            "bounded timeout evidence collector missing",
        )
        app = Mock(pid=101)
        app.poll.return_value = None
        evidence = {"acceptancePassed": False, "nativeUpdaterInvocations": 0}

        def rejected(session, image, temporary_root, diagnostics):
            diagnostics.update({"processes": [{"pid": 101, "reason": "executable-mismatch"}]})
            return []

        with (
            patch.object(feasibility, "owned_processes", side_effect=rejected),
            patch("time.monotonic", side_effect=[0, 0, 1, 46]),
            patch("time.sleep") as sleep,
        ):
            with self.assertRaisesRegex(TimeoutError, "No task-owned correlated"):
                feasibility.wait_for_mounted_identity(app, self.image, self.tmp, evidence)
        observed = evidence["mountedIdentityDiagnostics"]
        self.assertEqual(observed["scanCount"], 2)
        self.assertEqual(observed["firstScan"]["processes"][0]["reason"], "executable-mismatch")
        self.assertEqual(observed["lastScan"]["leaderReturncode"], None)
        self.assertEqual(sleep.call_count, 2)
        self.assertNotIn("mountedProcesses", evidence)
        self.assertFalse(evidence["acceptancePassed"])
        self.assertEqual(evidence["nativeUpdaterInvocations"], 0)

    def test_rejected_owned_process_records_reason_without_secret_or_external_mounts(self):
        entry, exe = self.process(exe=self.appdir + "/wallpaper-picker-ui")
        with (entry / "mountinfo").open("a") as stream:
            stream.write("32 22 0:45 / /foreign/mount ro - fuse.AppImage other ro\n")
        result, diagnostics = self.scan([(entry, exe)])
        self.assertEqual(result, [])
        observed = diagnostics["processes"][0]
        self.assertEqual(observed["reason"], "executable-mismatch")
        self.assertEqual(observed["pid"], 101)
        self.assertEqual(observed["uid"], 1001)
        self.assertEqual(observed["state"], "S")
        self.assertEqual(observed["exe"], exe)
        self.assertEqual(observed["environment"]["APPDIR"], self.appdir)
        self.assertEqual(len(observed["scopedMounts"]), 1)
        self.assertNotIn("SECRET", json.dumps(diagnostics))
        self.assertNotIn("DO-NOT-LOG", json.dumps(diagnostics))
        self.assertNotIn("foreign", json.dumps(diagnostics))


if __name__ == "__main__":
    unittest.main()
