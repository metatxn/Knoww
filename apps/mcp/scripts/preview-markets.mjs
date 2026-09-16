// Local MCP Apps fixture host. No upstream requests or credentials.
import { createServer } from "node:http";
import { MARKETS_HTML } from "../src/ui/markets.ts";

const preview = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Knoww MCP Apps preview</title>
<style>body{margin:24px;font:14px system-ui;background:#f7f5ef;color:#25231e}h1{font-size:18px}nav{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}button{padding:8px}iframe{width:100%;max-width:720px;border:1px solid #ddd;border-radius:12px;background:white}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>
<h1>Knoww MCP Apps fixture preview</h1><p>Sample data only. This host simulates the MCP Apps bridge and resets body padding to test embedded spacing.</p>
<nav><button data-mode="normal">Three markets</button><button data-mode="single">One market</button><button data-mode="past-end">Open after end date</button><button data-mode="empty">Empty</button><button data-mode="partial">Partial failure</button><button data-mode="error">Tool error</button><button data-mode="hostile">Untrusted text</button><button id="theme">Toggle theme</button></nav>
<iframe id="app" title="Knoww market cards" sandbox="allow-scripts" src="/widget"></iframe><pre id="events" aria-label="Bridge events"></pre>
<script>
const frame = document.getElementById("app");
let mode = "normal", theme = "light";
const slugs = ["fed-rate-cut", "bitcoin-year-end", "bitcoin-above-76k"];
function result() {
  if(mode === "error") return {isError:true,content:[{type:"text",text:"UPSTREAM_UNAVAILABLE"}]};
  const selection = mode === "empty" ? [] : mode === "single" ? slugs.slice(0,1) : slugs;
  return {structuredContent:{selectionSlugs: selection,markets:[
    {id:"1",slug:slugs[0],question:mode === "hostile" ? '<img src=x onerror="alert(1)"> Will rates fall?' : "Will the Fed cut rates at its next meeting?",outcomes:[{name:"Yes",price:"0.625",priceLabel:"62.5%",tokenId:"111"},{name:"No",price:"0.375",priceLabel:"37.5%",tokenId:"222"}],description:"Resolves based on the Federal Reserve's announced target rate following its next scheduled meeting.",event:{title:"Federal Reserve rate decision"},url:mode === "hostile" ? "javascript:alert(1)" : "https://knoww.app/events/detail/fed-rate-cut?conditionId=0x"+"a".repeat(64),endDate:mode === "past-end" ? "2000-01-01T00:00:00Z" : "2026-12-31T00:00:00Z",volume:"1248500.25",volumeLabel:"1,248,500.25"},
    {id:"2",slug:slugs[1],question:"Will Bitcoin finish the year above $100,000?",outcomes:[{name:"Yes",price:"0.48",priceLabel:"48.0%",tokenId:"333"},{name:"No",price:"0.52",priceLabel:"52.0%",tokenId:"444"}],url:"https://knoww.app/events/detail/bitcoin-year-end",endDate:"2026-12-31T23:59:00Z"},
    {id:"3",slug:slugs[2],question:"Will Bitcoin be above $76,000?",outcomes:[{name:"Yes",price:"0.34",priceLabel:"34.0%",tokenId:"555"},{name:"No",price:"0.66",priceLabel:"66.0%",tokenId:"666"}],url:"https://knoww.app/events/detail/bitcoin-above",endDate:"2026-12-31T23:59:00Z"}
  ].slice(0,selection.length),omittedCount:0,unavailableCount:mode === "partial" ? 1 : 0,meta:{asOf:new Date().toISOString()}}};
}
function send(message){frame.contentWindow.postMessage({jsonrpc:"2.0",...message},"*");}
function publish(){send({method:"ui/notifications/tool-result",params:result()});}
window.addEventListener("message", event => {
  if(event.source !== frame.contentWindow || event.data?.jsonrpc !== "2.0") return;
  const msg=event.data;
  if(msg.method !== "ui/notifications/size-changed") document.getElementById("events").textContent = msg.method + " " + JSON.stringify(msg.params);
  if(msg.method === "ui/initialize") send({id:msg.id,result:{protocolVersion:"2026-01-26",hostInfo:{name:"knoww-fixture",version:"1"},hostCapabilities:{serverTools:{},openLinks:{}},hostContext:{theme}}});
  if(msg.method === "ui/notifications/initialized") publish();
  if(msg.method === "ui/notifications/size-changed") frame.style.height=Math.ceil(msg.params.height)+"px";
  if(msg.method === "tools/call") {
    if(msg.params.name === "show_markets") send({id:msg.id,result:result()});
    else if(msg.params.name === "get_price_history") {
      const no = msg.params.arguments.tokenId === "222";
      send({id:msg.id,result:{structuredContent:{history:{tokenId:msg.params.arguments.tokenId,points:["0.44","0.46","0.43","0.51","0.49","0.58","0.61","0.625"].map((p,i)=>({timestamp:new Date(Date.now()-(7-i)*3600000).toISOString(),price:no ? "0.375" : p}))}}}});
    }
  }
  if(msg.method === "ui/open-link") send({id:msg.id,result:{}});
});
for(const button of document.querySelectorAll("[data-mode]")) button.onclick=()=>{mode=button.dataset.mode;publish();};
document.getElementById("theme").onclick=()=>{theme=theme === "light" ? "dark" : "light";send({method:"ui/notifications/host-context-changed",params:{theme}});};
</script></body></html>`;

const port = Number(process.env.KNOWW_PREVIEW_PORT ?? 8799);
createServer((request, response) => {
  if (request.url === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(
    request.url === "/widget"
      ? MARKETS_HTML.replace(
          "</head>",
          "<style>body { padding: 0 !important; }</style></head>"
        )
      : preview
  );
}).listen(port, "127.0.0.1", () =>
  process.stdout.write(`MCP Apps fixture preview: http://127.0.0.1:${port}\n`)
);
