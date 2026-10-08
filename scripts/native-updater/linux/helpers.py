"""Pure safety and WebKitGTK framing helpers; no native invocation on import."""

import re
from pathlib import PurePosixPath


def scoped_path(value, root):
    if not isinstance(value, str) or "\0" in value:
        raise ValueError("Expected a scoped absolute Linux path")
    path, parent = PurePosixPath(value), PurePosixPath(root)
    if not path.is_absolute() or ".." in path.parts or path == parent or parent not in path.parents:
        raise ValueError("Path must be strictly inside RUNNER_TEMP")
    return path


def validate_manifest(manifest, root):
    if (
        not isinstance(manifest, dict)
        or manifest.get("schema") != 1
        or manifest.get("repository") != "Rodrigo-Matuz/wallpaper-picker-ui"
        or manifest.get("target") != "linux-x86_64-appimage"
    ):
        raise ValueError("Requires exact published linux-x86_64-appimage manifest")
    case = str(scoped_path(manifest.get("caseRoot"), root + "/native-updater-acceptance"))
    for key, version in [("baseline", "3.6.0"), ("candidate", "3.6.1")]:
        artifact = manifest.get(key)
        if (
            not isinstance(artifact, dict)
            or artifact.get("version") != version
            or artifact.get("target") != manifest["target"]
        ):
            raise ValueError(f"Requires released {key} version {version} and exact target")
        scoped_path(artifact.get("artifactPath"), case)
        name = f"Wallpaper.Picker.UI_{version}_amd64.AppImage"
        if artifact.get("assetName") != name:
            raise ValueError("Unexpected literal published release asset name")
        url = f"https://github.com/{manifest['repository']}/releases/download/v{version}/{name}"
        if artifact.get("url") != url:
            raise ValueError("Unexpected published release download URL")
        if (
            type(artifact.get("size")) is not int
            or not 0 < artifact["size"] <= 512 * 1024 * 1024
            or artifact.get("sha256AndSizeVerified") is not True
        ):
            raise ValueError("Requires bounded verified artifact size")
        if not isinstance(artifact.get("signature"), str) or not artifact["signature"].strip():
            raise ValueError(
                "Requires published signature metadata (not native signature verification)"
            )
        if not isinstance(artifact.get("sha256"), str) or not re.fullmatch(
            r"[0-9a-f]{64}", artifact["sha256"]
        ):
            raise ValueError("Requires literal lowercase SHA-256")
    if manifest["baseline"]["artifactPath"] == manifest["candidate"]["artifactPath"]:
        raise ValueError("Baseline and candidate must be separate immutable artifacts")
    return manifest


def require_matching_payload(observed, expected):
    if (
        observed.get("sha256") != expected["sha256"]
        or type(observed.get("size")) is not int
        or observed["size"] != expected["size"]
    ):
        raise ValueError("Artifact/copy digest or size mismatch; native launch refused")


def launch_environment(output):
    root = PurePosixPath(output)
    # tauri-runtime-wry 2.9.3 create_webview enables this in RELEASE too.
    env = {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "LANG": "C.UTF-8",
        "GDK_BACKEND": "x11",
        "TAURI_WEBVIEW_AUTOMATION": "true",
    }
    for key, directory in (
        ("HOME", "home"),
        ("XDG_CONFIG_HOME", "config"),
        ("XDG_DATA_HOME", "data"),
        ("XDG_CACHE_HOME", "cache"),
        ("XDG_RUNTIME_DIR", "runtime"),
        ("TMPDIR", "tmp"),
    ):
        env[key] = str(root / directory)
    return env


def mounted_identity(env, exe, mountinfo, image, temporary_root):
    appdir = env.get("APPDIR", "")
    if env.get("APPIMAGE") != image or not appdir:
        return False
    try:
        scoped_path(appdir, temporary_root)
    except ValueError:
        return False
    if exe != appdir + "/usr/bin/wallpaper-picker-ui":
        return False
    for line in mountinfo.splitlines():
        fields = line.split()
        if "-" not in fields or len(fields) < 10:
            continue
        separator = fields.index("-")
        if separator < 6 or len(fields) < separator + 4:
            continue
        # mountinfo escapes whitespace, backslashes and newlines as octal.
        mountpoint = re.sub(r"\\([0-7]{3})", lambda m: chr(int(m[1], 8)), fields[4])
        filesystem = fields[separator + 1]
        # libfuse's default subtype is argv[0]'s basename; the hosted runtime
        # reports fuse.Wallpaper.AppImage for the owned Wallpaper.AppImage copy.
        # Preserve prior generic types, but never accept arbitrary fuse.* or
        # case-fold the filename-derived subtype on a case-sensitive filesystem.
        if mountpoint == appdir and (
            filesystem.lower() in ("fuse.appimage", "fuse")
            or filesystem == "fuse." + PurePosixPath(image).name
        ):
            return True
    return False


def listener_inode(tcp_table, port):
    for line in tcp_table.splitlines():
        fields = line.split()
        if (
            len(fields) >= 10
            and fields[1] == f"0100007F:{port:04X}"
            and fields[3] == "0A"
            and fields[9].isdigit()
        ):
            return fields[9]
    return None


def attach_capabilities(port):
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("Expected bounded numeric loopback inspector port")
    return {
        "capabilities": {
            "alwaysMatch": {
                "browserName": "wry",
                "webkitgtk:browserOptions": {
                    "targetAddress": f"127.0.0.1:{port}",
                    "binary": "/bin/false",
                    "args": [],
                },
            },
            "firstMatch": [{}],
        }
    }


def require_native_provenance(result, case):
    expected = {
        "mode": "manual-only",
        "platform": "linux",
        "architecture": "x86_64",
        "installer": "appimage",
        "target": None,
        "reason": "app-image-read-only" if case == "readonly" else "native-validation-pending",
    }
    if (
        not isinstance(result, dict)
        or result.get("support") != expected
        or result.get("version") != "3.6.0"
        or result.get("identifier") != "dev.matuz.wallpaper-picker-ui"
    ):
        raise ValueError(
            "Native packaged provenance/version/identity or disabled-target policy mismatch"
        )


def assert_guard(env, platform, uid):
    if platform != "linux" or uid is None or uid == 0:
        raise ValueError("Requires Linux nonroot user; no localhost native execution")
    expected = {
        "GITHUB_ACTIONS": "true",
        "RUNNER_ENVIRONMENT": "github-hosted",
        "RUNNER_OS": "Linux",
        "WALLPAPER_PICKER_NATIVE_ACCEPTANCE": "1",
    }
    for key, value in expected.items():
        if env.get(key) != value:
            raise ValueError(f"Hosted acceptance guard refused: {key}")
    root = env.get("RUNNER_TEMP", "")
    if (
        not root.startswith("/")
        or any(part in ("", ".", "..") for part in root.split("/")[1:])
        or "\0" in root
    ):
        raise ValueError("Requires literal absolute scoped RUNNER_TEMP")


# WebKitGTK SocketConnection.cpp: network u32 body size, u8 endian flag,
# NUL-terminated message name, serialized GVariant parameters. Not HTTP/CDP.
MAX_FRAME = 4 * 1024 * 1024


def encode_frame(name, parameters, little_endian):
    if not name or "\0" in name or not name.isascii():
        raise ValueError("Invalid inspector message name")
    body = name.encode("ascii") + b"\0" + parameters
    if len(body) > MAX_FRAME:
        raise ValueError("Oversize inspector frame")
    return len(body).to_bytes(4, "big") + bytes([int(little_endian)]) + body


def decode_frames(data):
    messages = []
    while len(data) >= 4:
        size = int.from_bytes(data[:4], "big")
        if size < 1 or size > MAX_FRAME:
            raise ValueError("Invalid inspector frame size")
        if len(data) < 5:
            break
        if data[4] not in (0, 1):
            raise ValueError("Invalid inspector byte order flag")
        if len(data) < size + 5:
            break
        body = data[5 : size + 5]
        if b"\0" not in body:
            raise ValueError("Inspector message has no name terminator")
        name, parameters = body.split(b"\0", 1)
        if not name:
            raise ValueError("Empty inspector message name")
        messages.append((name.decode("ascii"), data[4] == 1, parameters))
        data = data[size + 5 :]
    return messages, data
