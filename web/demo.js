// Example data, used only with `--demo`.
window.kaiusapDemo = () => {
  const projects = {
    atlas: "~/Projects/atlas",
    relay: "~/Projects/relay",
    shop: "~/Projects/shop",
    homelab: "~/Projects/homelab",
    trade: "~/Projects/trade",
    ops: "~/Projects/ops",
  };
  const nodes = [
    { id: "atlas-cld", provider: "claude", project: "atlas", state: "reachable", unread: 1, name: "spec revision" },
    { id: "atlas-cld-impl", provider: "claude", project: "atlas", state: "reachable", unread: 0, name: "parser implementer" },
    { id: "atlas-cdx", provider: "codex", project: "atlas", state: "reachable", unread: 0, waiting: "approval", name: "native hook build" },
    { id: "relay-cld", provider: "claude", project: "relay", state: "reachable", unread: 0, name: "relay design" },
    { id: "shop-cld-fe", provider: "claude", project: "shop", state: "reachable", unread: 2, owes: true, name: "frontend" },
    { id: "shop-cdx-be", provider: "codex", project: "shop", state: "detached", unread: 0, name: "backend API" },
    { id: "shop-cld-qa", provider: "claude", project: "shop", state: "stored", unread: 3, reason: "no Claude process holds this session", name: "QA pass" },
    { id: "dns-cld", provider: "claude", project: "homelab", state: "reachable", unread: 0, name: "DNS failover" },
    { id: "trade-claude", provider: "claude", project: "trade", state: "reachable", unread: 0, owes: true, name: "API contract" },
    { id: "trade-codex", provider: "codex", project: "trade", state: "stored", unread: 1, reason: "the thread isn't loaded in the Codex daemon", name: "order router" },
    { id: "ops-codex", provider: "codex", project: "ops", state: "reachable", unread: 0, name: "deploy scripts" },
    { id: "shop-cld-fe/explore", provider: "claude", project: "shop", state: "reachable", spawned: "shop-cld-fe", unread: 0, name: "Explore subagent" },
  ];
  const links = [
    { source: "atlas-cld", target: "relay-cld", count: 6, last: 4, open: null },
    { source: "relay-cld", target: "atlas-cld-impl", count: 9, last: 1460, open: null },
    { source: "atlas-cld", target: "atlas-cdx", count: 3, last: 22, open: null },
    { source: "dns-cld", target: "relay-cld", count: 2, last: 1050, open: null },
    { source: "shop-cdx-be", target: "shop-cld-fe", count: 14, last: 9, open: "shop-cld-fe" },
    { source: "shop-cld-fe", target: "shop-cld-qa", count: 4, last: 95, open: null },
    { source: "trade-codex", target: "trade-claude", count: 5, last: 31, open: "trade-claude" },
    { source: "trade-claude", target: "ops-codex", count: 2, last: 2880, open: null },
    { source: "ops-codex", target: "dns-cld", count: 1, last: 4300, open: null },
    { source: "shop-cld-fe", target: "shop-cld-fe/explore", count: 1, last: 7, open: null, lineage: true },
  ];
  const subjects = [
    "Review the API contract", "Confirm the error codes", "Schema for /orders", "Re: rate limit headers",
    "Which branch has the fix", "Failing test in checkout", "Draft spec change for review", "Re: wake rule",
    "Smoke test results", "Rename the env var", "Can you run the migration dry run", "Re: pagination cursor",
  ];
  const msgStates = ["answered", "read, not answered", "unread", "answered", "answered", "stored, not read"];
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const l of links) {
    l.messages = [];
    if (l.lineage) continue;
    for (let i = 0; i < l.count; i++) {
      const fwd = rand() > 0.45;
      l.messages.push({
        from: fwd ? l.source : l.target, to: fwd ? l.target : l.source,
        subject: subjects[Math.floor(rand() * subjects.length)],
        ago: l.last + Math.floor(i * (20 + rand() * 90)),
        state: i === 0 && l.open ? "read, not answered" : msgStates[Math.floor(rand() * msgStates.length)],
      });
    }
    if (l.open) { const m = l.messages[0]; m.to = l.open; m.from = l.open === l.source ? l.target : l.source; m.replyNeeded = true; }
  }
  nodes.forEach(n => {
    n.dir = projects[n.project];
    n.groupLabel = n.project;
    n.named = true;
    n.demo = true;
  });
  return { nodes, links, subjects };
};
