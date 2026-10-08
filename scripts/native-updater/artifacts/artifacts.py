"""Strict published-artifact selection for disposable native acceptance runners."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import urllib.request
from urllib.parse import unquote, urlsplit

REPOSITORY = "Rodrigo-Matuz/wallpaper-picker-ui"
TARGETS = {
    "windows-x86_64-nsis": ("Windows", ".exe"),
    "windows-x86_64-msi": ("Windows", ".msi"),
    "linux-x86_64-appimage": ("Linux", ".AppImage"),
}


def validate_versions(baseline, candidate):
    """Reject malformed literal versions and non-forward upgrades."""
    if not all(isinstance(v, str) and re.fullmatch(r"\d+\.\d+\.\d+", v) for v in (baseline, candidate)):
        raise ValueError("Versions must be literal stable major.minor.patch strings")
    if tuple(map(int, baseline.split("."))) >= tuple(map(int, candidate.split("."))):
        raise ValueError("Native acceptance requires a forward upgrade")
    return baseline, candidate


def require_runner(env, target):
    """Fail before network/filesystem activity unless explicitly on a hosted runner."""
    if target not in TARGETS:
        raise ValueError("Unsupported native acceptance target")
    required = {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
                "RUNNER_OS": TARGETS[target][0], "WALLPAPER_PICKER_NATIVE_ACCEPTANCE": "1"}
    if any(env.get(key) != value for key, value in required.items()):
        raise ValueError("Native acceptance requires an opted-in disposable GitHub-hosted runner")


def select_asset(release, feed, version, target):
    """Resolve only the requested static feed target and its exact immutable asset."""
    if target not in TARGETS:
        raise ValueError("Unsupported native acceptance target")
    if release.get("tag_name") != "v" + version or release.get("draft") is not False or release.get("prerelease") is not False:
        raise ValueError("Expected an exact published stable release")
    if feed.get("version") != version:
        raise ValueError("Manifest version does not match the approved release")
    entry = feed.get("platforms", {}).get(target)
    if not isinstance(entry, dict) or not isinstance(entry.get("signature"), str) or not entry["signature"].strip():
        raise ValueError("Exact signed target missing; generic fallback forbidden")
    url = entry.get("url")
    if not isinstance(url, str):
        raise ValueError("Target URL missing")
    parsed = urlsplit(url)
    prefix = f"/{REPOSITORY}/releases/download/v{version}/"
    if parsed.scheme != "https" or parsed.netloc != "github.com" or parsed.query or parsed.fragment or not parsed.path.startswith(prefix):
        raise ValueError("Asset URL must be the exact trusted release download origin/path")
    matches = [asset for asset in release.get("assets", []) if asset.get("browser_download_url") == url]
    if len(matches) != 1:
        raise ValueError("Manifest must match exactly one uploaded release asset")
    asset = matches[0]
    name, size, digest = asset.get("name"), asset.get("size"), asset.get("digest")
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9._ -]{1,200}", name) or unquote(parsed.path[len(prefix):]) != name or not name.endswith(TARGETS[target][1]):
        raise ValueError("Unsafe or mismatched installer asset basename/type")
    if type(size) is not int or not 0 < size <= 512 * 1024 * 1024:
        raise ValueError("Installer size missing or outside acceptance bound")
    if not isinstance(digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise ValueError("Release asset must provide an authoritative SHA-256 digest")
    return {"version": version, "target": target, "assetName": name, "url": url,
            "size": size, "sha256": digest[7:], "signature": entry["signature"]}


class HTTPSRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Never propagate API Authorization through asset/CDN redirects."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).scheme != "https":
            raise ValueError("HTTPS required for every redirect")
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None:
            redirected.remove_header("Authorization")
        return redirected


def open_url(url):
    """HTTPS metadata/payload reader; never forward a runner token to payload hosts."""
    if urlsplit(url).scheme != "https":
        raise ValueError("HTTPS required")
    headers = {"User-Agent": "wallpaper-picker-native-acceptance"}
    if urlsplit(url).netloc == "api.github.com" and os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    opener = urllib.request.build_opener(HTTPSRedirectHandler())
    return opener.open(urllib.request.Request(url, headers=headers), timeout=60)


def download_artifact(selected, destination):
    """Write a new owned file; reject truncated/oversized/digest-mismatched payloads."""
    destination = Path(destination)
    # Exclusive creation prevents overwriting a prior/unrelated file.
    stream = destination.open("xb")
    try:
        digest = hashlib.sha256()
        total = 0
        with stream, open_url(selected["url"]) as response:
            while chunk := response.read(65536):
                total += len(chunk)
                if total > selected["size"]:
                    raise ValueError("Payload exceeds declared asset size")
                digest.update(chunk)
                stream.write(chunk)
        if total != selected["size"] or digest.hexdigest() != selected["sha256"]:
            raise ValueError("Payload byte count or SHA-256 mismatched release metadata")
    except BaseException:
        stream.close()
        destination.unlink(missing_ok=True)
        raise
    return destination


def read_json(url):
    with open_url(url) as response:
        payload = response.read(2 * 1024 * 1024 + 1)
    if len(payload) > 2 * 1024 * 1024:
        raise ValueError("Metadata response exceeds limit")
    result = json.loads(payload)
    if not isinstance(result, dict):
        raise ValueError("Expected JSON object")
    return result


def metadata(baseline, candidate, target):
    validate_versions(baseline, candidate)
    selected = {}
    for key, version in (("baseline", baseline), ("candidate", candidate)):
        release = read_json(f"https://api.github.com/repos/{REPOSITORY}/releases/tags/v{version}")
        feed = read_json(f"https://github.com/{REPOSITORY}/releases/download/v{version}/latest.json")
        selected[key] = select_asset(release, feed, version, target)
    # The packaged applications use this production feed; reject an unexpected latest version.
    latest = read_json(f"https://github.com/{REPOSITORY}/releases/latest/download/latest.json")
    if latest.get("version") != candidate or latest.get("platforms", {}).get(target) != feed.get("platforms", {}).get(target):
        raise ValueError("Live packaged updater feed no longer matches the approved candidate")
    return {"schema": 1, "repository": REPOSITORY, "target": target,
            "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "feedUrl": f"https://github.com/{REPOSITORY}/releases/latest/download/latest.json", **selected}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default="3.6.0")
    parser.add_argument("--candidate", default="3.6.1")
    parser.add_argument("--target", choices=TARGETS, required=True)
    parser.add_argument("--case-root")
    parser.add_argument("--metadata-only", action="store_true", help="Read-only published metadata preflight, no download or native operation")
    args = parser.parse_args()
    validate_versions(args.baseline, args.candidate)
    if args.metadata_only:
        print(json.dumps(metadata(args.baseline, args.candidate, args.target), indent=2))
        return
    require_runner(os.environ, args.target)
    if not args.case_root or not os.environ.get("RUNNER_TEMP"):
        raise ValueError("Run-owned case root and RUNNER_TEMP required")
    root = Path(args.case_root).absolute()
    runner = Path(os.environ["RUNNER_TEMP"]).absolute()
    allowed = runner / "native-updater-acceptance"
    if ".." in root.parts or ".." in runner.parts or root == allowed or not root.is_relative_to(allowed):
        raise ValueError("Case root must be a literal strict descendant of RUNNER_TEMP/native-updater-acceptance")
    # Inspect the literal path before resolving it: resolving both sides can bless
    # a redirected acceptance boundary. Stop at RUNNER_TEMP, not the system root.
    ancestor = root
    while True:
        try:
            info = ancestor.lstat()
        except FileNotFoundError:
            pass  # Future case/intermediate directories are created only after validation.
        else:
            if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                raise ValueError("Case root ancestors through RUNNER_TEMP must not be symlinks or reparse points")
        if ancestor == runner:
            break
        ancestor = ancestor.parent
    canonical_runner = runner.resolve(strict=True)
    root = root.resolve()
    if root == canonical_runner or not root.is_relative_to(canonical_runner):
        raise ValueError("Canonical case root must remain strictly beneath canonical RUNNER_TEMP")
    data = metadata(args.baseline, args.candidate, args.target)
    root.mkdir(parents=True, exist_ok=False)
    data["caseRoot"] = str(root)
    for key in ("baseline", "candidate"):
        asset = data[key]
        path = root / (key + "-" + asset["assetName"])
        download_artifact(asset, path)
        asset["artifactPath"] = str(path)
        asset["sha256AndSizeVerified"] = True
    manifest = root / "manifest.json"
    manifest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"manifest={manifest}\n")
    print(json.dumps({"manifest": str(manifest), "target": args.target,
                      "baseline": args.baseline, "candidate": args.candidate,
                      "payloadIntegrity": "SHA256_AND_SIZE_VERIFIED", "nativeSignatureVerification": "NOT_YET_EXERCISED"}))


if __name__ == "__main__":
    main()
