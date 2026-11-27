"""Pure acceptance assertions. Environment requests are never desktop evidence."""


def validate(events, backend, scale, live_scale=False):
    assert events and [e["seq"] for e in events] == list(range(1, len(events) + 1)), "unordered or incomplete trace"
    assert len({e["pid"] for e in events}) == 1, "mixed application processes"
    kinds = {e["type"] for e in events}
    required = {"ready", "timer", "promise", "stdout", "input", "state", "toggle-state", "pointerdown",
                "pointerup", "focus", "keydown", "shortcut", "scroll", "resize", "close", "reopen",
                "dispose-pending", "drain", "normal-exit", "child-reaped"}
    assert required <= kinds, "missing events: " + str(required - kinds)
    assert not kinds & {"deadline", "late-control", "child-error", "overflow"}, "failure event"
    surfaces = [e for e in events if e["type"] == "surface" and e["mapped"] and e["complete"]
                and e["presentationTime"] > 0 and e["width"] > 0 and e["height"] > 0]
    expected = "GdkWaylandDisplay" if backend == "wayland" else "GdkX11Display"
    assert surfaces and all(e["backend"] == expected for e in surfaces), "mapped backend mismatch"
    assert surfaces[0]["scaleFactor"] == scale, "initial measured scale mismatch"
    reopened = next(e for e in events if e["type"] == "reopen")
    first = surfaces[0]
    assert any(e["seq"] > reopened["seq"] and (e["slot"], e["session"]) != (first["slot"], first["session"])
               for e in surfaces), "reopened surface missing"
    if live_scale:
        changes = [e for e in surfaces if e["surface"] == first["surface"]
                   and (e["slot"], e["session"]) == (first["slot"], first["session"])
                   and e["scaleFactor"] == 2 and e["seq"] > first["seq"]]
        assert changes, "no same-surface scale transition"
        assert any(e["type"] == "scale" and e["scaleFactor"] == 2
                   and first["seq"] < e["seq"] <= changes[-1]["seq"] for e in events), "no scale callback"
    for request in range(1, 5):
        selected = next(e for e in events if e["type"] == "chooser-result" and e["request"] == request)
        assert (isinstance(selected["folder"], str) and selected["folder"].startswith("/")) if request == 1 else selected["folder"] is None
        for kind in ["chooser-progress", "chooser-after"]:
            assert any(e["type"] == kind and e["request"] == request and e["progress"] for e in events), kind
    disposed = next(e for e in events if e["type"] == "dispose-pending")
    assert any(e["type"] == "stdout" and e.get("disposed") and e["seq"] > disposed["seq"] for e in events)
    drain = next(e for e in events if e["type"] == "drain")
    assert drain["progress"] and drain["late"] == 0 and drain["rootDisposed"] and drain["inputDisposed"]
    return {"backend": expected, "initial_scale": scale, "live_scale": live_scale,
            "surfaces": surfaces, "events": len(events)}
