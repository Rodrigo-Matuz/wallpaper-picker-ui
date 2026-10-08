import importlib.util
import pathlib
import unittest
import hashlib
import io
import os
import tempfile
import stat
import subprocess
import sys
import urllib.request
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("artifacts", pathlib.Path(__file__).with_name("artifacts.py"))
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ArtifactContractTests(unittest.TestCase):
    def release(self, version="3.6.1"):
        return {"tag_name": "v" + version, "draft": False, "prerelease": False, "assets": [
            {"name": "Wallpaper.Picker.UI_3.6.1_x64_en-US.msi", "size": 20,
             "digest": "sha256:" + "a" * 64,
             "browser_download_url": "https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/download/v3.6.1/Wallpaper.Picker.UI_3.6.1_x64_en-US.msi"}
        ]}

    def feed(self):
        return {"version": "3.6.1", "platforms": {"windows-x86_64-msi": {
            "url": self.release()["assets"][0]["browser_download_url"], "signature": "public-signature-test-fixture"}}}

    def test_selects_exact_target_and_matching_published_asset(self):
        chosen = MODULE.select_asset(self.release(), self.feed(), "3.6.1", "windows-x86_64-msi")
        self.assertEqual(chosen["sha256"], "a" * 64)
        self.assertEqual(chosen["assetName"], self.release()["assets"][0]["name"])

    def test_missing_exact_target_never_falls_back(self):
        feed = self.feed()
        feed["platforms"]["windows-x86_64"] = feed["platforms"].pop("windows-x86_64-msi")
        with self.assertRaises(ValueError):
            MODULE.select_asset(self.release(), feed, "3.6.1", "windows-x86_64-msi")

    def test_rejects_version_draft_digest_and_external_url_mismatches(self):
        cases = [lambda r, f: r.update(draft=True),
                 lambda r, f: f.update(version="3.6.2"),
                 lambda r, f: r["assets"][0].update(digest=None),
                 lambda r, f: f["platforms"]["windows-x86_64-msi"].update(url="https://example.org/installer.msi")]
        for mutate in cases:
            release, feed = self.release(), self.feed()
            mutate(release, feed)
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                MODULE.select_asset(release, feed, "3.6.1", "windows-x86_64-msi")

    def test_requires_hosted_runner_opt_in_before_network_or_filesystem(self):
        with self.assertRaises(ValueError):
            MODULE.require_runner({}, "windows-x86_64-msi")
        env = {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted", "RUNNER_OS": "Windows", "WALLPAPER_PICKER_NATIVE_ACCEPTANCE": "1"}
        MODULE.require_runner(env, "windows-x86_64-msi")
        with self.assertRaises(ValueError):
            MODULE.require_runner(env, "linux-x86_64-appimage")

    def test_redirected_owned_ancestors_are_rejected_before_network_or_writes(self):
        for boundary in ("acceptance", "intermediate", "runner"):
            with self.subTest(boundary=boundary), tempfile.TemporaryDirectory(
                dir=os.environ.get("TMPDIR") or os.environ.get("RUNNER_TEMP")
            ) as temporary:
                fixture = pathlib.Path(temporary)
                runner = fixture / "runner"
                outside = fixture / "outside"
                outside.mkdir()
                redirected = outside
                if boundary == "runner":
                    link = runner
                    case = runner / "native-updater-acceptance" / "future" / "case"
                else:
                    runner.mkdir()
                    acceptance = runner / "native-updater-acceptance"
                    if boundary == "acceptance":
                        link = acceptance
                    else:
                        acceptance.mkdir()
                        link = acceptance / "intermediate"
                        redirected = acceptance / "redirected-target"
                        redirected.mkdir()
                    case = link / "future" / "case"
                if os.name == "nt":
                    subprocess.run(
                        ["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(redirected)],
                        check=True, capture_output=True, text=True,
                    )
                    self.assertTrue(link.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
                else:
                    link.symlink_to(redirected, target_is_directory=True)
                    self.assertTrue(link.is_symlink())
                env = {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
                       "RUNNER_OS": "Windows", "WALLPAPER_PICKER_NATIVE_ACCEPTANCE": "1",
                       "RUNNER_TEMP": str(runner)}
                argv = ["artifacts.py", "--target", "windows-x86_64-msi", "--case-root", str(case)]
                data = {key: {"assetName": "fixture.msi"} for key in ("baseline", "candidate")}
                before = sorted(str(path.relative_to(fixture)) for path in fixture.rglob("*"))
                error = None
                try:
                    with patch.dict(os.environ, env, clear=True), patch.object(sys, "argv", argv), \
                            patch.object(MODULE, "metadata", return_value=data) as metadata, \
                            patch.object(MODULE, "download_artifact", side_effect=lambda asset, path: path.write_bytes(b"inert fixture")) as download, \
                            patch("sys.stdout", new=io.StringIO()):
                        try:
                            MODULE.main()
                        except ValueError as caught:
                            error = caught
                    after = sorted(str(path.relative_to(fixture)) for path in fixture.rglob("*"))
                    self.assertEqual(
                        {"rejected": isinstance(error, ValueError), "metadataCalls": metadata.call_count,
                         "downloadCalls": download.call_count, "filesystemUnchanged": after == before,
                         "escapedManifest": any(outside.rglob("manifest.json"))},
                        {"rejected": True, "metadataCalls": 0, "downloadCalls": 0,
                         "filesystemUnchanged": True, "escapedManifest": False},
                    )
                finally:
                    if os.name == "nt":
                        link.rmdir()
                    else:
                        link.unlink()

    def test_owned_future_case_allows_redirects_above_runner_and_remains_exclusive(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR") or os.environ.get("RUNNER_TEMP")) as temporary:
            fixture = pathlib.Path(temporary)
            physical = fixture / "physical"
            physical.mkdir()
            alias = fixture / "alias"
            if os.name == "nt":
                subprocess.run(["cmd.exe", "/d", "/c", "mklink", "/J", str(alias), str(physical)],
                               check=True, capture_output=True, text=True)
                self.assertTrue(alias.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
            else:
                alias.symlink_to(physical, target_is_directory=True)
            try:
                runner = alias / "runner"
                runner.mkdir()
                case = runner / "native-updater-acceptance" / "future" / "case"
                env = {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
                       "RUNNER_OS": "Windows", "WALLPAPER_PICKER_NATIVE_ACCEPTANCE": "1",
                       "RUNNER_TEMP": str(runner)}
                argv = ["artifacts.py", "--target", "windows-x86_64-msi", "--case-root", str(case)]
                data = {key: {"assetName": "fixture.msi"} for key in ("baseline", "candidate")}
                with patch.dict(os.environ, env, clear=True), patch.object(sys, "argv", argv), \
                        patch.object(MODULE, "metadata", return_value=data) as metadata, \
                        patch.object(MODULE, "download_artifact", side_effect=lambda asset, path: path.write_bytes(b"inert fixture")) as download, \
                        patch("sys.stdout", new=io.StringIO()):
                    MODULE.main()
                    metadata.assert_called_once_with("3.6.0", "3.6.1", "windows-x86_64-msi")
                    self.assertEqual(download.call_count, 2)
                    self.assertEqual(data["caseRoot"], str(case.resolve()))
                    self.assertTrue(case.resolve().is_relative_to(runner.resolve()))
                    manifest = case / "manifest.json"
                    original = manifest.read_bytes()
                    with self.assertRaises(FileExistsError):
                        MODULE.main()
                    self.assertEqual(download.call_count, 2)
                    self.assertEqual(manifest.read_bytes(), original)
            finally:
                if os.name == "nt":
                    alias.rmdir()
                else:
                    alias.unlink()

    def test_download_verifies_exact_bytes_and_removes_failed_partial(self):
        payload = b"unit-test installer bytes, never executable"
        selected = MODULE.select_asset(self.release(), self.feed(), "3.6.1", "windows-x86_64-msi")
        selected.update(size=len(payload), sha256=hashlib.sha256(payload).hexdigest())
        with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR") or os.environ.get("RUNNER_TEMP")) as temporary:
            destination = pathlib.Path(temporary) / "fixture.msi"
            with patch.object(MODULE, "open_url", return_value=io.BytesIO(payload)):
                MODULE.download_artifact(selected, destination)
            self.assertEqual(destination.read_bytes(), payload)
            bad = pathlib.Path(temporary) / "bad.msi"
            with patch.object(MODULE, "open_url", return_value=io.BytesIO(b"corrupt")), self.assertRaises(ValueError):
                MODULE.download_artifact(selected, bad)
            self.assertFalse(bad.exists())

    def test_redirects_never_forward_api_authorization_to_payload_host(self):
        handler_type = getattr(MODULE, "HTTPSRedirectHandler", None)
        self.assertTrue(callable(handler_type), "Credential-safe redirect handler missing")
        assert callable(handler_type)
        request = urllib.request.Request("https://api.github.com/repos/example/asset",
                                         headers={"Authorization": "Bearer nonsecret-test-fixture"})
        redirected = handler_type().redirect_request(
            request, None, 302, "Found", {}, "https://release-assets.githubusercontent.com/payload")
        self.assertIsNotNone(redirected)
        self.assertIsNone(redirected.get_header("Authorization"))
        self.assertEqual(redirected.full_url, "https://release-assets.githubusercontent.com/payload")

    def test_redirects_refuse_https_downgrade(self):
        request = urllib.request.Request("https://github.com/release/asset")
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            MODULE.HTTPSRedirectHandler().redirect_request(
                request, None, 302, "Found", {}, "http://release-assets.githubusercontent.com/payload")

    def test_versions_are_literal_and_upgrade_is_forward(self):
        self.assertEqual(MODULE.validate_versions("3.6.0", "3.6.1"), ("3.6.0", "3.6.1"))
        for old, new in [("v3.6.0", "3.6.1"), ("3.6.1", "3.6.0"), ("3.6.1", "3.6.1"), ("../3.6.0", "3.6.1")]:
            with self.subTest(old=old, new=new), self.assertRaises(ValueError):
                MODULE.validate_versions(old, new)


if __name__ == "__main__":
    unittest.main()
