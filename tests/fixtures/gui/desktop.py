"""Bounded Ubuntu desktop driver. Never calls JavaScript application handlers.

launch owns the display and D-Bus process groups; drive owns the application
group (including its real stdout child). All paths are inside work/.
"""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import struct
import time
import traceback
from desktop_receipts import observed_surface, validate

ROOT = Path(__file__).resolve().parents[3]


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, timeout=kwargs.pop("timeout", 5), **kwargs)


@contextlib.contextmanager
def owned(args, **kwargs):
    process = subprocess.Popen([str(a) for a in args], start_new_session=True, **kwargs)
    try:
        yield process
    finally:
        stop_group(process.pid, process)
        process.wait(timeout=2)


def stop_group(pgid, process=None):
    # A reaped D-Bus launcher can leave its Python driver alive and unwinding
    # cleanup of a separately sessioned app. Wait for the ENTIRE group, not just
    # its leader, before escalation. The outer launcher also owns the app group
    # through application.pid if a failed driver cannot finish its cleanup.
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if process is not None: process.poll()
        if process is None or process.returncode is not None:
            try:
                while os.waitpid(-pgid, os.WNOHANG)[0]: pass
            except ChildProcessError:
                pass
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.05)
    try:
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        return
    if process is not None: process.wait(timeout=2)
    # Linux subreaper mode makes orphaned grandchildren ours to reap as well.
    until = time.monotonic() + 2
    while time.monotonic() < until:
        try:
            pid, _ = os.waitpid(-pgid, os.WNOHANG)
            if pid == 0: time.sleep(0.05)
        except ChildProcessError:
            return


def wait(check, seconds=8, process=None):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        value = check()
        if value:
            return value
        if process is not None and process.poll() is not None:
            raise AssertionError("owned process exited: " + str(process.returncode))
        time.sleep(0.05)
    raise TimeoutError("desktop observation deadline")


def weston(command):
    client = str(Path(os.environ["XDG_RUNTIME_DIR"]) / ("input-" + str(os.getpid())))
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as connection:
        connection.settimeout(3)
        try:
            connection.bind(client)
            connection.sendto(command.encode(), os.environ["NONA_WESTON_INPUT"])
            reply = connection.recv(256).decode()
            assert reply.startswith("ok"), reply
            return reply
        finally:
            Path(client).unlink(missing_ok=True)


def launch(args):
    destination = Path(args.output).resolve()
    assert destination.is_relative_to(ROOT / "work"), destination
    destination.mkdir(parents=True, exist_ok=True)
    runtime = destination / "runtime"
    runtime.mkdir(mode=0o700, exist_ok=True)
    runtime.chmod(0o700)
    # Unix socket paths have a small fixed limit; use a short checkout-relative
    # path by changing cwd while keeping every artifact inside this checkout.
    environment = dict(os.environ, XDG_RUNTIME_DIR=str(runtime), GTK_A11Y="atspi",
                       GTK_IM_MODULE="gtk-im-context-simple", GSK_RENDERER="cairo",
                       LC_ALL="C.UTF-8", NONA_GUI_FOLDER=str(destination), NONA_GUI_ACCEPTANCE="1")
    for key in ["DISPLAY", "WAYLAND_DISPLAY", "GDK_SCALE", "GDK_DPI_SCALE"]:
        environment.pop(key, None)
    environment["GDK_BACKEND"] = args.backend
    metadata = {"requested_backend": args.backend, "requested_scale": args.scale,
                "source": run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip(),
                "architecture": os.uname().machine, "os_release": Path("/etc/os-release").read_text()}
    metadata["libraries"] = run(["dpkg-query", "-W", "libgtk-4-1", "libglib2.0-0t64", "libcairo2",
                                 "libpango-1.0-0", "libpangoft2-1.0-0", "libfontconfig1", "weston"],
                                capture_output=True, text=True).stdout
    metadata["fixtures_sha256"] = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                                    for p in [ROOT / "tests/fixtures/gui/desktop-layout.json",
                                              ROOT / "tests/fixtures/gui/layout.json", ROOT / "tests/fixtures/gui/pixels.json",
                                              ROOT / "site/samples/gui-assets/pixels.png", ROOT / "site/samples/gui-assets/Abel-Regular.ttf"]}
    (destination / "environment.json").write_text(json.dumps(metadata, indent=2))
    with (destination / "display.stdout.txt").open("w") as output, (destination / "display.stderr.txt").open("w") as errors:
        if args.backend == "x11":
            environment["DISPLAY"] = ":94"
            environment["GDK_SCALE"] = str(args.scale)
            command = ["Xvfb", ":94", "-screen", "0", "1920x1600x24", "-nolisten", "tcp"]
            readiness = ["xdpyinfo"]
        else:
            environment["WAYLAND_DISPLAY"] = "nona-wayland"
            environment["NONA_WESTON_INPUT"] = str(runtime / "input.sock")
            command = ["weston", "--backend=headless-backend.so", "--use-pixman", "--no-config",
                       "--socket=nona-wayland", "--width=1920", "--height=1600", "--scale=" + str(args.scale),
                       "--idle-time=0", "--modules=" + str((ROOT / args.module).resolve()),
                       "--log=" + str(destination / "weston.log")]
            readiness = ["wayland-info"]
        with owned(command, env=environment, stdout=output, stderr=errors) as display:
            def ready():
                try:
                    result = run(readiness, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    (destination / "display-ready.txt").write_bytes(result.stdout)
                    return True
                except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                    return False
            wait(ready, process=display)
            driver = ["dbus-run-session", "--", "/usr/bin/python3", __file__, "drive",
                      "--backend", args.backend, "--scale", str(args.scale), "--binary", args.binary,
                      "--output", str(destination)]
            if args.live_scale: driver.append("--live-scale")
            with (destination / "driver.stdout.txt").open("w") as driver_out, (destination / "driver.stderr.txt").open("w") as driver_err:
                try:
                    with owned(driver, env=environment, stdout=driver_out, stderr=driver_err) as driver_process:
                        assert driver_process.wait(timeout=180) == 0, "desktop driver failed; see artifacts"
                finally:
                    pid_file = destination / "application.pid"
                    if pid_file.exists(): stop_group(int(pid_file.read_text()))


def drive(args):
    import pyatspi
    destination = Path(args.output).resolve()
    trace_path = destination / "events.jsonl"
    inputs = []
    captures = []
    app = None
    def events():
        result = []
        for line in trace_path.read_text().splitlines():
            try: result.append(json.loads(line))
            except json.JSONDecodeError: pass  # writer may be partway through its last line
        return result
    def seen(kind, **values):
        return any(e["type"] == kind and all(e.get(k) == v for k, v in values.items()) for e in events())
    def observe(check): return wait(check, process=app)
    def walk(node, depth=0):
        if depth > 24: return
        yield node
        for child in node:
            if child is not None: yield from walk(child, depth + 1)
    def find(name, role=None):
        try:
            for node in walk(pyatspi.Registry.getDesktop(0)):
                if node.name == name and (role is None or node.getRoleName() == role): return node
        except (RuntimeError, LookupError): pass
        return None
    def accessible(name): return observe(lambda: find(name))
    keycodes = {"Tab": 15, "Return": 28, "space": 57, "Escape": 1, "ctrl": 29, "shift": 42,
                "s": 31, "l": 38, "r": 19, "u": 22, "x": 45, "1": 2, "f": 33, "4": 5, "0": 11, "8": 9}
    def key(*names):
        if args.backend == "wayland":
            for name in names: weston("key %d 1" % keycodes[name])
            for name in reversed(names): weston("key %d 0" % keycodes[name])
        else:
            run(["xdotool", "key", "--clearmodifiers", "+".join(names)])
        inputs.append({"keys": names, "transport": "weston-seat" if args.backend == "wayland" else "XTest"})
    def click(name):
        node = accessible(name)
        if args.backend == "wayland":
            bounds = node.queryComponent().getExtents(pyatspi.WINDOW_COORDS)
            weston("focus")
            weston("move %f %f" % (bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
            weston("button 272 1"); weston("button 272 0")
        else:
            wid = run(["xdotool", "search", "--name", "^Nona desktop acceptance$"], capture_output=True, text=True).stdout.splitlines()[-1]
            run(["xdotool", "windowfocus", "--sync", wid])
            bounds = node.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
            run(["xdotool", "mousemove", "--sync", str(bounds.x + bounds.width // 2),
                 str(bounds.y + bounds.height // 2), "click", "1"])
        inputs.append({"pointer": name, "transport": "weston-seat" if args.backend == "wayland" else "XTest",
                       "bounds": [bounds.x, bounds.y, bounds.width, bounds.height]})
    def action(name):
        assert accessible(name).queryAction().doAction(0), name
        inputs.append({"accessibility_action": name})
    def screenshot(name):
        surface = next(e for e in reversed(events()) if observed_surface(e, args.backend))
        picture = destination / (name + ".png")
        def color_count():
            return int(run(["identify", "-format", "%k", picture], capture_output=True, text=True).stdout)
        if args.backend == "wayland":
            before = set(destination.glob("wayland-screenshot-*.png"))
            run(["weston-screenshooter"], cwd=destination, env=dict(os.environ, XDG_PICTURES_DIR=str(destination)))
            pictures = set(destination.glob("wayland-screenshot-*.png")) - before
            assert len(pictures) == 1, "missing Weston capture"
            pictures.pop().rename(picture)
            colors = color_count()
        else:
            wid = run(["xdotool", "search", "--name", "^Nona desktop acceptance$"], capture_output=True, text=True).stdout.splitlines()[-1]
            def capture():
                run(["import", "-window", wid, picture])
                colors = color_count()
                return colors if colors > 8 else False
            colors = observe(capture)  # wait for drawn content, not a blank mapped window
        data = picture.read_bytes()
        assert data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR", "invalid screen capture"
        width, height = struct.unpack_from(">II", data, 16)
        captures.append(dict(name=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), colors=colors,
                             width=width, height=height,
                             **{k: surface[k] for k in ["surface", "slot", "session", "scaleFactor"]}))
    try:
        with trace_path.open("w") as output, (destination / "application.stderr.txt").open("w") as errors:
            with owned([Path(args.binary).resolve()], stdout=output, stderr=errors) as process:
                app = process
                (destination / "application.pid").write_text(str(app.pid))
                # Forced collections during synchronous module/scene setup can
                # take tens of seconds before the first ready trace exists.
                wait(lambda: seen("ready"), seconds=60, process=app)
                observe(lambda: any(observed_surface(e, args.backend) for e in events()))
                first = next(e for e in events() if observed_surface(e, args.backend))
                screenshot("initial")
                fixture = json.loads((ROOT / "tests/fixtures/gui/desktop-layout.json").read_text())
                converted = {}
                for name, expected in fixture["logical"].items():
                    actual = [first["bounds"][name][k] for k in ["x", "y", "width", "height"]]
                    assert actual == expected, (name, actual, expected)
                    converted[name] = [v * first["scaleFactor"] for v in actual]
                    assert converted[name] == fixture["device"][str(args.scale)][name], "measured scale conversion"
                (destination / "layout.json").write_text(json.dumps({"observed": first, "device": converted}, indent=2))
                frame = accessible("Nona desktop acceptance")
                (destination / "accessibility.json").write_text(json.dumps([
                    {"name": n.name, "role": n.getRoleName()} for n in walk(frame)], ensure_ascii=False, indent=2))
                for name, role in [("Service name", "text"), ("Run service", "push button")]:
                    assert accessible(name).getRoleName() == role
                click("Run service")
                observe(lambda: seen("pointerdown", name="Run service") and seen("state", actions=1))
                click("Service name")
                key("Tab")
                observe(lambda: find("Run service").getState().contains(pyatspi.STATE_FOCUSED))
                key("Return"); observe(lambda: seen("state", actions=2))
                key("space"); observe(lambda: seen("state", actions=3))
                key("shift", "Tab")
                observe(lambda: find("Service name").getState().contains(pyatspi.STATE_FOCUSED))
                # Native IM composition commit, with real redraws during preedit.
                key("ctrl", "shift", "u")
                for name in ["1", "f", "4", "0", "8"]: key(name)
                before = sum(e["type"] == "stdout" for e in events())
                observe(lambda: sum(e["type"] == "stdout" for e in events()) > before)
                assert not seen("input", text="gateway🐈")
                key("Return"); observe(lambda: seen("input", text="gateway🐈"))
                key("ctrl", "shift", "u"); key("1"); key("Escape"); key("x")
                observe(lambda: seen("input", text="gateway🐈x"))
                click("Scroll log"); observe(lambda: seen("scroll", offset=104))
                key("ctrl", "r"); observe(lambda: seen("resize", width=820, height=700))
                screenshot("services")
                key("ctrl", "s"); observe(lambda: seen("shortcut") and seen("screen", screen="settings"))
                assert accessible("Start automatically").getRoleName() == "check box"
                click("Start automatically"); observe(lambda: seen("toggle-state", checked=True))
                screenshot("settings")
                for request in range(1, 5):
                    click("Choose folder")
                    observe(lambda: seen("chooser-open", request=request))
                    observe(lambda: seen("chooser-progress", request=request, progress=True))
                    if request < 3:
                        accessible("Nona workspace")
                        action("Select" if request == 1 else "Cancel")
                    elif request == 3:
                        if args.backend == "wayland": weston("close")
                        else:
                            # EWMH close would need a window manager. XTest
                            # Alt+F4 is handled by GTK's native window binding.
                            action("Cancel")
                            wid = run(["xdotool", "search", "--name", "^Nona desktop acceptance$"], capture_output=True, text=True).stdout.splitlines()[-1]
                            run(["xdotool", "windowfocus", "--sync", wid])
                            key("alt", "F4")
                        observe(lambda: seen("reopen"))
                        observe(lambda: any(observed_surface(e, args.backend) and e["session"] != 1 for e in events()))
                        screenshot("reopened")
                    # Request four disposes its parent with chooser/stdout/timer work pending.
                    observe(lambda: seen("chooser-result", request=request))
                    observe(lambda: seen("chooser-after", request=request, progress=True))
                    if request == 1:
                        result = next(e for e in events() if e["type"] == "chooser-result" and e["request"] == 1)
                        assert result["folder"] == str(destination), result
                    if request == 2 and args.live_scale:
                        first = next(e for e in events() if e["type"] == "surface" and e["presentationTime"] > 0)
                        requested_at = time.monotonic_ns() // 1000
                        reply = weston("scale 2")
                        assert reply == "ok reconfigured scale 2 same surface", reply
                        inputs.append({"scale_request": 2, "surface": first["surface"], "monotonic_us": requested_at,
                                       "compositor_reply": reply})
                        observe(lambda: any(e["type"] == "surface" and e["surface"] == first["surface"]
                                            and e["session"] == first["session"] and e["scaleFactor"] == 2
                                            and e["presentationTime"] > requested_at for e in events()))
                        screenshot("live-scale-2")
                assert app.wait(timeout=5) == 0, "abnormal application exit"
                result = validate(events(), args.backend, args.scale, args.live_scale, captures=captures)
                assert len(list(destination.glob("*.png"))) >= 2
                assert any(i.get("transport") == ("weston-seat" if args.backend == "wayland" else "XTest")
                           and "pointer" in i for i in inputs)
                (destination / "PASS.json").write_text(json.dumps(result, indent=2))
    finally:
        (destination / "input.json").write_text(json.dumps(inputs, ensure_ascii=False, indent=2))
        (destination / "captures.json").write_text(json.dumps(captures, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["launch", "drive"])
    parser.add_argument("--backend", choices=["x11", "wayland"], required=True)
    parser.add_argument("--scale", type=int, choices=[1, 2], required=True)
    parser.add_argument("--binary", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--module", default="work/gui-evidence/weston-input.so")
    parser.add_argument("--live-scale", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    # Adopt and reap descendants if an app/driver dies before waiting its child.
    # This affects only this disposable Linux test process and its descendants.
    import ctypes
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise OSError(ctypes.get_errno(), "cannot enable desktop test subreaper")
    def terminated(*_): raise TimeoutError("desktop driver terminated")
    signal.signal(signal.SIGTERM, terminated)
    try:
        (launch if args.mode == "launch" else drive)(args)
    except BaseException:
        Path(args.output).mkdir(parents=True, exist_ok=True)
        Path(args.output, "FAIL.txt").write_text(traceback.format_exc())
        raise


if __name__ == "__main__": main()
