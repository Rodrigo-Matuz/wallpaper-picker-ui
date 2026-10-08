"""Pure tests: no subprocess, AppImage execution, socket or native updater."""

import copy
import unittest

import helpers

ROOT = "/home/runner/work/_temp"


def manifest_fixture():
    case = ROOT + "/native-updater-acceptance/linux-writable"
    result = {
        "schema": 1,
        "repository": "Rodrigo-Matuz/wallpaper-picker-ui",
        "target": "linux-x86_64-appimage",
        "caseRoot": case,
    }
    for key, version in (("baseline", "3.6.0"), ("candidate", "3.6.1")):
        name = f"Wallpaper.Picker.UI_{version}_amd64.AppImage"
        result[key] = {
            "version": version,
            "target": result["target"],
            "assetName": name,
            "artifactPath": case + "/" + key + "-" + name,
            "sha256": ("a" if key == "baseline" else "b") * 64,
            "size": 100,
            "sha256AndSizeVerified": True,
            "signature": "encoded-published-signature",
            "url": f"https://github.com/{result['repository']}/releases/download/v{version}/{name}",
        }
    return result


class GuardTests(unittest.TestCase):
    def test_release_automation_is_explicit_and_isolated_from_host_environment(self):
        self.assertTrue(
            callable(getattr(helpers, "launch_environment", None)),
            "isolated automation environment missing",
        )
        env = helpers.launch_environment("/run/case")
        self.assertEqual(env["TAURI_WEBVIEW_AUTOMATION"], "true")
        for key, directory in (
            ("HOME", "home"),
            ("XDG_CONFIG_HOME", "config"),
            ("XDG_DATA_HOME", "data"),
            ("XDG_CACHE_HOME", "cache"),
            ("XDG_RUNTIME_DIR", "runtime"),
            ("TMPDIR", "tmp"),
        ):
            self.assertEqual(env[key], "/run/case/" + directory)
        for key in (
            "LD_PRELOAD",
            "APPDIR",
            "APPIMAGE",
            "DISPLAY",
            "GITHUB_TOKEN",
            "WEBKIT_INJECTED_BUNDLE_PATH",
            "WEBKIT_EXEC_PATH",
        ):
            self.assertNotIn(key, env)

    def test_runner_root_cannot_normalize_to_filesystem_root_or_hide_components(self):
        env = dict(
            GITHUB_ACTIONS="true",
            RUNNER_ENVIRONMENT="github-hosted",
            RUNNER_OS="Linux",
            WALLPAPER_PICKER_NATIVE_ACCEPTANCE="1",
        )
        for root in ("//", "/./", "/runner/.", "/runner//tmp", "/runner/", "/runner/\0tmp"):
            with self.subTest(root=root), self.assertRaises(ValueError):
                helpers.assert_guard({**env, "RUNNER_TEMP": root}, "linux", 1001)

    def test_guard_before_python_driver_mutations(self):
        self.assertTrue(callable(getattr(helpers, "assert_guard", None)), "Python guard missing")
        env = dict(
            GITHUB_ACTIONS="true",
            RUNNER_ENVIRONMENT="github-hosted",
            RUNNER_OS="Linux",
            WALLPAPER_PICKER_NATIVE_ACCEPTANCE="1",
            RUNNER_TEMP="/home/runner/work/_temp",
        )
        helpers.assert_guard(env, "linux", 1001)
        for key in env:
            with self.assertRaises(ValueError):
                helpers.assert_guard({**env, key: "false"}, "linux", 1001)
        for platform, uid in [("win32", 1001), ("linux", 0), ("linux", None)]:
            with self.assertRaises(ValueError):
                helpers.assert_guard(env, platform, uid)


class ManifestTests(unittest.TestCase):
    def test_manifest_exact_versions_target_and_scoped_paths(self):
        self.assertTrue(
            callable(getattr(helpers, "validate_manifest", None)), "manifest validator missing"
        )
        root = ROOT
        manifest = manifest_fixture()
        self.assertEqual(helpers.validate_manifest(manifest, root), manifest)
        changes = [
            ("target", "linux-x86_64"),
            ("caseRoot", root),
            ("caseRoot", "/etc"),
            ("caseRoot", root + "/../data"),
            ("caseRoot", root + "-evil/x"),
        ]
        for key, value in changes:
            with self.assertRaises(ValueError):
                helpers.validate_manifest({**manifest, key: value}, root)
        for key, value in [
            ("version", "v3.6.0"),
            ("artifactPath", "relative"),
            ("assetName", "../bad.AppImage"),
            ("sha256", "A" * 64),
            ("assetName", "baseline_3.6.1_amd64.AppImage"),
        ]:
            bad = copy.deepcopy(manifest)
            bad["baseline"][key] = value
            with self.assertRaises(ValueError):
                helpers.validate_manifest(bad, root)
        with self.assertRaises(ValueError):
            helpers.validate_manifest(None, root)

    def test_launch_copy_must_match_verified_bytes_before_any_native_launch(self):
        self.assertTrue(
            callable(getattr(helpers, "require_matching_payload", None)),
            "copy verification missing",
        )
        expected = {"sha256": "a" * 64, "size": 100, "path": "/original"}
        helpers.require_matching_payload({**expected, "path": "/owned-copy"}, expected)
        for changed in ({"sha256": "b" * 64}, {"size": 99}, {"size": True}):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                helpers.require_matching_payload({**expected, **changed}, expected)

    def test_shared_artifact_contract_refuses_unowned_or_unverified_inputs(self):
        manifest = manifest_fixture()
        self.assertEqual(helpers.validate_manifest(manifest, ROOT), manifest)
        for key, value in (
            ("caseRoot", ROOT + "/other-owned-by-runner"),
            ("caseRoot", ROOT + "/native-updater-acceptance"),
            ("schema", 2),
            ("repository", "other/repository"),
        ):
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                helpers.validate_manifest({**manifest, key: value}, ROOT)
        for key, value in (
            ("size", None),
            ("size", True),
            ("size", 0),
            ("size", 512 * 1024 * 1024 + 1),
            ("assetName", "other_3.6.0_amd64.AppImage"),
            ("artifactPath", ROOT + "/unowned.AppImage"),
            ("target", "linux-x86_64"),
            ("sha256AndSizeVerified", False),
            ("signature", ""),
            ("url", "https://example.com/asset"),
        ):
            bad = copy.deepcopy(manifest)
            bad["baseline"][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                helpers.validate_manifest(bad, ROOT)


class IdentityTests(unittest.TestCase):
    def test_extracted_or_spoofed_paths_do_not_establish_mounted_identity(self):
        self.assertTrue(
            callable(getattr(helpers, "mounted_identity", None)), "mount correlation missing"
        )
        env = {
            "APPIMAGE": "/run/case/app/Wallpaper.AppImage",
            "APPDIR": "/run/case/tmp/.mount_Wall12",
        }
        exe = env["APPDIR"] + "/usr/bin/wallpaper-picker-ui"
        mount = "31 22 0:44 / /run/case/tmp/.mount_Wall12 ro,nosuid - fuse.AppImage Wallpaper.AppImage ro"
        self.assertTrue(helpers.mounted_identity(env, exe, mount, env["APPIMAGE"], "/run/case/tmp"))
        for observed, text in [
            (exe, ""),
            ("/run/case/squashfs-root/usr/bin/wallpaper-picker-ui", mount),
            (exe, mount.replace("fuse.AppImage", "ext4")),
        ]:
            self.assertFalse(
                helpers.mounted_identity(env, observed, text, env["APPIMAGE"], "/run/case/tmp")
            )
        self.assertFalse(
            helpers.mounted_identity(
                {**env, "APPIMAGE": "/wrong"}, exe, mount, env["APPIMAGE"], "/run/case/tmp"
            )
        )

    def test_inspector_listener_must_be_loopback_and_task_owned(self):
        self.assertTrue(
            callable(getattr(helpers, "listener_inode", None)), "listener correlation missing"
        )
        row = (
            "0: 0100007F:1388 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 12345"
        )
        self.assertEqual(helpers.listener_inode(row, 5000), "12345")
        for wrong in [
            row.replace("0100007F", "00000000"),
            row.replace("0A", "01"),
            row.replace("1388", "1389"),
        ]:
            self.assertIsNone(helpers.listener_inode(wrong, 5000))


class WebDriverTests(unittest.TestCase):
    def test_release_attach_payload_never_launches_minibrowser_or_rebuild(self):
        self.assertTrue(
            callable(getattr(helpers, "attach_capabilities", None)),
            "WebDriver attach helper missing",
        )
        payload = helpers.attach_capabilities(5000)
        caps = payload["capabilities"]["alwaysMatch"]
        self.assertEqual(caps["browserName"], "wry")
        self.assertEqual(
            caps["webkitgtk:browserOptions"],
            {"targetAddress": "127.0.0.1:5000", "binary": "/bin/false", "args": []},
        )
        for invalid in (0, 65536, "5000", True):
            with self.assertRaises(ValueError):
                helpers.attach_capabilities(invalid)

    def test_native_support_is_actual_packaged_provenance_and_still_disabled(self):
        self.assertTrue(
            callable(getattr(helpers, "require_native_provenance", None)),
            "native policy validator missing",
        )
        support = {
            "mode": "manual-only",
            "platform": "linux",
            "architecture": "x86_64",
            "installer": "appimage",
            "target": None,
            "reason": "native-validation-pending",
        }
        result = {
            "support": support,
            "version": "3.6.0",
            "identifier": "dev.matuz.wallpaper-picker-ui",
        }
        helpers.require_native_provenance(result, "writable")
        helpers.require_native_provenance(
            {**result, "support": {**support, "reason": "app-image-read-only"}}, "readonly"
        )
        for key, value in [
            ("installer", "deb"),
            ("target", "linux-x86_64-appimage"),
            ("mode", "development"),
            ("reason", "development-build"),
        ]:
            with self.assertRaises(ValueError):
                helpers.require_native_provenance(
                    {**result, "support": {**support, key: value}}, "writable"
                )
        for key, value in [("version", "3.6.1"), ("identifier", "other.identity")]:
            with self.assertRaises(ValueError):
                helpers.require_native_provenance({**result, key: value}, "writable")


class ProtocolTests(unittest.TestCase):
    def test_malformed_mountinfo_never_crashes_identity_check(self):
        env = {
            "APPIMAGE": "/run/case/app/Wallpaper.AppImage",
            "APPDIR": "/run/case/tmp/.mount_Wall12",
        }
        exe = env["APPDIR"] + "/usr/bin/wallpaper-picker-ui"
        mount = "31 22 0:44 / /run/case/tmp/.mount_Wall12 ro extra extra extra -"
        self.assertFalse(
            helpers.mounted_identity(env, exe, mount, env["APPIMAGE"], "/run/case/tmp")
        )

    def test_framing_is_binary_not_cdp_and_survives_fragmentation(self):
        self.assertTrue(callable(getattr(helpers, "encode_frame", None)), "framing missing")
        frame = helpers.encode_frame("SetupInspectorClient", b"\0", True)
        self.assertEqual(frame, b"\0\0\0\x16\x01SetupInspectorClient\0\0")
        for split in range(len(frame)):
            messages, rest = helpers.decode_frames(frame[:split])
            self.assertEqual(messages, [])
            messages, rest = helpers.decode_frames(rest + frame[split:])
            self.assertEqual(messages, [("SetupInspectorClient", True, b"\0")])
            self.assertEqual(rest, b"")
        big = helpers.encode_frame("SetTargetList", b"sample", False)
        self.assertEqual(len(helpers.decode_frames(frame + big)[0]), 2)
        self.assertFalse(helpers.decode_frames(big)[0][0][1])
        for malformed in [
            b"\0\0\0\0\x01",
            b"\0\0\0\x01\x08\0",
            b"\x7f\xff\xff\xff\x01",
            b"\0\0\0\x01\x01x",
        ]:
            with self.assertRaises(ValueError):
                helpers.decode_frames(malformed)
        for name in ["", "bad\0name", "☃"]:
            with self.assertRaises(ValueError):
                helpers.encode_frame(name, b"", True)


if __name__ == "__main__":
    unittest.main()
