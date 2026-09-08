import { ONBOARDING_THEME_COLORS } from "../../onboarding-theme";

const STYLES = `
  :host {
    display:block;height:100%;color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    --text-soft:color-mix(in srgb,var(--text) 85%,var(--bg));
    --muted:color-mix(in srgb,var(--text) 70%,var(--bg));
    --line:color-mix(in srgb,var(--text) 14%,transparent);
    --line-strong:color-mix(in srgb,var(--text) 25%,transparent);
    --green-soft:color-mix(in srgb,var(--green) 9%,transparent);
    --green-line:color-mix(in srgb,var(--green) 30%,transparent);
    --mono:"JetBrains Mono",ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace;
    -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  }
  *{box-sizing:border-box}[hidden]{display:none!important}
  .sign-in-page{height:100%;overflow:auto;display:grid;place-items:center;padding:80px 24px 32px}
  .shell{width:min(680px,100%);padding:28px 32px;background:var(--bg);border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 16px #0000000d}
  .brand-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:20px;border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:650;letter-spacing:-.01em}
  .brand img{width:28px;height:28px;border:1px solid var(--line-strong);border-radius:6px}
  .badge,.eyebrow,.wallet-label{font:500 10px/1.5 var(--mono);text-transform:uppercase;letter-spacing:.14em}
  .badge{display:flex;align-items:center;gap:7px;padding:3px 8px;border:1px solid var(--line);border-radius:999px;color:var(--text-soft)}
  .dot{width:5px;height:5px;flex:0 0 auto;border-radius:50%;background:var(--green)}
  section{position:relative;margin-top:28px;padding:28px;border:1px solid var(--line-strong);border-radius:6px;background:var(--panel);box-shadow:0 4px 12px #0000000a;overflow:hidden}
  section::before{position:absolute;content:"";top:0;left:0;right:0;height:2px;background:var(--green)}
  .eyebrow{display:flex;align-items:center;gap:8px;color:var(--muted);margin:0 0 16px}
  h1{margin:0 0 12px;font-size:30px;font-weight:550;letter-spacing:-.035em;line-height:1.15}
  .description{margin:0;color:var(--muted);font-size:14px;line-height:1.65;max-width:48ch}
  .wallet{display:grid;gap:8px;margin-top:24px;padding:16px;background:var(--panel-soft);border:1px solid var(--line);border-radius:6px}
  .wallet-label{margin:0;color:var(--muted)}
  .wallet-name{font-size:14px;font-weight:600;color:var(--text)}
  .account{margin:0;color:var(--text-soft);font:500 12px/1.6 var(--mono);overflow-wrap:anywhere}
  .status{display:flex;align-items:flex-start;gap:8px;margin:18px 0;color:var(--muted);font-size:13px;line-height:1.6;min-height:21px}
  .status[data-state="error"]{color:var(--danger)}
  .status[data-state="success"]{color:var(--green)}
  .status[data-state="waiting"]::before{content:"";flex:0 0 auto;width:14px;height:14px;margin-top:3px;border:2px solid var(--green-line);border-top-color:var(--green);border-radius:50%;animation:spin .8s linear infinite}
  .actions{display:flex;align-items:center;flex-wrap:wrap;gap:16px}
  button{cursor:pointer;font:700 10px/1.5 var(--mono);text-transform:uppercase;letter-spacing:.14em}
  button:focus-visible{outline:2px solid var(--green);outline-offset:4px}
  .continue{min-height:40px;padding:10px 16px;border:1px solid var(--text);border-radius:3px;background:var(--text);color:var(--bg)}
  .continue:hover{opacity:.9}.continue:disabled{cursor:wait;opacity:.5}
  .cancel{min-height:40px;padding:10px 0;border:0;background:transparent;color:var(--muted);text-decoration:underline;text-underline-offset:6px;text-decoration-color:var(--line-strong)}
  .cancel:hover{color:var(--text)}
  footer{margin-top:24px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:11px;line-height:1.6}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media(prefers-reduced-motion:reduce){.status[data-state="waiting"]::before{animation:none}}
  @media(max-width:480px){.sign-in-page{padding:72px 12px 20px}.shell{padding:20px 16px}.brand-bar{gap:12px}.badge{font-size:8px;letter-spacing:.1em}section{padding:22px 16px;margin-top:20px}h1{font-size:26px}.wallet{padding:12px}.continue{width:100%}.actions{gap:4px}.cancel{width:100%}}
`;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function createSessionSignInView(container: HTMLElement) {
  const host = element("div", "");
  host.id = "knoww-session-sign-in";
  for (const [key, token] of Object.entries(ONBOARDING_THEME_COLORS)) {
    host.style.setProperty(key, `var(${token})`);
  }
  const root = host.attachShadow({ mode: "closed" });
  const styles = element("style", "", STYLES);
  const page = element("div", "sign-in-page");
  const shell = element("div", "shell");
  const header = element("header", "brand-bar");
  const brand = element("div", "brand");
  const logo = element("img", "");
  logo.src = chrome.runtime.getURL("icons/icon-128.png");
  logo.alt = "";
  brand.append(logo, element("span", "", "Knoww"));
  const badge = element("span", "badge");
  badge.append(
    element("span", "dot"),
    document.createTextNode("Wallet sign-in")
  );
  header.append(brand, badge);
  const card = element("section", "");
  card.setAttribute("aria-labelledby", "sign-in-title");
  const eyebrow = element("p", "eyebrow");
  eyebrow.append(
    element("span", "dot"),
    document.createTextNode("Continue to trading")
  );
  const title = element("h1", "", "Sign in to Knoww");
  title.id = "sign-in-title";
  const description = element(
    "p",
    "description",
    "Sign in to continue with your trading account. This signature confirms your identity. Trading actions, including token approvals, need a separate wallet confirmation after you return."
  );
  const wallet = element("div", "wallet");
  wallet.hidden = true;
  const walletName = element("span", "wallet-name");
  const account = element("p", "account");
  wallet.append(
    element("p", "wallet-label", "Trading account to connect"),
    walletName,
    account
  );
  const status = element("p", "status", "Loading your sign-in request…");
  status.setAttribute("role", "status");
  status.setAttribute("aria-atomic", "true");
  const confirm = element("button", "continue");
  confirm.type = "button";
  confirm.hidden = true;
  const cancel = element("button", "cancel", "Cancel");
  cancel.type = "button";
  const actions = element("div", "actions");
  actions.append(confirm, cancel);
  card.append(eyebrow, title, description, wallet, status, actions);
  shell.append(
    header,
    card,
    element("footer", "", "You'll return to your trading tab automatically.")
  );
  page.append(shell);
  root.append(styles, page);
  container.append(host);
  const fallback = document.getElementById(
    "knoww-extension-onboarding-fallback"
  );
  if (fallback) fallback.hidden = true;
  return { host, wallet, walletName, account, status, confirm, cancel };
}
