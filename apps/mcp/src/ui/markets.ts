import { BRIDGE_SCRIPT } from "./bridge.ts";

// Change this URI when the component contract or bundled UI changes.
export const MARKETS_RESOURCE_URI = "ui://knoww/markets/v1.html";

export const MARKETS_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Knoww markets</title><style>
:root { color-scheme: light dark; --surface: #fff; --ink: #25231e; --muted: #69645b; --line: #e7e4dc; --tint: #f7f5ef; --accent: #37663d; }
@media(prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --surface: #191a18; --ink: #f1f0e9; --muted: #b8b7ad; --line: #3c3e37; --tint: #262821; --accent: #a5d699; } }
:root[data-theme="dark"] { --surface: #191a18; --ink: #f1f0e9; --muted: #b8b7ad; --line: #3c3e37; --tint: #262821; --accent: #a5d699; }
* { box-sizing: border-box; } body { margin: 0; padding: 16px; background: var(--surface); color: var(--ink); font: 14px/1.5 system-ui, sans-serif; }
header, .row, .actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h1 { margin: 0; font: 600 22px/1.2 Georgia, serif; } h2 { margin: 8px 0 16px; font-size: 18px; line-height: 1.4; overflow-wrap: anywhere; }
p { margin: 8px 0; } .muted, small { color: var(--muted); } #status { margin-top: 12px; } #markets { display: grid; gap: 16px; margin: 16px 0; }
article { border: 1px solid var(--line); border-radius: 10px; padding: 16px; min-width: 0; } .eyebrow { font-size: 12px; letter-spacing: .04em; color: var(--muted); }
.outcomes { display: flex; gap: 8px; flex-wrap: wrap; } .outcome { display: flex; gap: 12px; justify-content: space-between; text-align: left; min-width: 104px; flex: 1; }
.outcome span { min-width: 0; overflow-wrap: anywhere; } .outcome strong { white-space: nowrap; }
button, a { font: inherit; } button { padding: 8px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--tint); color: var(--ink); cursor: pointer; }
button:disabled { cursor: default; opacity: .65; } button[aria-pressed="true"] { border-color: var(--accent); outline: 1px solid var(--accent); }
button:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; } a { color: var(--accent); text-underline-offset: 3px; }
.chart { margin-top: 16px; } .chart svg { display: block; width: 100%; height: 100px; color: var(--accent); }
.chart-caption { font-size: 12px; color: var(--muted); } .actions { margin-top: 16px; } details { margin-top: 12px; } summary { cursor: pointer; } .description { white-space: pre-wrap; overflow-wrap: anywhere; }
footer { border-top: 1px solid var(--line); padding-top: 12px; font-size: 12px; color: var(--muted); } [hidden] { display: none !important; }
</style></head><body>
<header><div><h1>Knoww</h1><div class="muted">Markets related to your conversation</div></div><button id="refresh" type="button" disabled>Refresh prices</button></header>
<p id="status" role="status" aria-live="polite">Loading relevant markets...</p>
<main id="markets" aria-label="Relevant prediction markets"></main>
<footer>Source: Polymarket. Prices reflect market expectations, not guaranteed outcomes. <span id="fetched"></span></footer>
<script>
const list = document.getElementById("markets");
const status = document.getElementById("status");
const refresh = document.getElementById("refresh");
let latest;
let revision = 0;
let refreshing = false;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function showStatus(text) { status.textContent = text; status.hidden = !text; }
function dateText(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unavailable";
}
function safeUrl(raw) {
  try {
    const url = new URL(raw);
    return url.origin === "https://knoww.app" && /^\/events\/detail\/[a-z0-9-]+$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
function updateControls() {
  refresh.disabled = refreshing || !ready || !capabilities.serverTools || !latest?.selectionSlugs?.length;
  for (const button of list.querySelectorAll(".outcome")) button.disabled = !ready || !capabilities.serverTools || !button.dataset.token;
}
function renderChart(container, history, name) {
  const points = Array.isArray(history?.points) ? history.points.filter((point) => Number.isFinite(Date.parse(point.timestamp)) && typeof point.price === "string" && Number.isFinite(Number(point.price)) && Number(point.price) >= 0 && Number(point.price) <= 1).slice(0, 1000) : [];
  container.replaceChildren();
  if (points.length < 2) { container.append(element("p", "Not enough price history for this outcome.", "muted")); return; }
  const start = Date.parse(points[0].timestamp);
  const span = Date.parse(points.at(-1).timestamp) - start;
  if (span <= 0) { container.append(element("p", "Price history unavailable.", "muted")); return; }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 600 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", name + " price history, last 24 hours. Scale 0 to 1.");
  const path = document.createElementNS(svg.namespaceURI, "polyline");
  // Convert prices only to chart coordinates; displayed prices come from Decimal.js on the server.
  path.setAttribute("points", points.map((point) => ((Date.parse(point.timestamp) - start) / span * 596 + 2) + "," + (98 - Number(point.price) * 96)).join(" "));
  path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", "2"); path.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(path);
  container.append(svg, element("p", name + " · Last 24 hours · Price scale 0–1 · Latest " + points.at(-1).price + " at " + dateText(points.at(-1).timestamp), "chart-caption"));
}
function card(market) {
  const article = element("article");
  article.append(element("div", "POLYMARKET · ACTIVE", "eyebrow"), element("h2", market.question ?? market.slug));
  const outcomes = element("div", undefined, "outcomes");
  const chart = element("div", undefined, "chart");
  chart.setAttribute("aria-live", "polite");
  let chartSequence = 0;
  for (const outcome of (market.outcomes ?? []).slice(0, 20)) {
    const button = element("button", undefined, "outcome");
    button.type = "button";
    button.append(element("span", outcome.name), element("strong", outcome.priceLabel));
    button.setAttribute("aria-label", outcome.name + " " + outcome.priceLabel + ", show price history");
    button.setAttribute("aria-pressed", "false");
    if (/^[0-9]{1,80}$/.test(outcome.tokenId ?? "")) button.dataset.token = outcome.tokenId;
    button.onclick = async () => {
      const version = ++chartSequence;
      for (const sibling of outcomes.children) sibling.setAttribute("aria-pressed", String(sibling === button));
      chart.replaceChildren(element("p", "Loading price history...", "muted"));
      try {
        const result = await request("tools/call", { name: "get_price_history", arguments: { tokenId: button.dataset.token } });
        if (version !== chartSequence || !article.isConnected) return;
        if (result?.isError || result?.structuredContent?.history?.tokenId !== button.dataset.token) throw new Error("History unavailable");
        renderChart(chart, result.structuredContent.history, outcome.name);
      } catch { if (version === chartSequence && article.isConnected) chart.replaceChildren(element("p", "Price history could not be loaded. Select the outcome to retry.", "muted")); }
    };
    outcomes.append(button);
  }
  article.append(outcomes);
  if (market.volume !== undefined) article.append(element("p", "Volume " + market.volume + " · Unit unspecified by source", "chart-caption"));
  if (!outcomes.children.length) article.append(element("p", "Outcome prices unavailable.", "muted"));
  if (market.outcomesTruncated) article.append(element("small", "Some outcomes are omitted. Open Knoww for the complete market."));
  article.append(element("p", "Select an outcome to view its price history.", "chart-caption"), chart);
  if (market.description) {
    const details = element("details");
    details.append(element("summary", "Resolution details"), element("p", market.description, "description"));
    if (market.descriptionTruncated) details.append(element("small", "Description shortened. Open Knoww for full details."));
    article.append(details);
  }
  const actions = element("div", undefined, "actions");
  actions.append(element("small", market.endDate ? "Ends " + dateText(market.endDate) : "End date unavailable"));
  const url = safeUrl(market.url);
  if (url) {
    const link = element("a", "Open on Knoww ↗");
    link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer";
    link.onclick = async (event) => {
      if (!ready || !capabilities.openLinks) return;
      event.preventDefault();
      try { await request("ui/open-link", { url }); }
      catch { showStatus("The link could not be opened. Use the Knoww link in the conversation."); }
    };
    actions.append(link);
  }
  article.append(actions);
  return article;
}
function receiveResult(result) {
  if (result?.isError) { showStatus(latest ? "Request failed. Showing the previous market snapshot; try again." : "Markets could not be loaded. Ask to try again."); return; }
  const data = result?.structuredContent;
  // Other app tool calls, including chart requests, may also emit tool-result notifications.
  if (!Array.isArray(data?.markets)) return;
  latest = data;
  revision++;
  list.replaceChildren(...data.markets.slice(0, 3).map(card));
  const notices = [];
  if (!data.markets.length) notices.push("No matching active markets to show.");
  if (data.omittedCount) notices.push("Inactive or missing markets were omitted.");
  if (data.unavailableCount) notices.push("Some markets could not be loaded. Refresh to try again.");
  showStatus(notices.join(" "));
  document.getElementById("fetched").textContent = data.meta?.asOf ? "Fetched " + dateText(data.meta.asOf) + "." : "";
  updateControls();
}
refresh.onclick = async () => {
  const startedRevision = revision;
  refreshing = true; updateControls(); showStatus("Refreshing market prices...");
  try {
    const result = await request("tools/call", { name: "show_markets", arguments: { slugs: latest.selectionSlugs } });
    if (revision === startedRevision) receiveResult(result);
  } catch { if (revision === startedRevision) showStatus("Refresh failed. Showing the previous snapshot; try again."); }
  finally { refreshing = false; updateControls(); }
};
${BRIDGE_SCRIPT}
connect();
</script></body></html>`;
