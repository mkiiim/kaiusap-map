"""Bring a session's terminal to the front, for the map's POST /api/focus.

Two parts. What's the same everywhere: which tmux sessions a node is attached
to, the ttys of their clients (tmux list-clients only reads, and nothing in
tmux is changed), and how a terminal title names a session. What depends on
the machine: one backend per way of raising windows, each saying whether it can
run here and how it brings forward a tmux session or a titled split. On macOS
that way is each terminal app's own scripting, so today's backends are Ghostty
and Terminal.app, through AppleScript. On Linux it would be the window manager
(KWin, Hyprland, X11 through wmctrl), which can raise any terminal's window by
its title. One more backend opens a session in the app that hosts it (the
Claude desktop app, from kaiusap's `hosts`), through that app's own link; a
host comes before any terminal, since that is where the session runs. On a
platform with no backends, Show in terminal says it isn't available.
"""

import re
import subprocess
import sys
from functools import cached_property

# Targets go to the terminal app as arguments, never into script text, and are
# checked against these patterns first anyway. A tty is macOS's /dev/ttys003 or
# Linux's /dev/pts/3.
TMUX_NAME = re.compile(r"^[A-Za-z0-9._~-]{1,128}$")
TTY = re.compile(r"^/dev/(ttys?[0-9]{1,4}|pts/[0-9]{1,4})$")

# A backend's answer: "ok", "none" (no window shows it), "several" (more than
# one titled split matches, so it won't guess), "denied" (the OS refused
# control) or "error: <detail>".


# ---------- the same on every platform ----------

def attached_tmux_sessions(node):
    """The node's attached tmux sessions with valid names, in order, without repeats."""
    return list(dict.fromkeys(p["tmux_session"] for p in node.get("tmux_panes") or []
                              if p.get("attached") and TMUX_NAME.match(p.get("tmux_session") or "")))


def tmux_client_ttys(session):
    """ttys of the clients attached to a tmux session (list-clients only reads)."""
    p = subprocess.run(["tmux", "list-clients", "-t", "=" + session, "-F", "#{client_tty}"],
                       capture_output=True, text=True, timeout=5)
    return [t for t in p.stdout.split() if TTY.match(t)] if p.returncode == 0 else []


class TmuxSession:
    """An attached tmux session as the core hands it to every backend: its name, and the ttys of its
    clients, looked up once, the first time a backend asks."""

    def __init__(self, name):
        self.name = name

    @cached_property
    def client_ttys(self):
        return tmux_client_ttys(self.name)


# A provider's title starts with a status glyph (Claude's ✳ or a spinner; Codex's activity) and a space.
GLYPH = re.compile(r"^[^\x20-\x7e]+ ")
ELLIPSIS = re.compile(r"(\.\.\.|…)$")


def title_match(node, title):
    """How a terminal split's title names this session outside tmux: "id" (Codex thread id, exact),
    "name" (the provider session's name), or None."""
    name, sid = node.get("name") or "", node.get("session_id") or ""
    if node.get("provider") == "claude":
        # Claude: "✳ <name>". The glyph is required, so a tmux split titled with the bare name never matches.
        return "name" if name and GLYPH.match(title) and GLYPH.sub("", title, count=1) == name else None
    parts = [GLYPH.sub("", p, count=1).strip() for p in title.split(" | ")]
    for part in parts:
        stem = ELLIPSIS.sub("", part)
        if sid and len(stem) >= 8 and (part == sid or (stem != part and sid.startswith(stem))):
            return "id"
    return "name" if name and name in parts else None


def pick_titled(node, splits):
    """From (split id, title) pairs, the one split whose title names this session: (id, None), or
    (None, "none" | "several"). An exact thread id wins over a name; never guess between several."""
    hits = {"id": [], "name": []}
    for sid, title in splits:
        kind = title_match(node, title)
        if kind:
            hits[kind].append(sid)
    for kind in ("id", "name"):
        if len(hits[kind]) == 1:
            return hits[kind][0], None
        if len(hits[kind]) > 1:
            return None, "several"
    return None, "none"


# ---------- backends ----------

class Backend:
    """One way of raising windows on one platform: a terminal app's scripting (macOS), or a window
    manager that can raise any terminal (Linux). `label` names it to the user; `titles` says whether it
    can find a session outside tmux by its window's or split's title; `opens` says whether it can bring
    forward an app that hosts a session itself, by that app's own id for the session."""
    label = ""
    titles = False
    opens = False
    # The sentence after "<OS> didn't allow the map server to control <apps>."
    os_name = ""
    permission_help = ""

    def available(self):
        """True when this app runs on this machine now."""
        raise NotImplementedError

    def focus_tmux(self, tmux):
        """Bring forward the window showing this TmuxSession, from its name or its client ttys."""
        raise NotImplementedError

    def focus_titled(self, node):
        """Bring forward the one split titled with this session (only when `titles`)."""
        return "none"

    def focus_session(self, node):
        """Bring forward the app hosting this session, on that session (only when `opens`). Answer
        "none" when the node has no host this backend can open, so the core goes on to the other ways."""
        return "none"

    def label_for(self, node):
        """The name to give the user for this node's window; a host backend names the host."""
        return self.label


OSA_TIMEOUT = 10


def osa(script, *args):
    """Run an AppleScript with argv items. Returns its output ("ok", "none", a listing), "denied", or
    "error: " and what macOS said."""
    p = subprocess.run(["osascript", "-e", script, *args], capture_output=True,
                       text=True, timeout=OSA_TIMEOUT)
    if p.returncode != 0:
        # -1743: the user hasn't allowed this program to control the app.
        return "denied" if "-1743" in p.stderr or "Not authorized" in p.stderr else "error: " + p.stderr.strip()[:200]
    return p.stdout.strip()


class MacBackend(Backend):
    os_name = "macOS"
    permission_help = "Allow it in System Settings > Privacy & Security > Automation, then try again."
    process = ""

    def available(self):
        """True when a process with this exact name runs. Checked first, because `tell application`
        launches an app that isn't running. (`pgrep -q` is BSD's; Linux's pgrep has no -q.)"""
        return subprocess.run(["pgrep", "-xq", self.process], timeout=5).returncode == 0


# Ghostty 1.3+ scripting: each terminal surface (split) has a name, which tmux
# sets to the session name (set-titles on, set-titles-string "#S").
GHOSTTY_FOCUS = """
on run argv
  set target to item 1 of argv
  tell application "Ghostty"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with term in terminals of t
          if name of term is target then
            focus term
            activate
            return "ok"
          end if
        end repeat
      end repeat
    end repeat
  end tell
  return "none"
end run
"""
# A session outside tmux: list every split's id and title (ids are Ghostty's own
# UUIDs), match in Python, then focus the one split by id.
GHOSTTY_LIST = """
tell application "Ghostty"
  set out to {}
  repeat with t in terminals
    set end of out to (id of t) & (ASCII character 31) & (name of t)
  end repeat
  set AppleScript's text item delimiters to linefeed
  return out as text
end tell
"""
GHOSTTY_FOCUS_ID = """
on run argv
  tell application "Ghostty"
    set matches to (terminals whose id is (item 1 of argv))
    if (count of matches) is 0 then return "none"
    focus (item 1 of matches)
    activate
    return "ok"
  end tell
end run
"""
GHOSTTY_ID = re.compile(r"^[0-9A-Fa-f-]{36}$")


class GhosttyMac(MacBackend):
    label, process, titles = "Ghostty", "ghostty", True

    def focus_tmux(self, tmux):
        return osa(GHOSTTY_FOCUS, tmux.name)

    def focus_titled(self, node):
        listing = osa(GHOSTTY_LIST)
        if listing == "denied" or listing.startswith("error:"):
            return listing
        splits = [(tid, title) for tid, _, title in (line.partition("\x1f") for line in listing.splitlines())
                  if GHOSTTY_ID.match(tid)]
        tid, why = pick_titled(node, splits)
        return osa(GHOSTTY_FOCUS_ID, tid) if tid else why


# Terminal.app: match the tab whose tty is the tmux client's tty.
TERMINAL_FOCUS = """
on run argv
  set target to item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is target then
          set selected of t to true
          set index of w to 1
          activate
          return "ok"
        end if
      end repeat
    end repeat
  end tell
  return "none"
end run
"""


class TerminalMac(MacBackend):
    label, process = "Terminal", "Terminal"

    def focus_tmux(self, tmux):
        failed = None
        for tty in tmux.client_ttys:
            r = osa(TERMINAL_FOCUS, tty)
            if r in ("ok", "denied"):
                return r
            if r.startswith("error:"):
                failed = failed or r
        return failed or "none"


# A session's host, from kaiusap's `hosts`: apps, editors or pages, preferred first. The map
# opens only an app, only by its bundle id, and only with a link in a scheme of the app's own: never a
# file, web or script URL, whatever kaiusap says. The link goes to `open` as an argument, never a shell.
BUNDLE_ID = re.compile(r"^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$")
LINK = re.compile(r"^([a-z][a-z0-9+.-]{0,31}):[\x21-\x7e]{1,480}$")
REFUSED_SCHEMES = {"file", "http", "https", "javascript", "data", "about", "ftp", "blob", "vbscript"}


def safe_link(link):
    """The link when it's one the map may hand to an app, else None."""
    m = LINK.match(link) if isinstance(link, str) else None
    return link if m and m.group(1) not in REFUSED_SCHEMES else None


def host_of(node):
    """The first host the map can open: an app with a valid bundle id. Its link is kept only when safe;
    without one the app is brought forward but not on the session."""
    for h in node.get("hosts") or []:
        if isinstance(h, dict) and h.get("kind") == "app" and BUNDLE_ID.match(h.get("app_id") or ""):
            return {**h, "link": safe_link(h.get("link"))}
    return None


class HostMac(MacBackend):
    """An app that hosts the session itself (the Claude desktop app), opened by its bundle id: on the
    session through the app's link when it has one, else just brought forward. `open -b` launches an
    app that isn't running, which is what's wanted: the Claude app reopens an ended session from its
    link (seen live 2026-11-16)."""
    label, opens = "the app", True

    def available(self):
        return True

    def label_for(self, node):
        h = host_of(node)
        return (h and h.get("name")) or self.label

    def focus_session(self, node):
        h = host_of(node)
        if not h:
            return "none"
        args = ["open", "-b", h["app_id"]] + ([h["link"]] if h["link"] else [])
        p = subprocess.run(args, capture_output=True, text=True, timeout=OSA_TIMEOUT)
        return "ok" if p.returncode == 0 else "error: " + (p.stderr.strip()[:200] or f"open exited {p.returncode}")


# Each platform with backends: its name for people, and its backends in the order they're tried.
PLATFORMS = {
    "darwin": ("macOS", lambda: [HostMac(), GhosttyMac(), TerminalMac()]),
}


def backends_for(platform):
    """The backends to try on this platform, in order; none on a platform without any."""
    entry = PLATFORMS.get(platform)
    return entry[1]() if entry else []


BACKENDS = backends_for(sys.platform)


# ---------- the action ----------

def unavailable():
    names = " and ".join(name for name, _ in PLATFORMS.values())
    return False, "Not available", f"Bringing a session's window to the front works only on {names} for now."


def unavailable_reason():
    """Why Show in terminal can't work on this machine, for the map to show up front; None when it can."""
    return None if BACKENDS else unavailable()[2]


def denied(backends):
    apps = " and ".join(dict.fromkeys(b.label for b in backends))
    return False, "Needs permission", f"{backends[0].os_name} didn't allow the map server to control {apps}. {backends[0].permission_help}"


def failed(b, r):
    """An AppleScript that failed for a reason other than permission: say so, with macOS's words, rather than
    report no window, since the window may well be there."""
    return False, f"{b.label} didn't answer", f"macOS couldn't ask {b.label} for its windows: {r[6:].strip()}"


def focus_terminal(node, backends=None):
    """Bring the node's terminal to the front. Returns (ok, short, message): a
    few words for under the button and the full sentence for its tooltip."""
    backends = BACKENDS if backends is None else backends
    if not backends:
        return unavailable()
    hosted = focus_host(node, backends)
    if hosted:
        return hosted
    names = attached_tmux_sessions(node)
    if not names:
        return focus_outside_tmux(node, backends)
    refused, errors = [], []
    for name in names:
        tmux = TmuxSession(name)
        for b in backends:
            if not b.opens and b.available():
                r = b.focus_tmux(tmux)
                if r == "ok":
                    return True, f"Shown in {b.label}", f"Brought {b.label}'s {name} to the front."
                if r == "denied":
                    refused.append(b)
                elif r.startswith("error:"):
                    errors.append((b, r))
    if refused:
        return denied(refused)
    if errors:
        return failed(*errors[0])
    apps = " or ".join(b.label for b in backends if not b.opens)
    return False, "No window found", f"No {apps} window shows tmux session {names[0]}."


def focus_host(node, backends):
    """An app that hosts the session itself comes first, even over an attached tmux pane. None when no
    backend can open this node's host, so the core goes on to the terminals."""
    label = node.get("name") or node.get("session_id") or "this session"
    for b in backends:
        if b.opens and b.available():
            r = b.focus_session(node)
            app = b.label_for(node)
            if r == "ok":
                h = host_of(node)
                on = h and h["link"] and h.get("link_opens") == "session"
                return (True, f"Shown in {app}", f"Brought {app} to the front on {label}.") if on \
                    else (True, f"Opened {app}", f"Brought {app} to the front.")
            if r == "denied":
                return denied([b])
            if r.startswith("error:"):
                return False, f"{app} didn't open", f"macOS couldn't open {app}: {r[6:].strip()}"
    return None


def focus_outside_tmux(node, backends):
    """A session outside tmux and outside any host: a terminal split found by its title."""
    label = node.get("name") or node.get("session_id") or "this session"
    titled = [b for b in backends if b.titles]
    if not titled:
        return unavailable()
    apps = " or ".join(b.label for b in titled)
    running = [b for b in titled if b.available()]
    if not running:
        return False, "No window found", (f"Outside tmux the map can only find a session in {apps}, by its title, "
                                          f"and {apps} isn't running.")
    errors = []
    for b in running:
        r = b.focus_titled(node)
        if r == "ok":
            return True, f"Shown in {b.label}", f"Brought {b.label}'s {label} to the front."
        if r == "denied":
            return denied([b])
        if r == "several":
            return False, "Several windows", f"More than one {b.label} split is titled {label}, so the map won't guess which."
        if r.startswith("error:"):
            errors.append((b, r))
    if errors:
        return failed(*errors[0])
    hint = (" Codex shows its name in the title only with thread-name (default) or thread-id in [tui] terminal_title."
            if node.get("provider") == "codex" else "")
    return False, "No window found", (f"No {apps} split is titled with {label}. Outside tmux the map finds a session only "
                                      f"in {apps}, by its title.{hint}")
