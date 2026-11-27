"""Ubuntu AT-SPI + X11 input receipt; owns/reaps its sole application process.

AT-SPI actions and Unicode edits also work on Wayland, but only the X11 path
below injects physical pointer/key events. Do not report those as Wayland input.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

import pyatspi

binary, destination = sys.argv[1:]
destination = Path(destination)
destination.mkdir(parents=True, exist_ok=True)
log_path = destination / "controls.stdout.txt"
tree_path = destination / "controls.accessibility.json"
environment = dict(os.environ, NONA_GUI_FOLDER=str(destination.resolve()), GTK_A11Y="atspi")
deadline = time.monotonic() + 20


def wait(check):
    while time.monotonic() < deadline:
        value = check()
        if value:
            return value
        if app.poll() is not None:
            raise AssertionError("application exited: " + log_path.read_text())
        time.sleep(0.05)
    raise AssertionError("input probe timed out: " + log_path.read_text())


def walk(node, depth=0):
    if depth > 20:
        return
    yield node
    for child in node:
        if child is not None:
            yield from walk(child, depth + 1)


def find(name, role=None):
    try:
        for node in walk(pyatspi.Registry.getDesktop(0)):
            if node.name == name and (role is None or node.getRoleName() == role):
                return node
    except (RuntimeError, LookupError):
        return None
    return None


def action(name):
    node = wait(lambda: find(name))
    assert node.queryAction().doAction(0), name


def logged(text):
    return text in log_path.read_text()


with log_path.open("w") as output, (destination / "controls.stderr.txt").open("w") as errors:
    app = subprocess.Popen([binary], stdout=output, stderr=errors, env=environment, start_new_session=True)
    try:
        wait(lambda: logged("ready"))
        entry = wait(lambda: find("Service name", "text"))
        for name, role in [("Run service", "push button"), ("Enabled", "check box"), ("Choose folder", "push button")]:
            wait(lambda: find(name, role))
        window = wait(lambda: find("Nona controls probe", "frame"))
        snapshot = [{"name": node.name, "role": node.getRoleName()} for node in walk(window)]
        tree_path.write_text(json.dumps({"backend": environment.get("GDK_BACKEND"), "scale": environment.get("GDK_SCALE"), "tree": snapshot}, ensure_ascii=False, indent=2))
        assert entry.queryEditableText().setTextContents("日本語 e\u0301 🐈")
        wait(lambda: logged("input 日本語 e\u0301 🐈"))
        action("Enabled")
        wait(lambda: logged("checked true"))
        if environment.get("GDK_BACKEND") == "x11":
            wid = subprocess.check_output(["xdotool", "search", "--sync", "--name", "^Nona controls probe$"], timeout=3).decode().splitlines()[-1]
            bounds = wait(lambda: find("Run service")).queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
            subprocess.run(["xdotool", "mousemove", "--sync", str(bounds.x + bounds.width // 2), str(bounds.y + bounds.height // 2), "click", "1"], check=True, timeout=3)
            wait(lambda: logged("pointer button 1"))
            wait(lambda: logged("activated"))
            # Focus the entry, exercise native focus traversal and both native
            # activation keys, then a synchronously consumed application key.
            assert entry.queryComponent().grabFocus()
            activations = log_path.read_text().count("activated\n")
            subprocess.run(["xdotool", "windowfocus", "--sync", wid], check=True, timeout=3)
            for key in ["Tab", "Return", "space", "shift+Tab", "ctrl+s"]:
                subprocess.run(["xdotool", "key", key], check=True, timeout=3)
            wait(lambda: logged("keydown 65289"))
            wait(lambda: log_path.read_text().count("activated\n") >= activations + 2)
            wait(lambda: entry.getState().contains(pyatspi.STATE_FOCUSED))
            wait(lambda: logged("shortcut"))
        for index in [1, 2, 3]:
            action("Choose folder")
            wait(lambda: logged("choosing " + str(index)))
            if index < 3:
                wait(lambda: find("Nona folder selection"))
                action("Select" if index == 1 else "Cancel")
            wait(lambda: logged("folder " + str(index) + " " + (str(destination.resolve()) if index == 1 else "null")))
            wait(lambda: logged("after-folder " + str(index) + " true true true"))
        action("Finish probe")
        assert app.wait(timeout=4) == 0
        assert logged("progress true true true") and logged("normal exit")
    finally:
        # Include the fixture's shell/stdout child in cleanup on driver failure.
        try:
            os.killpg(app.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        if app.poll() is None:
            try:
                app.wait(timeout=2)
            except subprocess.TimeoutExpired:
                app.kill()
                app.wait(timeout=2)
