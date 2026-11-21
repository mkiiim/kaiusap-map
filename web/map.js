(() => {
// ---------- state ----------
// nodes: {id, provider, project (group key), groupLabel, state, unread, name, reason, waiting, owes, spawned, named, dir, r, ...}
let nodes = [], links = [], byId = new Map();
let demo = false, subjects = [], liveMessages = [], seenIds = null;
// Why the server can't bring windows forward on its machine (no focus backend, as on Linux), or null when it can.
let noFocus = null;
let lastUpdate = null, lastError = null;

// ---------- helpers ----------
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const ago = m => m < 1 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const tms = t => Date.parse(String(t).replace(/(\.\d{3})\d+/, "$1")); // microseconds -> ms precision
const nid = x => x?.id ?? x;
let seed = 11;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function degreeCount(id) { return links.filter(l => (l.source.id ?? l.source) === id || (l.target.id ?? l.target) === id).reduce((a, l) => a + l.count, 0) / 3; }
function radius(n) { return n.spawned ? 8 : n.named ? 15 + Math.min(8, degreeCount(n.id) * 1.4) : 10; }
function groupLabel(p) { return byId.size ? (nodes.find(n => n.project === p)?.groupLabel ?? p) : p; }

// Model makers' marks, keyed by kaiusap's maker names (kaiusap-DS "SESSION MAP — marks", circle fill row),
// noted at their source as:
// vendor marks, taken from anthropic.com and openai.com; both use
// currentColor so they inherit the row's text colour
// OpenCode's is kaiusap-DS assets/brand/provider-opencode.svg, its path unchanged;
// x and y are its viewBox origin.
// Google's is kaiusap-DS assets/brand/maker-gemini.svg, its path unchanged.
// Use them unmodified and in one colour, only to identify the provider, and only on this local map.
const MARKS = {
  anthropic: { label: "Anthropic", w: 35, h: 24, paths: '<path d="M24.5475 0H19.3384L28.8374 24H34.0465L24.5475 0Z" fill="currentColor"/><path d="M9.49897 0L0 24H5.31125L7.25395 18.96H17.1914L19.1341 24H24.4454L14.9464 0H9.49897ZM8.97193 14.5029L12.2227 6.06857L15.4735 14.5029H8.97193Z" fill="currentColor"/>' },
  openai: { label: "OpenAI", w: 41, h: 41, paths: '<path d="M37.5324 16.8707C37.9808 15.5241 38.1363 14.0974 37.9886 12.6859C37.8409 11.2744 37.3934 9.91076 36.676 8.68622C35.6126 6.83404 33.9882 5.3676 32.0373 4.4985C30.0864 3.62941 27.9098 3.40259 25.8215 3.85078C24.8796 2.7893 23.7219 1.94125 22.4257 1.36341C21.1295 0.785575 19.7249 0.491269 18.3058 0.500197C16.1708 0.495044 14.0893 1.16803 12.3614 2.42214C10.6335 3.67624 9.34853 5.44666 8.6917 7.47815C7.30085 7.76286 5.98686 8.3414 4.8377 9.17505C3.68854 10.0087 2.73073 11.0782 2.02839 12.312C0.956464 14.1591 0.498905 16.2988 0.721698 18.4228C0.944492 20.5467 1.83612 22.5449 3.268 24.1293C2.81966 25.4759 2.66413 26.9026 2.81182 28.3141C2.95951 29.7256 3.40701 31.0892 4.12437 32.3138C5.18791 34.1659 6.8123 35.6322 8.76321 36.5013C10.7141 37.3704 12.8907 37.5973 14.9789 37.1492C15.9208 38.2107 17.0786 39.0587 18.3747 39.6366C19.6709 40.2144 21.0755 40.5087 22.4946 40.4998C24.6307 40.5054 26.7133 39.8321 28.4418 38.5772C30.1704 37.3223 31.4556 35.5506 32.1119 33.5179C33.5027 33.2332 34.8167 32.6547 35.9659 31.821C37.115 30.9874 38.0728 29.9178 38.7752 28.684C39.8458 26.8371 40.3023 24.6979 40.0789 22.5748C39.8556 20.4517 38.9639 18.4544 37.5324 16.8707ZM22.4978 37.8849C20.7443 37.8874 19.0459 37.2733 17.6994 36.1501C17.7601 36.117 17.8666 36.0586 17.936 36.0161L25.9004 31.4156C26.1003 31.3019 26.2663 31.137 26.3813 30.9378C26.4964 30.7386 26.5563 30.5124 26.5549 30.2825V19.0542L29.9213 20.998C29.9389 21.0068 29.9541 21.0198 29.9656 21.0359C29.977 21.052 29.9842 21.0707 29.9867 21.0902V30.3889C29.9842 32.375 29.1946 34.2791 27.7909 35.6841C26.3872 37.0892 24.4838 37.8806 22.4978 37.8849ZM6.39227 31.0064C5.51397 29.4888 5.19742 27.7107 5.49804 25.9832C5.55718 26.0187 5.66048 26.0818 5.73461 26.1244L13.699 30.7248C13.8975 30.8408 14.1233 30.902 14.3532 30.902C14.583 30.902 14.8088 30.8408 15.0073 30.7248L24.731 25.1103V28.9979C24.7321 29.0177 24.7283 29.0376 24.7199 29.0556C24.7115 29.0736 24.6988 29.0893 24.6829 29.1012L16.6317 33.7497C14.9096 34.7416 12.8643 35.0097 10.9447 34.4954C9.02506 33.9811 7.38785 32.7263 6.39227 31.0064ZM4.29707 13.6194C5.17156 12.0998 6.55279 10.9364 8.19885 10.3327C8.19885 10.4013 8.19491 10.5228 8.19491 10.6071V19.808C8.19351 20.0378 8.25334 20.2638 8.36823 20.4629C8.48312 20.6619 8.64893 20.8267 8.84863 20.9404L18.5723 26.5542L15.206 28.4979C15.1894 28.5089 15.1703 28.5155 15.1505 28.5173C15.1307 28.5191 15.1107 28.516 15.0924 28.5082L7.04046 23.8557C5.32135 22.8601 4.06716 21.2235 3.55289 19.3046C3.03862 17.3858 3.30624 15.3413 4.29707 13.6194ZM31.955 20.0556L22.2312 14.4411L25.5976 12.4981C25.6142 12.4872 25.6333 12.4805 25.6531 12.4787C25.6729 12.4769 25.6928 12.4801 25.7111 12.4879L33.7631 17.1364C34.9967 17.849 36.0017 18.8982 36.6606 20.1613C37.3194 21.4244 37.6047 22.849 37.4832 24.2684C37.3617 25.6878 36.8382 27.0432 35.9743 28.1759C35.1103 29.3086 33.9415 30.1717 32.6047 30.6641C32.6047 30.5947 32.6047 30.4733 32.6047 30.3889V21.188C32.6066 20.9586 32.5474 20.7328 32.4332 20.5338C32.319 20.3348 32.154 20.1698 31.955 20.0556ZM35.3055 15.0128C35.2464 14.9765 35.1431 14.9142 35.069 14.8717L27.1045 10.2712C26.906 10.1554 26.6803 10.0943 26.4504 10.0943C26.2206 10.0943 25.9948 10.1554 25.7963 10.2712L16.0726 15.8858V11.9982C16.0715 11.9783 16.0753 11.9585 16.0837 11.9405C16.0921 11.9225 16.1048 11.9068 16.1207 11.8949L24.1719 7.25025C25.4053 6.53903 26.8158 6.19376 28.2383 6.25482C29.6608 6.31589 31.0364 6.78077 32.2044 7.59508C33.3723 8.40939 34.2842 9.53945 34.8334 10.8531C35.3826 12.1667 35.5464 13.6095 35.3055 15.0128ZM14.2424 21.9419L10.8752 19.9981C10.8576 19.9893 10.8423 19.9763 10.8309 19.9602C10.8195 19.9441 10.8122 19.9254 10.8098 19.9058V10.6071C10.8107 9.18295 11.2173 7.78848 11.9819 6.58696C12.7466 5.38544 13.8377 4.42659 15.1275 3.82264C16.4173 3.21869 17.8524 2.99464 19.2649 3.1767C20.6775 3.35876 22.0089 3.93941 23.1034 4.85067C23.0427 4.88379 22.937 4.94215 22.8668 4.98473L14.9024 9.58517C14.7025 9.69878 14.5366 9.86356 14.4215 10.0626C14.3065 10.2616 14.2466 10.4877 14.2479 10.7175L14.2424 21.9419ZM16.071 17.9991L20.4018 15.4978L24.7325 17.9975V22.9985L20.4018 25.4983L16.071 22.9985V17.9991Z" fill="currentColor"/>' },
  opencode: { label: "OpenCode", x: 128, y: 96, w: 256, h: 320, paths: '<path fill-rule="evenodd" clip-rule="evenodd" d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z" fill="currentColor"/>' },
  google: { label: "Gemini", x: 8, y: 8, w: 176, h: 176, paths: '<path d="M164.93 86.68c-13.56-5.84-25.42-13.84-35.6-24.01-10.17-10.17-18.18-22.04-24.01-35.6-2.23-5.19-4.04-10.54-5.42-16.02C99.45 9.26 97.85 8 96 8s-3.45 1.26-3.9 3.05c-1.38 5.48-3.18 10.81-5.42 16.02-5.84 13.56-13.84 25.43-24.01 35.6-10.17 10.16-22.04 18.17-35.6 24.01-5.19 2.23-10.54 4.04-16.02 5.42C9.26 92.55 8 94.15 8 96s1.26 3.45 3.05 3.9c5.48 1.38 10.81 3.18 16.02 5.42 13.56 5.84 25.42 13.84 35.6 24.01 10.17 10.17 18.18 22.04 24.01 35.6 2.24 5.2 4.04 10.54 5.42 16.02A4.03 4.03 0 0 0 96 184c1.85 0 3.45-1.26 3.9-3.05 1.38-5.48 3.18-10.81 5.42-16.02 5.84-13.56 13.84-25.42 24.01-35.6 10.17-10.17 22.04-18.18 35.6-24.01 5.2-2.24 10.54-4.04 16.02-5.42A4.03 4.03 0 0 0 184 96c0-1.85-1.26-3.45-3.05-3.9-5.48-1.38-10.81-3.18-16.02-5.42" fill="currentColor"/>' },
};
// Each provider (harness) kaiusap reports: its name, its fill and its maker, the last for rows that lack
// kaiusap's harness_maker (example data, released handles). An unknown provider falls back to Claude's look.
const PROVIDERS = {
  claude: { name: "Claude", app: "Claude Code", fill: "--color-provider-claude", maker: "anthropic" },
  codex: { name: "Codex", app: "Codex", fill: "--color-provider-codex", maker: "openai" },
  opencode: { name: "OpenCode", app: "OpenCode", fill: "--color-provider-opencode", maker: "opencode" },
  // OpenCode 2 is a provider of its own: keys opencode2:<id>, harness maker
  // opencode. A stronger plum than 1.x (kaiusap-DS), with OpenCode's mark.
  opencode2: { name: "OpenCode 2", app: "OpenCode", fill: "--color-provider-opencode2", maker: "opencode" },
};
// Which mark a session wears: the fill says which app it runs in, the mark who made the model of its last
// reply (kaiusap's context.model_maker). With no reply yet, an unknown maker, or a maker with no mark here,
// it wears its harness maker's mark.
const markOf = d => {
  if (d.spawned || !d.named) return "";
  const model = d.context?.model_maker, harness = d.harness_maker || providerOf(d.provider).maker;
  return Object.hasOwn(MARKS, model) ? model : Object.hasOwn(MARKS, harness) ? harness : "";
};
const providerOf = p => (Object.hasOwn(PROVIDERS, p) ? PROVIDERS[p] : PROVIDERS.claude);
// The app and version running a live session now, from kaiusap's harness_version: "Claude
// Code 2.1.319", "OpenCode 2.2.7". Empty when it's null (not live, or kaiusap can't tell) or absent (an older
// kaiusap). It's the running version, which can trail the installed one; the map doesn't guess at newer ones.
const runningText = d => d.harness_version
  ? `${Object.hasOwn(PROVIDERS, d.provider) ? PROVIDERS[d.provider].app + " " : ""}${d.harness_version}` : "";
// The mark centred on (0,0), its wider side `size` across.
function markSvg(provider, size) {
  const m = MARKS[provider];
  if (!m) return "";
  const k = size / Math.max(m.w, m.h), w = m.w * k, h = m.h * k;
  return `<svg class="mark" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" viewBox="${m.x || 0} ${m.y || 0} ${m.w} ${m.h}" aria-hidden="true">${m.paths}</svg>`;
}

// ---------- svg ----------
const svg = d3.select("#map");
// A soft blue glow under picked sessions: a radial fade, coloured from CSS so it follows the theme.
const glow = svg.append("defs").append("radialGradient").attr("id", "pick-glow");
glow.append("stop").attr("offset", "45%").attr("class", "glow-in");
glow.append("stop").attr("offset", "100%").attr("class", "glow-out");
const root = svg.append("g");
const gHull = root.append("g");
const gLink = root.append("g");
const gPacket = root.append("g");
const gNode = root.append("g");
const gFlow = root.append("g"); // owed-reply hooks, above the sessions so a neighbour never hides one (no pointer events)
const gMarquee = root.append("g"); // the selection box, above everything
let W = 800, H = 600;
// Panning the canvas needs Shift with a mouse drag (touch drags still pan); the wheel and pinch zoom.
// A plain click on blank space only clears the selection.
const stageEl = document.getElementById("stage");
// The farthest out you can zoom: 40%, or less when that's what fitting the map in needs (a phone).
let kMin = 0.4;
const zoom = d3.zoom().scaleExtent([kMin, 2.5])
  .filter(e => !e.target.closest(".node") && !e.button && (e.type === "wheel" || e.type.startsWith("touch") || e.shiftKey))
  .on("start", e => { if (e.sourceEvent?.type === "mousedown") stageEl.classList.add("panning"); })
  .on("zoom", e => { root.attr("transform", e.transform); showZoom(e.transform.k); })
  .on("end", e => { stageEl.classList.remove("panning"); if (e.sourceEvent) saveLayout(); });
// A double tap zooms in on a touch screen, so a phone, which hides the zoom buttons, has a one-finger zoom
// (WCAG 2.5.1). d3 handles the double tap itself and calls this listener; with a mouse, double-click stays off.
const dblZoom = svg.call(zoom).on("dblclick.zoom"), coarse = matchMedia("(pointer: coarse)");
const setDblZoom = () => svg.on("dblclick.zoom", coarse.matches ? dblZoom : null);
setDblZoom();
coarse.addEventListener("change", setDblZoom);
// Show the open hand while Shift is held, so the pan is discoverable; the closed hand while dragging.
const panReady = on => stageEl.classList.toggle("pan-ready", on);
addEventListener("keydown", e => { if (e.key === "Shift") panReady(true); });
addEventListener("keyup", e => { if (e.key === "Shift") panReady(false); });
addEventListener("blur", () => panReady(false));
// Keyboard or pointer: a session's focus ring shows only after Tab, never after a click.
addEventListener("keydown", e => { if (e.key === "Tab") document.documentElement.classList.add("kbd"); }, true);
addEventListener("pointerdown", () => document.documentElement.classList.remove("kbd"), true);
svg.on("mousemove.pan", e => panReady(e.shiftKey));
// ---------- selecting several sessions ----------
// A plain drag on blank canvas draws a box; the sessions inside it are picked (Cmd or Ctrl adds to the
// pick). Dragging any picked session moves them all. A click on blank canvas or Esc clears the pick.
let picked = new Set(), skipClick = false;
let press = null, pressed = false; // a long press under way, and whether one just toggled the pick
function basePick() { return picked.size ? new Set(picked) : selected?.type === "node" ? new Set([selected.d]) : new Set(); }
function setPicked(set, show = true) {
  picked = set;
  if (!show) return updateNodes();
  if (picked.size >= 2) select({ type: "pick" });
  else if (picked.size === 1) select({ type: "node", d: [...picked][0] });
  else if (selected?.type === "pick") select(null);
  else updateNodes();
}
svg.on("click", e => {
  if (skipClick) { skipClick = false; return; }
  if (e.target === svg.node() || e.target.closest(".hull")) { if (picked.size) setPicked(new Set()); select(null); }
});
svg.on("pointerdown.marquee", e => {
  if (e.button !== 0 || e.shiftKey || e.pointerType === "touch" || e.target.closest(".node, .link-hit")) return;
  const t = d3.zoomTransform(svg.node()), at = ev => t.invert(d3.pointer(ev, svg.node()));
  const p0 = at(e), add = e.metaKey || e.ctrlKey, base = add ? new Set(picked) : new Set();
  let box = null;
  const move = ev => {
    const p1 = at(ev);
    if (!box && Math.hypot((p1[0] - p0[0]) * t.k, (p1[1] - p0[1]) * t.k) < 4) return;
    box ||= gMarquee.append("rect").attr("class", "marquee");
    const x0 = Math.min(p0[0], p1[0]), y0 = Math.min(p0[1], p1[1]), x1 = Math.max(p0[0], p1[0]), y1 = Math.max(p0[1], p1[1]);
    box.attr("x", x0).attr("y", y0).attr("width", x1 - x0).attr("height", y1 - y0);
    const inside = new Set(base);
    vNodes.forEach(n => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) inside.add(n); });
    setPicked(inside, false);
  };
  const up = () => {
    removeEventListener("pointermove", move); removeEventListener("pointerup", up);
    if (box) { box.remove(); skipClick = true; setTimeout(() => { skipClick = false; }, 0); setPicked(picked); }
  };
  addEventListener("pointermove", move); addEventListener("pointerup", up);
});

const opts = { past: true, spawned: true, unnamed: true };
let selected = null; // {type:'node'|'link', d}

const sim = d3.forceSimulation()
  .force("link", d3.forceLink().id(d => d.id)
    .distance(l => l.lineage ? 34 : sameGroup(l) ? 80 : 170)
    .strength(l => l.lineage ? 0.9 : sameGroup(l) ? 0.35 : 0.06))
  .force("charge", d3.forceManyBody().strength(d => d.spawned ? -40 : d.named ? -300 : -120))
  .force("collide", d3.forceCollide(d => d.r + 10))
  .force("group", groupForce(0.12))
  .force("x", d3.forceX(() => W / 2).strength(0.025))
  .force("y", d3.forceY(() => H / 2).strength(0.035))
  .on("tick", ticked);

function sameGroup(l) { return l.source.project === l.target.project; }
function groupForce(k) {
  let ns;
  function force(alpha) {
    const c = d3.rollup(ns, v => ({ x: d3.mean(v, d => d.x), y: d3.mean(v, d => d.y) }), d => d.project);
    for (const d of ns) { const g = c.get(d.project); d.vx += (g.x - d.x) * k * alpha; d.vy += (g.y - d.y) * k * alpha; }
  }
  force.initialize = n => (ns = n);
  return force;
}

let vNodes = [], vLinks = [];
function visible() {
  vNodes = nodes.filter(n => (opts.spawned || !n.spawned) && (opts.unnamed || n.named || n.holdsMail) && (opts.past || !n.released));
  const ids = new Set(vNodes.map(n => n.id));
  vLinks = links.filter(l => ids.has(l.source.id ?? l.source) && ids.has(l.target.id ?? l.target) && (opts.past || l.last < 120 || l.open));
}

let linkSel, hitSel, flowSel, nodeSel, hullSel;
const widthScale = d3.scaleSqrt().domain([1, 15]).range([1.2, 6]);
const fade = m => m < 60 ? 0.85 : m < 1440 ? 0.55 : 0.35; // DS floor 0.35

function render(alpha = 0.8) {
  visible();
  linkSel = gLink.selectAll("line.link").data(vLinks, l => key(l)).join("line").attr("class", "link")
    .attr("stroke-width", l => l.lineage ? 1 : widthScale(l.count))
    .attr("stroke-dasharray", l => l.lineage ? "2 4" : null)
    .attr("stroke-opacity", l => l.lineage ? 0.6 : fade(l.last))
    // An owed reply's blue dashes carry the colour; its line stays grey so they stand alone.
    .classed("recent", l => !l.lineage && !l.open && l.last < 60);
  hitSel = gLink.selectAll("line.link-hit").data(vLinks.filter(l => !l.lineage), l => key(l)).join("line").attr("class", "link-hit")
    .on("click", (e, l) => { e.stopPropagation(); select({ type: "link", d: l }); });
  // Owes a reply (kaiusap-DS): one hook per owing end of a line. Blue dashes run from the asker toward the
  // session that owes and turn just past its ring; the reply still owed arcs back toward the asker as dashes that
  // slow, shrink to dots and fade as they near an outlined arrowhead (animateOwed): expected, not yet sent.
  // Each hook is the sending dashes, the reply's dashes and the arrow, drawn above the sessions with no halo.
  const hooks = vLinks.flatMap(l => [...(l.owers || (l.open ? [l.open] : []))].map(o => ({ l, o })));
  flowSel = gFlow.selectAll("g.flow-pair").data(hooks, h => key(h.l) + "@" + h.o).join(e => {
    const g = e.append("g").attr("class", "flow-pair");
    g.append("path").attr("class", "flow");
    g.append("g").attr("class", "flow-dots");
    g.append("polygon").attr("class", "flow-arrow");
    return g;
  });

  nodeSel = gNode.selectAll("g.node").data(vNodes, d => d.id).join(enter => {
    const g = enter.append("g").attr("class", "node").attr("tabindex", 0).attr("role", "button");
    g.append("circle").attr("class", "pick");
    g.append("circle").attr("class", "wring"); // a turn running: the ring that grows from r + 4
    g.append("circle").attr("class", "ring");
    g.append("circle").attr("class", "body");
    g.append("g").attr("class", "glyph");
    g.append("text").attr("class", "label");
    g.append("g").attr("class", "badge");
    // A turn running (kaiusap activity "working") under reduced motion: three still dots under the name; layDots()
    // sets them and the ring. Its title says so too, so the state never rests on motion alone.
    g.append("g").attr("class", "dots").append("title").text("Turn running");
    g.append("circle").attr("class", "pin").attr("r", 2.6);
    g.call(drag());
    g.call(longPress);
    g.on("click", (e, d) => {
      e.stopPropagation();
      if (pressed) { pressed = false; return; } // a long press already toggled it
      // Cmd or Ctrl toggles a session in the pick; a plain click on one outside the pick clears it.
      if (e.metaKey || e.ctrlKey) return togglePick(d);
      if (!picked.has(d) && picked.size) setPicked(new Set(), false);
      select({ type: "node", d });
    })
      // Unpinning keeps the session where it is: it only moves when something else stirs the layout
      // (a new session, a drag). "Release pins" is the explicit "tidy up" and does restart it.
      .on("dblclick", (e, d) => { e.stopPropagation(); d.fx = d.fy = null; d.vx = d.vy = 0; d.pinned = false; updateNodes(); saveLayout(); })
      .on("contextmenu.ctx", (e, d) => {
        e.preventDefault();
        // A touch long press toggles the pick instead; Ctrl-click keeps its selection meaning.
        if (press || pressed || (e.ctrlKey && e.button === 0)) return;
        openCtx(d, e);
      })
      .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select({ type: "node", d }); } })
      .on("mouseenter", (e, d) => highlight(d)).on("mouseleave", () => highlight(null));
    return g;
  });
  updateNodes();
  sim.nodes(vNodes);
  sim.force("link").links(vLinks);
  sim.alpha(alpha).restart();
  const empty = document.getElementById("empty");
  empty.hidden = vNodes.length > 0 || !lastUpdate;
  empty.textContent = nodes.length ? "Every session is hidden by the filters." : "kaiusap lists no sessions.";
}
function key(l) { return (l.source.id ?? l.source) + ">" + (l.target.id ?? l.target); }

function label(d) {
  if (d.spawned) return "explore";
  if (d.named) return d.id;
  const last = (d.formerly || []).reduce((a, f) => (!a || tms(f.at) >= tms(a.at) ? f : a), null);
  return d.name || last?.handle || (d.session_id || "").slice(0, 8) || "(no handle)";
}
// Turn running (kaiusap-DS): a --color-text-mid ring grows from r + 4 and fades, 1.8s, looping. Under
// reduced motion there's no ring: three still dots under the name instead.
const stillMotion = matchMedia("(prefers-reduced-motion: reduce)");
function layDots() {
  if (!nodeSel) return;
  const still = stillMotion.matches;
  nodeSel.select(".wring").attr("r", d => d.r + 4).attr("display", d => d.activity?.state === "working" && !still ? null : "none");
  nodeSel.select(".dots").each(function (d) {
    const on = d.activity?.state === "working" && still, g = d3.select(this).attr("display", on ? null : "none");
    if (!on) return;
    g.selectAll("circle").data([-6, 0, 6]).join("circle").attr("r", 2).attr("cx", x => x).attr("cy", d.r + 25);
  });
}
stillMotion.addEventListener("change", layDots);
function updateNodes() {
  showPinControls();
  nodeSel.attr("class", d => `node ${d.spawned ? "spawned" : ""} ${d.named ? "" : "unnamed"} ${d.state === "stored" ? "off" : ""} ${d.released ? "released" : ""} ${selected?.type === "node" && selected.d === d ? "selected" : ""} ${picked.has(d) ? "picked" : ""}`)
    .attr("aria-label", d => `${label(d)}, ${d.provider}, ${statusText(d)}${runningText(d) ? ", running " + runningText(d) : ""}`);
  nodeSel.select(".body").attr("r", d => d.r).attr("fill", d => css(providerOf(d.provider).fill));
  nodeSel.select(".ring").attr("r", d => d.r + 4).attr("class", d => `ring ${d.state}`);
  nodeSel.select(".pick").attr("r", d => d.r * 2 + 10)
    .attr("display", d => picked.has(d) || (selected?.type === "node" && selected.d === d) ? null : "none");
  // Re-draw a mark only when its provider or size changes.
  nodeSel.select(".glyph").each(function (d) {
    const m = markOf(d), want = m ? `${m}:${d.r}` : "";
    if (this.dataset.mark === want) return;
    this.dataset.mark = want;
    this.innerHTML = want ? markSvg(m, d.r * 2 * 0.55) : "";
  });
  nodeSel.select(".label").attr("y", d => d.r + 17).text(label);
  layDots();
  nodeSel.select(".pin").attr("cx", d => -d.r * 0.7).attr("cy", d => -d.r * 0.7).attr("display", d => d.pinned ? null : "none");
  nodeSel.select(".badge").each(function (d) {
    const b = d3.select(this).attr("transform", `translate(${d.r * 0.75},${-d.r * 0.75})`);
    const items = [];
    if (d.waiting) items.push({ t: "!", c: "--color-secondary", tc: "--color-text-on-secondary" });
    if (d.unread) items.push({ t: d.unread, c: "--color-primary", tc: "--color-text-on-primary" });
    const s = b.selectAll("g").data(items).join(e => { const g = e.append("g"); g.append("circle").attr("r", 7.5); g.append("text"); return g; })
      .attr("transform", (x, i) => `translate(${i * 13},0)`);
    s.select("circle").attr("fill", x => css(x.c));
    s.select("text").text(x => x.t).attr("fill", x => css(x.tc));
  });
  linkSel?.classed("selected", l => selected?.type === "link" && selected.d === l);
}

function hullPoints(members) {
  const pts = [];
  for (const d of members) for (let a = 0; a < 8; a++) {
    const t = a / 8 * Math.PI * 2, r = d.r + 22;
    pts.push([d.x + Math.cos(t) * r, d.y + Math.sin(t) * r]);
  }
  return d3.polygonHull(pts);
}
const hullLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6));

function ticked() {
  // No bounding box: a node can be dragged and pinned anywhere; the x and y forces keep free nodes central.
  const groups = d3.groups(vNodes, d => d.project).map(([p, m]) => ({ p, m, hull: hullPoints(m) }));
  hullSel = gHull.selectAll("g").data(groups, g => g.p).join(e => { const g = e.append("g"); g.append("path").attr("class", "hull"); const t = g.append("text").attr("class", "hull-label"); t.append("tspan"); t.append("title"); return g; });
  hullSel.select("path").attr("d", g => hullLine(g.hull));
  // The label is the directory's name, or more of its path where two islands share a name; the title gives it whole.
  hullSel.select("tspan").text(g => groupLabel(g.p));
  hullSel.select("title").text(g => g.p.replace(/^\/Users\/[^/]+/, "~"));
  hullSel.select("text").attr("x", g => d3.min(g.hull, p => p[0]) + 6).attr("y", g => d3.min(g.hull, p => p[1]) - 6);
  const pos = sel => sel.attr("x1", l => l.source.x).attr("y1", l => l.source.y).attr("x2", l => l.target.x).attr("y2", l => l.target.y);
  pos(linkSel); pos(hitSel);
  // flow runs from the sender toward the session that owes the reply
  // select (not selectAll) passes each pair's current link down to its lines.
  flowSel.each(function (h) {
    const b = byId.get(h.o), a = other(h.l, h.o), k = hook(a, b), g = d3.select(this).attr("display", k ? null : "none");
    h.k = k;
    if (!k) return;
    g.selectAll("path").attr("d", k.d);
    g.select("polygon").attr("points", k.arrow);
  });
  nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
  wakeOwed();
}
// The hook's geometry (kaiusap-DS "Owes a reply", with the legs moved off the line): the sending leg runs
// `side` px to one side of the line, from just outside the asker's ring to 10px past the owing node's ring; a turn
// of that radius brings it to the same distance on the other side, and the reply leg arcs back toward the asker. The
// arc runs from the turn to just outside the asker's ring, bowing outward (away from the sending leg) by a twelfth
// of that run (3 to 14px), but only its first `back` share by length is drawn: the arrowhead's tip ends there, still on
// the arc, heading for the asker. The arrowhead is 12px long and 8px wide. None when the two rings nearly touch.
const HOOK = { side: 5, turn: 10, back: 0.8, bow: 1 / 12, bowMin: 3, bowMax: 14, arrow: 12, half: 4 };
function hook(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const ra = a.r + 4 + 6, rb = b.r + 4 + HOOK.turn;
  if (!len || len - ra - rb < 4) return null;
  const u = [dx / len, dy / len], n = [-u[1], u[0]], f = v => v.toFixed(1);
  const g = HOOK.side, S = [a.x + u[0] * ra - n[0] * g, a.y + u[1] * ra - n[1] * g];
  const P = [b.x - u[0] * rb - n[0] * g, b.y - u[1] * rb - n[1] * g], P2 = [P[0] + n[0] * 2 * g, P[1] + n[1] * 2 * g];
  // The whole arc: a quadratic curve from P2 to F, beside the line at the asker's ring, whose control point C sits
  // outward of the midpoint by twice the bow, so the curve's peak is the bow.
  const F = [a.x + u[0] * ra + n[0] * g, a.y + u[1] * ra + n[1] * g], run = len - ra - rb;
  const h = Math.min(HOOK.bowMax, Math.max(HOOK.bowMin, run * HOOK.bow));
  const C = [(P2[0] + F[0]) / 2 + n[0] * 2 * h, (P2[1] + F[1]) / 2 + n[1] * 2 * h];
  const at = t => [0, 1].map(i => (1 - t) ** 2 * P2[i] + 2 * (1 - t) * t * C[i] + t * t * F[i]);
  // Walk the arc to find where the drawn part ends: the arrowhead's base E sits an arrow's length before the tip,
  // which is `back` of the arc's length from P2.
  const N = 48, pts = d3.range(N + 1).map(i => at(i / N)), acc = [0];
  for (let i = 1; i <= N; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tAt = s => { const i = Math.max(1, d3.bisectLeft(acc, s)), k = (s - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1); return (i - 1 + Math.min(1, k)) / N; };
  const tip = acc[N] * HOOK.back, te = tAt(Math.max(0, tip - HOOK.arrow)), E = at(te), T = at(tAt(tip));
  // The drawn part, P2 to E, as its own quadratic (de Casteljau split at te).
  const C1 = [P2[0] + (C[0] - P2[0]) * te, P2[1] + (C[1] - P2[1]) * te];
  // The drawn part measured by length, for the dots that travel it.
  const q = t => [0, 1].map(i => (1 - t) ** 2 * P2[i] + 2 * (1 - t) * t * C1[i] + t * t * E[i]);
  const qs = d3.range(33).map(i => q(i / 32)), qa = [0];
  for (let i = 1; i <= 32; i++) qa.push(qa[i - 1] + Math.hypot(qs[i][0] - qs[i - 1][0], qs[i][1] - qs[i - 1][1]));
  const backAt = s => { const i = Math.min(32, Math.max(1, d3.bisectLeft(qa, s))), w = (s - qa[i - 1]) / ((qa[i] - qa[i - 1]) || 1); return [qs[i - 1][0] + (qs[i][0] - qs[i - 1][0]) * w, qs[i - 1][1] + (qs[i][1] - qs[i - 1][1]) * w]; };
  const el = Math.hypot(T[0] - E[0], T[1] - E[1]) || 1, v = [(T[0] - E[0]) / el, (T[1] - E[1]) / el], m = [-v[1], v[0]];
  return {
    d: `M${f(S[0])} ${f(S[1])}L${f(P[0])} ${f(P[1])}A${g} ${g} 0 0 1 ${f(P2[0])} ${f(P2[1])}`,
    backLen: qa[32], backAt,
    arrow: `${f(T[0])},${f(T[1])} ${f(E[0] + m[0] * HOOK.half)},${f(E[1] + m[1] * HOOK.half)} ${f(E[0] - m[0] * HOOK.half)},${f(E[1] - m[1] * HOOK.half)}`,
  };
}
function other(l, id) { return l.source.id === id ? l.target : l.source; }
// The reply still owed: dashes leave the turn at the sending dashes' speed (12px/s, 11px apart) and ease out along
// the arc, slowing, shrinking to dots and fading to nothing at the arrowhead. Under reduced motion they hold still,
// shrinking and fading the same way. The loop runs only while a reply is owed and motion is allowed: with no
// hook, or under reduced motion, it draws once and stops, and wakeOwed starts it again when the hooks move
// (every tick of the layout) or the motion setting changes.
const OWED_DOTS = { gap: 11, speed: 12.2, dash: 4 };
let owedFrame = 0;
function wakeOwed() { if (!owedFrame) owedFrame = requestAnimationFrame(animateOwed); }
function animateOwed(now) {
  owedFrame = 0;
  let owed = false;
  flowSel?.each(function (h) {
    const k = h.k;
    if (!k) return;
    owed = true;
    const L = k.backLen, n = Math.max(2, Math.round(2 * L / OWED_DOTS.gap)), period = 2 * L / OWED_DOTS.speed * 1000;
    const base = stillMotion.matches ? 0 : now / period;
    d3.select(this).select(".flow-dots").selectAll("line").data(d3.range(n)).join("line")
      .each(function (i) {
        const p = (base + i / n) % 1, s = L * (1 - (1 - p) ** 2), half = OWED_DOTS.dash * (1 - p) / 2;
        const p0 = k.backAt(Math.max(0, s - half)), p1 = k.backAt(Math.min(L, s + half));
        this.setAttribute("x1", p0[0].toFixed(1)); this.setAttribute("y1", p0[1].toFixed(1));
        this.setAttribute("x2", p1[0].toFixed(1)); this.setAttribute("y2", p1[1].toFixed(1));
        this.setAttribute("opacity", (0.9 * (1 - p)).toFixed(2));
      });
  });
  if (owed && !stillMotion.matches) wakeOwed();
}
stillMotion.addEventListener("change", wakeOwed);

// Dragging a picked session moves every picked session, keeping their spacing; each is pinned where it lands.
function togglePick(d) { const p = basePick(); p.has(d) ? p.delete(d) : p.add(d); setPicked(p); }

// On a touch screen there's no Cmd-click, so holding a finger still on a session toggles it in the pick.
// Moving the finger first makes it an ordinary drag; the click that may follow the press is swallowed.
const LONG_MS = 500, LONG_SLOP = 8;
function endPress() { if (press) { clearTimeout(press.timer); press = null; } }
addEventListener("pointermove", e => { if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_SLOP) endPress(); });
addEventListener("pointerup", e => { if (press && e.pointerId === press.id) endPress(); });
addEventListener("pointercancel", endPress);
function longPress(sel) {
  sel.on("pointerdown.long", (e, d) => {
    if (e.pointerType !== "touch" || !e.isPrimary) return endPress();
    endPress(); pressed = false;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY,
      timer: setTimeout(() => { press = null; pressed = true; togglePick(d); }, LONG_MS) };
  })
    // iOS would otherwise open its own menu on a long press.
    .on("contextmenu.long", e => { if (pressed || press) e.preventDefault(); });
}

function drag() {
  let group = [];
  return d3.drag()
    .on("start", (e, d) => {
      if (!e.active) sim.alphaTarget(0.3).restart();
      group = (picked.has(d) ? [...picked].filter(n => vNodes.includes(n)) : [d]).map(n => ({ n, dx: n.x - d.x, dy: n.y - d.y }));
      group.forEach(({ n }) => { n.fx = n.x; n.fy = n.y; });
    })
    .on("drag", e => { group.forEach(({ n, dx, dy }) => { n.fx = e.x + dx; n.fy = e.y + dy; }); })
    .on("end", e => { if (!e.active) sim.alphaTarget(0); group.forEach(({ n }) => { n.pinned = true; }); updateNodes(); saveLayout(); });
}

// Hovering a session fades what isn't connected to it. Hovering one in a box selection fades what isn't
// connected to any selected session.
function highlight(d) {
  if (!d) { gNode.selectAll(".node").classed("dimmed", false); gLink.selectAll(".link").classed("dimmed", false); return; }
  const from = picked.has(d) ? new Set([...picked].filter(n => vNodes.includes(n))) : new Set([d]);
  const near = new Set([...from].map(n => n.id));
  vLinks.forEach(l => { if (from.has(l.source)) near.add(l.target.id); if (from.has(l.target)) near.add(l.source.id); });
  nodeSel.classed("dimmed", n => !near.has(n.id));
  linkSel.classed("dimmed", l => !from.has(l.source) && !from.has(l.target));
}

// ---------- live data ----------
function liveState(n) {
  if (!n.handle) return "unnamed"; // can't receive mail, so no reachability ring
  if (n.reachable && n.detached) return "detached";
  if (n.reachable) return "reachable";
  return "stored";
}
function fromLive(n) {
  return {
    ...n, project: n.group, groupLabel: n.group_label, named: !!n.handle,
    // kaiusap lists a stopped session with no handle only while it still holds open mail.
    holdsMail: !n.handle && n.where === "not_running",
    state: liveState(n), reason: n.why_not || (n.where === "not_running" ? "not running" : n.where === "unknown" ? "state unknown" : null),
    unread: n.unread || 0,
    // A turn waiting on the user, from kaiusap's activity: what it waits on.
    waiting: n.activity?.state === "blocked" ? (n.activity.waiting_on?.length ? n.activity.waiting_on : ["user"]) : null,
  };
}
// Lines from `messages`: one per pair of sessions on the map. A handle that has mail but isn't in `who`
// or `sessions` has been released or changed. Its mail stays with the session it was on: the session whose
// kaiusap `formerly` lists it (for an older kaiusap, the session its newest mail came
// from), when that session is still on the map under a new handle or none. That mail is drawn on that session's
// node, which lists the old handle under "Formerly"; the messages keep the handles they were sent with. A released
// handle whose session isn't on the map gets a faded node of its own in "released handles". Either way its
// mail leaves the map once its newest message is RELEASED_DAYS old.
// Who owes a reply follows kaiusap's answerable_by (mail belongs to the persona, so a reply owed under
// an old handle is answered under the new one), falling back to the node holding `to` when it's null, off the
// map, or missing (an older kaiusap).
// A message names its two personas by session key:
// from_persona_session_key sent it, to_persona_session_key owes it. A line joins those nodes, whatever handle
// either now holds or whoever took it since; the handle rules above apply only to an end whose key is missing
// or not on the map.
const RELEASED_DAYS = 7;
// "ksup-oc (changed, 11 Nov)": how and when kaiusap says the binding ended, when it says.
const formerText = f => esc(f.handle) + (f.how ? ` (${esc(f.how)}${f.at ? ", " + new Date(f.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""})` : "");
function ghost(h, sessionKey) {
  return { id: h, handle: h, provider: Object.hasOwn(PROVIDERS, (sessionKey || "").split(":")[0]) ? sessionKey.split(":")[0] : "claude",
    session_key: null, project: "(released)", groupLabel: "released handles", named: true, released: true,
    state: "stored", reason: "released; no longer a handle", unread: 0, dir: null };
}
function buildLive(rawNodes, msgs) {
  const ns = rawNodes.map(fromLive);
  const ids = new Set(ns.map(n => n.id));
  const now = Date.now(), pairs = new Map();
  const bySession = new Map(ns.filter(n => n.session_key).map(n => [n.session_key, n]));
  // The node of each end's persona, when kaiusap names it and it's on the map.
  const persona = (m, side) => bySession.get(m[side + "_persona_session_key"])?.id;
  // Each released handle's newest message, and the session it was on then.
  const lastSeen = new Map();
  const seen = (h, key, at) => { if (!ids.has(h) && !(lastSeen.get(h)?.at >= at)) lastSeen.set(h, { at, key }); };
  for (const m of msgs) {
    if (!m.from || !m.to || m.from === m.to) continue;
    const at = tms(m.at);
    if (!persona(m, "from")) seen(m.from, m.from_session_key, at);
    if (!persona(m, "to")) seen(m.to, m.to_session_key, at);
  }
  const gone = new Set([...lastSeen].filter(([, v]) => now - v.at > RELEASED_DAYS * 86400000).map(([h]) => h));
  const alias = new Map(); // old handle -> the node now holding its session
  // kaiusap's own record first: the newest ending of each handle no one holds now.
  const ended = new Map();
  for (const n of ns) for (const f of n.formerly || []) {
    if (!ids.has(f.handle) && !(tms(ended.get(f.handle)?.at) >= tms(f.at))) ended.set(f.handle, { at: f.at, node: n });
  }
  for (const [h, v] of ended) if (!gone.has(h)) alias.set(h, v.node.id);
  for (const n of ns) n.former = Array.isArray(n.formerly) ? n.formerly : [];
  for (const [h, v] of lastSeen) {
    if (gone.has(h) || alias.has(h)) continue;
    const holder = bySession.get(v.key);
    if (holder && !Array.isArray(holder.formerly)) { alias.set(h, holder.id); holder.former.push({ handle: h }); } // an older kaiusap
    else { ids.add(h); ns.push(ghost(h, v.key)); }
  }
  const at_ = h => alias.get(h) ?? h;
  // Each message's two nodes, set on it for the cards and the packets: fromNode sent it, toNode received it.
  for (const m of msgs) {
    m.fromNode = persona(m, "from") ?? (gone.has(m.from) ? null : at_(m.from));
    m.toNode = persona(m, "to") ?? (gone.has(m.to) ? null : at_(m.to));
  }
  const owner = m => persona(m, "to") ?? (m.answerable_by && ids.has(m.answerable_by) ? m.answerable_by : m.toNode);
  for (const m of msgs) {
    if (!m.fromNode || !m.toNode) continue; // a handle is the same at both ends only across two personas
    const [a, b] = [m.fromNode, m.toNode].sort();
    if (a === b) continue; // mail between a session's old and new handles
    let l = pairs.get(a + ">" + b);
    if (!l) pairs.set(a + ">" + b, l = { source: a, target: b, count: 0, lastAt: 0, open: null, openAt: 0, owers: new Set(), messages: [] });
    const at = tms(m.at);
    l.count++;
    l.lastAt = Math.max(l.lastAt, at);
    l.messages.push({ ...m, atMs: at, ago: (now - at) / 60000 });
    if (m.owed) { const o = owner(m), end = o === a || o === b ? o : m.toNode; l.owers.add(end); if (at >= l.openAt) { l.open = end; l.openAt = at; } }
  }
  const ls = [...pairs.values()];
  ls.forEach(l => { l.last = (now - l.lastAt) / 60000; });
  const owes = new Set(msgs.filter(m => m.owed).map(owner));
  ns.forEach(n => { n.owes = owes.has(n.id); });
  return { ns, ls };
}
// Ages are minutes before now; refresh them so fading and "x min ago" stay true.
function refreshAges() {
  const now = Date.now();
  for (const l of links) {
    if (!l.lastAt) continue;
    l.last = (now - l.lastAt) / 60000;
    l.messages.forEach(m => { m.ago = (now - m.atMs) / 60000; });
  }
}

// Merge new rows into the existing node objects so positions and pins survive a poll.
function applyNodes(incoming, newLinks = []) {
  const old = byId;
  const before = new Set(old.keys());
  nodes = incoming.map(n => {
    const prev = old.get(n.id);
    if (!prev) return n;
    for (const k of Object.keys(prev)) if (!(k in n) && !["x", "y", "vx", "vy", "fx", "fy", "pinned", "index"].includes(k)) delete prev[k];
    return Object.assign(prev, n);
  });
  byId = new Map(nodes.map(n => [n.id, n]));
  links = newLinks;
  nodes.forEach(n => { n.r = radius(n); });
  const added = nodes.filter(n => !before.has(n.id));
  const removed = [...before].some(id => !byId.has(id));
  const fresh = seedPositions(added);
  if (selected?.type === "node") selected = byId.has(selected.d.id) ? { type: "node", d: byId.get(selected.d.id) } : null;
  if (selected?.type === "link") {
    const k = key(selected.d), l = links.find(x => key(x) === k);
    selected = l ? { type: "link", d: l } : null;
  }
  // Restored nodes only settle gently; a node with no saved place needs a real layout pass.
  render(fresh ? 0.6 : added.length || removed ? 0.1 : 0.05);
  select(selected);
}
// ---------- layout memory ----------
// Positions and pins are kept by the server, one layout for phones and one for everything else, so every
// open map of the same kind starts from the same layout; a pin, a pinned move or an unpin in one follows in
// the others. Each page sends only the sessions that changed, and nothing when nothing did. The zoom stays
// in this browser. This browser's localStorage keeps a copy too, used when the server doesn't keep layouts
// (an older one) and for the example data, which stays in the browser. Stored as fractions of the map's
// size, so a resized window still roughly fits. Demo and live layouts are kept apart. Entries unseen for
// 30 days are dropped.
const LAYOUT_DAYS = 30;
const PHONE = matchMedia("(pointer: coarse) and (max-width: 760px)");
const screenKind = () => PHONE.matches ? "phone" : "desktop";
let kind = screenKind();
// This page's own id, so the server doesn't send its own pin changes back to it.
const tabId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
let serverLayout = false;  // the server keeps this page's layout
let switching = false;     // the screen changed kind: take the other layout's places as well as its pins
let sent = {};             // each session as the server has it, from this page or from the server
const layoutKey = () => demo ? "layout-demo" : "layout";
function loadLayout() {
  try { return JSON.parse(localStorage.getItem(layoutKey())) || { nodes: {} }; } catch (e) { return { nodes: {} }; }
}
let layout = { nodes: {} };
function saveLayout(leaving) {
  if (!nodes.length) return;
  const now = Date.now(), keep = {};
  for (const [id, v] of Object.entries(layout.nodes || {})) if (now - (v.t || 0) < LAYOUT_DAYS * 864e5) keep[id] = v;
  for (const n of nodes) if (n.x != null) keep[n.id] = { x: +(n.x / W).toFixed(4), y: +(n.y / H).toFixed(4), pinned: !!n.pinned, t: now };
  const t = d3.zoomTransform(svg.node());
  layout = { nodes: keep, zoom: { x: Math.round(t.x), y: Math.round(t.y), k: +t.k.toFixed(3) } };
  try { localStorage.setItem(layoutKey(), JSON.stringify(layout)); } catch (e) {}
  postLayout(keep, leaving === true);
}
// Send the server the sessions that differ from what it has: pinned or unpinned, or moved more than 2px.
// A pin change goes at once. The live map never quite settles (each update nudges it), so free sessions'
// places go at most every FREE_POST ms, and when the page is hidden or closed: other maps only read them
// when they load.
const FREE_POST = 30000;
let freePosted = 0;
function postLayout(entries, leaving = false) {
  if (!serverLayout || demo) return;
  const out = {};
  let pins = false;
  for (const [id, v] of Object.entries(entries)) {
    // The server refuses a whole save with a place it won't keep (more than 10 map-sizes away), so leave those out.
    if (!(Math.abs(v.x) <= 10 && Math.abs(v.y) <= 10) || id.length > 200) continue;
    const s = sent[id], pinned = !!v.pinned;
    const moved = !s || Math.abs(v.x - s.x) * W > 2 || Math.abs(v.y - s.y) * H > 2;
    if (s && s.pinned === pinned && !moved) continue;
    out[id] = { x: v.x, y: v.y, pinned };
    if (s ? s.pinned !== pinned || pinned : pinned) pins = true;
  }
  const ids = Object.keys(out);
  if (!ids.length || (!pins && !leaving && Date.now() - freePosted < FREE_POST)) return;
  freePosted = Date.now();
  const was = {};
  for (const id of ids) { was[id] = sent[id]; sent[id] = out[id]; }
  const body = JSON.stringify({ key: kind, tab: tabId, nodes: out });
  // keepalive lets a save made as the tab closes finish; it's limited to 64 KB. A save that didn't arrive
  // is sent again with the next one; one the server refused (4xx) isn't, since it would be refused again.
  const undo = () => { for (const id of ids) if (sent[id] === out[id]) { if (was[id]) sent[id] = was[id]; else delete sent[id]; } };
  fetch("api/layout", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60000 })
    .then(r => { if (r.status >= 500) undo(); }, undo);
}
// The server's layout for this page's kind of screen: all of it when the page connects, else other pages'
// pin changes. Pins are taken; free sessions keep settling here, so open maps never tug at each other.
function onLayout(m) {
  if (m.key !== kind || demo) return;
  serverLayout = true;
  const now = Date.now(), stamp = e => { const o = {}; for (const [id, v] of Object.entries(e)) o[id] = { ...v, t: now }; return o; };
  if (m.push) {
    Object.assign(sent, m.nodes);
    Object.assign(layout.nodes, stamp(m.nodes));
    return adoptPins(m.nodes, false);
  }
  if (!layoutLoaded) {
    // The page's first: no sessions yet. A new server layout starts from this browser's own.
    layoutLoaded = true;
    const local = loadLayout();
    layout = m.empty ? local : { nodes: stamp(m.nodes), zoom: local.zoom };
    restoreZoom();
    sent = m.empty ? {} : { ...m.nodes };
    if (m.empty) postLayout(layout.nodes || {}, true);
    return;
  }
  // A reconnect, or the screen changed kind.
  sent = { ...m.nodes };
  Object.assign(layout.nodes, stamp(m.nodes));
  if (m.empty) { switching = false; return saveLayout(true); }
  adoptPins(m.nodes, switching);
  switching = false;
}
// Take others' pins; with places, the free sessions' places too.
function adoptPins(entries, places) {
  let moved = false, freed = false;
  for (const n of nodes) {
    const v = entries[n.id];
    if (!v) continue;
    const x = v.x * W, y = v.y * H;
    if (v.pinned) {
      if (!n.pinned || Math.abs(x - n.fx) > 1 || Math.abs(y - n.fy) > 1) { n.x = n.fx = x; n.y = n.fy = y; n.pinned = true; moved = true; }
      continue;
    }
    if (n.pinned) { n.fx = n.fy = null; n.vx = n.vy = 0; n.pinned = false; freed = true; }
    if (places) { n.x = x; n.y = y; moved = true; }
  }
  if (!moved && !freed) return;
  updateNodes(); ticked();
  // Unpinning moves nothing, as it doesn't here.
  if (moved) sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
}
// A phone turned wide, or a window narrowed on a touch screen: switch to the other layout.
PHONE.addEventListener("change", () => {
  if (screenKind() === kind) return;
  saveLayout(true);
  kind = screenKind();
  if (!serverLayout) return;
  serverLayout = false; switching = true; sent = {};
  if (es) { es.close(); es = null; connect(); }
});
function restoreZoom() {
  const z = layout.zoom;
  if (z) svg.call(zoom.transform, d3.zoomIdentity.translate(z.x, z.y).scale(z.k));
}
// Put a node back where it was last seen; true when it had a saved place.
function restorePosition(n) {
  const v = layout.nodes?.[n.id];
  if (!v) return false;
  n.x = v.x * W; n.y = v.y * H;
  if (v.pinned) { n.fx = n.x; n.fy = n.y; n.pinned = true; }
  return true;
}
sim.on("end.layout", () => saveLayout());
setInterval(() => { if (sim.alpha() > sim.alphaMin() && !document.hidden) saveLayout(); }, 5000);
addEventListener("pagehide", () => saveLayout(true));
document.addEventListener("visibilitychange", () => { if (document.hidden) saveLayout(true); });

// New nodes go to their saved place, else next to their group, else around a circle by group.
// Returns how many had no saved place.
function seedPositions(added) {
  const groups = [...new Set(nodes.map(n => n.project))];
  const fresh = added.filter(n => !restorePosition(n));
  for (const n of fresh) {
    const mates = nodes.filter(m => m.project === n.project && m.x != null && !added.includes(m));
    if (mates.length) {
      n.x = d3.mean(mates, m => m.x) + (rand() - 0.5) * 40;
      n.y = d3.mean(mates, m => m.y) + (rand() - 0.5) * 40;
    } else {
      const a = groups.indexOf(n.project) / groups.length * Math.PI * 2;
      n.x = W / 2 + Math.cos(a) * W * 0.28 + (rand() - 0.5) * 40;
      n.y = H / 2 + Math.sin(a) * H * 0.28 + (rand() - 0.5) * 40;
    }
  }
  return fresh.length;
}

// ---------- panel ----------
const panel = document.getElementById("panel");
const WHERE = { tmux: "in tmux", not_in_tmux: "running, not in tmux", background: "background session", hosted: "in an app", not_running: "not running", unknown: "unknown" };
// Where a session is, naming its host when kaiusap reports one: "in Claude", not "in an app".
function whereText(d) {
  const h = d.where === "hosted" && hostOf(d);
  return h ? `in ${h.name || "an app"}` : WHERE[d.where];
}
function statusText(d) {
  if (d.spawned) return `spawned agent of ${d.spawned}; can look, not send`;
  if (d.released) return "released; no longer a handle, past messages only";
  if (d.holdsMail) return "no handle; not running; holds open messages";
  const act = activityText(d);
  if (!d.named) return `no handle; ${whereText(d) || "state unknown"}${act ? `; ${act}` : ""}`;
  const base = d.state === "reachable" ? "reachable" : d.state === "detached" ? "reachable, detached tmux session"
    : `not reachable (${d.reason || "unknown"})`;
  return act ? `${base}, ${act}` : base;
}
// What a live session is doing, from kaiusap's activity: { state: idle | working | blocked | error, waiting_on:
// [approval, user_input], observed_at }, a snapshot as of observed_at. Null (not live, no signal from the
// provider, or the read failed) says nothing, never idle. Codex and Claude report it; OpenCode doesn't yet. The demo's `waiting`
// is a single word.
const WAIT = { approval: "an approval", user_input: "your input", input: "your input", user: "you" };
const waitList = d => (Array.isArray(d.waiting) ? d.waiting : d.waiting ? [d.waiting] : []);
const waitText = d => waitList(d).map(w => WAIT[w] || w.replace(/_/g, " ")).join(" and ");
function activityText(d) {
  if (waitList(d).length) return `waiting on ${waitText(d)}`;
  return { idle: "idle", working: "turn running", error: "the provider reports an error" }[d.activity?.state] || "";
}
function pill(d) {
  if (d.released) return `<span class="pill stored">released</span>`;
  // A turn waiting on you outranks how mail reaches the session, or that it has no handle: the status line
  // still says those.
  if (waitList(d).length) return `<span class="pill need">waiting on ${waitList(d).map(w => w === "approval" ? "approval" : w === "user" ? "you" : "input").join(" and ")}</span>`;
  if (!d.named) return `<span class="pill detached">no handle</span>`;
  if (d.state === "stored") return `<span class="pill stored">stored only</span>`;
  if (d.state === "detached") return `<span class="pill detached">detached</span>`;
  return `<span class="pill ok">reachable</span>`;
}
// Re-selecting the same thing (a poll, a minute tick) keeps the panel's scroll position.
let shown = null;
// `from` is the session whose panel opened this conversation; its panel offers a way back to it.
let backTo = null;
const selKey = s => !s ? "" : s.type === "node" ? `node:${s.d.id}` : s.type === "pick" ? "pick" : `link:${key(s.d)}`;
function select(s, from = null) {
  const same = shown !== null && selKey(s) === shown;
  if (!same) { focusMsg.clear(); backTo = from; }
  const top = panel.scrollTop;
  selected = s;
  shown = selKey(s);
  updateNodes();
  if (!s) overview();
  else if (s.type === "node") sessionPanel(s.d);
  else if (s.type === "pick") pickPanel();
  else linkPanel(s.d);
  renderDock();
  updateCentre();
  if (s) keyYields();
  if (same) panel.scrollTop = top;
}
// The machine summary always sits in a collapsible dock at the bottom of the panel,
// so it stays in one place (and in thumb's reach on a phone) whatever is selected.
// The sessions behind each summary card, in the order a click on the card visits them: unread by most
// mail, owed by the longest-waiting request, the others by handle.
function statSessions(kind) {
  const named = nodes.filter(n => n.named && !n.spawned && !n.released), byId = (a, b) => d3.ascending(a.id, b.id);
  const owedSince = n => d3.min(links.filter(l => l.open === n.id), l => l.openAt || 0);
  const list = kind === "reach" ? named.filter(n => n.state !== "stored").sort(byId)
    : kind === "unread" ? named.filter(n => n.unread).sort((a, b) => b.unread - a.unread || byId(a, b))
    : kind === "owed" ? nodes.filter(n => n.owes).sort((a, b) => owedSince(a) - owedSince(b) || byId(a, b))
    : kind === "unnamed" ? nodes.filter(n => !n.named && !n.spawned).sort(byId) : [];
  return list.filter(n => vNodes.includes(n));
}
// ---------- disclosure motion ----------
// Every chevron-led disclosure opens and closes the same way: height (and opacity, to or from nothing)
// eases over the dock's 0.22s --ease-out. No motion under prefers-reduced-motion.
const easeOut = () => getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() || "ease-out";
function ease(el, prop, from, to, done) {
  if (reduced || !el) { done?.(); return null; }
  const fade = prop === "height" && (from === 0 || to === 0);
  const k = f => ({ [prop]: f + "px", ...(fade ? { opacity: f ? 1 : 0 } : {}) });
  el.style.overflow = "hidden";
  const a = el.animate([k(from), k(to)], { duration: 220, easing: easeOut() });
  a.onfinish = () => { el.style.overflow = ""; done?.(); };
  return a;
}
function goTo(n) {
  if (picked.size) setPicked(new Set(), false);
  select({ type: "node", d: n });
  focusBox(n.x - n.r - 10, n.y - n.r - 10, n.x + n.r + 10, n.y + n.r + 28);
}
// A tap on a card's body gives a brief sign it landed: the card presses in and its tint flashes. The dock
// redraws on the step, so this finds the new card. Under reduced motion only the tint flashes.
function tapped(kind) {
  const card = document.querySelector(`[data-step="${kind}"]`)?.closest(".stat");
  if (!card) return;
  const cs = getComputedStyle(card), rest = cs.backgroundColor, tint = cs.getPropertyValue("--stat-tint").trim();
  // brightness too, so the flash shows on a card already filled with its tint
  const frames = [{ backgroundColor: tint || rest, filter: "brightness(0.92)", ...(reduced ? {} : { transform: "scale(0.96)" }) },
    { backgroundColor: rest, filter: "none", ...(reduced ? {} : { transform: "none" }) }];
  card.animate(frames, { duration: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dur-base")) || 240, easing: easeOut() });
}
// A click on a card's body selects and centres the next of its sessions after the one selected, wrapping round.
function stepStat(kind) {
  const list = statSessions(kind);
  if (!list.length) return;
  const i = selected?.type === "node" ? list.indexOf(selected.d) : -1;
  goTo(list[(i + 1) % list.length]);
}
// The card's chevron lists its sessions under the cards (kaiusap-DS "Summary card lists"): one list at a time,
// remembered per viewer. The session the cycling has reached is marked in it; a row jumps there.
let statOpen = null;
try { statOpen = localStorage.getItem("stat-list") || null; } catch (e) {}
const minsAgo = t => (Date.now() - t) / 60000;
function statSub(kind, n) {
  if (kind === "unread") {
    const at = d3.min(links.filter(l => l.source === n || l.target === n).flatMap(l => l.messages),
      m => m.state === "unread" && (m.toNode === n.id || m.answerable_by === n.id) ? m.atMs : undefined);
    return `${n.unread} unread${at ? ` · oldest ${ago(minsAgo(at))}` : ""}`;
  }
  if (kind === "owed") {
    const ls = links.filter(l => l.open === n.id).sort((a, b) => (a.openAt || 0) - (b.openAt || 0)), l = ls[0];
    if (!l) return "";
    return `owed to ${other(l, n.id).id}${ls.length > 1 ? ` +${ls.length - 1}` : ""}${l.openAt ? ` · since ${ago(minsAgo(l.openAt))}` : ""}`;
  }
  if (kind === "unnamed") return `${n.groupLabel || ""} · ${whereText(n) || "state unknown"}`;
  return `${n.groupLabel || ""} · ${statusText(n)}`;
}
// A 14px chevron, not the ▸ character: its direction reads at a glance. It turns down when the list is open.
const CHEVRON = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.75L9.25 7 5 11.25"/></svg>`;
function statList(kind) {
  const cur = selected?.type === "node" ? selected.d : null;
  return `<ul class="list stat-list" id="stat-list">${statSessions(kind).map(n => `<li${n === cur ? ` class="current" aria-current="true"` : ""}><button type="button" class="peer" data-goto="${esc(n.id)}">${esc(label(n))}</button>${rowAct(n)}<span class="sub">${esc(statSub(kind, n))}</span></li>`).join("")}</ul>`;
}
document.addEventListener("click", e => {
  const step = e.target.closest("[data-step]"), list = e.target.closest("[data-list]"), go = e.target.closest("[data-goto]");
  if (step) { stepStat(step.dataset.step); tapped(step.dataset.step); }
  else if (list) {
    const next = statOpen === list.dataset.list ? null : list.dataset.list;
    const old = document.getElementById("stat-list"), oldH = old ? old.getBoundingClientRect().height : 0;
    const apply = () => {
      statOpen = next;
      try { statOpen ? localStorage.setItem("stat-list", statOpen) : localStorage.removeItem("stat-list"); } catch (e) {}
      renderDock();
      document.querySelector(`[data-list="${list.dataset.list}"]`)?.focus();
    };
    if (!next && old) {
      document.querySelector(`[data-list="${list.dataset.list}"]`)?.setAttribute("aria-expanded", "false"); // the chevron turns now
      ease(old, "height", oldH, 0, apply);
    } else {
      apply();
      const nu = document.getElementById("stat-list");
      if (nu) ease(nu, "height", oldH, nu.scrollHeight); // from nothing, or from the list it replaces
    }
  } else if (go) { const n = nodes.find(x => x.id === go.dataset.goto); if (n) goTo(n); }
});
function summary() {
  const named = nodes.filter(n => n.named && !n.spawned && !n.released);
  const unnamed = nodes.filter(n => !n.named && !n.spawned);
  const groups = new Set(nodes.map(n => n.project));
  const reach = named.filter(n => n.state !== "stored").length;
  const owed = demo ? links.filter(l => l.open).length : liveMessages.filter(m => m.owed).length;
  const unread = d3.sum(named, n => n.unread);
  // Each card's border echoes the mark it counts on the map; a count of zero keeps the plain border.
  // A card with sessions on the map steps through them when its body is clicked; its chevron lists them.
  const stat = (n, label, kind) => {
    const go = statSessions(kind).length, what = label === "replies owed" ? "session that owes a reply" : label + " session";
    const body = `<b>${n}</b><span>${label}</span>`;
    return `<div class="stat${n ? ` lit is-${kind}` : ""}${go && statOpen === kind ? " listing" : ""}" role="group" aria-label="${n} ${label}">${go
      ? `<button type="button" class="stat-step" data-step="${kind}" title="Show each ${what} in turn" aria-label="Show the next ${what} (${n} ${label})">${body}</button>`
      : `<div class="stat-step">${body}</div>`}<button type="button" class="stat-toggle" data-list="${kind}" aria-expanded="${go && statOpen === kind}" aria-controls="stat-list" aria-label="List the ${what}s" title="List them"${go ? "" : " disabled"}>${CHEVRON}</button></div>`;
  };
  const title = `${named.length} named session${named.length === 1 ? "" : "s"} in ${groups.size} ${groups.size === 1 ? "repository" : "repositories"}`;
  const stats = `<div class="stats">
      ${stat(reach, "reachable", "reach")}
      ${stat(unread, "unread", "unread")}
      ${stat(owed, "replies owed", "owed")}
      ${demo ? "" : stat(unnamed.length, "unnamed", "unnamed")}
    </div>${statOpen && statSessions(statOpen).length ? statList(statOpen) : ""}`;
  const tally = demo ? "" : `${liveMessages.length} message${liveMessages.length === 1 ? "" : "s"} in ${links.length} conversation${links.length === 1 ? "" : "s"}.${lastUpdate ? ` Updated ${new Date(lastUpdate).toLocaleTimeString()}.` : ""}`;
  return { title, stats, tally };
}
// With nothing selected, the panel shows a session card's shape with no session in it: the same heading, pill and
// fields as sessionPanel, dimmed, with "—" for each value, so the panel keeps one layout and shows what a click
// will fill in. The hint sits where a session's way back goes.
const TEMPLATE_FIELDS = ["Handle", "Name", "Directory", "Status", "Where", "Unread", "Session"];
function overview() {
  const note = "Select a session or a line to see its messages, or a card below to step through its sessions."
    + (demo ? " Everything here is made up to show the idea." : "");
  const badge = `<svg class="title-mark" width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true"><circle r="9.25" fill="none" stroke="${css("--color-text-dim")}" stroke-width="1.5" stroke-dasharray="2 3"/></svg>`;
  panel.innerHTML = `
    <div class="panel-head template"><div class="eyebrow">Session</div>
      <h2 class="with-mark">${badge}<span>No session selected</span></h2></div>
    <div class="pill-row template" aria-hidden="true"><span class="pill stored">status</span></div>
    <div class="getback"><p class="note">${esc(note)}</p></div>
    <dl class="kv template" aria-label="Session details, empty until a session is selected">
      ${TEMPLATE_FIELDS.map(f => `<dt>${f}</dt><dd>—</dd>`).join("")}
    </dl>`;
}
const dockEl = document.getElementById("dock");
function renderDock() {
  const { title, stats, tally } = summary();
  document.getElementById("dock-body").innerHTML = `<p class="dock-title">${esc(title)}</p>${stats}${tally ? `<p class="note">${esc(tally)}</p>` : ""}`;
}
function renderLegend() {
  // Four groups, set apart by space and a faint rule: sessions, whether mail reaches them,
  // what needs you, and the lines and layout.
  document.getElementById("legend-body").innerHTML = [
    `
      ${swatch(`<circle r="9" fill="${css("--color-provider-claude")}"/><g style="color:${css("--color-text-on-provider")}">${markSvg("anthropic", 9.9)}</g>`)}<span>Claude session</span>
      ${swatch(`<circle r="9" fill="${css("--color-provider-codex")}"/><g style="color:${css("--color-text-on-provider")}">${markSvg("openai", 9.9)}</g>`)}<span>Codex session</span>
      ${swatch(`<circle r="9" fill="${css("--color-provider-opencode")}"/><g style="color:${css("--color-text-on-provider")}">${markSvg("opencode", 9.9)}</g>`)}<span>OpenCode session</span>
      ${swatch(`<circle r="9" fill="${css("--color-provider-opencode2")}"/><g style="color:${css("--color-text-on-provider")}">${markSvg("opencode", 9.9)}</g>`)}<span>OpenCode 2 session</span>
      <span></span><span class="lg-note">Colour is the harness. Logo is the model provider.</span>
      ${swatch(SWATCH.unnamed())}<span>Open session with no handle</span>
`,
    `
      ${swatch(SWATCH.reach())}<span>Reachable: message will awaken</span>
      ${swatch(`<circle r="9" fill="none" stroke="${css("--color-text-mid")}" stroke-width="2" stroke-dasharray="3 3"/>`)}<span>Detached tmux session</span>
      ${swatch(`<circle r="9" fill="none" stroke="${css("--color-text-dim")}" stroke-width="1.5"/><circle r="7" fill="${css("--color-provider-claude")}" opacity="0.38"/>`)}<span>Not reachable: messages will be stored</span>
      ${swatch(`<circle r="8" fill="none" stroke="${css("--color-text-dim")}" stroke-width="1.5" stroke-dasharray="2 3"/>`)}<span>Released handle: past messages only</span>
`,
    `
      ${swatch(`<circle r="7" fill="${css("--color-secondary")}"/><text x="0" y="3.5" font-size="9" fill="${css("--color-text-on-secondary")}" text-anchor="middle">!</text>`)}<span>Turn waiting on your approval or input</span>
      ${swatch(`<circle r="5" fill="${css("--color-provider-claude")}"/><circle class="lg-wring" r="6.5" fill="none" stroke="${css("--color-text-mid")}" stroke-width="2"/><g class="lg-still" opacity="0.7">${[-5, 0, 5].map(x => `<circle cx="${x}" cy="9.5" r="1.5" fill="${css("--color-text-mid")}"/>`).join("")}</g>`)}<span>Turn running</span>
      ${swatch(SWATCH.unread("2"))}<span>Unread messages waiting for that session</span>
      ${swatchWide(SWATCH.owed())}<span>Reply owed: runs to the session that owes, then hooks back towards the asker</span>
`,
    `
      ${swatch(`<line x1="-10" x2="10" stroke="${css("--color-text-dim")}" stroke-width="4" stroke-opacity="0.85"/>`)}<span>Message traffic; thicker is more busy, darker is more recent</span>
      ${swatch(`<line x1="-10" x2="10" stroke="${css("--color-primary")}" stroke-width="3" stroke-opacity="0.85"/>`)}<span>Blue: messaging in the last hour</span>
      ${swatch(`<line x1="-10" x2="10" stroke="${css("--color-text-dim")}" stroke-dasharray="2 3"/>`)}<span>Spawned agent and its parent</span>
      ${swatch(`<rect x="-10" y="-7" width="20" height="14" rx="7" fill="${css("--color-surface-sunken")}" stroke="${css("--color-border")}"/>`)}<span>Shaded island: sessions in the same repository</span>
      ${swatch(`<circle r="8" fill="${css("--color-provider-codex")}"/><circle cx="-5.6" cy="-5.6" r="2.6" fill="${css("--color-text")}"/>`)}<span>Pinned where you dropped it; double-click to release</span>
`].map(g => `<div class="legend">${g}</div>`).join("");
}
let order = "newest";
try { if (localStorage.getItem("order") === "oldest") order = "oldest"; } catch (e) {}
function orderControl() {
  return `<div class="seg" role="group" aria-label="Message order">
    <button type="button" data-order="newest" aria-pressed="${order === "newest"}">Newest first</button>
    <button type="button" data-order="oldest" aria-pressed="${order === "oldest"}">Oldest first</button></div>`;
}
panel.addEventListener("click", e => {
  const c = e.target.closest("[data-copy]");
  if (c) {
    navigator.clipboard?.writeText(c.dataset.copy).then(() => {
      c.innerHTML = COPIED_ICON; c.title = "Copied"; c.setAttribute("aria-label", "Copied");
      setTimeout(() => { c.innerHTML = COPY_ICON; c.title = "Copy"; c.setAttribute("aria-label", "Copy command"); }, 1200);
    }, () => {});
    return;
  }
  const b = e.target.closest("[data-order]");
  if (!b) return;
  order = b.dataset.order;
  try { localStorage.setItem("order", order); } catch (err) {}
  select(selected);
});
// Legend marks drawn from code. Functions, so the colours follow the theme each time they're drawn.
const SWATCH = {
  reach: () => `<circle r="9" fill="none" stroke="${css("--color-success")}" stroke-width="2.5"/>`,
  unread: (n = "") => `<circle r="7.5" fill="${css("--color-primary")}"/><text x="0" y="3.5" font-size="9" fill="${css("--color-text-on-primary")}" text-anchor="middle">${n}</text>`,
  // Twice as wide as the other swatches, with fine dashes, so the hook reads at Key size: dashes run from the asker
  // (the arrowhead) to the session that owes and turn just past it; the reply still owed arcs back as dashes that
  // slow, shrink to dots and fade at an outlined arrowhead. The sending dashes are the reply's starting dashes; a
  // 3 + 2.5 dash repeats every 5.5, so the flow's -11 offset loops cleanly.
  owed: () => `<path class="lg-flow" d="M-20 -2.5L12 -2.5A2.5 2.5 0 0 1 12 2.5" fill="none" stroke="${css("--color-primary")}" stroke-width="1.5" stroke-dasharray="3 2.5" stroke-linecap="round" opacity="0.9"/><g class="lg-flow-dots" stroke="${css("--color-primary")}" stroke-width="1.5" stroke-linecap="round">${[0, 0.6, 1.2, 1.8].map(b => `<line x1="-1.5" x2="1.5" opacity="0"><animateMotion dur="2.4s" begin="-${b}s" repeatCount="indefinite" rotate="auto" path="M12 2.5Q2.9 4.2 -6.2 4" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.5 1 0.89 1"/><animate attributeName="x1" values="-1.5;0" dur="2.4s" begin="-${b}s" repeatCount="indefinite"/><animate attributeName="x2" values="1.5;0" dur="2.4s" begin="-${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="2.4s" begin="-${b}s" repeatCount="indefinite"/></line>`).join("")}</g><g class="lg-still" stroke="${css("--color-primary")}" stroke-width="1.5" stroke-linecap="round"><line x1="10.5" y1="2.6" x2="13.5" y2="2.4" opacity="0.9"/><line x1="2.9" y1="3.7" x2="5.1" y2="3.5" opacity="0.68"/><line x1="-2.4" y1="4" x2="-1" y2="4" opacity="0.45"/><line x1="-5.5" y1="4" x2="-4.7" y2="4" opacity="0.23"/></g><polygon points="-13.7,3.5 -6,1 -6.4,7" fill="${css("--color-bg")}" stroke="${css("--color-primary")}" stroke-width="1" stroke-linejoin="round" opacity="0.6"/><circle cx="17.5" r="4" fill="${css("--color-provider-claude")}"/>`,
  unnamed: () => `<circle r="6" fill="${css("--color-provider-claude")}" opacity="0.55" stroke="${css("--color-surface")}" stroke-width="2" stroke-dasharray="1 2"/>`,
};
// The session's circle beside its title in the panel: the node's fill and mark, or a released node's dashed outline.
function titleBadge(d) {
  const body = d.released
    ? `<circle r="9.25" fill="none" stroke="${css("--color-text-dim")}" stroke-width="1.5" stroke-dasharray="2 3"/>`
    : `<circle r="10" fill="${css(providerOf(d.provider).fill)}"/>`;
  const m = d.released ? "" : markOf(d);
  return `<svg class="title-mark" width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true">${body}${m ? `<g style="color:${css("--color-text-on-provider")}">${markSvg(m, 11)}</g>` : ""}</svg>`;
}
function swatch(inner) { return `<svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true">${inner}</svg>`; }
function swatchWide(inner) { return `<svg width="44" height="22" viewBox="-22 -11 44 22" aria-hidden="true">${inner}</svg>`; }
// Bring a session's terminal window forward (Ghostty or Terminal.app); the server does the work
// and says what happened, which stays under the button until the next try.
const focusMsg = new Map();
// The app hosting a session, from kaiusap's hosts: the first entry that's an app
// with a bundle id, or null. Today that's the Claude desktop app's Code sessions. The server's HostMac backend
// opens it, through the same /api/focus. These checks match the server's (focus.py host_of), so the button never
// promises more than it will do: a link the server won't hand to the app makes it "Open", not "Show in".
const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/, HOST_LINK = /^([a-z][a-z0-9+.-]{0,31}):[\x21-\x7e]{1,480}$/;
const REFUSED_SCHEMES = new Set(["file", "http", "https", "javascript", "data", "about", "ftp", "blob", "vbscript"]);
function hostOf(d) {
  const h = (d.hosts || []).find(h => h && h.kind === "app" && BUNDLE_ID.test(h.app_id || ""));
  if (!h) return null;
  const m = typeof h.link === "string" && HOST_LINK.exec(h.link);
  return { ...h, link: m && !REFUSED_SCHEMES.has(m[1]) ? h.link : null };
}
// How the map can bring a session forward, or null. One answer for the session rows, the right-click menu and the
// panel button, so they never disagree: its words and its glyph. Its host app first, even over a tmux pane, and
// even once the session has ended, since the app reopens it from its link: "Show in Claude" when the link lands on
// the session, "Open Claude" when it only brings the app forward. Else a terminal when the session has an attached tmux
// pane, or runs outside tmux (the server looks for its title in Ghostty), or is a Codex thread kaiusap can't place
// ("unknown") that may still be open in a terminal when it's reachable. When the server has no way to bring windows
// forward, the answer carries `off`, the reason, and every place shows the action greyed out with that reason.
function bringForward(d) {
  const fwd = bringForwardHere(d);
  if (!fwd || !noFocus) return fwd;
  const lead = fwd.kind === "app" ? `${d.where === "not_running" ? "Last run" : "Running"} in ${fwd.app}. `
    : d.where === "not_in_tmux" ? "Running outside tmux, so there's nothing to attach to. " : "";
  return { ...fwd, off: noFocus, note: lead + noFocus };
}
function bringForwardHere(d) {
  if (d.demo || d.released) return null;
  const h = hostOf(d);
  if (h) {
    // text, row and tip go into HTML as they are, so they carry the escaped name; the note is escaped where it's shown.
    const raw = h.name || "its app", app = esc(raw), on = !!h.link && h.link_opens === "session";
    const say = name => on ? `Show in ${name}` : `Open ${name}`;
    return { kind: "app", app: raw, text: say(app), note: `${d.where === "not_running" ? "Last run" : "Running"} in ${raw}: use ${say(raw)}.`,
      row: name => on ? `Show ${name} in ${app}` : `Open ${app}, where ${name} runs`,
      tip: name => on ? `Bring ${app} to the front on ${name}` : `Bring ${app} to the front`, icon14: HOST_ICON_14, icon16: HOST_ICON_16 };
  }
  const panes = d.tmux_panes || [];
  if (panes.some(p => p.attached) || d.where === "not_in_tmux" || (d.provider === "codex" && d.where === "unknown" && d.state !== "stored"))
    return { kind: "terminal", text: "Show in terminal", note: "Running outside tmux, so there's nothing to attach to: use Show in terminal.",
      row: name => `Show ${name} in its terminal`, tip: name => `Bring ${name}'s terminal window to the front`, icon14: TERM_ICON_14, icon16: TERM_ICON_16 };
  return null;
}
function focusable(d) { return !!bringForward(d); }
async function requestFocus(id) {
  let res;
  try {
    const r = await fetch("api/focus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    res = r.ok ? await r.json()
      : r.status === 501 || r.status === 404 ? { ok: false, short: "Restart the server", message: "The map server is older than this page; restart it to use this." }
      : { ok: false, short: "Refused", message: `The map server refused (${r.status}).` };
  } catch (e) { res = { ok: false, short: "No server", message: "The map server isn't answering." }; }
  res.short ||= res.ok ? "Shown" : "Failed";
  return res;
}
async function showTerminal(id, btn) {
  btn.disabled = true;
  const res = await requestFocus(id);
  focusMsg.set(id, res);
  if (selected?.type === "node" && selected.d.id === id) select(selected);
  else btn.disabled = false;
}
// The message is about the last click only: drop it when the browser gets focus back (you've been
// to the terminal and returned) or when another session or line is selected.
function clearFocusMsg() {
  if (!focusMsg.size) return;
  focusMsg.clear();
  panel.querySelectorAll(".focus-msg").forEach(el => { el.textContent = ""; el.title = ""; el.classList.remove("bad"); });
}
addEventListener("focus", clearFocusMsg);
const COPY_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="4.25" y="4.25" width="7.5" height="7.5" rx="1.2"/><path d="M9.75 4.25V3.2c0-.66-.54-1.2-1.2-1.2H3.2C2.54 2 2 2.54 2 3.2v5.35c0 .66.54 1.2 1.2 1.2h1.05"/></svg>`;
// Session row actions (kaiusap-DS "Session row actions"): every list row that names a session ends with one
// right-aligned button, a sibling of its link. Terminal when its window can come forward; else copy kaiusap's
// command; else the copy glyph marked unavailable (aria-disabled, so it stays focusable), whose tap says why.
// Both glyphs are 14px at a 1.3px stroke. Feedback replaces the glyph for 1.2s.
const TERM_ICON_14 = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.49" stroke-linecap="round" stroke-linejoin="round"><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3.5"/></svg>`;
const TERM_ICON_16 = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3.5"/></svg>`;
// The desktop-app button's glyph (kaiusap-DS, chosen 2026-11-16): the terminal glyph's frame with a sidebar and two
// lines, the usual layout of the Claude and Codex desktop apps. Shown for a session whose host is an app.
const HOST_ICON_14 = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.49" stroke-linecap="round" stroke-linejoin="round"><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="M5.75 2.75v10.5M8 6.5h4M8 9h2.5"/></svg>`;
const HOST_ICON_16 = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="M5.75 2.75v10.5M8 6.5h4M8 9h2.5"/></svg>`;
function rowAct(n) {
  if (!n || typeof n !== "object") return "";
  const name = esc(label(n)), fwd = bringForward(n);
  if (fwd && !fwd.off) return `<button type="button" class="icon row-act" data-rfocus="${esc(n.id)}" aria-label="${fwd.row(name)}" title="${fwd.tip(name)}">${fwd.icon14}</button>`;
  const back = getBack(n);
  if (back.cmd) return `<button type="button" class="icon row-act" data-rcopy="${esc(back.cmd)}" aria-label="Copy ${name}'s command" title="Copy: ${esc(back.cmd)}">${COPY_ICON}</button>`;
  if (fwd) return `<button type="button" class="icon row-act" aria-disabled="true" data-rwhy="${esc(fwd.off)}" aria-label="${fwd.row(name)}: unavailable. ${esc(fwd.off)}" title="${esc(fwd.off)}">${fwd.icon14}</button>`;
  const why = back.note || "There's no command to get back to this session.";
  return `<button type="button" class="icon row-act" aria-disabled="true" data-rwhy="${esc(why)}" aria-label="Copy ${name}'s command: unavailable. ${esc(why)}" title="${esc(why)}">${COPY_ICON}</button>`;
}
// The 1.2s feedback: a glyph and a title in place of the button's own, and, for a failed focus, the message in place
// of the row's status line.
function rowFlash(b, icon, text, line = false) {
  if (b.dataset.flashing) return;
  b.dataset.flashing = "1";
  const was = { html: b.innerHTML, title: b.title }, sub = line ? b.parentElement.querySelector(":scope > .sub") : null, subWas = sub?.textContent;
  if (icon) b.innerHTML = icon;
  b.title = text;
  if (sub) { sub.textContent = text; sub.setAttribute("role", "status"); }
  setTimeout(() => {
    delete b.dataset.flashing; b.innerHTML = was.html; b.title = was.title;
    if (sub) { sub.textContent = subWas; sub.removeAttribute("role"); }
  }, 1200);
}
// The unavailable button's reason (kaiusap-DS) takes the row's status line until the button is tapped again
// or focus leaves the row: a sentence needs longer than 1.2s.
function toggleWhy(b, show = !b.dataset.why) {
  const li = b.parentElement, sub = li.querySelector(":scope > .sub");
  if (!sub) return;
  if (show) {
    b.dataset.why = sub.textContent;
    sub.textContent = b.dataset.rwhy; sub.setAttribute("role", "status");
    const away = e => { if (!li.contains(e.relatedTarget)) { li.removeEventListener("focusout", away); toggleWhy(b, false); } };
    li.addEventListener("focusout", away);
  } else if (b.dataset.why !== undefined) {
    sub.textContent = b.dataset.why; sub.removeAttribute("role"); delete b.dataset.why;
  }
}
document.addEventListener("click", async e => {
  const b = e.target.closest(".row-act");
  if (!b) return;
  if (b.dataset.rcopy) navigator.clipboard?.writeText(b.dataset.rcopy).then(() => rowFlash(b, COPIED_ICON, "Copied"), () => rowFlash(b, null, "Couldn't copy"));
  else if (b.dataset.rwhy) toggleWhy(b);
  else if (b.dataset.rfocus && !b.dataset.flashing) {
    const res = await requestFocus(b.dataset.rfocus);
    rowFlash(b, res.ok ? COPIED_ICON : CLEAR_ICON, res.message || res.short, !res.ok);
  }
});
// Right-click on a session (desktop): a one-item menu with the same action as its list rows. Show in terminal when its
// window can come forward; else copy kaiusap's command; else the copy item, unavailable, with the reason under it.
// Shift+F10 or the menu key on a focused session opens it there.
const ctxEl = document.getElementById("ctx"), ctxStatus = document.getElementById("ctx-status");
let ctxFrom = null, ctxTimer = 0;
function openCtx(d, e) {
  clearTimeout(ctxTimer); ctxStatus.textContent = "";
  const name = esc(label(d)), fwd = bringForward(d), back = fwd && !fwd.off ? null : getBack(d);
  ctxEl.innerHTML = !back
    ? `<button type="button" role="menuitem" data-cfocus="${esc(d.id)}">${fwd.icon14}<span class="ctx-text">${fwd.text}</span></button>`
    : fwd && !back.cmd
      ? `<button type="button" role="menuitem" aria-disabled="true">${fwd.icon14}<span class="ctx-text">${fwd.text}<small>${esc(fwd.off)}</small></span></button>`
    : back.cmd
      ? `<button type="button" role="menuitem" data-ccopy="${esc(back.cmd)}" title="${esc(back.cmd)}">${COPY_ICON}<span class="ctx-text">Copy command<code>${esc(back.cmd)}</code></span></button>`
      : `<button type="button" role="menuitem" aria-disabled="true">${COPY_ICON}<span class="ctx-text">No command to copy<small>${esc(back.note || "There's no command to get back to this session.")}</small></span></button>`;
  ctxEl.setAttribute("aria-label", `${label(d)}`);
  ctxFrom = e.currentTarget;
  ctxEl.hidden = false;
  // From the keyboard the event has no pointer position: open by the session instead.
  let x = e.clientX, y = e.clientY;
  if (!x && !y) { const r = ctxFrom.getBoundingClientRect(); x = r.right; y = r.top + r.height / 2; }
  const w = ctxEl.offsetWidth, h = ctxEl.offsetHeight;
  ctxEl.style.left = `${Math.max(8, Math.min(x + 2, innerWidth - w - 8))}px`;
  ctxEl.style.top = `${Math.max(8, Math.min(y + 2, innerHeight - h - 8))}px`;
  ctxEl.querySelector("button").focus({ preventScroll: true });
}
function closeCtx(back = false) {
  clearTimeout(ctxTimer);
  if (ctxEl.hidden) return;
  ctxEl.hidden = true;
  if (back) ctxFrom?.focus({ preventScroll: true });
  ctxFrom = null;
}
// Feedback stays in the item: a tick that closes the menu shortly after, or the failure, until you dismiss it. It's
// also said through #ctx-status, a live region that's always in the page, so a screen reader announces it. Opening
// or closing a menu cancels a pending close, so it can't close the next one.
function ctxFlash(b, icon, text, close) {
  b.innerHTML = `${icon}<span class="ctx-text">${esc(text)}</span>`;
  ctxStatus.textContent = text;
  if (close) ctxTimer = setTimeout(() => closeCtx(), 700);
}
ctxEl.addEventListener("click", async e => {
  const b = e.target.closest("button");
  if (!b || b.dataset.busy) return;
  if (b.dataset.ccopy) navigator.clipboard?.writeText(b.dataset.ccopy).then(() => ctxFlash(b, COPIED_ICON, "Copied", true), () => ctxFlash(b, CLEAR_ICON, "Couldn't copy", false));
  else if (b.dataset.cfocus) {
    b.dataset.busy = "1";
    const res = await requestFocus(b.dataset.cfocus);
    ctxFlash(b, res.ok ? COPIED_ICON : CLEAR_ICON, res.ok ? "Shown" : (res.message || res.short), res.ok);
  }
});
ctxEl.addEventListener("keydown", e => {
  if (e.key === "Escape") { e.stopPropagation(); closeCtx(true); }
  else if (e.key === "Tab") { e.preventDefault(); closeCtx(true); }
});
document.addEventListener("pointerdown", e => { if (!e.target.closest?.("#ctx")) closeCtx(); }, true);
addEventListener("blur", () => closeCtx());
addEventListener("resize", () => closeCtx());
addEventListener("wheel", () => closeCtx(), { passive: true });
const COPIED_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.75 7.25 5.5 10l5.75-6"/></svg>`;
// How to get back to a session, always shown under its terminal button. kaiusap's `command` is the
// whole answer: tmux attach, a resume with its cd, or claude attach for a
// background session. The map shows it as given, with kaiusap's note, and writes only notes of its own
// when there's no command.
function getBack(d) {
  if (d.released) return { note: "Released: this handle no longer points to a session, and the session it was on isn't on the map." };
  const held = d.holdsMail ? "It has no handle but still holds open messages: resume it to read or answer them, or mark a message moot from a shell with kaiusap moot <id>." : "";
  if (d.command) return { cmd: d.command, note: [d.note, held,
    d.where === "background" ? "Running in the background: this opens it in this terminal; it keeps running when you leave (← or Ctrl+Z)." : ""].filter(Boolean).join(" ") };
  if (held) return { note: [d.note, held].filter(Boolean).join(" ") };
  // Outside tmux (or in a desktop app) the way back is the button, and its own note says which.
  const fwd = bringForward(d);
  return { note: d.note || (d.demo ? "Example data has no real sessions."
    : fwd && (fwd.kind === "app" || d.where === "not_in_tmux") ? fwd.note
    : d.where === "unknown" ? "kaiusap can't tell whether this thread is open somewhere, so it gives no command: resuming it could open a second copy."
    : d.where === "background" ? "Running in the background: claude agents lists it, and claude attach <job> opens it in a terminal."
    : "kaiusap gives no command to reopen this session.") };
}
// Several sessions picked with the box: who they are, and what can be done to all of them.
// The selection panel reuses the pin box's glyphs, so the two never drift apart.
const ICON = {
  pin: () => document.querySelector("#btn-pin svg").outerHTML,
  unpin: () => document.querySelector("#btn-unpin svg").outerHTML,
  tidy: () => document.querySelector("#btn-tidy svg").outerHTML,
};
const CLEAR_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3.75 3.75l6.5 6.5M10.25 3.75l-6.5 6.5"/></svg>`;
function actBtn(attr, icon, title, disabled = false) {
  return `<button type="button" class="icon" ${attr} aria-label="${esc(title)}" title="${esc(title)}" ${disabled ? "disabled" : ""}>${icon}</button>`;
}
function pickPanel() {
  const ps = [...picked].filter(n => nodes.includes(n)).sort((a, b) => label(a).localeCompare(label(b)));
  const pinned = ps.filter(n => n.pinned).length;
  panel.innerHTML = `
    <div class="panel-head"><div class="eyebrow">Selection</div><h2>${ps.length} sessions selected</h2></div>
    <ul class="list picks">${ps.map(n => `<li><button type="button" class="peer" data-node="${esc(n.id)}">${esc(label(n))}</button>${rowAct(n)}<span class="sub">${esc(n.groupLabel || "")} · ${esc(statusText(n))}${n.pinned ? " · pinned" : ""}</span></li>`).join("")}</ul>
    <div class="actions">${actBtn("data-pick-pin", ICON.pin(), pinned < ps.length ? `Pin ${ps.length - pinned} unpinned (P)` : "All selected are pinned", pinned === ps.length)}${actBtn("data-pick-unpin", ICON.unpin(), pinned ? `Unpin ${pinned} pinned, without moving them (U)` : "None selected is pinned", !pinned)}${actBtn("data-pick-tidy", ICON.tidy(), "Tidy: re-run the layout so unpinned sessions settle (T)")}${actBtn("data-pick-clear", CLEAR_ICON, "Clear selection (Esc)")}</div>
    <p class="note">Drag any selected session to move them all. Pin and Unpin keep them where they are; Tidy re-runs the layout. Cmd- or Ctrl-click, or a long press, adds or removes one; Esc clears.</p>`;
  panel.querySelectorAll("[data-node]").forEach(b => b.addEventListener("click", () => { const n = byId.get(b.dataset.node); if (n) select({ type: "node", d: n }); }));
  panel.querySelector("[data-pick-pin]").addEventListener("click", () => pinAll(true));
  panel.querySelector("[data-pick-unpin]").addEventListener("click", () => pinAll(false));
  panel.querySelector("[data-pick-tidy]").addEventListener("click", tidy);
  panel.querySelector("[data-pick-clear]").addEventListener("click", () => setPicked(new Set()));
}
// Context in use, from kaiusap's `context` (absent from an older kaiusap). A meter only when the
// provider reports the window (Codex); Claude's limit isn't recorded, so it shows the count alone.
const ktok = n => n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : String(n);
function contextRow(d) {
  const c = d.context;
  if (!c || !Number.isFinite(c.used)) return "";
  const asOf = c.at ? ` · as of ${ago((Date.now() - tms(c.at)) / 60000)}` : "";
  const sub = `${c.model ? esc(c.model) : ""}${asOf}`.replace(/^ · /, "");
  if (c.limit_source === "provider" && c.limit > 0) {
    const pct = Math.min(100, Math.round(c.used / c.limit * 100));
    return `<dt>Context</dt><dd>${ktok(c.used)} of ${ktok(c.limit)} tokens (${pct}%)
      <span class="meter" role="meter" aria-valuemin="0" aria-valuemax="${c.limit}" aria-valuenow="${c.used}" aria-label="Context in use"><span style="width:${pct}%"></span></span>
      <span class="ctx-sub">${sub}</span></dd>`;
  }
  return `<dt>Context</dt><dd title="The provider doesn't report this session's context limit, so there's no meter.">${ktok(c.used)} tokens<span class="ctx-sub">${sub}</span></dd>`;
}
function sessionPanel(d) {
  const mine = links.filter(l => !l.lineage && (l.source === d || l.target === d)).sort((a, b) => order === "newest" ? a.last - b.last : b.last - a.last);
  const panes = d.tmux_panes || [];
  // An attached tmux session has a window already: the terminal button replaces the attach command.
  // Outside tmux the server looks for the session's title in Ghostty; a Codex thread kaiusap can't place
  // ("unknown") may still be open in a terminal when it's reachable.
  const fwd = bringForward(d);
  const back = getBack(d);
  panel.innerHTML = `
    <div class="panel-head"><div class="eyebrow">${d.spawned ? "Spawned agent" : `${providerOf(d.provider).name} session`}</div>
      <h2 class="with-mark">${titleBadge(d)}<span>${esc(label(d))}</span></h2></div>
    <div class="pill-row">${pill(d)}${fwd ? `<button type="button" class="icon" data-focus="${esc(d.id)}" ${fwd.off
        ? `aria-disabled="true" aria-label="${fwd.text}: unavailable. ${esc(fwd.off)}" title="${esc(fwd.off)}"`
        : `aria-label="${fwd.text}" title="${fwd.tip("this session")}"`}>
        ${fwd.icon16}</button>` : ""}
      <span class="focus-msg ${focusMsg.get(d.id)?.ok === false ? "bad" : ""}" role="status" title="${esc(focusMsg.get(d.id)?.message || "")}">${esc(focusMsg.get(d.id)?.short || "")}</span></div>
    <div class="getback">${back.cmd ? `<div class="cmd"><code>${esc(back.cmd)}</code><button type="button" class="icon" data-copy="${esc(back.cmd)}" aria-label="Copy command" title="Copy">${COPY_ICON}</button></div>` : ""}${back.note ? `<p class="note">${esc(back.note)}</p>` : ""}</div>
    <dl class="kv">
      ${d.named ? `<dt>Handle</dt><dd>${esc(d.id)}</dd>` : ""}
      <dt>Name</dt><dd>${esc(d.name || "—")}</dd>
      <dt>Directory</dt><dd>${esc(d.dir)}</dd>
      <dt>Status</dt><dd${d.activity?.observed_at ? ` title="Activity as of ${esc(new Date(d.activity.observed_at).toLocaleTimeString())}"` : ""}>${esc(statusText(d))}</dd>
      ${runningText(d) ? `<dt>Harness</dt><dd title="The app and version running this session now, which can be older than the version installed">${esc(runningText(d))}</dd>` : ""}
      ${d.former?.length ? `<dt>Formerly</dt><dd title="Handles this session held before; their messages are drawn here, under the names they were sent to">${d.former.map(formerText).join(", ")}</dd>` : ""}
      ${contextRow(d)}
      ${d.where ? `<dt>Where</dt><dd>${esc(whereText(d) || d.where)}</dd>` : ""}
      ${panes.length ? `<dt>tmux</dt><dd>${panes.map(p => `${esc(p.tmux_session)} (${p.attached ? "attached" : "detached"}${p.trusted === false ? ", not yet trusted" : ""})`).join("<br>")}</dd>` : ""}
      <dt>Unread</dt><dd>${d.unread}</dd>
      ${d.session_key ? `<dt>Session</dt><dd>${esc(d.session_key)}</dd>` : ""}
      ${d.owes ? `<dt>Owes</dt><dd>a reply to ${esc(links.find(l => l.open === d.id) ? other(links.find(l => l.open === d.id), d.id).id : "")}</dd>` : ""}
    </dl>
    ${mine.length ? `<div><div class="row"><div class="eyebrow">Conversations</div>${orderControl()}</div><ul class="list">${mine.map(l => {
      const p = other(l, d.id), k = key(l), open = openConv === k;
      return `<li class="conv"><button type="button" class="peer conv-toggle" data-conv="${esc(k)}" aria-expanded="${open}">${esc(p.id)}</button><span>${l.count} msgs</span>${rowAct(p)}<span class="sub">last ${ago(l.last)}${l.open ? " · reply owed by " + esc(l.open) : ""}</span>${open ? `<ul class="list thread-list">${threadItems(l)}</ul>` : ""}</li>`;
    }).join("")}</ul></div>` : ""}`;
  // A conversation opens in place under its row, closing any other; the panel redraws with it open or closed.
  // The redraw replaces the button, so a keyboard user (click detail 0) gets focus back on it.
  panel.querySelectorAll("[data-conv]").forEach(b => b.addEventListener("click", e => {
    const k = b.dataset.conv, was = openConv;
    const oldList = was ? panel.querySelector(`[data-conv="${CSS.escape(was)}"]`)?.closest("li")?.querySelector(".thread-list") : null;
    const oldH = oldList ? oldList.getBoundingClientRect().height : 0;
    if (was === k) { // closing: the chevron turns now, the threads ease shut, then the panel redraws
      b.setAttribute("aria-expanded", "false");
      ease(oldList, "height", oldH, 0, () => { openConv = null; select(selected); panel.querySelector(`[data-conv="${CSS.escape(k)}"]`)?.focus(); });
      return;
    }
    openConv = k;
    select(selected);
    // The new threads ease open while the one they replace eases shut, held open by its row's margin.
    const nu = panel.querySelector(`[data-conv="${CSS.escape(k)}"]`)?.closest("li")?.querySelector(".thread-list");
    if (nu) ease(nu, "height", 0, nu.scrollHeight);
    if (was && oldH) ease(panel.querySelector(`[data-conv="${CSS.escape(was)}"]`)?.closest("li"), "marginBottom", oldH, 0);
    if (e.detail === 0) panel.querySelector(`[data-conv="${CSS.escape(k)}"]`)?.focus();
  }));
  // Greyed out: a tap says why under the button, without asking the server.
  panel.querySelector("[data-focus]")?.addEventListener("click", e => {
    if (!fwd.off) return showTerminal(d.id, e.currentTarget);
    focusMsg.set(d.id, { ok: false, short: "Not available", message: fwd.off });
    select(selected);
  });
}
// One word per state, so every pill in a thread list is the same width; the full state is on hover.
function msgPill(m) {
  // offer_pending: held until the user answers kaiusap's offer of this handle.
  const held = m.state === "unread" && m.reason_code === "offer_pending" ? "held: kaiusap has offered this handle to a new session and is waiting for your answer" : "";
  // Held wins over owed: the recipient can't reply to mail that hasn't reached it, so the user is the blocker.
  const full = held ? held + (m.owed ? "; owed: a reply is expected once it's delivered" : "")
    : m.owed ? "owed: a reply is expected" : m.state === "unread" && m.outcome ? `unread, ${m.outcome}` : m.state;
  const word = held ? "held" : m.owed ? "owed" : String(m.state || "").split(",")[0];
  const cls = held ? "held" : m.owed ? "primary" : m.state === "answered" ? "ok" : m.state === "moot" ? "stored"
    : m.state === "unread" ? (m.outcome === "stored" ? "stored" : "primary") : "detached";
  return `<span class="pill msg ${cls}" title="${esc(full)}">${esc(word)}</span>`;
}
// Threads follow in_reply_to (chain_id is kaiusap's loop-limit chain).
function threads(msgs) {
  const byMsg = new Map(msgs.map(m => [m.id, m]));
  const rootOf = m => { const seen = new Set(); while (m.in_reply_to && byMsg.has(m.in_reply_to) && !seen.has(m.id)) { seen.add(m.id); m = byMsg.get(m.in_reply_to); } return m.id; };
  const groups = d3.groups(msgs, rootOf).map(([, ms]) => ms.sort((a, b) => a.atMs - b.atMs));
  const latest = g => d3.max(g, m => m.atMs);
  return groups.sort((a, b) => order === "newest" ? latest(b) - latest(a) : latest(a) - latest(b));
}
// Conversation header: a way back to the session it was opened from, and each end opens its session.
function linkHead(l) {
  const a = nid(l.source), b = nid(l.target), end = id => `<button type="button" class="peer" data-node="${esc(id)}">${esc(id)}</button>`;
  return `${backTo ? `<div class="back-wrap"><button type="button" class="back" data-back>‹ ${esc(label(backTo))}</button></div>` : ""}
    <div class="panel-head"><div class="eyebrow">Conversation</div><h2>${end(a)} and ${end(b)}</h2></div>`;
}
function wireLinkHead() {
  panel.querySelector("[data-back]")?.addEventListener("click", goBack);
  panel.querySelectorAll("[data-node]").forEach(btn => btn.addEventListener("click", () => { const n = byId.get(btn.dataset.node); if (n) select({ type: "node", d: n }); }));
}
function goBack() {
  if (!backTo || !nodes.includes(backTo)) return false;
  const n = backTo, from = selected?.type === "link" ? key(selected.d) : null;
  select({ type: "node", d: n });
  ([...panel.querySelectorAll("[data-link]")].find(b => b.dataset.link === from) || panel.querySelector("[data-link]"))?.focus();
  return true;
}
// The start of a message's text (kaiusap messages --preview), muted and labelled by the field
// it came from, so it isn't taken for the whole message.
const PREVIEW_FROM = { body: "Reply", request: "Request", context: "Context" };
function previewLine(m) {
  if (m.preview == null || m.preview === "") return "";
  return `<span class="preview"><span class="preview-from">${esc(PREVIEW_FROM[m.preview_field] || m.preview_field || "Text")}:</span> ${esc(m.preview)}</span>`;
}
// The one conversation open in a session panel, by link key; it stays open across updates.
let openConv = null;
// A conversation's messages as list items: threads with their replies, or (example data) newest or oldest first.
function threadItems(l) {
  if (demo) return l.messages.slice().sort((a, b) => order === "newest" ? a.ago - b.ago : b.ago - a.ago).map(m => `
      <li><span>${esc(m.subject)}</span>${msgPill(m)}
      <span class="sub">${esc(m.from)} → ${esc(m.to)} · ${ago(m.ago)}${m.replyNeeded ? " · answer expected" : ""}</span></li>`).join("");
  const time = m => new Date(m.atMs).toLocaleString();
  return threads(l.messages).map(t => t.map((m, i) => `
      <li class="${i ? "reply" : "thread-start"}"><span>${i ? "↳ " : ""}${esc(m.subject)}</span>${msgPill(m)}${previewLine(m)}
      <span class="sub" title="${esc(time(m))} · ${esc(m.id)}">${esc(m.from)} → ${esc(m.to)} · ${ago(m.ago)}${m.reply_needed ? " · answer expected" : ""}</span></li>`).join("")).join("");
}
function liveLinkPanel(l) {
  const ts = threads(l.messages);
  panel.innerHTML = `
    ${linkHead(l)}
    <dl class="kv"><dt>Messages</dt><dd>${l.count} in ${ts.length} thread${ts.length === 1 ? "" : "s"}</dd><dt>Last</dt><dd>${ago(l.last)}</dd>
      ${l.open ? `<dt>Waiting</dt><dd>${esc(l.open)} owes a reply</dd>` : ""}</dl>
    <div class="row"><div class="eyebrow">Threads</div>${orderControl()}</div>
    <ul class="list">${threadItems(l)}</ul>
    <p class="note">Each message shows only the start of its text, from <code>kaiusap messages --preview</code>, which marks nothing read. The whole message is read with <code>kaiusap read</code> in the recipient's session.</p>`;
  wireLinkHead();
}
function linkPanel(l) {
  if (!demo) return liveLinkPanel(l);
  panel.innerHTML = `
    ${linkHead(l)}
    <dl class="kv"><dt>Messages</dt><dd>${l.count}</dd><dt>Last</dt><dd>${ago(l.last)}</dd>
      ${l.open ? `<dt>Waiting</dt><dd>${esc(l.open)} owes a reply</dd>` : ""}</dl>
    <div class="row"><div class="eyebrow">Messages</div>${orderControl()}</div>
    <ul class="list">${threadItems(l)}</ul>`;
  wireLinkHead();
}

// ---------- example mail (demo only) ----------
const packets = [];
document.getElementById("btn-mail").addEventListener("click", () => {
  const pool = vLinks.filter(l => !l.lineage);
  if (!pool.length) return;
  const l = pool[Math.floor(Math.random() * pool.length)];
  const fwd = Math.random() > 0.5;
  const from = fwd ? l.source : l.target, to = fwd ? l.target : l.source;
  const m = { from: from.id, to: to.id, subject: subjects[Math.floor(Math.random() * subjects.length)], ago: 0, state: to.state === "stored" ? "stored, not read" : "unread", replyNeeded: true };
  l.messages.forEach(x => x.ago += 1);
  l.messages.unshift(m); l.count++; l.last = 0; l.open = to.id;
  to.unread++; to.owes = true;
  if (from.owes && links.every(x => x.open !== from.id || x === l)) from.owes = false;
  packets.push({ l, from, to, t0: performance.now() });
  render();
  select(selected);
});
// d3.timer passes the time since the timer started, not performance.now(), which t0 is measured on.
d3.timer(() => {
  const now = performance.now(), dur = reduced ? 1 : 1100;
  const live = packets.filter(p => now - p.t0 < dur);
  packets.length = 0; packets.push(...live);
  const at = p => d3.easeCubicInOut(Math.max(0, Math.min(1, (now - p.t0) / dur)));
  gPacket.selectAll("circle").data(live).join("circle").attr("class", "packet").attr("r", 5)
    .attr("cx", p => p.from.x + (p.to.x - p.from.x) * at(p))
    .attr("cy", p => p.from.y + (p.to.y - p.from.y) * at(p));
});

// ---------- controls ----------
try { if (localStorage.getItem("show-unnamed") === "0") { opts.unnamed = false; document.getElementById("opt-unnamed").checked = false; } } catch (e) {}
document.getElementById("opt-unnamed").addEventListener("change", e => { opts.unnamed = e.target.checked; try { localStorage.setItem("show-unnamed", opts.unnamed ? "1" : "0"); } catch (err) {} render(); });
document.getElementById("opt-past").addEventListener("change", e => { opts.past = e.target.checked; render(); });
document.getElementById("opt-spawned").addEventListener("change", e => { opts.spawned = e.target.checked; render(); });
// Theme: System follows the OS; Light or Dark overrides it (index.html sets data-theme before paint).
const themeButtons = document.querySelectorAll("#theme [data-theme-choice]");
const showTheme = () => themeButtons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === window.kaiusapTheme.get())));
themeButtons.forEach(b => b.addEventListener("click", () => { window.kaiusapTheme.set(b.dataset.themeChoice); showTheme(); }));
showTheme();
// ---------- pins and layout ----------
// Pin and Unpin act on the selection (a box selection, or the session open in the panel), else on every
// session; neither moves anything. Tidy is the one that moves: it re-runs the layout so unpinned sessions settle.
function pinScope() {
  if (selected?.type === "pick") { const ps = [...picked].filter(n => vNodes.includes(n)); return { ns: ps, what: `${ps.length} selected` }; }
  if (selected?.type === "node" && vNodes.includes(selected.d)) return { ns: [selected.d], what: label(selected.d) };
  return { ns: vNodes, what: "all" };
}
function pinAll(on) {
  const { ns } = pinScope();
  ns.forEach(n => {
    if (on) { n.fx = n.x; n.fy = n.y; n.pinned = true; }
    else { n.fx = n.fy = null; n.vx = n.vy = 0; n.pinned = false; }
  });
  saveLayout();
  if (selected?.type === "pick") select(selected); else updateNodes();
}
function tidy() { sim.alpha(0.6).restart(); }
function showPinControls() {
  const pin = document.getElementById("btn-pin"), unpin = document.getElementById("btn-unpin");
  if (!pin) return;
  const { ns, what } = pinScope(), on = ns.filter(n => n.pinned).length, off = ns.length - on;
  const set = (b, n, verb, key) => { b.disabled = !n; const t = n ? `${verb} ${what}${what === "all" || ns.length > 1 ? ` (${n})` : ""} (${key})` : `Nothing to ${verb.toLowerCase()}`; b.title = t; b.setAttribute("aria-label", t); };
  set(pin, off, "Pin", "P");
  set(unpin, on, "Unpin", "U");
}
document.getElementById("btn-pin").addEventListener("click", () => pinAll(true));
document.getElementById("btn-unpin").addEventListener("click", () => pinAll(false));
document.getElementById("btn-tidy").addEventListener("click", tidy);
// P, U and T outside text fields.
document.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === "p" && !document.getElementById("btn-pin").disabled) pinAll(true);
  else if (k === "u" && !document.getElementById("btn-unpin").disabled) pinAll(false);
  else if (k === "t") tidy();
  else return;
  e.preventDefault();
});

// ---------- search ----------
// Fuzzy find over sessions (handle, session name) and repositories (label, directory). Picking a session
// selects it and centres it; picking a repository fits its group in view and outlines its hull briefly.
// Score: exact > prefix > word start > substring > in-order letters (fewer gaps and earlier starts score higher).
function fuzzy(q, text) {
  const t = String(text || "").toLowerCase();
  if (!q || !t) return null;
  if (t === q) return { score: 1000, hits: [[0, q.length]] };
  const i = t.indexOf(q);
  if (i === 0) return { score: 900 - t.length, hits: [[0, q.length]] };
  if (i > 0) {
    const w = /[^a-z0-9]/.test(t[i - 1]);
    return { score: (w ? 800 : 700) - i - t.length / 10, hits: [[i, i + q.length]] };
  }
  let pos = -1, gaps = 0, first = -1;
  const hits = [];
  for (const c of q) {
    const j = t.indexOf(c, pos + 1);
    if (j < 0) return null;
    if (first < 0) first = j;
    if (j !== pos + 1 && pos >= 0) gaps++;
    if (hits.length && hits[hits.length - 1][1] === j) hits[hits.length - 1][1] = j + 1; else hits.push([j, j + 1]);
    pos = j;
  }
  return { score: 400 - gaps * 25 - first * 2 - t.length / 10, hits };
}
function marked(text, hits) {
  if (!hits) return esc(text);
  let out = "", at = 0;
  for (const [a, b] of hits) { out += esc(text.slice(at, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>"; at = b; }
  return out + esc(text.slice(at));
}
function searchCandidates() {
  const out = [], groups = new Map();
  for (const n of vNodes) {
    out.push({ kind: "session", n, name: label(n), alt: [n.name, n.handle, n.dir], sub: [n.name && n.name !== label(n) ? n.name : null, n.groupLabel].filter(Boolean).join(" · ") });
    if (!groups.has(n.project)) groups.set(n.project, { kind: "repo", p: n.project, name: groupLabel(n.project), alt: [n.project, n.dir], sub: (n.project || "").replace(/^\/Users\/[^/]+/, "~"), members: [] });
    groups.get(n.project).members.push(n);
  }
  for (const g of groups.values()) { g.sub = `${g.members.length} session${g.members.length === 1 ? "" : "s"} · ${g.sub}`; out.push(g); }
  return out;
}
function searchRank(qRaw) {
  const q = qRaw.trim().toLowerCase();
  if (!q) return [];
  const res = [];
  for (const c of searchCandidates()) {
    const m = fuzzy(q, c.name);
    let best = m ? { score: m.score + 20, hits: m.hits } : null;
    for (const a of c.alt) { const m2 = fuzzy(q, a); if (m2 && (!best || m2.score > best.score)) best = { score: m2.score, hits: null }; }
    if (best) res.push({ ...c, score: best.score + (c.kind === "repo" ? 5 : 0), hits: best.hits });
  }
  return res.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 8);
}
const qEl = document.getElementById("q"), qList = document.getElementById("q-results");
let qRes = [], qIdx = 0;
function showResults() {
  qRes = searchRank(qEl.value);
  qIdx = 0;
  const open = qEl.value.trim() !== "";
  qList.hidden = !open;
  qEl.setAttribute("aria-expanded", String(open));
  if (!open) { qEl.removeAttribute("aria-activedescendant"); return; }
  qList.innerHTML = qRes.length ? qRes.map((r, i) => `<li role="option" id="q-${i}" aria-selected="${i === qIdx}">
      <span class="name">${marked(r.name, r.hits)}</span><span class="kind">${r.kind === "repo" ? "repo" : "session"}</span><span class="sub">${esc(r.sub)}</span></li>`).join("")
    : `<li class="none" role="option" aria-disabled="true">No match</li>`;
  markActive();
}
function markActive() {
  qList.querySelectorAll("li[role=option][id]").forEach((li, i) => li.setAttribute("aria-selected", String(i === qIdx)));
  if (qRes.length) { qEl.setAttribute("aria-activedescendant", `q-${qIdx}`); document.getElementById(`q-${qIdx}`)?.scrollIntoView({ block: "nearest" }); }
}
function closeResults() { qList.hidden = true; qEl.setAttribute("aria-expanded", "false"); qEl.removeAttribute("aria-activedescendant"); }
// Animate to a transform (instant under reduced motion), then remember it.
function zoomTo(t) {
  if (reduced) { svg.call(zoom.transform, t); saveLayout(); }
  else svg.transition().duration(450).ease(d3.easeCubicOut).call(zoom.transform, t).on("end", saveLayout);
}
// Centre the box [x0,y0,x1,y1] (map coordinates) in the canvas. Keep the current zoom if the box fits at it;
// zoom out only as far as needed when it doesn't. Never zooms in.
function focusBox(x0, y0, x1, y1) {
  const pad = 60, k0 = d3.zoomTransform(svg.node()).k;
  const fit = Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0));
  const k = Math.max(kMin, Math.min(k0, fit));
  zoomTo(d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k));
}
// A search pick selects: a session is selected and centred; a repository's sessions are all selected and
// fitted in view. With Cmd or Ctrl the pick is added to the current selection.
function pick(r, add = false) {
  if (!r) return;
  closeResults();
  qEl.blur();
  const ns = r.kind === "session" ? [r.n] : r.members.filter(n => vNodes.includes(n));
  if (add) setPicked(new Set([...basePick(), ...ns]));
  else if (ns.length > 1) setPicked(new Set(ns));
  else { if (picked.size) setPicked(new Set(), false); select({ type: "node", d: ns[0] }); }
  // Frame everything now selected (an added pick brings the earlier ones along).
  const all = picked.size ? [...picked].filter(n => vNodes.includes(n)) : ns;
  focusBox(d3.min(all, n => n.x - n.r) - 10, d3.min(all, n => n.y - n.r) - 10, d3.max(all, n => n.x + n.r) + 10, d3.max(all, n => n.y + n.r) + 28);
}
qEl.addEventListener("input", showResults);
qEl.addEventListener("focus", () => { if (qEl.value.trim()) showResults(); });
qEl.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (qList.hidden) showResults();
    if (qRes.length) { qIdx = (qIdx + (e.key === "ArrowDown" ? 1 : qRes.length - 1)) % qRes.length; markActive(); }
  } else if (e.key === "Enter") { e.preventDefault(); pick(qRes[qIdx], e.metaKey || e.ctrlKey); }
  else if (e.key === "Escape") { if (!qList.hidden) closeResults(); else { qEl.value = ""; qEl.blur(); } }
});
qEl.addEventListener("blur", () => setTimeout(closeResults, 120));
qList.addEventListener("mousedown", e => {
  const li = e.target.closest("li[id]");
  if (li) { e.preventDefault(); pick(qRes[+li.id.slice(2)], e.metaKey || e.ctrlKey); }
});
// "/" focuses the search from anywhere outside a text field.
document.addEventListener("keydown", e => {
  if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) {
    e.preventDefault(); qEl.focus(); qEl.select();
  }
});

// ---------- zoom bar ----------
// Looked up on each call: a zoom event can fire before this part of the script has run.
function showZoom(k) { const el = document.getElementById("z-pct"); if (el) el.textContent = `${Math.round(k * 100)}%`; }
// Scale about the centre of the canvas, so what is in the middle stays there.
function zoomAbout(k) {
  const t0 = d3.zoomTransform(svg.node()), k1 = Math.max(kMin, Math.min(2.5, k));
  const cx = (W / 2 - t0.x) / t0.k, cy = (H / 2 - t0.y) / t0.k;
  zoomTo(d3.zoomIdentity.translate(W / 2 - k1 * cx, H / 2 - k1 * cy).scale(k1));
}
// Fit everything drawn (sessions, labels, repository groups and their names) in the canvas.
function fitAll() {
  if (!vNodes.length) return;
  // The sessions and their repository outlines only, in map coordinates before the zoom transform:
  // nothing in flight or half-drawn (a message dot, the selection box) can stretch the fit.
  const bs = [gHull, gNode].filter(g => g.node().childElementCount).map(g => g.node().getBBox());
  const x0 = d3.min(bs, b => b.x), y0 = d3.min(bs, b => b.y);
  const x1 = d3.max(bs, b => b.x + b.width), y1 = d3.max(bs, b => b.y + b.height);
  // The canvas's real size: W and H have a floor for the layout, which a phone's map can be smaller than.
  const r = svg.node().getBoundingClientRect(), w = r.width, h = r.height;
  const pad = 24, k = Math.min(2.5, (w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0));
  // Below 40% only when nothing larger fits it all; zooming out by hand then stops there too.
  kMin = Math.min(0.4, k);
  zoom.scaleExtent([kMin, 2.5]);
  zoomTo(d3.zoomIdentity.translate(w / 2 - k * (x0 + x1) / 2, h / 2 - k * (y0 + y1) / 2).scale(k));
}
// The middle of what's selected: a session, the box around a pick of several, or a line's midpoint.
function selectionCentre() {
  const ns = picked.size ? [...picked].filter(n => vNodes.includes(n))
    : selected?.type === "node" && vNodes.includes(selected.d) ? [selected.d]
    : selected?.type === "link" && vNodes.includes(selected.d.source) && vNodes.includes(selected.d.target) ? [selected.d.source, selected.d.target] : [];
  if (!ns.length) return null;
  return { x: (d3.min(ns, n => n.x) + d3.max(ns, n => n.x)) / 2, y: (d3.min(ns, n => n.y) + d3.max(ns, n => n.y)) / 2 };
}
// Move the selection to the middle of the canvas, at the zoom it's at.
function centreSelected() {
  const c = selectionCentre();
  if (!c) return;
  const r = svg.node().getBoundingClientRect(), k = d3.zoomTransform(svg.node()).k;
  zoomTo(d3.zoomIdentity.translate(r.width / 2 - k * c.x, r.height / 2 - k * c.y).scale(k));
}
// Looked up on each call, like the zoom level: select() can run before this part of the script has.
function updateCentre() {
  const btn = document.getElementById("z-centre"), has = !!selectionCentre();
  btn.disabled = !has;
  btn.title = has ? "Centre the selection (Shift+2)" : "Select a session to centre it";
}
const ZSTEP = 1.25;
document.getElementById("z-in").addEventListener("click", () => zoomAbout(d3.zoomTransform(svg.node()).k * ZSTEP));
document.getElementById("z-out").addEventListener("click", () => zoomAbout(d3.zoomTransform(svg.node()).k / ZSTEP));
document.getElementById("z-reset").addEventListener("click", () => zoomAbout(1));
document.getElementById("z-fit").addEventListener("click", fitAll);
document.getElementById("z-centre").addEventListener("click", centreSelected);
// Escape clears a pick of several sessions.
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || !menuEl.hidden || !picked.size) return;
  setPicked(new Set()); e.preventDefault();
});
// Escape in a conversation opened from a session goes back to that session.
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || !menuEl.hidden) return;
  if (selected?.type === "link" && goBack()) e.preventDefault();
});
// Keys, outside text fields: + and − step, Shift+0 is 100%, Shift+1 fits, Shift+2 centres the
// selection.
document.addEventListener("keydown", e => {
  if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  const k = d3.zoomTransform(svg.node()).k;
  if (e.key === "+" || e.key === "=") zoomAbout(k * ZSTEP);
  else if (e.key === "-" || e.key === "_") zoomAbout(k / ZSTEP);
  else if (e.code === "Digit0" && e.shiftKey) zoomAbout(1);
  else if (e.code === "Digit1" && e.shiftKey) fitAll();
  else if (e.code === "Digit2" && e.shiftKey) centreSelected();
  else return;
  e.preventDefault();
});
showZoom(d3.zoomTransform(svg.node()).k);

// ---------- view options menu ----------
// A disclosure, not an ARIA menu: it holds checkboxes and a switch. Closes on Escape, outside click or focus leaving it.
const menuBtn = document.getElementById("btn-menu"), menuEl = document.getElementById("menu");
function setMenu(open, refocus) {
  menuEl.hidden = !open;
  menuBtn.setAttribute("aria-expanded", String(open));
  if (open) menuEl.querySelector("input, button")?.focus();
  else if (refocus) menuBtn.focus();
}
menuBtn.addEventListener("click", () => setMenu(menuEl.hidden));
menuEl.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); setMenu(false, true); } });
document.addEventListener("pointerdown", e => { if (!menuEl.hidden && !e.target.closest(".menu-wrap")) setMenu(false); });
menuEl.addEventListener("focusout", e => { if (!menuEl.hidden && e.relatedTarget && !e.relatedTarget.closest(".menu-wrap")) setMenu(false); });

// ---------- panel resizing ----------
const asideEl = document.querySelector("aside"), resizer = document.getElementById("resizer"), mainEl = document.querySelector("main");
const narrow = () => matchMedia("(max-width: 760px)").matches;
function setPanel(px, save = true) {
  const m = mainEl.getBoundingClientRect(), tall = narrow();
  const v = tall ? Math.max(120, Math.min(m.height - 160, px)) : Math.max(260, Math.min(Math.min(760, m.width - 280), px));
  document.documentElement.style.setProperty(tall ? "--panel-h" : "--panel-w", v + "px");
  if (save) try { localStorage.setItem(tall ? "panel-h" : "panel-w", v); } catch (e) {}
}
// While the sizer is dragged, the map doesn't re-run its layout on every step: once, when it's let go.
let sizing = false;
try {
  const w = localStorage.getItem("panel-w"), h = localStorage.getItem("panel-h");
  if (w) document.documentElement.style.setProperty("--panel-w", w + "px");
  if (h) document.documentElement.style.setProperty("--panel-h", h + "px");
} catch (e) {}
const toggleBtn = document.getElementById("panel-toggle");
function setCollapsed(c, save = true) {
  mainEl.classList.toggle("collapsed", c);
  toggleBtn.setAttribute("aria-expanded", String(!c));
  const lbl = c ? "Show the side panel" : "Hide the side panel";
  toggleBtn.setAttribute("aria-label", lbl); toggleBtn.title = lbl;
  toggleBtn.classList.toggle("shut", c); // the chevron points the way the panel will move
  if (save) try { localStorage.setItem("panel-collapsed", c ? "1" : "0"); } catch (e) {}
}
toggleBtn.addEventListener("pointerdown", e => e.stopPropagation());
toggleBtn.addEventListener("dblclick", e => e.stopPropagation());
// The panel slides out of and back into its edge: a negative margin as wide (or, on a narrow screen, as tall)
// as the panel, so its contents keep their layout while the map grows. The map settles once, at the end.
let panelAnim = null;
function slidePanel(c, save = true) {
  if (reduced) { setCollapsed(c, save); return; }
  const prop = narrow() ? "marginBottom" : "marginRight";
  const cur = panelAnim ? parseFloat(getComputedStyle(asideEl)[prop]) || 0 : null;
  panelAnim?.cancel();
  if (!c) setCollapsed(false, save); // shown before it slides in, so it can be measured
  const size = narrow() ? asideEl.getBoundingClientRect().height : asideEl.getBoundingClientRect().width;
  toggleBtn.setAttribute("aria-expanded", String(!c));
  toggleBtn.classList.toggle("shut", c);
  sizing = true;
  panelAnim = asideEl.animate([{ [prop]: (cur ?? (c ? 0 : -size)) + "px" }, { [prop]: (c ? -size : 0) + "px" }], { duration: 220, easing: easeOut() });
  panelAnim.onfinish = () => { panelAnim = null; sizing = false; if (c) setCollapsed(true, save); resize(); sim.alpha(0.3).restart(); };
}
toggleBtn.addEventListener("click", () => slidePanel(!mainEl.classList.contains("collapsed")));
try { setCollapsed(localStorage.getItem("panel-collapsed") === "1"); } catch (e) { setCollapsed(false); }
matchMedia("(max-width: 760px)").addEventListener("change", () => setCollapsed(mainEl.classList.contains("collapsed"), false));
resizer.addEventListener("pointerdown", e => {
  if (mainEl.classList.contains("collapsed")) return;
  e.preventDefault(); resizer.setPointerCapture(e.pointerId); resizer.classList.add("active"); sizing = true;
  // One resize per frame, however fast the pointer reports.
  let last = null, frame = 0;
  const at = ev => { const m = mainEl.getBoundingClientRect(); return narrow() ? m.bottom - ev.clientY : m.right - ev.clientX; };
  const move = ev => { last = at(ev); frame ||= requestAnimationFrame(() => { frame = 0; setPanel(last, false); }); };
  const up = ev => {
    cancelAnimationFrame(frame); frame = 0;
    if (last !== null) setPanel(at(ev));
    resizer.classList.remove("active"); sizing = false;
    ["pointermove", "pointerup", "pointercancel"].forEach((t, i) => resizer.removeEventListener(t, i ? up : move));
    if (nodes.length) sim.alpha(0.3).restart();
  };
  resizer.addEventListener("pointermove", move); resizer.addEventListener("pointerup", up); resizer.addEventListener("pointercancel", up);
});
resizer.addEventListener("keydown", e => {
  if (e.target !== resizer || mainEl.classList.contains("collapsed")) return;
  const r = asideEl.getBoundingClientRect(), step = e.shiftKey ? 60 : 20;
  if (!narrow() && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); setPanel(r.width + (e.key === "ArrowLeft" ? step : -step)); }
  if (narrow() && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); setPanel(r.height + (e.key === "ArrowUp" ? step : -step)); }
});
resizer.addEventListener("dblclick", () => {
  if (mainEl.classList.contains("collapsed")) return; document.documentElement.style.removeProperty(narrow() ? "--panel-h" : "--panel-w"); try { localStorage.removeItem(narrow() ? "panel-h" : "panel-w"); } catch (e) {} });

// ---------- size ----------
const stage = document.getElementById("stage");
// Re-layout only when the map's size really changes; the observer also fires once on load,
// and a restart then would undo the restored layout.
function resize() {
  const r = stage.getBoundingClientRect();
  const w = Math.max(300, r.width), h = Math.max(260, r.height);
  if (Math.abs(w - W) < 2 && Math.abs(h - H) < 2) return;
  W = w; H = h;
  if (nodes.length && !sizing) sim.alpha(0.3).restart();
}
new ResizeObserver(resize).observe(stage);
resize();
renderLegend();
try { if (localStorage.getItem("dock-open") === "0") dockEl.open = false; } catch (e) {}
dockEl.addEventListener("toggle", () => { try { localStorage.setItem("dock-open", dockEl.open ? "1" : "0"); } catch (e) {} });
// The dock and the legend open and close smoothly: the body's height eases between 0 and its own, over the
// dock's 0.22s --ease-out. The chevron turns at the start either way. No motion under prefers-reduced-motion.
function smoothDetails(el) {
  const sum = el.querySelector("summary"), body = sum.nextElementSibling;
  let anim = null;
  sum.addEventListener("click", e => {
    if (reduced) return;
    e.preventDefault();
    const opening = anim ? el.classList.contains("closing") : !el.open;
    const from = anim || el.open ? body.getBoundingClientRect().height : 0; // a closed body may still report its height
    anim?.cancel();
    el.classList.toggle("closing", !opening);
    if (opening) el.open = true;
    const cap = parseFloat(body.style.maxHeight) || Infinity; // a height set with the grip
    const to = opening ? Math.min(cap, body.scrollHeight) : 0;
    body.style.overflow = "hidden";
    anim = body.animate([{ height: from + "px", opacity: opening ? 0 : 1 }, { height: to + "px", opacity: opening ? 1 : 0 }],
      { duration: 220, easing: getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() || "ease-out" });
    anim.onfinish = () => {
      anim = null; body.style.overflow = "";
      if (!opening) { el.open = false; el.classList.remove("closing"); }
    };
  });
}
smoothDetails(dockEl);
// An open dock's grab handle, and its title row, set the most its body may take (max-height, so a body with less
// to show stays short); past that the body scrolls. Up gives the dock more room, down gives the panel more. The
// panel above keeps at least 80px. Dragging the body to its full contents clears the limit, and so does a
// double-click or Home. Kept in localStorage per dock. The title row starts a drag only once the pointer has moved 4px,
// so a click still opens and closes it.
function dockSizer(el, key) {
  const grip = el.querySelector(".grip"), sum = el.querySelector("summary"), body = sum.nextElementSibling;
  const set = (h, save = true) => {
    if (h == null || h >= body.scrollHeight - 1) { body.style.maxHeight = ""; body.classList.remove("sized"); h = null; }
    else { body.style.maxHeight = h + "px"; body.classList.add("sized"); }
    if (save) try { h == null ? localStorage.removeItem(key) : localStorage.setItem(key, Math.round(h)); } catch (e) {}
    values();
  };
  // The separator reports the body's height in px, from the least it can take to its full contents.
  const values = () => {
    grip.setAttribute("aria-valuemin", 48);
    grip.setAttribute("aria-valuemax", Math.round(Math.max(48, body.scrollHeight)));
    grip.setAttribute("aria-valuenow", Math.round(body.getBoundingClientRect().height));
  };
  grip.addEventListener("focus", values);
  el.addEventListener("toggle", values);
  try { const h = +localStorage.getItem(key); if (h) { body.style.maxHeight = h + "px"; body.classList.add("sized"); } } catch (e) {}
  const clamp = (h, from) => Math.max(48, Math.min(h, body.scrollHeight, from + panel.getBoundingClientRect().height - 80));
  let dragged = false;
  const start = (e, src, threshold) => {
    if (!el.open || el.classList.contains("closing") || e.button) return;
    const y0 = e.clientY, h0 = body.getBoundingClientRect().height;
    let live = !threshold, last = null, frame = 0;
    const begin = () => { live = true; src.setPointerCapture(e.pointerId); grip.classList.add("active"); document.body.style.cursor = "row-resize"; };
    if (live) { e.preventDefault(); begin(); }
    const move = ev => {
      if (!live && Math.abs(ev.clientY - y0) < 4) return;
      if (!live) begin();
      last = clamp(h0 + y0 - ev.clientY, h0);
      frame ||= requestAnimationFrame(() => { frame = 0; set(last, false); });
    };
    const up = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (last !== null) { set(last); dragged = threshold; }
      grip.classList.remove("active"); document.body.style.cursor = "";
      ["pointermove", "pointerup", "pointercancel"].forEach((t, i) => src.removeEventListener(t, i ? up : move));
    };
    src.addEventListener("pointermove", move); src.addEventListener("pointerup", up); src.addEventListener("pointercancel", up);
  };
  grip.addEventListener("pointerdown", e => start(e, grip, false));
  sum.addEventListener("pointerdown", e => start(e, sum, true));
  // A drag that began on the title row doesn't also toggle the dock (caught before smoothDetails sees it).
  el.addEventListener("click", e => { if (dragged && sum.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } dragged = false; }, true);
  grip.addEventListener("dblclick", () => set(null));
  grip.addEventListener("keydown", e => {
    if (e.key === "Home") { e.preventDefault(); set(null); return; } // as a double-click: fit the contents
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const h = body.getBoundingClientRect().height, step = e.shiftKey ? 60 : 20;
    set(clamp(h + (e.key === "ArrowUp" ? step : -step), h));
  });
}
dockSizer(dockEl, "dock-h");

// ---------- the Key ----------
// A card over the map, anchored 8px above the control bars and right-aligned with them, so opening it never takes
// room from the side panel; on a phone, a bottom sheet of at most half the screen (kaiusap-DS "Key card").
// Not a modal. It closes from the Key button, its ×, or Esc inside it, not from a click on the map: it's kept open
// for reference. On a phone only one sheet shows: opening the Key hides the side panel, and selecting a session
// closes the Key and brings the panel back. Open or closed is kept per viewer (legend-open), and so is the height
// set with its grab handle (legend-h). It starts closed for a new viewer, and on a phone always.
const keyEl = document.getElementById("key"), keyBtn = document.getElementById("btn-key"), keyBody = document.getElementById("legend-body");
const keyHead = keyEl.querySelector(".key-head"), keyGrip = keyEl.querySelector(".grip"), mapctlEl = document.querySelector(".mapctl");
var keyOpen = false, keyAnim = null, keyHidPanel = false; // var: select() may ask before this line has run
// The most the card may take: the map area above the bars (12px short of its top), or half the screen on a phone.
const keyCap = () => narrow() ? Math.round(innerHeight * 0.5)
  : Math.max(120, Math.round(mapctlEl.getBoundingClientRect().top - stage.getBoundingClientRect().top - 8 - 12));
// The most the body may take inside that, once the title row and padding are counted.
const keyBodyCap = () => Math.max(48, keyCap() - (keyEl.getBoundingClientRect().height - keyBody.getBoundingClientRect().height));
function fitKey() { keyEl.style.maxHeight = keyCap() + "px"; keyValues(); }
function setKey(open, { save = true, focus = false } = {}) {
  if (open === keyOpen) return;
  keyOpen = open;
  keyBtn.setAttribute("aria-expanded", String(open));
  keyBtn.title = open ? "Hide the Key" : "Show the Key";
  if (save) try { localStorage.setItem("legend-open", open ? "1" : "0"); } catch (e) {}
  keyAnim?.cancel(); keyAnim = null;
  const off = { opacity: 0, transform: `translateY(${narrow() ? 24 : 8}px)` }, on = { opacity: 1, transform: "none" };
  if (open) {
    if (narrow() && !mainEl.classList.contains("collapsed")) { keyHidPanel = true; slidePanel(true, false); } // not kept: the Key's doing
    keyEl.hidden = false; fitKey();
    if (!reduced) { keyAnim = keyEl.animate([off, on], { duration: 220, easing: easeOut() }); keyAnim.onfinish = () => { keyAnim = null; }; }
  } else {
    const done = () => { keyAnim = null; keyEl.hidden = true; };
    if (reduced) done();
    else { keyAnim = keyEl.animate([on, off], { duration: 180, easing: easeOut() }); keyAnim.onfinish = done; }
    if (focus) keyBtn.focus();
    // The side panel comes back if the Key hid it.
    if (keyHidPanel && narrow() && mainEl.classList.contains("collapsed")) slidePanel(false, false);
    keyHidPanel = false;
  }
}
keyBtn.addEventListener("click", () => setKey(!keyOpen));
keyEl.querySelector(".key-close").addEventListener("click", () => setKey(false, { focus: true }));
keyEl.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); setKey(false, { focus: true }); } });
addEventListener("resize", () => { if (keyOpen) fitKey(); });
new ResizeObserver(() => { if (keyOpen) fitKey(); }).observe(stage);
// Bringing the side panel back on a phone closes the Key, and so does selecting something. Closing the Key brings
// back the panel if the Key hid it.
toggleBtn.addEventListener("click", () => { if (narrow() && keyOpen && !mainEl.classList.contains("collapsed")) { keyHidPanel = false; setKey(false, { save: false }); } });
function keyYields() { if (keyOpen && narrow()) setKey(false, { save: false }); }
// Its grab handle and title row set the body's max-height, past which it scrolls, as the docks' do: up gives it
// more, never past its contents or the map area. Double-click or Home fits it again. A phone sheet has none of
// this: its height is its contents, and only its × (or Esc) closes it.
function keyValues() {
  keyGrip.setAttribute("aria-valuemin", 48);
  keyGrip.setAttribute("aria-valuemax", Math.round(Math.max(48, Math.min(keyBody.scrollHeight, keyBodyCap()))));
  keyGrip.setAttribute("aria-valuenow", Math.round(keyBody.getBoundingClientRect().height));
}
function keySize(h, save = true) {
  if (h == null || h >= keyBody.scrollHeight - 1) { keyBody.style.maxHeight = ""; h = null; }
  else keyBody.style.maxHeight = h + "px";
  if (save) try { h == null ? localStorage.removeItem("legend-h") : localStorage.setItem("legend-h", Math.round(h)); } catch (e) {}
  keyValues();
}
try { const h = +localStorage.getItem("legend-h"); if (h) keyBody.style.maxHeight = h + "px"; } catch (e) {}
const keyClamp = h => Math.max(48, Math.min(h, keyBody.scrollHeight, keyBodyCap()));
function keyDrag(e, src, threshold) {
  if (!keyOpen || narrow() || e.button || e.target.closest(".key-close")) return;
  const y0 = e.clientY, h0 = keyBody.getBoundingClientRect().height;
  let live = !threshold, last = null, frame = 0;
  const begin = () => { live = true; src.setPointerCapture(e.pointerId); keyGrip.classList.add("active"); document.body.style.cursor = "row-resize"; };
  if (live) { e.preventDefault(); begin(); }
  const move = ev => {
    if (!live && Math.abs(ev.clientY - y0) < 4) return;
    if (!live) begin();
    last = keyClamp(h0 + y0 - ev.clientY);
    frame ||= requestAnimationFrame(() => { frame = 0; keySize(last, false); });
  };
  const up = () => {
    cancelAnimationFrame(frame); frame = 0;
    keyGrip.classList.remove("active"); document.body.style.cursor = "";
    ["pointermove", "pointerup", "pointercancel"].forEach((t, i) => src.removeEventListener(t, i ? up : move));
    if (last !== null) keySize(last);
  };
  src.addEventListener("pointermove", move); src.addEventListener("pointerup", up); src.addEventListener("pointercancel", up);
}
keyGrip.addEventListener("pointerdown", e => keyDrag(e, keyGrip, false));
keyHead.addEventListener("pointerdown", e => keyDrag(e, keyHead, true));
keyGrip.addEventListener("focus", keyValues);
keyGrip.addEventListener("dblclick", () => keySize(null));
keyGrip.addEventListener("keydown", e => {
  if (e.key === "Home") { e.preventDefault(); keySize(null); return; }
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const h = keyBody.getBoundingClientRect().height, step = e.shiftKey ? 60 : 20;
  keySize(keyClamp(h + (e.key === "ArrowUp" ? step : -step)));
});
// It starts closed until a viewer opens it; after that their choice is kept. A phone always starts closed.
try { if (!narrow() && localStorage.getItem("legend-open") === "1") setKey(true, { save: false }); } catch (e) {}
render();
overview();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { updateNodes(); renderLegend(); select(selected); });
new MutationObserver(() => { updateNodes(); renderLegend(); select(selected); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// ---------- connection ----------
const connEl = document.getElementById("conn"), bannerEl = document.getElementById("banner");
// The dot and word say the state; the tooltip says what it means and when the map last changed.
const CONN_TIPS = {
  connecting: "Waiting for the first data from the map server.",
  live: "Connected. The server checks kaiusap every few seconds and sends any change here.",
  error: "Connected, but a kaiusap command failed; the banner says which. The map shows the last good data.",
  retrying: "The map server isn't answering (stopped?). Retrying.",
  paused: "This tab is in the background, so it disconnected and the server stopped checking. It reconnects when you come back.",
};
function setConn(state, text, kind = state) {
  connEl.className = `conn ${state}`; connEl.textContent = text;
  const when = lastUpdate ? ` Last change: ${new Date(lastUpdate).toLocaleTimeString()}.` : "";
  connEl.title = (CONN_TIPS[kind] || "") + when;
}
setConn("", "connecting…", "connecting");
function showBanner(text) { bannerEl.hidden = !text; bannerEl.textContent = text || ""; }

function enterDemo() {
  demo = true;
  document.querySelector(".example").hidden = false;
  document.querySelectorAll(".demo-only").forEach(el => { el.hidden = false; });
  connEl.hidden = true;
  const d = window.kaiusapDemo();
  subjects = d.subjects;
  lastUpdate = Date.now();
  layout = loadLayout(); restoreZoom();
  applyNodes(d.nodes, d.links);
}

let layoutLoaded = false;
// The summary's title names the machine the server runs on, which matters when the map is opened
// from another device.
function showHost(host) {
  const el = document.querySelector("#dock summary");
  el.innerHTML = `This machine${host ? `: <span class="host">${esc(host)}</span>` : ""}`;
}
function onState(s) {
  showHost(s.host);
  noFocus = s.focus_unavailable || null;
  if (s.demo) { if (es) es.close(); es = null; return enterDemo(); }
  if (!layoutLoaded) { layoutLoaded = true; layout = loadLayout(); restoreZoom(); }
  lastUpdate = s.updated;
  lastError = s.error;
  const warn = [s.error && `kaiusap: ${s.error}. Showing the last good map.`, ...(s.warnings || [])].filter(Boolean).join(" · ");
  showBanner(warn);
  setConn(s.error ? "error" : "live", s.error ? "kaiusap error" : "live");
  liveMessages = s.messages || [];
  const { ns, ls } = buildLive(s.nodes || [], liveMessages);
  applyNodes(ns, ls);
  // A message new since the last update travels along its line.
  const ids = new Set(liveMessages.map(m => m.id));
  if (seenIds) for (const m of liveMessages) {
    if (seenIds.has(m.id)) continue;
    const from = byId.get(m.fromNode), to = byId.get(m.toNode);
    if (from && to && vNodes.includes(from) && vNodes.includes(to)) packets.push({ from, to, t0: performance.now() });
  }
  seenIds = ids;
}
setInterval(() => { if (demo || !links.length) return; refreshAges(); render(0); select(selected); }, 60000);

// Connect only while the tab is visible; the server polls only while a page is connected.
let es = null;
function connect() {
  if (es || demo) return;
  es = new EventSource(`api/events?layout=${kind}&tab=${tabId}`);
  es.addEventListener("layout", e => { try { onLayout(JSON.parse(e.data)); } catch (err) { console.error(err); } });
  es.onmessage = e => { try { onState(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  es.onerror = () => { if (!demo) setConn("", "disconnected, retrying…", "retrying"); };
}
function disconnect() { if (es) { es.close(); es = null; setConn("", "paused while hidden", "paused"); } }
document.addEventListener("visibilitychange", () => document.hidden ? disconnect() : connect());
connect();
})();
