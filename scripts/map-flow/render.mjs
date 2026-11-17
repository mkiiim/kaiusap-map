// Renders the README flow on the map, stacked above kaiusap's terminal animation (its docs/assets/flow.gif), into
// docs/assets/map-flow.gif and map-flow-dark.gif. One GIF, so the two halves can never drift apart. The terminal
// GIF is 76 beats of 0.5 s, 38 s a loop; each beat here is cut into FPS frames so the map's motion (packets, the
// turn-running ring, the reply-owed dashes) reads smoothly, and the map's state changes only on beats.
// Run from the repo root: node --experimental-websocket scripts/map-flow/render.mjs [light|dark|both]
// Needs Google Chrome, ImageMagick (magick), and the terminal GIF: TERMINAL_GIF=<path>, by default a kaiusap clone
// beside this one. Chrome runs headless on virtual time, so every run is the same.
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 830, H = 500, SCALE = 2, BEATS = 76, BEAT_MS = 500, FPS = 10;
const PER_BEAT = BEAT_MS * FPS / 1000;
const root = process.cwd();
const page = "file://" + resolve(root, "web/index.html");
const TERMINAL = resolve(root, process.env.TERMINAL_GIF || "../kaiusap/docs/assets/flow.gif");
const timeline = readFileSync(resolve(root, "scripts/map-flow/timeline.js"), "utf8");
// PREVIEW=<dir> writes one PNG at the end of a few beats there instead of a GIF, for a quick look.
const PREVIEW = process.env.PREVIEW, PREVIEW_BEATS = [0, 7, 8, 22, 35, 47, 75];
// Where each session sits, as fractions of the map's size (the map's own saved-layout format), and the side
// zoom. Placed by hand so the three sessions of the flow stand clear of their neighbours. They're pinned so the
// layout doesn't creep between frames (which would also bloat the GIF); the pin markers are hidden, since a map
// that has settled on its own looks the same without them.
const PLACES = {
  "backend-eng": [0.36, 0.13], "frontend-dev": [0.64, 0.22], "qa-tester": [0.42, 0.36],
  "docs-oc": [0.08, 0.31], "docs-cld": [0.12, 0.62], "docs-cdx": [0.25, 0.72],
  "api-cld": [0.66, 0.62], "api-cdx": [0.82, 0.55], "api-db-cld": [0.80, 0.76],
};
const LAYOUT = { nodes: Object.fromEntries(Object.entries(PLACES).map(([id, [x, y]]) => [id, { x, y, pinned: true, t: Date.now() }])), zoom: { x: 24, y: 18, k: 0.9 } };
// Also for the illustration: no pin markers (above), no "Click or drag a box" hint, the neighbours' names a size
// down to match their circles, and the side panel's contents at 85% so more of a session's details fit.
const CSS = [
  "#map .node .pin { display: none; }",
  ".hint { display: none; }",
  '#map .node:not([aria-label^="backend-eng,"]):not([aria-label^="frontend-dev,"]):not([aria-label^="qa-tester,"]) .label { font-size: 9px; }',
  "aside > * { zoom: 0.85; }",
].join(" ");
const themes = { light: ["light"], dark: ["dark"], both: ["light", "dark"] }[process.argv[2] || "both"];

// Chrome's helpers can still be writing to its profile just after it exits; a leftover temp folder is harmless.
function cleanup(dir) { try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch (e) {} }

async function chrome(profile) {
  const proc = spawn(CHROME, ["--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const ws = await new Promise((ok, no) => {
    let buf = "";
    proc.stderr.on("data", d => { buf += d; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) ok(m[1]); });
    proc.on("exit", c => no(new Error("chrome exited " + c)));
  });
  const port = new URL(ws).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const sock = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(ok => sock.addEventListener("open", ok, { once: true }));
  let id = 0;
  const waiting = new Map(), listeners = new Map();
  sock.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const [ok, no] = waiting.get(m.id); waiting.delete(m.id); m.error ? no(new Error(JSON.stringify(m.error))) : ok(m.result); }
    else if (m.method) (listeners.get(m.method) || []).forEach(f => f(m.params));
  });
  const send = (method, params = {}) => new Promise((ok, no) => { if (process.env.DEBUG) console.error("->", method); waiting.set(++id, [ok, no]); sock.send(JSON.stringify({ id, method, params })); });
  const once = method => new Promise(ok => { const l = listeners.get(method) || []; l.push(function f(p) { l.splice(l.indexOf(f), 1); ok(p); }); listeners.set(method, l); });
  const close = () => new Promise(ok => { proc.once("exit", ok); sock.close(); proc.kill(); });
  return { send, once, close };
}

async function run(theme) {
  const profile = mkdtempSync(join(tmpdir(), "map-flow-"));
  const c = await chrome(profile);
  const { send, once } = c;
  const advance = async ms => { const done = once("Emulation.virtualTimeBudgetExpired"); await send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: ms }); await done; };
  const evaluate = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "no-preference" }] });
  const seed = `const CSS = ${JSON.stringify(CSS)};\n    try { localStorage.setItem("layout", ${JSON.stringify(JSON.stringify(LAYOUT))}); } catch (e) {}
    addEventListener("DOMContentLoaded", () => document.head.insertAdjacentHTML("beforeend", "<style>" + CSS + "</style>"));`;
  await send("Page.addScriptToEvaluateOnNewDocument", { source: seed + "\n" + timeline });
  // Load in real time, then freeze the clock: from here on time moves only when advance() says so.
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url: page });
  await loaded;
  await send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await evaluate("__flow(0)");
  await advance(3000); // let the first render finish before the loop starts
  const frames = mkdtempSync(join(tmpdir(), "map-flow-frames-"));
  const files = [];
  if (PREVIEW) {
    for (const b of PREVIEW_BEATS) {
      await evaluate(`__flow(${b})`);
      await advance(BEAT_MS);
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(PREVIEW, `${theme}-${b}.png`), Buffer.from(data, "base64"));
    }
    await c.close(); cleanup(profile);
    return;
  }
  for (let b = 0; b < BEATS; b++) {
    await evaluate(`__flow(${b})`);
    for (let k = 0; k < PER_BEAT; k++) {
      await advance(1000 / FPS);
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      const f = join(frames, `${String(files.length).padStart(4, "0")}.png`);
      writeFileSync(f, Buffer.from(data, "base64"));
      files.push(f);
    }
    process.stdout.write(`\r${theme}: beat ${b + 1}/${BEATS}`);
  }
  process.stdout.write("\n");
  await c.close(); cleanup(profile);
  const out = resolve(root, `docs/assets/map-flow${theme === "dark" ? "-dark" : ""}.gif`);
  encode(stack(files, frames), frames, out);
  if (!process.env.KEEP) rmSync(frames, { recursive: true, force: true });
  else console.log(frames);
  console.log(out);
}

// Each map frame over the terminal frame for its beat (the terminal GIF has one frame per beat).
function stack(files, dir) {
  if (!existsSync(TERMINAL)) throw new Error(`no terminal GIF at ${TERMINAL}; set TERMINAL_GIF`);
  execFileSync("magick", [TERMINAL, "-coalesce", "+repage", join(dir, "t%03d.png")]);
  return files.map((f, i) => {
    const out = join(dir, `s${String(i).padStart(4, "0")}.png`);
    execFileSync("magick", [f, join(dir, `t${String(Math.floor(i / PER_BEAT)).padStart(3, "0")}.png`), "-append", "+repage", out]);
    return out;
  });
}
// One palette for every frame, so an unchanged pixel stays the same colour and each frame stores only what moved.
function encode(files, dir, out) {
  const pal = join(dir, "palette.png");
  execFileSync("magick", [...files.filter((f, i) => i % 19 === 0), "-append", "+dither", "-colors", "128", "-unique-colors", pal]);
  execFileSync("magick", ["-delay", String(100 / FPS), ...files, "+dither", "-remap", pal, "-loop", "0", "-layers", "Optimize", out]);
}
if (process.env.ENCODE) { // re-encode frames kept with KEEP=1: ENCODE=<frames dir> OUT=<gif>
  const dir = process.env.ENCODE;
  encode(stack((await import("node:fs")).readdirSync(dir).filter(f => /^\d+\.png$/.test(f)).sort().map(f => join(dir, f)), dir), dir, process.env.OUT);
  process.exit(0);
}
for (const theme of themes) {
  await run(theme);
}
process.exit(0);
