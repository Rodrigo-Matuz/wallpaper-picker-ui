"""Replay hosted observations, never host /proc or native calls.

JSON fixtures are byte-identical hosted reports. They contain bounded parsed
mount descriptions, NOT raw mountinfo/status/environ/cmdline. The /proc fields
below are explicitly reconstructed test input; absent fields are not evidence.
"""

import hashlib
import json
import os
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

import feasibility

from diagnostics import identity_diagnostic
from helpers import mounted_identity

FIXTURES = Path(__file__).parent / "fixtures"
REPORT_DIGESTS = {
    "readonly": "17aa331a9d1520932a5cc73ba2d03a4e7baf34e00e5aac2ca80be9ba81f53945",
    "writable": "e92d254e89f4ca3c46b2a50b589d780ce0d1c02b080d1484def2800a3c55c732",
}


def capture(case):
    payload = (FIXTURES / f"run-37783877938-{case}.json.txt").read_bytes()
    if hashlib.sha256(payload).hexdigest() != REPORT_DIGESTS[case]:
        raise AssertionError("Hosted report bytes changed")
    return json.loads(payload)


def mount_row(mount):
    """Reconstruct only the recorded mountpoint/type, using inert row metadata."""
    point = mount["mountpoint"]
    for value, escaped in (("\\", r"\134"), (" ", r"\040"), ("\t", r"\011"), ("\n", r"\012")):
        point = point.replace(value, escaped)
    return f"31 22 0:44 / {point} ro,nosuid - {mount['filesystem']} fixture-source ro"


class CapturedIdentityTests(unittest.TestCase):
    def test_captured_readonly_and_writable_leaders_correlate_exact_filename_subtype(self):
        for case in REPORT_DIGESTS:
            report = capture(case)
            scan = report["mountedIdentityDiagnostics"]["lastScan"]
            leader = next(item for item in scan["processes"] if item["pid"] == report["launchPid"])
            with self.subTest(case=case):
                self.assertEqual(scan["session"], leader["pid"])
                self.assertEqual(scan["uid"], 1001)
                self.assertEqual(leader["uid"], 1001)
                self.assertEqual(leader["reason"], "no-matching-fuse-mount")
                self.assertEqual(leader["scopedMounts"][0]["filesystem"], "fuse.Wallpaper.AppImage")
                text = "\n".join(mount_row(mount) for mount in leader["scopedMounts"])
                args = (leader["environment"], leader["exe"], text,
                        report["imageBefore"]["path"], leader["environment"]["TMPDIR"])
                self.assertTrue(mounted_identity(*args))
                self.assertEqual(identity_diagnostic(*args)["reason"], "correlated")
                # Correlation never rewrites the actual failed hosted outcome.
                self.assertEqual(report["status"], "failed")
                self.assertFalse(report["acceptancePassed"])
                self.assertEqual(report["nativeUpdaterInvocations"], 0)

    def test_subtype_is_exact_case_sensitive_image_filename_not_fuse_wildcard(self):
        report = capture("writable")
        leader = report["mountedIdentityDiagnostics"]["lastScan"]["processes"][0]
        env, exe = leader["environment"], leader["exe"]
        mount = leader["scopedMounts"][0]
        for filesystem in ("fuse.Other.AppImage", "fuse.wallpaper.appimage", "FUSE.Wallpaper.AppImage",
                           "fuse.Wallpaper.AppImage.extra", "fuse.squashfuse", "fuse.sshfs", "ext4"):
            with self.subTest(filesystem=filesystem):
                args = (env, exe, mount_row({**mount, "filesystem": filesystem}),
                        report["imageBefore"]["path"], env["TMPDIR"])
                self.assertFalse(mounted_identity(*args))
                self.assertEqual(identity_diagnostic(*args)["reason"], "no-matching-fuse-mount")
        other = env["APPIMAGE"].replace("Wallpaper.AppImage", "Other.AppImage")
        args = ({**env, "APPIMAGE": other}, exe, mount_row(mount), other, env["TMPDIR"])
        self.assertFalse(mounted_identity(*args))
        # The rule derives from the expected image, not a hardcoded product label.
        args = ({**env, "APPIMAGE": other}, exe,
                mount_row({**mount, "filesystem": "fuse.Other.AppImage"}), other, env["TMPDIR"])
        self.assertTrue(mounted_identity(*args))
        self.assertEqual(identity_diagnostic(*args)["reason"], "correlated")

    def test_prior_generic_fuse_and_appimage_types_remain_supported(self):
        report = capture("readonly")
        leader = report["mountedIdentityDiagnostics"]["lastScan"]["processes"][0]
        env = leader["environment"]
        for filesystem in ("fuse", "fuse.AppImage", "fuse.appimage"):
            with self.subTest(filesystem=filesystem):
                args = (env, leader["exe"],
                        mount_row({**leader["scopedMounts"][0], "filesystem": filesystem}),
                        report["imageBefore"]["path"], env["TMPDIR"])
                self.assertTrue(mounted_identity(*args))
                self.assertEqual(identity_diagnostic(*args)["reason"], "correlated")

    def test_filename_subtype_does_not_override_launch_path_or_mount_guards(self):
        report = capture("writable")
        leader = report["mountedIdentityDiagnostics"]["lastScan"]["processes"][0]
        env, exe, mount = leader["environment"], leader["exe"], leader["scopedMounts"][0]
        foreign = "/foreign/.mount_Wallpaper"
        escaped = env["TMPDIR"] + "/../foreign/.mount_Wallpaper"
        variants = [
            ({**env, "APPIMAGE": "/foreign/Wallpaper.AppImage"}, exe, mount, "appimage-mismatch"),
            (env, exe + ".other", mount, "executable-mismatch"),
            (env, exe, {**mount, "mountpoint": foreign}, "no-matching-fuse-mount"),
            (env, exe, {**mount, "mountpoint": env["APPDIR"] + ".other"}, "no-matching-fuse-mount"),
            ({**env, "APPDIR": foreign}, foreign + "/usr/bin/wallpaper-picker-ui",
             {**mount, "mountpoint": foreign}, "appdir-outside-task-tmp"),
            ({**env, "APPDIR": escaped}, escaped + "/usr/bin/wallpaper-picker-ui",
             {**mount, "mountpoint": escaped}, "appdir-outside-task-tmp"),
        ]
        for observed_env, observed_exe, observed_mount, reason in variants:
            with self.subTest(reason=reason, mountpoint=observed_mount["mountpoint"]):
                args = (observed_env, observed_exe, mount_row(observed_mount),
                        report["imageBefore"]["path"], env["TMPDIR"])
                self.assertFalse(mounted_identity(*args))
                diagnostic = identity_diagnostic(*args)
                self.assertEqual(diagnostic["reason"], reason)
                self.assertNotIn("/foreign/", json.dumps(diagnostic["scopedMounts"]))

    def test_mountinfo_escaped_paths_decode_once_and_still_require_exact_appdir(self):
        report = capture("readonly")
        leader = report["mountedIdentityDiagnostics"]["lastScan"]["processes"][0]
        env = leader["environment"]
        for suffix in (" space", "\t", "\n", "\\", r"\040"):
            with self.subTest(suffix=suffix):
                appdir = env["APPDIR"] + suffix
                text = mount_row({**leader["scopedMounts"][0], "mountpoint": appdir})
                args = ({**env, "APPDIR": appdir}, appdir + "/usr/bin/wallpaper-picker-ui",
                        text, report["imageBefore"]["path"], env["TMPDIR"])
                self.assertTrue(mounted_identity(*args))
                self.assertEqual(identity_diagnostic(*args)["reason"], "correlated")
                wrong = ({**env, "APPDIR": appdir + ".other"},
                         appdir + ".other/usr/bin/wallpaper-picker-ui", *args[2:])
                self.assertFalse(mounted_identity(*wrong))
                self.assertEqual(identity_diagnostic(*wrong)["reason"], "no-matching-fuse-mount")


class CapturedOwnedProcessTests(unittest.TestCase):
    def replay(self, report, scan_name="lastScan", uid_slots=None, sessions=None):
        scan = report["mountedIdentityDiagnostics"][scan_name]
        root = os.environ.get("TMPDIR") or os.environ.get("RUNNER_TEMP")
        self.assertIsNotNone(root, "Set task-owned TMPDIR or RUNNER_TEMP")
        with tempfile.TemporaryDirectory(dir=root) as temporary:
            proc = Path(temporary)
            exes = {}
            for item in scan["processes"]:
                entry = proc / str(item["pid"])
                entry.mkdir()
                uids = uid_slots or [str(item["uid"])] * 4
                (entry / "status").write_text(
                    f"State:\t{item['state']}\nPPid:\t{item['ppid']}\nUid:\t{' '.join(uids)}\n"
                )
                (entry / "environ").write_bytes(
                    "\0".join(f"{key}={value}" for key, value in item["environment"].items()).encode()
                )
                (entry / "mountinfo").write_text(
                    "\n".join(mount_row(mount) for mount in item["scopedMounts"])
                )
                (entry / "cmdline").write_bytes(b"reconstructed-fixture-not-captured\0")
                exes[str(entry / "exe")] = item["exe"]
            diagnostics = {}
            with ExitStack() as stack:
                stack.enter_context(patch("os.getuid", return_value=scan["uid"], create=True))
                sid = stack.enter_context(patch("os.getsid", create=True))
                sid.return_value = scan["session"]
                if sessions is not None:
                    sid.side_effect = sessions
                stack.enter_context(patch("os.readlink", side_effect=lambda path: exes[str(path)]))
                snapshot = stack.enter_context(patch.object(
                    feasibility, "snapshot", return_value={"fixtureOnly": True, "notCaptured": True}
                ))
                # A fixture replay must never progress to native operations.
                stack.enter_context(patch("subprocess.Popen", side_effect=AssertionError("native launch")))
                stack.enter_context(patch("socket.socket", side_effect=AssertionError("socket")))
                result = feasibility.owned_processes(
                    scan["session"], report["imageBefore"]["path"],
                    scan["processes"][0]["environment"]["TMPDIR"],
                    diagnostics=diagnostics, proc_root=proc,
                )
                return result, diagnostics, snapshot.call_args_list

    def test_owned_replay_selects_only_captured_leader_not_webkit_or_startup_runtime(self):
        for case in REPORT_DIGESTS:
            report = capture(case)
            with self.subTest(case=case):
                result, diagnostics, snapshots = self.replay(report)
                self.assertEqual([item["pid"] for item in result], [report["launchPid"]])
                self.assertEqual([item["reason"] for item in diagnostics["processes"]],
                                 ["correlated", "executable-mismatch", "executable-mismatch"])
                self.assertEqual([call.args[0] for call in snapshots], [Path(result[0]["exe"])])
                result, diagnostics, snapshots = self.replay(report, "firstScan")
                self.assertEqual(result, [])
                self.assertEqual(diagnostics["processes"][0]["reason"], "appimage-mismatch")
                self.assertEqual(snapshots, [])
                self.assertFalse(report["acceptancePassed"])
                self.assertEqual(report["nativeUpdaterInvocations"], 0)

    def test_filename_subtype_cannot_override_any_uid_slot_or_foreign_session(self):
        report = capture("writable")
        for slot in range(4):
            uids = ["1001"] * 4
            uids[slot] = "2002"
            with self.subTest(slot=slot):
                result, diagnostics, snapshots = self.replay(report, uid_slots=uids)
                self.assertEqual(result, [])
                self.assertEqual(snapshots, [])
                for item in diagnostics["processes"]:
                    self.assertEqual(item["reason"], "uid-mismatch-or-unavailable")
                    self.assertNotIn("environment", item)
                    self.assertNotIn("exe", item)
                    self.assertNotIn("scopedMounts", item)
        result, diagnostics, snapshots = self.replay(report, sessions=lambda pid: 999)
        self.assertEqual(result, [])
        self.assertEqual(diagnostics["processes"], [])
        self.assertEqual(snapshots, [])

    def test_filename_subtype_cannot_override_session_recheck_after_sensitive_reads(self):
        report = capture("readonly")
        session = report["launchPid"]
        result, diagnostics, snapshots = self.replay(
            report, sessions=[session, session, 999, 999, 999]
        )
        self.assertEqual(result, [])
        self.assertEqual(diagnostics["processes"][0]["reason"], "session-changed")
        self.assertEqual(len(snapshots), 1)


if __name__ == "__main__":
    unittest.main()
