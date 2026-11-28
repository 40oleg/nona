"""Receipt rejection tests run without GTK, a display, or pyatspi."""
import copy
import unittest
from unittest.mock import Mock, patch
from desktop_receipts import validate
from desktop import owned


def receipt():
    events = []
    def add(kind, **data):
        events.append(dict(seq=len(events) + 1, type=kind, pid=42, session=1,
                           ticks=4, jobs=4, lines=4, **data))
    add("ready", child=43)
    surface = dict(slot=0, surface="1:2", mapped=True, width=760, height=650,
                   complete=True, presentationTime=100, backend="GdkWaylandDisplay", scaleFactor=1)
    add("surface", **surface)
    for kind in ["timer", "promise", "stdout", "pointerdown", "pointerup", "focus", "keydown",
                 "input", "state", "toggle-state", "shortcut", "scroll", "resize"]:
        add(kind)
    for request in range(1, 5):
        add("chooser-open", request=request)
        add("chooser-progress", request=request, progress=True)
        add("chooser-result", request=request, folder="/workspace" if request == 1 else None)
        add("chooser-after", request=request, progress=True)
    add("scale", scaleFactor=2)
    add("surface", **dict(surface, scaleFactor=2))
    add("close")
    add("reopen")
    add("surface", **dict(surface, slot=1, surface="1:3"))
    add("dispose-pending")
    add("stdout", disposed=True)
    add("drain", progress=True, late=0, rootDisposed=True, inputDisposed=True)
    add("normal-exit")
    add("child-reaped")
    return events


class Receipts(unittest.TestCase):
    def test_xvfb_requires_captured_pixels_when_presentation_feedback_is_unavailable(self):
        events = receipt()
        for e in events:
            if e["type"] == "surface":
                e.update(backend="GdkX11Display", complete=False, presentationTime=0)
        captures = [dict(surface="1:2", slot=0, session=1, scaleFactor=1,
                         sha256="a" * 64, bytes=1024, width=760, height=650, colors=16),
                    dict(surface="1:3", slot=1, session=1, scaleFactor=1,
                         sha256="b" * 64, bytes=1024, width=760, height=650, colors=16)]
        validate(events, "x11", 1, captures=captures)
        for bad in [[], captures[:1], [dict(c, bytes=0) for c in captures],
                    [dict(c, width=0) for c in captures], [dict(c, surface="other") for c in captures],
                    [dict(c, colors=1) for c in captures], [dict(c, sha256="") for c in captures]]:
            with self.subTest(captures=bad), self.assertRaises(AssertionError):
                validate(events, "x11", 1, captures=bad)

    def test_cleanup_waits_for_driver_group_even_after_its_leader_exits(self):
        process = Mock(pid=42)
        process.wait.return_value = 0
        process.poll.return_value = 0
        process.returncode = 0
        signals = []
        def killpg(pid, sig):
            signals.append(sig)
            if signals.count(0) >= 2: raise ProcessLookupError()
        with patch("desktop.subprocess.Popen", return_value=process), \
             patch("desktop.os.killpg", side_effect=killpg, create=True), \
             patch("desktop.signal.SIGKILL", 9, create=True), \
             patch("desktop.os.waitpid", side_effect=ChildProcessError), \
             patch("desktop.os.WNOHANG", 1, create=True), \
             patch("desktop.time.sleep"), \
             patch("desktop.time.monotonic", side_effect=range(20)):
            with owned(["fake"]): pass
        self.assertNotIn(9, signals)
        self.assertGreaterEqual(signals.count(0), 2)

    def check(self, events):
        return validate(events, "wayland", 1, True)

    def test_complete(self):
        self.check(receipt())

    def test_missing_boundary(self):
        for kind in ["input", "pointerdown", "shortcut", "child-reaped", "normal-exit", "toggle-state", "drain"]:
            events = [e for e in receipt() if e["type"] != kind]
            for i, event in enumerate(events): event["seq"] = i + 1
            with self.subTest(kind=kind), self.assertRaises(AssertionError):
                self.check(events)

    def test_missing_trace_line_is_not_a_complete_receipt(self):
        events = receipt()
        events[1]["seq"] = 100
        with self.assertRaises(AssertionError): self.check(events)

    def test_requested_backend_or_scale_is_not_observed(self):
        for field, value in [("backend", "GdkX11Display"), ("scaleFactor", 3), ("mapped", False),
                             ("presentationTime", 0), ("complete", False), ("width", 0)]:
            events = receipt()
            for e in events:
                if e["type"] == "surface": e[field] = value
            with self.subTest(field=field), self.assertRaises(AssertionError): self.check(events)

    def test_new_surface_is_not_live_scale_change(self):
        events = receipt()
        for e in events:
            if e["type"] == "surface" and e["scaleFactor"] == 2: e["surface"] = "other"
        with self.assertRaises(AssertionError): self.check(events)

    def test_no_forgiven_chooser_or_disposal_failure(self):
        for kind, field, value in [("chooser-after", "progress", False), ("drain", "late", 1),
                                   ("chooser-result", "folder", None)]:
            events = copy.deepcopy(receipt())
            next(e for e in events if e["type"] == kind)[field] = value
            with self.subTest(kind=kind), self.assertRaises(AssertionError): self.check(events)


if __name__ == "__main__": unittest.main()
