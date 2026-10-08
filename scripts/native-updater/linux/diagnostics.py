"""Bounded, allowlisted diagnostic descriptions; never grant mounted identity."""

import re

from helpers import mounted_identity, scoped_path

MAX_PROCESSES = 32
MAX_MOUNTS = 16
MAX_TEXT = 4096
MAX_ENVIRONMENT_BYTES = 128 * 1024
MAX_MOUNTINFO_BYTES = 1024 * 1024
MAX_STATUS_BYTES = 16 * 1024


def bounded_text(value):
    return value[:MAX_TEXT]


def identity_diagnostic(env, exe, mountinfo, image, temporary_root):
    """Explain the unchanged strict predicate; expose only task-subtree mount rows."""
    appdir = env.get("APPDIR", "")
    mounts = []
    scoped_count = 0
    appdir_scoped = False
    try:
        scoped_path(appdir, temporary_root)
        appdir_scoped = True
    except ValueError:
        pass
    for line in mountinfo.splitlines():
        fields = line.split()
        if "-" not in fields or len(fields) < 10:
            continue
        separator = fields.index("-")
        if separator < 6 or len(fields) < separator + 4:
            continue
        mountpoint = re.sub(r"\\([0-7]{3})", lambda m: chr(int(m[1], 8)), fields[4])
        try:
            scoped_path(mountpoint, temporary_root)
        except ValueError:
            continue
        scoped_count += 1
        if len(mounts) < MAX_MOUNTS:
            mounts.append(
                {
                    "mountpoint": bounded_text(mountpoint),
                    "filesystem": bounded_text(fields[separator + 1]),
                    "matchesAPPDIR": mountpoint == appdir,
                }
            )
    if mounted_identity(env, exe, mountinfo, image, temporary_root):
        reason = "correlated"
    elif env.get("APPIMAGE") != image:
        reason = "appimage-mismatch"
    elif not appdir:
        reason = "appdir-missing"
    elif not appdir_scoped:
        reason = "appdir-outside-task-tmp"
    elif exe != appdir + "/usr/bin/wallpaper-picker-ui":
        reason = "executable-mismatch"
    else:
        reason = "no-matching-fuse-mount"
    return {
        "reason": reason,
        "environment": {
            key: bounded_text(env[key]) for key in ("APPIMAGE", "APPDIR", "TMPDIR") if key in env
        },
        "exe": bounded_text(exe),
        "scopedMounts": mounts,
        "scopedMountsOmitted": max(0, scoped_count - len(mounts)),
    }
