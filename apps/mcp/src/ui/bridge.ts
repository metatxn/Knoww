/** Dependency-free implementation of the MCP Apps 2026-01-26 bridge. */
export const BRIDGE_SCRIPT = `
const pending = new Map();
let sequence = 0;
let ready = false;
let capabilities = {};
let parentOrigin = "*";
function post(message) { window.parent.postMessage({ jsonrpc: "2.0", ...message }, parentOrigin); }
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Request timed out")); }, 15000);
    pending.set(id, { resolve, reject, timer });
    post({ id, method, params });
  });
}
function applyTheme(context) {
  if (context?.theme === "light" || context?.theme === "dark") document.documentElement.dataset.theme = context.theme;
}
function resize() {
  if (ready) post({ method: "ui/notifications/size-changed", params: { height: document.body.scrollHeight } });
}
const observer = new ResizeObserver(resize);
observer.observe(document.body);
window.addEventListener("message", (event) => {
  if (event.source !== window.parent || (parentOrigin !== "*" && event.origin !== parentOrigin)) return;
  const message = event.data;
  if (!message || message.jsonrpc !== "2.0") return;
  if (!message.method && ("result" in message || "error" in message) && pending.has(message.id)) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (event.origin !== "null") parentOrigin = event.origin;
    if (message.error) entry.reject(new Error("Host request failed"));
    else entry.resolve(message.result);
    return;
  }
  if (message.method === "ui/notifications/tool-result") receiveResult(message.params);
  if (message.method === "ui/notifications/tool-cancelled") showStatus("Market request cancelled.");
  if (message.method === "ui/notifications/host-context-changed") applyTheme(message.params);
  if (message.method === "ping") post({ id: message.id, result: {} });
  if (message.method === "ui/resource-teardown") {
    ready = false;
    observer.disconnect();
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("View closed")); }
    pending.clear();
    post({ id: message.id, result: {} });
  }
});
async function connect() {
  try {
    const result = await request("ui/initialize", {
      appInfo: { name: "Knoww markets", version: "1.0.0" },
      appCapabilities: { availableDisplayModes: ["inline"] },
      protocolVersion: "2026-01-26",
    });
    if (result?.protocolVersion !== "2026-01-26") throw new Error("Unsupported bridge version");
    capabilities = result.hostCapabilities ?? {};
    applyTheme(result.hostContext);
    ready = true;
    post({ method: "ui/notifications/initialized", params: {} });
    updateControls();
    resize();
  } catch { showStatus("Interactive controls are unavailable. Use the market links in the conversation."); }
}
`;
