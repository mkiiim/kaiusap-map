#!/usr/bin/env python3
"""Local server for the kaiusap session map.

Reads kaiusap only through `kaiusap who --json`, `kaiusap sessions --json` and
`kaiusap messages --preview [--since <time>] --json`, never through ~/.kaiusap/;
`--preview` adds the start of each body without marking it read. Runs nothing
else of kaiusap: no read, send, reply, iam, release, moot or pause.

Serves the page on 127.0.0.1 and pushes state to it over Server-Sent Events.
Polls only while at least one page is connected.

Two actions besides reading. POST /api/focus brings a session's terminal
window to the front (focus.py: Ghostty or Terminal.app, on macOS), for a
session kaiusap reports in an attached tmux session, or outside tmux in a
titled Ghostty split. It never touches kaiusap, and changes nothing in tmux:
it only lists clients. POST /api/layout saves where the map's sessions sit
and which are pinned, one layout for desktops and one for phones, in
layouts.json in the server's state folder; pin changes go on to the other
open maps with the same layout. Neither touches kaiusap.

Installed, it's the `kaiusap-map` command, with web/ beside this file; in the
repo it runs as `python3 server/kaiusap_map.py`, with web/ one folder up.
"""

__version__ = "0.2.4"

import argparse
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from collections import deque
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote

try:
    from . import focus  # installed: beside this file in the kaiusap_map package
except ImportError:
    import focus  # in the repo: `python3 server/kaiusap_map.py` puts server/ on the path

HERE = Path(__file__).resolve().parent
INSTALLED = (HERE / "web").is_dir()
WEB_DIR = HERE / "web" if INSTALLED else HERE.parent / "web"
# Files under web/ are served by extension; anything else is 404.
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}

# The only kaiusap invocations this server may make. All are read-only and act
# as no handle; `messages --preview --since <time> --json` is
# the one form with a value, checked by allowed(). `--preview`
# adds the first two lines or 256 characters of each body and marks nothing read.
ALLOWED = {("who", "--json"), ("sessions", "--json"), ("messages", "--preview", "--json"),
           ("version", "--json")}
# The oldest kaiusap release with every field the map reads. A field added later
# arrives in a minor release (kaiusap adds JSON fields under schema 1), and
# this becomes that release.
KAIUSAP_MIN = (0, 2, 0)
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)")
ISO_TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")
FULL_REFRESH = 300  # seconds between full `messages` listings
KAIUSAP_TIMEOUT = 15
HEARTBEAT = 15


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def allowed(args):
    if args in ALLOWED:
        return True
    return (len(args) == 5 and args[:3] == ("messages", "--preview", "--since")
            and bool(ISO_TIME.match(args[3])) and args[4] == "--json")


def run_kaiusap(exe, *args):
    if not allowed(tuple(args)):
        raise RuntimeError(f"refusing to run kaiusap {' '.join(args)}")
    try:
        p = subprocess.run([exe, *args], capture_output=True, text=True,
                           timeout=KAIUSAP_TIMEOUT, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"kaiusap {args[0]} took longer than {KAIUSAP_TIMEOUT} s")
    try:
        data = json.loads(p.stdout)
    except json.JSONDecodeError:
        err = (p.stderr or p.stdout).strip().splitlines()
        raise RuntimeError(f"kaiusap {args[0]} exited {p.returncode}: {err[-1] if err else 'no output'}")
    if "error" in data:
        raise RuntimeError(f"kaiusap {args[0]}: {data['error']}")
    return data


_roots = {}


def repo_root(cwd):
    """The git repository root holding cwd, else cwd itself. Cached."""
    if not cwd:
        return None
    if cwd not in _roots:
        root = cwd
        if os.path.isdir(cwd):
            try:
                p = subprocess.run(["git", "-C", cwd, "rev-parse", "--show-toplevel"],
                                   capture_output=True, text=True, timeout=3,
                                   stdin=subprocess.DEVNULL)
                if p.returncode == 0 and p.stdout.strip():
                    root = p.stdout.strip()
            except (OSError, subprocess.TimeoutExpired):
                pass
        _roots[cwd] = root
    return _roots[cwd]


def group_labels(roots):
    """Each root's island label: its last path part, or, where roots share
    that, as many trailing parts as it takes to tell them apart
    (scratch/work, oc2live/work)."""
    parts = {r: [p for p in r.split(os.sep) if p] or [r] for r in roots}
    labels = {}
    for r, ps in parts.items():
        k = 1
        while k < len(ps) and any(o != r and parts[o][-k:] == ps[-k:] for o in parts):
            k += 1
        labels[r] = "/".join(ps[-k:])
    return labels


def tilde(path):
    home = str(Path.home())
    if path and (path == home or path.startswith(home + os.sep)):
        return "~" + path[len(home):]
    return path


def self_command():
    """How the user runs this map, for the hints it prints."""
    return "kaiusap-map" if INSTALLED else f"python3 {tilde(str(Path(__file__).resolve()))}"


def kaiusap_too_old(exe):
    """None when this kaiusap is new enough for the map, else why not."""
    need = ".".join(map(str, KAIUSAP_MIN))
    try:
        have = run_kaiusap(exe, "version", "--json").get("version") or ""
    except (OSError, RuntimeError, ValueError):
        return f"the map needs kaiusap {need} or later, and kaiusap version didn't answer"
    m = SEMVER.match(have)
    if not m:
        return f"the map needs kaiusap {need} or later, and kaiusap reports version {have or 'none'!r}"
    if tuple(map(int, m.groups())) < KAIUSAP_MIN:
        return f"the map needs kaiusap {need} or later; this one is {have}"
    return None


def merge(who, sessions):
    """One node per handle; one per unnamed session. Fields from both verbs."""
    nodes = {}
    for h in who.get("handles", []):
        nodes[h["handle"]] = {
            "id": h["handle"], "handle": h["handle"], "provider": h["provider"],
            "session_id": h["session_id"], "session_key": h["session_key"],
            "cwd": h["cwd"], "name": h["name"], "reachable": h["reachable"],
            "detached": h["detached"], "why_not": h["why_not"],
            "reason_code": h["reason_code"], "unread": h["unread"],
            "where": None, "command": None, "tmux_panes": [], "trusted": None, "note": None, "context": None,
            "harness_maker": None, "harness_version": None, "activity": None, "formerly": None, "hosts": [],
        }
    for s in sessions.get("sessions", []):
        key = s.get("handle") or s["session_key"]
        n = nodes.setdefault(key, {
            "id": key, "handle": s.get("handle"), "provider": s["provider"],
            "session_id": s["session_id"], "session_key": s["session_key"],
            "cwd": s["cwd"], "name": s.get("name"), "reachable": None,
            "detached": s.get("detached", False), "why_not": None,
            "reason_code": None, "unread": 0,
        })
        # sessions describes the session the handle points to; prefer its row
        # only when it is that session.
        if n["session_key"] != s["session_key"] and s.get("handle"):
            continue
        n.update({
            "where": s.get("where"), "command": s.get("command"),
            "tmux_panes": s.get("tmux_panes") or [], "trusted": s.get("trusted"),
            "note": s.get("note"),
            "context": s.get("context"), "harness_maker": s.get("harness_maker"),
            "harness_version": s.get("harness_version"), "activity": s.get("activity"),
            "formerly": s.get("formerly"),
            # The apps hosting the session; missing from an older kaiusap.
            "hosts": s.get("hosts") or [],
        })
        if not n.get("name"):
            n["name"] = s.get("name")
    out = []
    for n in nodes.values():
        n["group"] = repo_root(n["cwd"]) or "(unknown)"
        n["dir"] = tilde(n["cwd"])
        out.append(n)
    labels = group_labels({n["group"] for n in out if n["group"] != "(unknown)"})
    for n in out:
        n["group_label"] = labels.get(n["group"], "(unknown)")
    out.sort(key=lambda n: (n["group"], n["id"]))
    return out


class Hub:
    """Latest state plus a version counter; clients wait on the condition."""

    def __init__(self, exe, interval, demo):
        self.exe, self.interval, self.demo = exe, interval, demo
        self.cond = threading.Condition()
        self.version = 0
        self.clients = 0
        self.nodes = []
        self.error = None
        self.warnings = []
        self.updated = None
        self.messages = {}   # id -> row from `messages --json`
        self.as_of = None    # the last listing's as_of, passed back as --since
        self.full_at = 0.0   # monotonic time of the last full listing
        self.payload = self._encode()
        # Example data keeps its layout in the browser only.
        self.layouts = None if demo else Layouts(self.cond, LAYOUT_FILE, lambda: [n["id"] for n in self.nodes])

    def _encode(self):
        return json.dumps({
            "schema": 1, "demo": self.demo, "updated": self.updated, "host": HOST,
            "error": self.error, "warnings": self.warnings, "nodes": self.nodes,
            "focus_unavailable": focus.unavailable_reason(),
            "messages": sorted(self.messages.values(), key=lambda m: (m["at"], m["id"])),
        })

    def poll_messages(self):
        """Messages after this poll: a full listing at first and every
        FULL_REFRESH s, else the rows changed since the last as_of, upserted by
        id. `--since` overlaps by 60 s, so rows repeat."""
        full = self.as_of is None or time.monotonic() - self.full_at > FULL_REFRESH
        if full:
            data = run_kaiusap(self.exe, "messages", "--preview", "--json")
            messages = {}
        else:
            data = run_kaiusap(self.exe, "messages", "--preview", "--since", self.as_of, "--json")
            messages = dict(self.messages)
        for m in data.get("messages", []):
            messages[m["id"]] = m
        if full:
            self.full_at = time.monotonic()
        self.as_of = data["as_of"]
        return messages, data.get("warnings") or []

    def poll_once(self):
        errors, warnings = [], []
        try:
            who = run_kaiusap(self.exe, "who", "--json")
            sessions = run_kaiusap(self.exe, "sessions", "--json")
            nodes = merge(who, sessions)
            warnings += (who.get("warnings") or []) + (sessions.get("warnings") or [])
        except Exception as e:  # keep the last good nodes on failure
            nodes = self.nodes
            errors.append(str(e))
        try:
            messages, w = self.poll_messages()
            warnings += w
        except Exception as e:  # keep the last good messages on failure
            messages = self.messages
            errors.append(str(e))
        error = "; ".join(errors) or None
        with self.cond:
            self.updated = now_iso()
            changed = ((nodes, warnings, error, messages)
                       != (self.nodes, self.warnings, self.error, self.messages))
            self.nodes, self.warnings, self.error, self.messages = nodes, warnings, error, messages
            self.payload = self._encode()
            if changed:
                self.version += 1
                self.cond.notify_all()

    def poller(self):
        while True:
            with self.cond:
                while self.clients == 0:
                    self.cond.wait()
            self.poll_once()
            time.sleep(self.interval)

    def connect(self):
        with self.cond:
            self.clients += 1
            self.cond.notify_all()

    def disconnect(self):
        with self.cond:
            self.clients -= 1


# ---------- layouts ----------

LAYOUT_KEY = re.compile(r"[a-z]{1,16}")       # a layout's name: "desktop", "phone"
TAB_ID = re.compile(r"[A-Za-z0-9-]{1,64}")    # a page's own id, so it can skip its own changes
LAYOUT_KEYS = 8          # layouts kept at most
LAYOUT_MAX = 2000        # sessions per layout
LAYOUT_ID_MAX = 200      # characters in a session's id
LAYOUT_DAYS = 30         # entries unseen this long are dropped
LAYOUT_BODY = 512 * 1024 # bytes one save may send
PIN_WRITE, FREE_WRITE = 2, 30  # seconds before a change is on disk: pins soon, settling places later


def layout_entry(v):
    """A clean {x, y, pinned} from a page's save, else None. x and y are fractions of the map's size."""
    if not isinstance(v, dict):
        return None
    x, y, pinned = v.get("x"), v.get("y"), v.get("pinned")
    for c in (x, y):
        # A session dragged off the edge can sit a little outside 0..1; NaN fails the range check.
        if isinstance(c, bool) or not isinstance(c, (int, float)) or not -10 <= c <= 10:
            return None
    if not isinstance(pinned, bool):
        return None
    return {"x": round(float(x), 4), "y": round(float(y), 4), "pinned": pinned}


def pin_change(old, new):
    """True when new pins, unpins or moves a pinned session: what other pages take on."""
    if old is None:
        return new["pinned"]
    return old["pinned"] != new["pinned"] or (new["pinned"] and (old["x"], old["y"]) != (new["x"], new["y"]))


class Layouts:
    """The map's layouts by name: each session's place and whether it's pinned. Pages send only what
    changed; pin changes are kept for the event streams, which pass them on to the other pages with
    the same layout. Written to disk atomically, soon after a pin change, later for settling places."""

    def __init__(self, cond, path, live_ids):
        self.cond = cond          # the hub's: a pin change wakes the event streams
        self.path = path
        self.live_ids = live_ids  # ids of the sessions on the map now, which count as seen
        self.layouts = self._load()
        self.seq = 0
        self.pushes = deque(maxlen=200)  # (seq, key, tab, entries) of recent pin changes
        self.wcond = threading.Condition()
        self.wlock = threading.Lock()  # one write at a time: the writer thread, or flush at shutdown
        self.due = None           # monotonic time the next write is due
        threading.Thread(target=self._writer, daemon=True).start()

    def _load(self):
        try:
            data = json.loads(self.path.read_text())
        except FileNotFoundError:
            return {}
        except (OSError, json.JSONDecodeError) as e:
            print(f"kaiusap-map: ignoring {self.path}: {e}", file=sys.stderr, flush=True)
            return {}
        layouts = data.get("layouts") if isinstance(data, dict) else None
        out = {}
        for key, lay in (layouts.items() if isinstance(layouts, dict) else []):
            if not (isinstance(key, str) and LAYOUT_KEY.fullmatch(key) and isinstance(lay, dict)):
                continue
            out[key] = {}
            for sid, v in lay.items():
                e = layout_entry(v)
                t = v.get("t") if isinstance(v, dict) else None
                if e and isinstance(sid, str) and len(sid) <= LAYOUT_ID_MAX and isinstance(t, (int, float)):
                    out[key][sid] = {**e, "t": t}
        return out

    def get(self, key):
        """The layout's sessions without their timestamps, and whether the layout exists yet. Hold cond."""
        lay = self.layouts.get(key)
        return {sid: {k: v[k] for k in ("x", "y", "pinned")} for sid, v in (lay or {}).items()}, lay is None

    def save(self, key, tab, entries):
        """Merge one page's changed sessions. False when it would start a layout past LAYOUT_KEYS."""
        with self.cond:
            if key not in self.layouts and len(self.layouts) >= LAYOUT_KEYS:
                return False
            now = time.time()
            lay = self.layouts.setdefault(key, {})
            pins = {}
            for sid, e in entries.items():
                if pin_change(lay.get(sid), e):
                    pins[sid] = e
                lay[sid] = {**e, "t": now}
            self._prune(lay, now)
            if pins:
                self.seq += 1
                self.pushes.append((self.seq, key, tab, pins))
                self.cond.notify_all()
        self._schedule(PIN_WRITE if pins else FREE_WRITE)
        return True

    def _prune(self, lay, now):
        # A session still on the map counts as seen, though a settled one sends nothing.
        for sid in self.live_ids():
            if sid in lay:
                lay[sid]["t"] = now
        for sid in [s for s, v in lay.items() if now - v["t"] > LAYOUT_DAYS * 86400]:
            del lay[sid]
        if len(lay) > LAYOUT_MAX:
            for sid in sorted(lay, key=lambda s: lay[s]["t"])[:len(lay) - LAYOUT_MAX]:
                del lay[sid]

    def pushes_for(self, key, tab, seen):
        """Pin changes after seen for this layout from other pages, merged; None when some are no
        longer kept, so the page needs the whole layout. Hold cond."""
        if self.pushes and self.pushes[0][0] > seen + 1:
            return None
        out = {}
        for seq, k, t, entries in self.pushes:
            if seq > seen and k == key and t != tab:
                out.update(entries)
        return out

    def _schedule(self, delay):
        with self.wcond:
            due = time.monotonic() + delay
            if self.due is None or due < self.due:
                self.due = due
                self.wcond.notify()

    def _writer(self):
        while True:
            with self.wcond:
                while self.due is None or time.monotonic() < self.due:
                    self.wcond.wait(None if self.due is None else self.due - time.monotonic())
                self.due = None
            self._write()

    def flush(self):
        """Write now if a write is waiting; on shutdown."""
        with self.wcond:
            waiting, self.due = self.due is not None, None
        if waiting:
            self._write()

    def _write(self):
        with self.wlock:
            with self.cond:
                data = json.dumps({"schema": 1, "layouts": self.layouts}, separators=(",", ":"))
            tmp = self.path.with_name(self.path.name + ".tmp")
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                tmp.write_text(data)
                os.replace(tmp, self.path)
            except OSError as e:
                print(f"kaiusap-map: couldn't save layouts to {self.path}: {e}", file=sys.stderr, flush=True)


def machine_name():
    """This machine's name for the summary title: its host name without .local, else its address."""
    name = socket.gethostname().strip()
    if name.lower().endswith(".local"):
        name = name[:-len(".local")]
    if name:
        return name
    try:
        return socket.gethostbyname(socket.gethostname())
    except OSError:
        return ""


HOST = machine_name()


def make_handler(hub, port, names=()):
    # names: the tailnet address and names, with --tailnet. Tailscale encrypts that
    # traffic and lets in only the tailnet's own devices, so plain HTTP is fine there.
    allowed_hosts = {f"{h}:{port}" for h in ("127.0.0.1", "localhost", *names)}
    allowed_origins = {f"http://{h}" for h in allowed_hosts}

    class Handler(BaseHTTPRequestHandler):
        server_version = "kaiusap-map"

        def log_message(self, fmt, *args):
            pass

        def do_GET(self):
            # Refuse other Host headers, so a DNS-rebinding page can't read this.
            if self.headers.get("Host") not in allowed_hosts:
                return self.send_error(HTTPStatus.FORBIDDEN)
            path = self.path.split("?", 1)[0]
            if path == "/api/state":
                return self.body(hub.payload.encode(), "application/json")
            if path == "/api/events":
                return self.events()
            self.static(path)

        def do_POST(self):
            # Same Host check, plus Origin: only the map page itself may ask, so another
            # site open in the browser can't raise windows (a cross-site POST carries its Origin).
            if (self.headers.get("Host") not in allowed_hosts
                    or self.headers.get("Origin") not in allowed_origins
                    or self.headers.get("Content-Type", "").split(";")[0] != "application/json"):
                return self.send_error(HTTPStatus.FORBIDDEN)
            if self.path == "/api/layout":
                return self.save_layout()
            if self.path != "/api/focus":
                return self.send_error(HTTPStatus.NOT_FOUND)
            try:
                n = int(self.headers.get("Content-Length") or 0)
                req = json.loads(self.rfile.read(min(n, 4096)) or b"{}")
                node_id = str(req.get("id", ""))
            except (ValueError, json.JSONDecodeError):
                return self.send_error(HTTPStatus.BAD_REQUEST)
            if hub.demo:
                ok, short, msg = False, "Example data", "Example data has no real terminals."
            else:
                # Only a session on the map, with its tmux panes re-read from
                # `kaiusap sessions --json` at click time (a rename may have happened).
                with hub.cond:
                    node = next((x for x in hub.nodes if x["id"] == node_id), None)
                try:
                    fresh = next((s for s in run_kaiusap(hub.exe, "sessions", "--json").get("sessions", [])
                                  if node and s.get("session_key") == node.get("session_key")), None)
                    if not fresh:
                        ok, short, msg = False, "Session closed", "kaiusap doesn't report that session as open any more."
                    else:
                        ok, short, msg = focus.focus_terminal(fresh)
                except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as e:
                    ok, short, msg = False, "Failed", f"Couldn't reach the terminal: {e}"
            self.body(json.dumps({"ok": ok, "short": short, "message": msg}).encode(), "application/json")

        def save_layout(self):
            # {"key": "desktop", "tab": "<page id>", "nodes": {id: {x, y, pinned}}}: only the sessions
            # that changed. Anything outside that shape is refused whole.
            if not hub.layouts:
                return self.send_error(HTTPStatus.NOT_FOUND)
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return self.send_error(HTTPStatus.BAD_REQUEST)
            if not 0 < n <= LAYOUT_BODY:
                return self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE if n > 0 else HTTPStatus.BAD_REQUEST)
            try:
                req = json.loads(self.rfile.read(n))
            except (ValueError, json.JSONDecodeError):
                return self.send_error(HTTPStatus.BAD_REQUEST)
            key, tab, entries = (req.get(k) for k in ("key", "tab", "nodes")) if isinstance(req, dict) else (None,) * 3
            if not (isinstance(key, str) and LAYOUT_KEY.fullmatch(key) and isinstance(tab, str)
                    and TAB_ID.fullmatch(tab) and isinstance(entries, dict) and len(entries) <= LAYOUT_MAX):
                return self.send_error(HTTPStatus.BAD_REQUEST)
            clean = {}
            for sid, v in entries.items():
                e = layout_entry(v)
                if e is None or len(sid) > LAYOUT_ID_MAX:
                    return self.send_error(HTTPStatus.BAD_REQUEST)
                clean[sid] = e
            if not hub.layouts.save(key, tab, clean):
                return self.send_error(HTTPStatus.BAD_REQUEST)
            self.body(b'{"ok": true}', "application/json")

        def body(self, data, ctype):
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def static(self, path):
            name = unquote(path).lstrip("/") or "index.html"
            f = (WEB_DIR / name).resolve()
            ctype = TYPES.get(f.suffix)
            # Stay inside web/, and serve only known file types.
            if not ctype or not f.is_relative_to(WEB_DIR) or not f.is_file():
                return self.send_error(HTTPStatus.NOT_FOUND)
            self.body(f.read_bytes(), ctype)

        def events(self):
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            # A page that names its layout (?layout=desktop&tab=<its id>) gets that layout first, as a
            # "layout" event, then other pages' pin changes to it as they happen. An older page names none.
            q = parse_qs(self.path.partition("?")[2])
            key, tab = (q.get("layout") or [""])[0], (q.get("tab") or [""])[0]
            lay = hub.layouts if hub.layouts and LAYOUT_KEY.fullmatch(key) and TAB_ID.fullmatch(tab) else None
            hub.connect()
            try:
                seen = lseen = -1
                if lay:
                    with hub.cond:
                        entries, empty = lay.get(key)
                        lseen = lay.seq
                    self.layout_event(key, entries, empty=empty)
                if hub.demo:
                    self.wfile.write(f"data: {hub.payload}\n\n".encode())
                    self.wfile.flush()
                    seen = hub.version
                while True:
                    with hub.cond:
                        if hub.version == seen and (not lay or lay.seq == lseen):
                            hub.cond.wait(HEARTBEAT)
                        version, payload = hub.version, hub.payload
                        pins = full = None
                        if lay and lay.seq != lseen:
                            pins = lay.pushes_for(key, tab, lseen)
                            if pins is None:
                                full = lay.get(key)[0]
                            lseen = lay.seq
                    sent = False
                    if full is not None:
                        self.layout_event(key, full, flush=False)
                        sent = True
                    elif pins:
                        self.layout_event(key, pins, push=True, flush=False)
                        sent = True
                    if version != seen and (version > 0 or hub.demo):
                        self.wfile.write(f"data: {payload}\n\n".encode())
                        seen = version
                    elif not sent:
                        self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                hub.disconnect()

        def layout_event(self, key, entries, empty=False, push=False, flush=True):
            # push: only the sessions whose pins changed elsewhere; else the whole layout.
            msg = json.dumps({"key": key, "nodes": entries, "empty": empty, "push": push})
            self.wfile.write(f"event: layout\ndata: {msg}\n\n".encode())
            if flush:
                self.wfile.flush()

    return Handler


# ---------- background process: start, stop, status ----------

STATE_DIR = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local" / "state") / "kaiusap-map"
STATE_FILE = STATE_DIR / "server.json"
LOG_FILE = STATE_DIR / "server.log"
LAYOUT_FILE = STATE_DIR / "layouts.json"


def read_state():
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def is_ours(pid):
    """True when pid is alive and is this script, so a reused pid isn't mistaken for it."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return False
    p = subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True)
    return Path(__file__).name in p.stdout


def running():
    """The state of the background server, or None; clears a stale state file."""
    st = read_state()
    if st and is_ours(st.get("pid", -1)):
        return st
    if st:
        try:
            STATE_FILE.unlink()
        except OSError:
            pass
    return None


TAILSCALE_APP = "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
TAILNET_IP = re.compile(r"^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]{1,3}\.[0-9]{1,3}$")
DNS_NAME = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$")


def tailnet():
    """This Mac's tailnet IPv4 address and its names, from the Tailscale CLI, or a reason."""
    exe = shutil.which("tailscale") or (TAILSCALE_APP if os.access(TAILSCALE_APP, os.X_OK) else None)
    if not exe:
        return None, "the Tailscale CLI isn't on the PATH"
    try:
        p = subprocess.run([exe, "status", "--json"], capture_output=True, text=True, timeout=10)
        st = json.loads(p.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return None, "tailscale status didn't answer"
    if st.get("BackendState") != "Running":
        return None, f"Tailscale isn't connected ({st.get('BackendState') or 'unknown'})"
    me = st.get("Self") or {}
    ip = next((a for a in me.get("TailscaleIPs") or [] if TAILNET_IP.match(a)), None)
    if not ip:
        return None, "Tailscale reports no IPv4 address for this Mac"
    names = [ip]
    full = (me.get("DNSName") or "").rstrip(".").lower()
    if DNS_NAME.match(full):
        names += [full, full.split(".")[0]]
    return names, None


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def cmd_start(args):
    st = running()
    if st:
        print(f"kaiusap-map: already running at {st['url']} (pid {st['pid']}).")
        if args.open:
            webbrowser.open(st["url"])
        return 0
    if port_open(args.port):
        print(f"kaiusap-map: something else is listening on 127.0.0.1:{args.port}. Pass another --port.", file=sys.stderr)
        return 1
    if not args.demo:
        exe = shutil.which("kaiusap")
        why = kaiusap_too_old(exe) if exe else "kaiusap isn't on the PATH. Install kaiusap"
        if why:
            print(f"kaiusap-map: {why}.", file=sys.stderr)
            return 1
    tail_url = None
    if args.tailnet:
        names, why = tailnet()
        if why:
            print(f"kaiusap-map: --tailnet: {why}.", file=sys.stderr)
            return 1
        tail_url = f"http://{(names[1:2] or names)[0]}:{args.port}/"
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    child = [sys.executable, str(Path(__file__).resolve()), "run",
             "--port", str(args.port), "--interval", str(args.interval)]
    if args.demo:
        child.append("--demo")
    if args.tailnet:
        child.append("--tailnet")
    with open(LOG_FILE, "a") as log:
        log.write(f"--- {now_iso()} start\n")
        log.flush()
        proc = subprocess.Popen(child, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                start_new_session=True, close_fds=True)
    url = f"http://127.0.0.1:{args.port}/"
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            tail = LOG_FILE.read_text().strip().splitlines()[-1:]
            print(f"kaiusap-map: the server exited at start: {tail[0] if tail else 'no output'}. See {tilde(str(LOG_FILE))}.", file=sys.stderr)
            return 1
        if port_open(args.port):
            break
        time.sleep(0.1)
    else:
        print(f"kaiusap-map: the server didn't start listening within 5 s. See {tilde(str(LOG_FILE))}.", file=sys.stderr)
        return 1
    STATE_FILE.write_text(json.dumps({"pid": proc.pid, "port": args.port, "url": url,
                                      "tailnet_url": tail_url, "demo": args.demo, "started": now_iso()}))
    print(f"kaiusap-map: running at {url}{' (example data)' if args.demo else ''} (pid {proc.pid}). Stop it with: {self_command()} stop")
    if tail_url:
        print(f"kaiusap-map: and on your tailnet at {tail_url}")
    if args.open:
        webbrowser.open(url)
    return 0


def cmd_stop(args):
    st = running()
    if not st:
        print("kaiusap-map: not running.")
        return 0
    pid = st["pid"]
    os.kill(pid, signal.SIGTERM)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and is_ours(pid):
        time.sleep(0.1)
    forced = False
    if is_ours(pid):
        os.kill(pid, signal.SIGKILL)
        forced = True
    try:
        STATE_FILE.unlink()
    except OSError:
        pass
    print(f"kaiusap-map: stopped (pid {pid}{', forced after 5 s' if forced else ''}).")
    return 0


def cmd_status(args):
    st = running()
    if not st:
        print("kaiusap-map: not running.")
        return 1
    print(f"kaiusap-map: running at {st['url']}{' (example data)' if st.get('demo') else ''} "
          f"(pid {st['pid']}, since {st['started']}). Log: {tilde(str(LOG_FILE))}")
    if st.get("tailnet_url"):
        print(f"kaiusap-map: and on your tailnet at {st['tailnet_url']}")
    return 0


def main():
    ap = argparse.ArgumentParser(
        prog="kaiusap-map" if INSTALLED else None,
        description="Serve the kaiusap session map on localhost.",
        epilog="Commands: run (default) serves in the foreground; start runs it in the background, "
               "detached from the terminal; stop ends that; status reports it.")
    ap.add_argument("command", nargs="?", default="run", choices=["run", "start", "stop", "status"])
    ap.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--interval", type=float, default=3.0, help="seconds between polls (default 3)")
    ap.add_argument("--open", action="store_true", help="open the map in the browser")
    ap.add_argument("--demo", action="store_true", help=argparse.SUPPRESS)  # example data, no kaiusap commands; undocumented
    ap.add_argument("--tailnet", action="store_true",
                    help="also listen on this Mac's Tailscale address, for your own tailnet devices")
    args = ap.parse_args()
    if args.command != "run":
        sys.exit({"start": cmd_start, "stop": cmd_stop, "status": cmd_status}[args.command](args))

    # A background server stops cleanly on SIGTERM.
    def on_term(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, on_term)

    exe = None
    if not args.demo:
        exe = shutil.which("kaiusap")
        if not exe:
            sys.exit("kaiusap-map: kaiusap isn't on the PATH. Install kaiusap.")
        why = kaiusap_too_old(exe)
        if why:
            sys.exit(f"kaiusap-map: {why}.")

    names = []
    if args.tailnet:
        names, why = tailnet()
        if why:
            sys.exit(f"kaiusap-map: --tailnet: {why}.")

    hub = Hub(exe, max(1.0, args.interval), args.demo)
    handler = make_handler(hub, args.port, names)
    servers = []
    for addr in ["127.0.0.1", *names[:1]]:
        try:
            servers.append(ThreadingHTTPServer((addr, args.port), handler))
        except OSError as e:
            sys.exit(f"kaiusap-map: can't listen on {addr}:{args.port} ({e.strerror}). Pass another --port.")
        servers[-1].daemon_threads = True
    httpd = servers[0]
    for extra in servers[1:]:
        threading.Thread(target=extra.serve_forever, daemon=True).start()
    if not args.demo:
        threading.Thread(target=hub.poller, daemon=True).start()

    url = f"http://127.0.0.1:{args.port}/"
    print(f"kaiusap map{' (example data)' if args.demo else ''}: {url}  (Ctrl-C to stop)", flush=True)
    for h in names[1:2] or names[:1]:
        print(f"  and on your tailnet: http://{h}:{args.port}/", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print()
    finally:
        for srv in servers:
            srv.server_close()
        if hub.layouts:
            hub.layouts.flush()


if __name__ == "__main__":
    main()
