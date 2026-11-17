// The README flow's map side, as scripted data. render.mjs injects this into web/index.html before the page's own
// scripts run. It stands in for the map server: EventSource is replaced, and window.__flow(f) pushes the state for
// beat f (0..75, half a second each, the same beats as kaiusap's docs/assets/flow.gif) and selects the session
// acting in that step. Everything here is made up; it is an illustration.
(() => {
  const T0 = Date.parse("2026-11-14T15:00:00Z");
  const at = f => new Date(T0 + f * 500).toISOString();
  const ago = min => new Date(T0 - min * 60000).toISOString();

  let es = null;
  window.EventSource = class { constructor() { es = this; } close() {} };

  const DIR = { "kaiusap-demo": "~/Projects/kaiusap-demo", api: "~/Projects/api", docs: "~/Projects/docs" };
  const MODEL = {
    claude: ["anthropic", "2.1.323", "claude-opus-5-5", "anthropic", null],
    codex: ["openai", "0.169.0", "gpt-6.1-sol", "openai", 475000],
    opencode: ["opencode", "1.19.5", "gemini-3.8-flash", "google", 1048576],
  };
  let pane = 10;
  const key = (provider, h) => `${provider}:${[...h].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(8, "0")}-0000-4000-8000-${h.length.toString().padStart(12, "0")}`;
  function session(handle, provider, project, o = {}) {
    const [harness_maker, harness_version, model, model_maker, limit] = MODEL[provider];
    const reachable = o.reachable ?? true, where = o.where ?? "tmux";
    return {
      id: handle, handle, provider, session_id: key(provider, handle).split(":")[1], session_key: key(provider, handle),
      cwd: DIR[project].replace("~", "/Users/you"), name: o.name ?? handle, reachable, detached: !!o.detached,
      why_not: o.why_not ?? null, reason_code: o.reason_code ?? null, unread: 0, where,
      command: where === "tmux" ? `tmux -L default attach -t '=${handle}'` : null,
      tmux_panes: where === "tmux" ? [{ pane: `4100@1794200000:%${pane++}`, tmux_session: handle, attached: !o.detached, trusted: null }] : [],
      trusted: null, note: null,
      context: { used: o.used ?? 60000, limit, limit_source: limit ? "provider" : null, model, model_maker, at: ago(1) },
      harness_maker, harness_version,
      activity: o.activity === null ? null : { state: o.activity ?? "idle", waiting_on: o.waiting ?? [], observed_at: ago(0) },
      formerly: [], group: DIR[project].replace("~", "/Users/you"), dir: DIR[project], group_label: project,
    };
  }
  const K = {};
  let mid = 0;
  function msg(from, to, subject, o = {}) {
    const id = o.id ?? `20261114T1${String(mid++).padStart(5, "0")}Z-flow${mid}`;
    return {
      id, at: o.at, from, from_session_key: K[from] ?? null, to, to_session_key: K[to] ?? null, subject,
      reply_needed: !!o.reply_needed, in_reply_to: o.in_reply_to ?? null, chain_id: o.chain_id ?? id, depth: o.depth ?? 0,
      state: o.state ?? "answered", owed: !!o.owed, answerable_by: to,
      from_persona_session_key: K[from] ?? null, to_persona_session_key: K[to] ?? null, reply_to: from,
      outcome: o.outcome ?? "delivered", reason_code: null, changed_at: o.at, preview_field: o.reply_needed ? "request" : "body",
      preview: o.preview ?? subject,
    };
  }

  // The machine around the flow: two neighbouring repositories, sessions in the states the map can show, and one
  // handle released two days ago.
  const bgNodes = () => [
    session("api-cld", "claude", "api", { name: "orders endpoint", activity: "blocked", waiting: ["approval"], used: 140000 }),
    session("api-cdx", "codex", "api", { name: "rate limits", reachable: false, where: "unknown", why_not: "the thread isn't loaded in the Codex daemon", reason_code: "thread_not_loaded", activity: null }),
    session("api-db-cld", "claude", "api", { name: "migration dry run", detached: true }),
    session("docs-cld", "claude", "docs", { name: "API reference" }),
    session("docs-cdx", "codex", "docs", { name: "examples pass", activity: "working", used: 210000 }),
  ];
  const bgMsgs = () => [
    msg("api-cld", "api-cdx", "Which headers carry the rate limit", { at: ago(190), reply_needed: true }),
    msg("api-cdx", "api-cld", "Re: Which headers carry the rate limit", { at: ago(180) }),
    msg("api-cld", "api-cdx", "Confirm the 429 body", { at: ago(40), state: "unread", outcome: "stored", reason_code: "thread_not_loaded" }),
    msg("api-cld", "api-db-cld", "Can you run the migration dry run", { at: ago(300), reply_needed: true }),
    msg("api-db-cld", "api-cld", "Re: Can you run the migration dry run", { at: ago(280) }),
    msg("docs-cld", "api-cld", "Schema for /orders", { at: ago(900), reply_needed: true }),
    msg("api-cld", "docs-cld", "Re: Schema for /orders", { at: ago(870) }),
    msg("docs-cdx", "docs-cld", "Examples for the new pagination cursor", { at: ago(12), state: "unread" }),
    msg("docs-cdx", "docs-cld", "Two examples still use the old cursor", { at: ago(6), state: "unread" }),
    msg("docs-oc", "docs-cld", "Glossary draft", { at: ago(2900) }),
    msg("docs-cld", "docs-oc", "Re: Glossary draft", { at: ago(2880) }),
    msg("backend-eng", "api-cld", "Date format the orders endpoint returns", { at: ago(240), reply_needed: true }),
    msg("api-cld", "backend-eng", "Re: Date format the orders endpoint returns", { at: ago(230) }),
  ];

  // The flow, by beat. Each step's lines appear one beat apart, as in flow.gif: step 1 at beats 6-9, step 2 at
  // 18-23, step 3 at 32-37, step 4 at 46-49, step 5 at 58-59. Beats 0-5 are the prompt being typed.
  const ACT = [[0, "backend-eng"], [18, "frontend-dev"], [32, "qa-tester"], [46, "frontend-dev"], [58, "backend-eng"]];
  function state(f) {
    mid = 0;
    const trio = [
      session("backend-eng", "claude", "kaiusap-demo", { name: "parser change lead", used: 48000 }),
      session("frontend-dev", "codex", "kaiusap-demo", { name: "order date parser", used: 91000 }),
      session("qa-tester", "opencode", "kaiusap-demo", { name: "integration suite", used: 35000 }),
    ];
    const [be, fe, qa] = trio;
    const nodes = [...trio, ...bgNodes()];
    nodes.forEach(n => { K[n.handle] = n.session_key; });
    K["docs-oc"] = "opencode:0f0c1a2b-3c4d-4e5f-8a9b-000000000006";
    const working = (n, from, to) => { if (f >= from && (to == null || f < to)) n.activity.state = "working"; };
    working(be, 6, 9); working(fe, 8, 23); working(qa, 22, 36); working(fe, 37, 48); working(be, 49, 59);

    const msgs = [];
    const send = (beat, from, to, subject, o) => { if (f >= beat) msgs.push(msg(from, to, subject, { at: at(beat), ...o })); };
    // 1.2 backend-eng asks frontend-dev; 2.1 read; 4.2 answered.
    send(7, "backend-eng", "frontend-dev", "Implement the parser change", {
      id: "20261114T150003Z-parser", reply_needed: true,
      state: f >= 47 ? "answered" : f >= 18 ? "read" : "unread", owed: f < 47,
      preview: "Implement the parser change in parseOrderDate.ts, have qa-tester run the integration suite on it, and reply with both the unit and integration results.",
    });
    // 2.4 frontend-dev asks qa-tester; 3.1 read; 3.4 answered.
    send(21, "frontend-dev", "qa-tester", "Run the integration suite", {
      id: "20261114T150010Z-suite", reply_needed: true, chain_id: "20261114T150003Z-parser", depth: 1,
      state: f >= 35 ? "answered" : f >= 32 ? "read" : "unread", owed: f < 35,
      preview: "The parser change is in parseOrderDate.ts, and its unit tests pass (48 of 48). Run the integration suite on it and reply with the results.",
    });
    // 3.4 qa-tester replies; 4.1 read.
    send(35, "qa-tester", "frontend-dev", "Re: Run the integration suite", {
      id: "20261114T150017Z-suite-re", in_reply_to: "20261114T150010Z-suite", chain_id: "20261114T150003Z-parser", depth: 2,
      state: f >= 46 ? "read" : "unread", preview: "112 of 112 pass, 0 failed.",
    });
    // 4.2 frontend-dev replies to backend-eng; 5.1 read.
    send(47, "frontend-dev", "backend-eng", "Re: Implement the parser change", {
      id: "20261114T150023Z-parser-re", in_reply_to: "20261114T150003Z-parser", chain_id: "20261114T150003Z-parser", depth: 3,
      state: f >= 58 ? "read" : "unread", preview: "The parser change is in: unit tests 48 of 48, integration suite 112 of 112 (run by qa-tester).",
    });
    const all = [...bgMsgs(), ...msgs];
    for (const n of nodes) n.unread = all.filter(m => m.to === n.handle && m.state === "unread").length;
    return { schema: 1, demo: false, updated: at(f), host: "dev-laptop", error: null, warnings: [], nodes, messages: all };
  }

  let selected = null;
  // The neighbours draw smaller than the map would draw them, so the flow's three sessions stand out. The map
  // sizes a session by its traffic each update; this scales the radius it gave them and has the map redraw them
  // (it redraws every session when the theme attribute is set), and its islands follow the smaller radius.
  const SMALL = 0.65;
  function shrink() {
    for (const el of document.querySelectorAll("#map g.node")) {
      const d = el.__data__;
      if (d && !["backend-eng", "frontend-dev", "qa-tester"].includes(d.id)) d.r *= SMALL;
    }
    document.documentElement.setAttribute("data-theme", document.documentElement.dataset.theme);
  }
  // Push only a changed state: each push nudges the layout, as a real update does.
  let last = null;
  window.__flow = f => {
    const s = state(f), same = { ...s, updated: null }, k = JSON.stringify(same);
    if (k !== last) { last = k; es.onmessage({ data: JSON.stringify(s) }); shrink(); }
    const who = [...ACT].reverse().find(([beat]) => f >= beat)[1];
    if (who !== selected) {
      const g = [...document.querySelectorAll("#map g.node")].find(el => el.__data__?.id === who);
      if (g) { g.dispatchEvent(new MouseEvent("click", { bubbles: true })); selected = who; }
    }
  };
  window.__flowState = state;
})();
