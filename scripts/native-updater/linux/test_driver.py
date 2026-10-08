import unittest
from unittest.mock import patch

import feasibility


class DriverTests(unittest.TestCase):
    def test_byteswapped_gvariant_full_reference_is_not_sunk_again(self):
        from unittest.mock import Mock, call

        glib = Mock()
        glib.g_variant_new_from_data.return_value = 10
        glib.g_variant_ref_sink.side_effect = lambda value: value
        glib.g_variant_is_normal_form.return_value = True
        glib.g_variant_byteswap.return_value = 20  # GLib returns a full, NOT floating reference.
        with patch("ctypes.CDLL", return_value=glib), patch("ctypes.string_at", return_value=b"()"):
            self.assertEqual(
                feasibility.variant_description(
                    b"fixture", "(ta(tsssb))", feasibility.sys.byteorder != "little"
                ),
                "()",
            )
        self.assertEqual(glib.g_variant_ref_sink.call_args_list, [call(10)])
        self.assertEqual(glib.g_variant_unref.call_args_list, [call(10), call(20)])
        glib.g_variant_type_free.assert_called_once()
        glib.g_free.assert_called_once()

    def test_webdriver_status_is_bounded_loopback_get_not_attach_or_launch(self):
        self.assertTrue(
            callable(getattr(feasibility, "webdriver_status_request", None)),
            "bounded status request missing",
        )
        import io
        from unittest.mock import Mock

        opener = Mock()
        opener.open.return_value = io.BytesIO(b'{"value":{"ready":true,"message":"No sessions"}}')
        with patch("urllib.request.build_opener", return_value=opener) as build:
            result = feasibility.webdriver_status_request(5000)
        self.assertTrue(result["ready"])
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:5000/status")
        self.assertEqual(request.get_method(), "GET")
        self.assertIsNone(request.data)
        self.assertEqual(opener.open.call_args.kwargs, {"timeout": 2})
        self.assertEqual(build.call_args.args[0].proxies, {})
        self.assertIsNone(
            build.call_args.args[1].redirect_request(
                request, None, 302, "", {}, "https://example.com"
            )
        )

    def test_webdriver_status_rejects_unbounded_or_non_status_payloads(self):
        self.assertTrue(
            callable(getattr(feasibility, "webdriver_status_request", None)),
            "bounded status request missing",
        )
        import io
        from unittest.mock import Mock

        for payload in (b"x" * 65537, b'{"value":{}}', b'{"value":{"ready":"true"}}', b"[]"):
            opener = Mock()
            opener.open.return_value = io.BytesIO(payload)
            with (
                self.subTest(payload=payload[:60]),
                patch("urllib.request.build_opener", return_value=opener),
            ):
                with self.assertRaises(ValueError):
                    feasibility.webdriver_status_request(5000)
        for port in (0, 65536, True, "5000"):
            with self.assertRaises(ValueError):
                feasibility.webdriver_status_request(port)

    def test_webdriver_probe_never_creates_a_session_and_checks_owned_listener_first(self):
        self.assertTrue(
            callable(getattr(feasibility, "webdriver_status_probe", None)), "service probe missing"
        )
        from unittest.mock import Mock

        evidence = {}
        start = Mock(return_value=Mock(pid=101))
        with patch("shutil.which", return_value=None):
            feasibility.webdriver_status_probe(start, evidence)
        start.assert_not_called()
        self.assertFalse(evidence["webdriver"]["available"])
        reserved = Mock()
        reserved.__enter__ = Mock(return_value=reserved)
        reserved.__exit__ = Mock(return_value=False)
        reserved.getsockname.return_value = ("127.0.0.1", 5000)
        events = []
        with (
            patch("shutil.which", return_value="/usr/bin/WebKitWebDriver"),
            patch("socket.socket", return_value=reserved),
            patch.object(
                feasibility,
                "verify_listener_owner",
                side_effect=lambda *a: events.append("owner") or 101,
            ),
            patch.object(
                feasibility,
                "webdriver_status_request",
                side_effect=lambda *a: events.append("status") or {"ready": True},
            ),
        ):
            feasibility.webdriver_status_probe(start, evidence)
        self.assertEqual(events, ["owner", "status"])
        self.assertEqual(
            start.call_args.args,
            (["/usr/bin/WebKitWebDriver", "--host=127.0.0.1", "--port=5000"], "webdriver"),
        )
        self.assertFalse(evidence["webdriver"]["sessionAttempted"])
        self.assertFalse(evidence["webdriver"]["appControlValidated"])

    def test_cleanup_escalates_surviving_descendant_after_leader_exit(self):
        self.assertTrue(
            callable(getattr(feasibility, "cleanup_session", None)), "session cleanup missing"
        )
        from unittest.mock import Mock

        child = Mock(pid=101, stdout=None)
        # Leader is reaped, but a different process group in the same session survives TERM.
        with (
            patch.object(
                feasibility, "live_session_members", side_effect=[[202], [202], [202], []]
            ),
            patch("os.getsid", return_value=101, create=True),
            patch("os.kill", create=True) as kill,
            patch("time.monotonic", side_effect=[0, 6, 6]),
            patch("time.sleep"),
        ):
            self.assertEqual(feasibility.cleanup_session(child), [])
        self.assertEqual(
            [call.args for call in kill.call_args_list],
            [(202, feasibility.signal.SIGTERM), (202, 9)],
        )
        child.wait.assert_called_once_with(timeout=5)

    def test_cleanup_signal_failure_does_not_skip_reaping_or_pipe_close(self):
        self.assertTrue(
            callable(getattr(feasibility, "cleanup_session", None)), "session cleanup missing"
        )
        from unittest.mock import Mock

        child = Mock(pid=101)
        with (
            patch.object(feasibility, "live_session_members", side_effect=[[202], [], [], []]),
            patch("os.getsid", return_value=101, create=True),
            patch("os.kill", side_effect=PermissionError("denied"), create=True),
            patch("time.monotonic", return_value=0),
        ):
            errors = feasibility.cleanup_session(child)
        self.assertTrue(any("denied" in error for error in errors))
        child.wait.assert_called_once_with(timeout=5)
        child.stdout.close.assert_called_once()

    def test_cleanup_pipe_close_error_is_retained_for_failure_evidence(self):
        from unittest.mock import Mock

        child = Mock(pid=101)
        child.stdout.close.side_effect = OSError("pipe-close-failed")
        with patch.object(feasibility, "live_session_members", return_value=[]):
            errors = feasibility.cleanup_session(child)
        self.assertTrue(any("pipe-close-failed" in error for error in errors))
        child.wait.assert_called_once_with(timeout=5)

    def test_session_scan_excludes_foreign_sessions_and_zombies(self):
        from unittest.mock import MagicMock, Mock

        entries = []
        for pid, state in ((101, "S"), (202, "S"), (303, "Z"), (404, "S")):
            entry = MagicMock()
            entry.name = str(pid)
            stat = Mock()
            stat.read_text.return_value = f"{pid} (name ) with spaces) {state} 1 2 3"
            entry.__truediv__.return_value = stat
            entries.append(entry)
        with (
            patch("pathlib.Path.iterdir", return_value=iter(entries)),
            patch("os.getsid", side_effect=lambda pid: 999 if pid == 404 else 101, create=True),
        ):
            self.assertEqual(feasibility.live_session_members(101), [101, 202])

    def test_driver_host_guard_is_before_any_fixture_or_native_process(self):
        self.assertTrue(callable(getattr(feasibility, "main", None)), "driver missing")
        with (
            patch("sys.platform", "win32"),
            patch("pathlib.Path.mkdir", side_effect=AssertionError("mutation")),
            patch("subprocess.Popen", side_effect=AssertionError("native process")),
        ):
            with self.assertRaisesRegex(ValueError, "Linux"):
                feasibility.main(["--case", "writable", "--manifest", "DO-NOT-READ"])


if __name__ == "__main__":
    unittest.main()
