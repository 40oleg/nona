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
environment = dict(os.environ, NONA_GUI_FOLDER=str(destination.resolve()), GTK_A11Y="atspi", GTK_IM_MODULE="gtk-im-context-simple")
input_receipt = {"requested_backend": environment.get("GDK_BACKEND"), "requested_scale": environment.get("GDK_SCALE"), "ime_module": environment["GTK_IM_MODULE"], "steps": []}


def wait(check, seconds=8):
    deadline = time.monotonic() + seconds
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


def click(name, role):
    node = wait(lambda: find(name, role))
    wid = subprocess.check_output(["xdotool", "search", "--name", "^Nona controls probe$"], timeout=3).decode().splitlines()[-1]
    subprocess.run(["xdotool", "windowfocus", "--sync", wid], check=True, timeout=3)
    bounds = node.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
    subprocess.run(["xdotool", "mousemove", "--sync", str(bounds.x + bounds.width // 2), str(bounds.y + bounds.height // 2), "click", "1"], check=True, timeout=3)
    input_receipt["steps"].append({"pointer": name, "button": 1})


def logged(text):
    return text in log_path.read_text()


def input_lines():
    return [line for line in log_path.read_text().splitlines() if line.startswith("input ")]


def backgrounds():
    return log_path.read_text().count("background ")


def key(value):
    subprocess.run(["xdotool", "key", "--clearmodifiers", value], check=True, timeout=3)
    input_receipt["steps"].append({"key": value})


def terminate(signum, frame):
    # The Node runner's timeout must unwind the owned process-group cleanup.
    raise TimeoutError("input driver terminated")


signal.signal(signal.SIGTERM, terminate)


with log_path.open("w") as output, (destination / "controls.stderr.txt").open("w") as errors:
    app = subprocess.Popen([binary], stdout=output, stderr=errors, env=environment, start_new_session=True)
    try:
        # Startup under forced GC includes module and retained-scene allocation;
        # it is separate from each observation's bounded progress deadline.
        wait(lambda: logged("ready"), seconds=60)
        entry = wait(lambda: find("Service name", "text"))
        for name, role in [("Run service", "push button"), ("Enabled", "check box"), ("Choose folder", "push button")]:
            wait(lambda: find(name, role))
        window = wait(lambda: find("Nona controls probe", "frame"))
        snapshot = [{"name": node.name, "role": node.getRoleName()} for node in walk(window)]
        tree_path.write_text(json.dumps({"backend": environment.get("GDK_BACKEND"), "scale": environment.get("GDK_SCALE"), "tree": snapshot}, ensure_ascii=False, indent=2))
        assert entry.queryEditableText().setTextContents("日本語 e\u0301 🐈")
        wait(lambda: logged("input 日本語 e\u0301 🐈"))
        # GTK 4.14's GtkCheckButton has no indexed AT-SPI action. Exercise its
        # native pointer activation, then verify the accessible checked state.
        click("Enabled", "check box")
        wait(lambda: logged("checked true"))
        wait(lambda: find("Enabled").getState().contains(pyatspi.STATE_CHECKED))
        if environment.get("GDK_BACKEND") == "x11":
            wid = subprocess.check_output(["xdotool", "search", "--sync", "--name", "^Nona controls probe$"], timeout=3).decode().splitlines()[-1]
            click("Run service", "push button")
            wait(lambda: logged("pointer button 1"))
            wait(lambda: logged("activated"))
            # Focus the entry, exercise native focus traversal and both native
            # activation keys, then a synchronously consumed application key.
            assert entry.queryComponent().grabFocus()
            activations = log_path.read_text().count("activated\n")
            subprocess.run(["xdotool", "windowfocus", "--sync", wid], check=True, timeout=3)
            key("Tab")
            wait(lambda: find("Run service").getState().contains(pyatspi.STATE_FOCUSED))
            key("Return")
            wait(lambda: log_path.read_text().count("activated\n") == activations + 1)
            key("space")
            wait(lambda: log_path.read_text().count("activated\n") == activations + 2)
            key("shift+Tab")
            wait(lambda: entry.getState().contains(pyatspi.STATE_FOCUSED))
            key("ctrl+s")
            wait(lambda: logged("keydown 65289"))
            wait(lambda: logged("shortcut"))
            # A real GtkIMContextSimple composition, distinct from the AT-SPI
            # Unicode edit above. Retained scene updates must preserve preedit.
            assert entry.queryEditableText().setTextContents("")
            wait(lambda: input_lines()[-1:] == ["input "])
            before = len(input_lines())
            key("ctrl+shift+u")
            for digit in ["1", "f", "4", "0", "8"]:
                key(digit)
            redraw = backgrounds()
            wait(lambda: backgrounds() > redraw)
            assert entry.queryText().getText(0, -1) == ""
            assert len(input_lines()) == before, "preedit leaked into committed input"
            key("Return")
            wait(lambda: input_lines()[-1:] == ["input 🐈"])
            input_receipt["steps"].append({"composition": "U+1F408", "committed": "🐈", "redraw_during_preedit": True})
            before = len(input_lines())
            key("ctrl+shift+u")
            key("6")
            key("5")
            redraw = backgrounds()
            wait(lambda: backgrounds() > redraw)
            key("Escape")
            # If Escape were ignored, 'x' would encounter the still-active hex
            # preedit instead of performing this ordinary committed insertion.
            key("x")
            wait(lambda: input_lines()[-1:] == ["input 🐈x"])
            assert entry.queryText().getText(0, -1) == "🐈x"
            assert len(input_lines()) == before + 1, "cancelled preedit affected later editing"
            input_receipt["steps"].append({"composition": "U+0065", "cancelled": True, "followup_text": "🐈x"})
        for index in [1, 2, 3, 4]:
            action("Choose folder")
            wait(lambda: logged("choosing " + str(index)))
            if index < 3:
                wait(lambda: find("Nona folder selection"))
                wait(lambda: logged("modal-progress " + str(index) + " true true true"))
                action("Select" if index == 1 else "Cancel")
            wait(lambda: logged("folder " + str(index) + " " + (str(destination.resolve()) if index == 1 else "null")))
            wait(lambda: logged("after-folder " + str(index) + " true true true"))
        assert app.wait(timeout=4) == 0
        assert logged("progress true true true") and logged("normal exit")
        assert logged("parent-disposed") and logged("disposed-events 0")
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
        (destination / "controls.input.json").write_text(json.dumps(input_receipt, ensure_ascii=False, indent=2))
