# Sets the demo's headless monitor to an integer scale (HiDPI shots: 2 = twice the pixels, same layout).
# Runs inside the demo's own dbus session (session.sh), so it only reaches the demo's GNOME Shell.
import sys, time
import gi
gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

scale = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0
bus = Gio.bus_get_sync(Gio.BusType.SESSION)
def call(method, args=None, reply=None):
    return bus.call_sync("org.gnome.Mutter.DisplayConfig", "/org/gnome/Mutter/DisplayConfig", "org.gnome.Mutter.DisplayConfig",
                         method, args, GLib.VariantType(reply) if reply else None, Gio.DBusCallFlags.NONE, 5000, None)
for _ in range(50):
    try:
        serial, monitors, _logical, _props = call("GetCurrentState").unpack()
        if monitors: break
    except GLib.Error:
        pass
    time.sleep(0.2)
(connector, *_), modes, _mprops = monitors[0]
mode = next(m for m in modes if m[6].get("is-current")) if any(m[6].get("is-current") for m in modes) else modes[0]
call("ApplyMonitorsConfig", GLib.Variant("(uua(iiduba(ssa{sv}))a{sv})",
     (serial, 1, [(0, 0, scale, 0, True, [(connector, mode[0], {})])], {})))
