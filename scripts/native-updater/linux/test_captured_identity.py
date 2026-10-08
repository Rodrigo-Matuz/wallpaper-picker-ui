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
from itertools import permutations
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
    def assert_reasons(self, diagnostics, expected):
        processes = diagnostics["processes"]
        pids = [item["pid"] for item in processes]
        self.assertEqual(len(pids), len(set(pids)), "Duplicate diagnostic PID")
        self.assertEqual(set(pids), set(expected), "Incomplete diagnostic PID set")
        self.assertEqual({item["pid"]: item["reason"] for item in processes}, expected)

    def replay(self, report, scan_name="lastScan", uid_slots=None, sessions=None, order=None,
               events=None):
        """Enumerate inert entries; all injected ownership calls are PID-specific."""
        scan = report["mountedIdentityDiagnostics"][scan_name]
        events = [] if events is None else events
        pids = [item["pid"] for item in scan["processes"]]
        self.assertEqual(len(pids), len(set(pids)), "Duplicate captured PID")
        if sessions is None:
            # Both captures have one admitted lastScan leader; firstScan is
            # startup runtime only. Rejected children never reach a final call.
            sessions = {
                pid: [scan["session"]] * (
                    3 if scan_name == "lastScan" and pid == report["launchPid"] else 2
                ) for pid in pids
            }
        self.assertEqual(set(sessions), set(pids), "Session queues must cover exactly this scan")
        queues = {pid: list(values) for pid, values in sessions.items()}
        leader = next(item for item in scan["processes"] if item["pid"] == report["launchPid"])

        def getsid(pid):
            self.assertIn(pid, queues, "Unknown session PID")
            self.assertTrue(queues[pid], f"Excess session call for PID {pid}")
            value = queues[pid].pop(0)
            events.append(("session", pid, value))
            return value

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
            original_read = feasibility.read_bounded

            def read(path, limit):
                self.assertEqual(path.parent.parent, proc, "Read outside inert proc fixture")
                events.append(("read", int(path.parent.name), path.name))
                return original_read(path, limit)

            def readlink(path):
                events.append(("exe", int(path.parent.name), exes[str(path)]))
                return exes[str(path)]

            def executable_snapshot(path):
                events.append(("snapshot", str(path)))
                return {"fixtureOnly": True, "notCaptured": True}

            with ExitStack() as stack:
                if order is not None:
                    self.assertEqual(set(order), set(pids))
                    self.assertEqual(len(order), len(pids))
                    original_iterdir = Path.iterdir

                    def fixture_iterdir(path):
                        if path == proc:
                            return iter(proc / str(pid) for pid in order)
                        return original_iterdir(path)

                    # Change only enumeration of this actual inert proc root.
                    stack.enter_context(patch.object(Path, "iterdir", fixture_iterdir))
                stack.enter_context(patch("os.getuid", return_value=scan["uid"], create=True))
                stack.enter_context(patch("os.getsid", side_effect=getsid, create=True))
                stack.enter_context(patch.object(feasibility, "read_bounded", side_effect=read))
                stack.enter_context(patch("os.readlink", side_effect=readlink))
                snapshot = stack.enter_context(patch.object(
                    feasibility, "snapshot", side_effect=executable_snapshot
                ))
                # A fixture replay must never progress to native operations.
                stack.enter_context(patch("subprocess.Popen", side_effect=AssertionError("native launch")))
                stack.enter_context(patch("socket.socket", side_effect=AssertionError("socket")))
                result = feasibility.owned_processes(
                    scan["session"], report["imageBefore"]["path"],
                    leader["environment"]["TMPDIR"],
                    diagnostics=diagnostics, proc_root=proc,
                )
                self.assertEqual(queues, {pid: [] for pid in pids}, "Unconsumed session calls")
                return result, diagnostics, snapshot.call_args_list

    def test_owned_replay_selects_only_captured_leader_not_webkit_or_startup_runtime(self):
        for case in REPORT_DIGESTS:
            report = capture(case)
            scans = report["mountedIdentityDiagnostics"]
            pids = [item["pid"] for item in scans["lastScan"]["processes"]]
            leader = next(item for item in scans["lastScan"]["processes"]
                          if item["pid"] == report["launchPid"])
            expected = {pid: "correlated" if pid == leader["pid"] else "executable-mismatch"
                        for pid in pids}
            startup_pids = [item["pid"] for item in scans["firstScan"]["processes"]]
            self.assertEqual(startup_pids, [report["launchPid"]])
            for order in permutations(pids):
                with self.subTest(case=case, order=order):
                    result, diagnostics, snapshots = self.replay(report, order=order)
                    self.assertEqual([item["pid"] for item in result], [report["launchPid"]])
                    self.assert_reasons(diagnostics, expected)
                    self.assertEqual(result[0]["exe"], leader["exe"])
                    self.assertEqual([call.args for call in snapshots], [(Path(leader["exe"]),)])
                    result, diagnostics, snapshots = self.replay(
                        report, "firstScan", order=startup_pids
                    )
                    self.assertEqual(result, [])
                    self.assert_reasons(
                        diagnostics, {pid: "appimage-mismatch" for pid in startup_pids}
                    )
                    self.assertEqual(snapshots, [])
                    self.assertFalse(report["acceptancePassed"])
                    self.assertEqual(report["nativeUpdaterInvocations"], 0)

    def test_filename_subtype_cannot_override_any_uid_slot_or_foreign_session(self):
        report = capture("writable")
        scan = report["mountedIdentityDiagnostics"]["lastScan"]
        pids = [item["pid"] for item in scan["processes"]]
        for slot in range(4):
            uids = ["1001"] * 4
            uids[slot] = "2002"
            with self.subTest(slot=slot):
                events = []
                result, diagnostics, snapshots = self.replay(
                    report, uid_slots=uids,
                    sessions={pid: [scan["session"]] for pid in pids}, events=events
                )
                self.assertEqual(result, [])
                self.assertEqual(snapshots, [])
                self.assert_reasons(
                    diagnostics, {pid: "uid-mismatch-or-unavailable" for pid in pids}
                )
                self.assertEqual({event[0] for event in events}, {"session", "read"})
                self.assertEqual(
                    {event[2] for event in events if event[0] == "read"}, {"status"}
                )
                for item in diagnostics["processes"]:
                    self.assertNotIn("environment", item)
                    self.assertNotIn("exe", item)
                    self.assertNotIn("scopedMounts", item)
        events = []
        result, diagnostics, snapshots = self.replay(
            report, sessions={pid: [999] for pid in pids}, events=events
        )
        self.assertEqual(result, [])
        self.assertEqual(diagnostics["processes"], [])
        self.assertEqual(snapshots, [])
        self.assertEqual({event[0] for event in events}, {"session"})

    def test_filename_subtype_cannot_override_session_recheck_after_sensitive_reads(self):
        for case in REPORT_DIGESTS:
            report = capture(case)
            session = report["launchPid"]
            processes = report["mountedIdentityDiagnostics"]["lastScan"]["processes"]
            pids = [item["pid"] for item in processes]
            leader = next(item for item in processes if item["pid"] == session)
            sessions = {pid: [session, session, 999] if pid == session else [session, session]
                        for pid in pids}
            expected = {pid: "session-changed" if pid == session else "executable-mismatch"
                        for pid in pids}
            for order in permutations(pids):
                with self.subTest(case=case, order=order):
                    events = []
                    result, diagnostics, snapshots = self.replay(
                        report, sessions=sessions, order=order, events=events
                    )
                    self.assertEqual(result, [])
                    self.assert_reasons(diagnostics, expected)
                    self.assertEqual([call.args for call in snapshots], [(Path(leader["exe"]),)])
                    leader_events = [event for event in events
                                     if event[0] == "snapshot" or event[1] == session]
                    self.assertEqual(leader_events, [
                        ("session", session, session),
                        ("read", session, "status"),
                        ("session", session, session),
                        ("read", session, "environ"),
                        ("exe", session, leader["exe"]),
                        ("read", session, "mountinfo"),
                        ("snapshot", str(Path(leader["exe"]))),
                        ("read", session, "cmdline"),
                        ("session", session, 999),
                    ])


if __name__ == "__main__":
    unittest.main()
