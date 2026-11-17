# Moves (and optionally clicks) the pointer in the demo's headless GNOME Shell, through Mutter's
# RemoteDesktop API on the demo's own dbus session (never your desktop): pointer.py X Y [click]
# X, Y in logical pixels of the demo window (1600x1000). Used to show tooltips in the shots.
import os, sys, time
import gi
gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

demo_home = os.environ["HOME"]
addr = None
for pid in os.listdir("/proc"):
    if not pid.isdigit(): continue
    try:
        if open(f"/proc/{pid}/comm").read().strip() != "gnome-shell": continue
        env = dict(kv.split("=", 1) for kv in open(f"/proc/{pid}/environ").read().split("\0") if "=" in kv)
    except OSError:
        continue
    if env.get("HOME") == demo_home and env.get("DBUS_SESSION_BUS_ADDRESS"):
        addr = env["DBUS_SESSION_BUS_ADDRESS"]; break
if not addr: sys.exit("demo gnome-shell not found")
bus = Gio.DBusConnection.new_for_address_sync(addr, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
def call(path, iface, method, args=None, reply=None):
    return bus.call_sync("org.gnome.Mutter.RemoteDesktop", path, iface, method, args,
                         GLib.VariantType(reply) if reply else None, Gio.DBusCallFlags.NONE, 5000, None)
session, = call("/org/gnome/Mutter/RemoteDesktop", "org.gnome.Mutter.RemoteDesktop", "CreateSession", None, "(o)").unpack()
S = "org.gnome.Mutter.RemoteDesktop.Session"
call(session, S, "Start")
time.sleep(0.3)
x, y = float(sys.argv[1]), float(sys.argv[2]) + float(os.environ.get("TOP", 32))  # the window sits under the 32px top bar
call(session, S, "NotifyPointerMotionRelative", GLib.Variant("(dd)", (-20000.0, -20000.0)))
time.sleep(0.2)
call(session, S, "NotifyPointerMotionRelative", GLib.Variant("(dd)", (x, y)))
time.sleep(0.2)
call(session, S, "NotifyPointerMotionRelative", GLib.Variant("(dd)", (0.5, 0.0)))  # a small move, so hover registers
if len(sys.argv) > 3 and sys.argv[3] == "click":
    for down in (True, False):
        call(session, S, "NotifyPointerButton", GLib.Variant("(ib)", (0x110, down))); time.sleep(0.1)
time.sleep(float(os.environ.get("HOLD", "0")))
