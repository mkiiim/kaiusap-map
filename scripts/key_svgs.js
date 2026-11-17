// Writes docs/key/<name>-light.svg and -dark.svg, one per row of the map's Key, for the README.
// It runs the Key's own drawing code from web/map.js with the DS colour tokens of each theme, so the README's
// glyphs match the Key. Run it from the repo root after changing the Key: node scripts/key_svgs.js
const fs = require("fs");
const src = fs.readFileSync("web/map.js", "utf8").split("\n");
const marks = src.slice(29, 66).join("\n");               // MARKS + markSvg
const swStart = src.findIndex(l => l.startsWith("const SWATCH = {"));
const swEnd = src.findIndex((l, i) => i > swStart && l === "};");
const swatchDefs = src.slice(swStart, swEnd + 1).join("\n");
const lgStart = src.findIndex(l => l.includes('document.getElementById("legend-body").innerHTML = ['));
const lgEnd = src.findIndex((l, i) => i > lgStart && l.includes('].map(g => `<div class="legend">'));
const legend = "[" + src.slice(lgStart + 1, lgEnd).join("\n") + "\n`]";
const colors = fs.readFileSync("web/tokens/colors.css", "utf8");
const [lightBlock, darkBlock] = [colors.slice(0, colors.indexOf(".dark, [data-theme")), colors.slice(colors.indexOf(".dark, [data-theme"))];
const tok = b => Object.fromEntries([...b.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const themes = { light: tok(lightBlock), dark: { ...tok(lightBlock), ...tok(darkBlock) } };
// The Key's motion (the owed reply's moving dashes, the turn-running pulse) and its reduced-motion forms, copied
// from web/index.html's own rules so the README's glyphs move as the Key does, and stay still when the reader asks.
const page = fs.readFileSync("web/index.html", "utf8");
const ease = fs.readFileSync("web/tokens/spacing.css", "utf8").match(/--ease-out:\s*([^;]+);/)[1].trim();
const rules = page.split("\n").filter(l => /^(\.lg-(flow|wring|still) |@keyframes (flow|owe) )/.test(l));
const rm = page.slice(page.indexOf("@media (prefers-reduced-motion: reduce)")).split("\n").slice(1).filter(l => /^\s+\.lg-/.test(l));
const MOTION = (rules.join("") + `@media (prefers-reduced-motion: reduce){${rm.map(l => l.trim()).join("")}}`)
  .replace(/var\(--ease-out\)/g, ease).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const out = {};
for (const [name, t] of Object.entries(themes)) {
  const css = v => t[v];
  const swatch = inner => `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="-11 -11 22 22">${inner}</svg>`;
  const swatchWide = inner => `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="22" viewBox="-22 -11 44 22">${inner}</svg>`;
  const groups = eval(`(() => { ${marks}\n${swatchDefs}\nreturn ${legend}; })()`);
  groups.forEach((g, gi) => {
    const re = /(<svg xmlns[\s\S]*?<\/svg>)(?=<span>)<span>([^<]+)<\/span>/g;
    for (const m of g.matchAll(re)) {
      const label = m[2];
      const slug = label.toLowerCase().replace(/:.*|;.*/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      let svg = m[1].replace(/ class="(?!lg-)[^"]*"/g, "").replace(/ aria-hidden="true"/g, "")
        .replace(/width="(\d+)" height="(\d+)"/, (_, w, h) => `width="${w * 2}" height="${h * 2}"`)
        .replace(/<text /g, '<text font-family="IBM Plex Sans, -apple-system, Helvetica, Arial, sans-serif" font-weight="600" ');
      if (/class="lg-/.test(svg)) svg = svg.replace(/(<svg[^>]*>)/, `$1<style>${MOTION}</style>`);
      (out[slug] ||= { label, group: gi })[name] = svg;
    }
  });
}
fs.mkdirSync("docs/key", { recursive: true });
for (const [slug, v] of Object.entries(out)) for (const th of ["light", "dark"]) fs.writeFileSync(`docs/key/${slug}-${th}.svg`, v[th] + "\n");
console.log(`${Object.keys(out).length} Key rows, ${Object.keys(out).length * 2} files in docs/key/`);
