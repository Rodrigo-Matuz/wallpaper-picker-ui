"""Guarded genuine AppImage feasibility probe, NOT completed updater acceptance.

Release developer extras are disabled, but the locked runtime supports the
TAURI_WEBVIEW_AUTOMATION opt-in independently. Discover availability without
ELF patching, LD_PRELOAD, extraction, rebuilding or a simulated updater.
Always exit 2 (blocked) or 1 (setup failure), never acceptance/pass.
"""

import sys

sys.dont_write_bytecode = True

import argparse
import ctypes
import hashlib
import json
import os
import select
import shutil
import signal
import socket
import subprocess
import time
import traceback
import urllib.request
from pathlib import Path

from diagnostics import (
    MAX_ENVIRONMENT_BYTES,
    MAX_MOUNTINFO_BYTES,
    MAX_PROCESSES,
    MAX_STATUS_BYTES,
    bounded_text,
    identity_diagnostic,
)
from helpers import (
    assert_guard,
    decode_frames,
    encode_frame,
    launch_environment,
    listener_inode,
    mounted_identity,
    require_matching_payload,
    scoped_path,
    validate_manifest,
)


def checked_path(value, root, directory=False):
    path = Path(str(scoped_path(value, str(root))))
    for component in [path, *path.parents]:
        if component.is_symlink():
            raise ValueError(f"Symlink refused: {component}")
        if component == root:
            break
    resolved = path.resolve(strict=True)
    scoped_path(str(resolved), str(root))
    if not (resolved.is_dir() if directory else resolved.is_file()):
        raise ValueError(f"Unexpected path type: {resolved}")
    return resolved


def snapshot(path):
    info = path.stat()
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return {
        "path": str(path),
        "sha256": digest.hexdigest(),
        "size": info.st_size,
        "inode": info.st_ino,
        "device": info.st_dev,
        "mode": oct(info.st_mode & 0o7777),
    }


def read_bounded(path, limit):
    with path.open("rb") as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError("proc-field-size-limit")
    return data.decode(errors="replace")


def diagnostic_entries(proc_root, diagnostics):
    try:
        yield from proc_root.iterdir()
    except OSError as error:
        diagnostics["enumerationError"] = {"errorType": type(error).__name__, "errno": error.errno}
        raise


def owned_processes(session, image, temporary_root, diagnostics=None, proc_root=Path("/proc")):
    """Only read process detail after session ownership, then verify all UID slots.

    proc_root is a pure fixture seam; the guarded hosted entrypoint uses /proc.
    Diagnostic data never grants identity or bypasses mounted_identity.
    """
    result = []
    scan = {"session": session, "uid": os.getuid(), "processes": [], "ownedOmitted": 0}
    if diagnostics is not None:
        diagnostics.update(scan)
    for entry in diagnostic_entries(proc_root, diagnostics if diagnostics is not None else scan):
        if not entry.name.isdigit():
            continue
        # No detail or identifiers from a foreign session are recorded.
        try:
            pid = int(entry.name)
            if os.getsid(pid) != session:
                continue
        except (OSError, ValueError):
            continue
        item = {"pid": pid, "stage": "status"}
        if len(scan["processes"]) < MAX_PROCESSES:
            scan["processes"].append(item)
        else:
            # Bound retained diagnostics, not the unchanged correlation search.
            scan["ownedOmitted"] += 1
            if diagnostics is not None:
                diagnostics["ownedOmitted"] = scan["ownedOmitted"]
        try:
            status = dict(
                line.split(":", 1)
                for line in read_bounded(entry / "status", MAX_STATUS_BYTES).splitlines()
                if ":" in line
            )
            uids = status.get("Uid", "").split()
            if len(uids) != 4 or any(value != str(scan["uid"]) for value in uids):
                # Do not collect environ/exe/mounts for a foreign/unknown UID.
                item["reason"] = "uid-mismatch-or-unavailable"
                continue
            item["stage"] = "session-recheck"
            if os.getsid(pid) != session:
                item["reason"] = "session-changed"
                continue
            item["uid"] = scan["uid"]
            item["state"] = status.get("State", "").split()[0]
            item["ppid"] = int(status.get("PPid", ""))
            item["stage"] = "environ"
            env = dict(
                field.split("=", 1)
                for field in read_bounded(entry / "environ", MAX_ENVIRONMENT_BYTES).split("\0")
                if "=" in field
            )
            item["environment"] = {
                key: bounded_text(env[key])
                for key in ("APPIMAGE", "APPDIR", "TMPDIR")
                if key in env
            }
            item["stage"] = "exe"
            exe = os.readlink(entry / "exe")
            item["exe"] = bounded_text(exe)
            item["stage"] = "mountinfo"
            mounts = read_bounded(entry / "mountinfo", MAX_MOUNTINFO_BYTES)
            item.update(identity_diagnostic(env, exe, mounts, str(image), str(temporary_root)))
            if mounted_identity(env, exe, mounts, str(image), str(temporary_root)):
                item["stage"] = "executable-snapshot"
                executable = snapshot(Path(exe))
                item["stage"] = "cmdline"
                cmdline = read_bounded(entry / "cmdline", MAX_STATUS_BYTES)
                # Recheck session ownership after the reads (process exit/reuse race).
                item["stage"] = "session-recheck"
                if os.getsid(pid) != session:
                    item["reason"] = "session-changed"
                    continue
                result.append(
                    {
                        "pid": pid,
                        "exe": exe,
                        "APPIMAGE": env["APPIMAGE"],
                        "APPDIR": env["APPDIR"],
                        "mountinfo": mounts,
                        "executable": executable,
                        "cmdline": cmdline,
                    }
                )
            item["stage"] = "complete"
        except (OSError, ValueError, IndexError) as error:
            # Avoid raw exception paths/environment values; preserve reason/stage/errno.
            item["reason"] = "proc-read-or-snapshot-failed"
            item["errorType"] = type(error).__name__
            item["errno"] = getattr(error, "errno", None)
            if isinstance(error, ValueError) and str(error) == "proc-field-size-limit":
                item["reason"] = "proc-field-size-limit"
    return result


def wait_for_mounted_identity(app, image, temporary_root, evidence):
    """Retain bounded first/latest task-owned observations before cleanup."""
    diagnostics = {
        "purpose": "rejection diagnostics only, not native acceptance",
        "scanCount": 0,
        "deadlineSeconds": 45,
        "maxRecordedProcessesPerScan": MAX_PROCESSES,
    }
    evidence["mountedIdentityDiagnostics"] = diagnostics
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        scan = {}
        try:
            observed = owned_processes(app.pid, image, temporary_root, diagnostics=scan)
        finally:
            # Keep even partial enumeration on setup/read failure, before session cleanup.
            scan["leaderReturncode"] = app.poll()
            diagnostics["scanCount"] += 1
            diagnostics.setdefault("firstScan", scan)
            diagnostics["lastScan"] = scan
        if observed:
            evidence["mountedProcesses"] = observed
            return
        if scan["leaderReturncode"] is not None:
            raise RuntimeError(
                f"AppImage exited before mounted identity: {scan['leaderReturncode']}"
            )
        time.sleep(0.25)
    raise TimeoutError("No task-owned correlated FUSE-mounted native executable")


def variant_description(payload, signature, little_endian):
    # stdlib ctypes calls already-installed GLib, no Python/production dependencies.
    glib = ctypes.CDLL("libglib-2.0.so.0")
    pointer = ctypes.c_void_p
    bindings = {
        "g_variant_type_new": (pointer, [ctypes.c_char_p]),
        "g_variant_type_free": (None, [pointer]),
        "g_variant_new_from_data": (
            pointer,
            [pointer, pointer, ctypes.c_size_t, ctypes.c_int, pointer, pointer],
        ),
        "g_variant_ref_sink": (pointer, [pointer]),
        "g_variant_is_normal_form": (ctypes.c_int, [pointer]),
        "g_variant_byteswap": (pointer, [pointer]),
        "g_variant_print": (pointer, [pointer, ctypes.c_int]),
        "g_variant_unref": (None, [pointer]),
        "g_free": (None, [pointer]),
    }
    for name, (restype, argtypes) in bindings.items():
        function = getattr(glib, name)
        function.restype, function.argtypes = restype, argtypes
    buffer = ctypes.create_string_buffer(payload)
    variant_type = glib.g_variant_type_new(signature.encode())
    variant = glib.g_variant_ref_sink(
        glib.g_variant_new_from_data(variant_type, buffer, len(payload), 0, None, None)
    )
    glib.g_variant_type_free(variant_type)
    try:
        if not glib.g_variant_is_normal_form(variant):
            raise ValueError("Inspector GVariant is not in normal form")
        if little_endian != (sys.byteorder == "little"):
            swapped = glib.g_variant_byteswap(variant)  # Returns full, non-floating ownership.
            glib.g_variant_unref(variant)
            variant = swapped
        text = glib.g_variant_print(variant, 1)
        try:
            return ctypes.string_at(text).decode("utf-8")
        finally:
            glib.g_free(text)
    finally:
        glib.g_variant_unref(variant)


def verify_listener_owner(port, session):
    inode = listener_inode(Path("/proc/net/tcp").read_text(), port)
    if inode:
        for entry in Path("/proc").iterdir():
            if not entry.name.isdigit():
                continue
            try:
                if os.getsid(int(entry.name)) != session:
                    continue
                for descriptor in (entry / "fd").iterdir():
                    if os.readlink(descriptor) == f"socket:[{inode}]":
                        return int(entry.name)
            except OSError:
                continue
    raise ValueError("Inspector listener not owned by task AppImage session on IPv4 loopback")


def inspector_probe(port, session, evidence, deadline):
    connection = None
    while time.monotonic() < deadline:
        try:
            connection = socket.create_connection(("127.0.0.1", port), timeout=0.5)
            break
        except OSError:
            time.sleep(0.25)
    if connection is None:
        evidence["inspector"] = {"listening": False, "messages": []}
        return
    observed = {
        "listening": True,
        "protocol": "WebKitGTK SocketConnection/GVariant (not CDP)",
        "messages": [],
    }
    evidence["inspector"] = observed
    with connection:
        observed["ownerPid"] = verify_listener_owner(port, session)
        connection.settimeout(0.5)
        # (ay), empty NUL-terminated bytestring; source-backed binary handshake.
        connection.sendall(encode_frame("SetupInspectorClient", b"\0", sys.byteorder == "little"))
        buffered = b""
        total = 0
        while time.monotonic() < deadline:
            try:
                incoming = connection.recv(65536)
                if not incoming:
                    observed["closed"] = True
                    break
            except socket.timeout:
                continue
            total += len(incoming)
            if total > 8 * 1024 * 1024:
                raise ValueError("Inspector response exceeded bounded evidence size")
            frames, buffered = decode_frames(buffered + incoming)
            for name, little_endian, payload in frames:
                item = {"name": name, "littleEndian": little_endian, "bytes": len(payload)}
                if name == "SetTargetList":
                    item["variant"] = variant_description(payload, "(ta(tsssb))", little_endian)
                elif name == "DidSetupInspectorClient":
                    item["sha256"] = hashlib.sha256(payload).hexdigest()
                else:
                    item["prefixHex"] = payload[:256].hex()
                observed["messages"].append(item)
        observed["incompleteFrameBytes"] = len(buffered)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def webdriver_status_request(port):
    """Service availability only: never POST /session or touch a webview."""
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("Requires bounded numeric loopback WebDriver port")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(f"http://127.0.0.1:{port}/status", method="GET")
    with opener.open(request, timeout=2) as response:
        payload = response.read(65537)
    if len(payload) > 65536:
        raise ValueError("WebDriver status exceeded bounded evidence size")
    data = json.loads(payload)
    value = data.get("value") if isinstance(data, dict) else None
    if not isinstance(value, dict) or type(value.get("ready")) is not bool:
        raise ValueError("Invalid W3C WebDriver status response")
    return value


def webdriver_status_probe(start, evidence):
    """Optional tool availability, separate from AppImage inspector TCP protocol."""
    binary = shutil.which("WebKitWebDriver", path="/usr/local/bin:/usr/bin:/bin")
    observed = {
        "available": binary is not None,
        "sessionAttempted": False,
        "appControlValidated": False,
        "purpose": "GET /status only, no app attachment",
    }
    evidence["webdriver"] = observed
    if binary is None:
        return
    with socket.socket() as reserved:
        reserved.bind(("127.0.0.1", 0))
        port = reserved.getsockname()[1]
    child = start([binary, "--host=127.0.0.1", f"--port={port}"], "webdriver")
    observed["pid"], observed["port"] = child.pid, port
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            observed["ownerPid"] = verify_listener_owner(port, child.pid)
            observed["status"] = webdriver_status_request(port)
            return
        except (OSError, ValueError) as error:
            observed["error"] = str(error)
            time.sleep(0.25)
    observed["statusUnavailable"] = True


def live_session_members(session):
    """Include other process groups in our session; zombies cannot retain sockets/mounts."""
    result = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            pid = int(entry.name)
            if (
                os.getsid(pid) == session
                and (entry / "stat").read_text().rsplit(")", 1)[1].split()[0] != "Z"
            ):
                result.append(pid)
        except (ProcessLookupError, FileNotFoundError):
            continue
    return result


def cleanup_session(child):
    """Bounded TERM/KILL of the task-owned session, independent of leader exit."""
    errors = []

    def members():
        try:
            return live_session_members(child.pid)
        except OSError as error:
            errors.append(f"Session {child.pid} enumeration: {error}")
            return []

    def stop(pids, sig):
        for pid in pids:
            try:
                # Recheck ownership immediately before each signal; never signal host sessions.
                if os.getsid(pid) == child.pid:
                    os.kill(pid, sig)
            except ProcessLookupError:
                pass
            except OSError as error:
                errors.append(f"Session {child.pid}, pid {pid}: {error}")

    stop(members(), signal.SIGTERM)
    deadline = time.monotonic() + 5
    while members() and time.monotonic() < deadline:
        time.sleep(0.1)
    stop(members(), getattr(signal, "SIGKILL", 9))
    try:
        child.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired) as error:
        errors.append(f"Session {child.pid} leader reap: {error}")
    finally:
        if child.stdout is not None:
            try:
                child.stdout.close()
            except OSError as error:
                errors.append(f"Session {child.pid} pipe close: {error}")
    deadline = time.monotonic() + 5
    remaining = members()
    while remaining and time.monotonic() < deadline:
        time.sleep(0.1)
        remaining = members()
    if remaining:
        errors.append(f"Session {child.pid} still has live processes: {remaining}")
    return errors


def main(argv=None):
    # FIRST action, including direct invocation, precedes all file/process access.
    assert_guard(os.environ, sys.platform, os.getuid() if hasattr(os, "getuid") else None)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["writable", "readonly"], required=True)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args(argv)
    runner = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True)
    manifest_path = checked_path(args.manifest, runner)
    manifest = validate_manifest(json.loads(manifest_path.read_text()), str(runner))
    case_root = checked_path(manifest["caseRoot"], runner, directory=True)
    inputs = {}
    for key in ("baseline", "candidate"):
        artifact = manifest[key]
        path = checked_path(artifact["artifactPath"], runner)
        observed = snapshot(path)
        require_matching_payload(observed, artifact)
        with path.open("rb") as stream:
            header = stream.read(11)
        if header[:4] != b"\x7fELF" or header[8:11] != b"AI\x02":
            raise ValueError(f"{key} is not a type-2 AppImage")
        inputs[key] = observed
    # Empty owned subtree; never overwrite/reuse original artifacts/prior runs.
    output = case_root / f"linux-{args.case}"
    output.mkdir(mode=0o700)
    evidence = {
        "schema": 1,
        "status": "blocked",
        "acceptancePassed": False,
        "case": args.case,
        "target": manifest["target"],
        "inputBefore": inputs,
        "uid": os.getuid(),
        "nativeUpdaterInvocations": 0,
        "unexercised": [
            "get_update_support provenance/target-null",
            "signed native download verification",
            "native install writable/denied",
            "replacement inode/bytes",
            "native relaunch/version",
            "upgrade fixture preservation",
        ],
        "limitation": "Locked release source supports TAURI_WEBVIEW_AUTOMATION=true independently of developer extras. This probe requests that mode, but inspector discovery and optional WebDriver GET /status do not establish app attachment or native IPC. No session/control adapter or updater acceptance is implemented; never substitute a rebuilt/extracted binary.",
    }
    children, logs = [], []
    fixture_paths = []
    image = output / "app" / "Wallpaper.AppImage"
    exit_code = 2
    try:
        for name in ("app", "home", "config", "data", "cache", "runtime", "tmp"):
            (output / name).mkdir(mode=0o700)
        shutil.copyfile(inputs["baseline"]["path"], image)
        image.chmod(0o755 if args.case == "writable" else 0o555)
        config = output / "config" / "WallpaperPickerUI" / "config.json"
        mapping = output / "data" / "dev.matuz.wallpaper-picker-ui" / "thumbnails" / "map.json"
        cache = output / "cache" / "native-acceptance-preservation.bin"
        fixture_values = [
            (
                config,
                json.dumps(
                    {
                        "command": "",
                        "wallpapersPath": "",
                        "debugMode": False,
                        "newWallpapers": True,
                        "darkMode": True,
                        "language": "eng",
                        "thumbnailsHashMap": {},
                        "thumbnailVersion": 1,
                    },
                    indent=4,
                ).encode(),
            ),
            (mapping, b"{}"),
            (cache, b"disposable-cache-fixture\x00\x01\x02"),
        ]
        for path, content in fixture_values:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            fixture_paths.append(path)
        evidence["fixtureBefore"] = [snapshot(path) for path in fixture_paths]
        evidence["imageBefore"] = snapshot(image)
        require_matching_payload(evidence["imageBefore"], inputs["baseline"])
        if args.case == "readonly":
            image.parent.chmod(0o555)
        evidence["effectiveImageAccess"] = {
            "fileWritable": os.access(image, os.W_OK),
            "parentWritable": os.access(image.parent, os.W_OK),
        }
        if args.case == "readonly" and any(evidence["effectiveImageAccess"].values()):
            raise ValueError("Denied fixture still writable to effective nonroot user")
        if not Path("/dev/fuse").exists() or not os.access("/dev/fuse", os.R_OK | os.W_OK):
            raise ValueError("FUSE missing/denied; extract-and-run fallback forbidden")
        # No signing secrets, host HOME/XDG, LD_PRELOAD or AppImage spoof variables.
        env = launch_environment(str(output))
        evidence["automationRequested"] = env["TAURI_WEBVIEW_AUTOMATION"]

        def start(command, name, stdout=None, pass_fds=()):
            log = (output / f"{name}.log").open("wb")
            logs.append(log)
            child = subprocess.Popen(
                command,
                env=env,
                cwd=output,
                stdin=subprocess.DEVNULL,
                stdout=stdout if stdout is not None else log,
                stderr=log,
                start_new_session=True,
                pass_fds=pass_fds,
            )
            children.append(child)
            return child

        read_fd, write_fd = os.pipe()
        try:
            start(
                [
                    "Xvfb",
                    "-displayfd",
                    str(write_fd),
                    "-screen",
                    "0",
                    "1280x800x24",
                    "-nolisten",
                    "tcp",
                    "-ac",
                ],
                "xvfb",
                pass_fds=(write_fd,),
            )
            os.close(write_fd)
            write_fd = None
            if not select.select([read_fd], [], [], 15)[0]:
                raise TimeoutError("Xvfb display allocation timeout")
            display = os.read(read_fd, 128).decode().strip()
            if not display.isdigit():
                raise ValueError("Xvfb did not allocate numeric display")
            env["DISPLAY"] = f":{display}"
        finally:
            os.close(read_fd)
            if write_fd is not None:
                os.close(write_fd)
        dbus = start(
            [
                "dbus-daemon",
                "--session",
                "--nofork",
                "--print-address=1",
                f"--address=unix:path={output / 'runtime' / 'bus'}",
            ],
            "dbus",
            stdout=subprocess.PIPE,
        )
        if dbus.stdout is None:
            raise RuntimeError("Session DBus did not provide its address pipe")
        if not select.select([dbus.stdout], [], [], 15)[0]:
            raise TimeoutError("Disposable session DBus startup timeout")
        address = dbus.stdout.readline().decode().strip()
        if not address.startswith(f"unix:path={output / 'runtime' / 'bus'}"):
            raise ValueError("Unexpected session DBus address")
        env["DBUS_SESSION_BUS_ADDRESS"] = address
        with socket.socket() as reserved:
            reserved.bind(("127.0.0.1", 0))
            port = reserved.getsockname()[1]
        env["WEBKIT_INSPECTOR_SERVER"] = f"127.0.0.1:{port}"
        app = start([str(image)], "app")  # genuine mounted AppImage, no extract flags
        evidence["launchPid"] = app.pid
        wait_for_mounted_identity(app, image, output / "tmp", evidence)
        inspector_probe(port, app.pid, evidence, time.monotonic() + 15)
        webdriver_status_probe(start, evidence)
        # Listening socket/target list or WebDriver /status does NOT establish app control/IPC/install/relaunch.
        evidence["blocker"] = "native-webdriver-attachment-and-ipc-unvalidated"
    except Exception as error:
        exit_code = 1
        evidence["status"] = "failed"
        evidence["error"] = str(error)
        (output / "failure.log").write_text(traceback.format_exc())
    finally:
        cleanup_errors = []
        for child in reversed(children):
            cleanup_errors.extend(cleanup_session(child))
        for log in logs:
            log.close()
        if cleanup_errors:
            evidence["cleanupErrors"] = cleanup_errors
            evidence["status"], exit_code = "failed", 1

        # Retain denied directory/data and failure evidence, no destructive cleanup.
        def after_snapshot(path):
            try:
                return snapshot(path)
            except OSError as error:
                return {"path": str(path), "error": str(error)}

        evidence["inputAfter"] = {
            key: after_snapshot(Path(info["path"])) for key, info in inputs.items()
        }
        evidence["originalArtifactsUnchanged"] = evidence["inputAfter"] == inputs
        evidence["fixtureAfter"] = [after_snapshot(path) for path in fixture_paths]
        evidence["probeFixturesUnchanged"] = (
            evidence.get("fixtureBefore") == evidence["fixtureAfter"]
        )
        evidence["imageAfter"] = after_snapshot(image)
        evidence["probeImageUnchanged"] = evidence.get("imageBefore") == evidence["imageAfter"]
        if not all(
            evidence[key]
            for key in (
                "originalArtifactsUnchanged",
                "probeFixturesUnchanged",
                "probeImageUnchanged",
            )
        ):
            evidence["status"], exit_code = "failed", 1
        (output / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
        print(
            json.dumps(
                {
                    "status": evidence["status"],
                    "acceptancePassed": False,
                    "evidence": str(output / "evidence.json"),
                    "exitCode": exit_code,
                }
            )
        )
    return exit_code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"Guard/setup refused: {error}", file=sys.stderr)
        sys.exit(1)
