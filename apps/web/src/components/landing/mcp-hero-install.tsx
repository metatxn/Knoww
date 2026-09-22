"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const CLIENTS = [
  {
    name: "Claude Code",
    command: "claude mcp add --transport http knoww https://mcp.knoww.app/mcp",
    hint: "Then open /mcp in Claude Code to sign in with Google.",
  },
  {
    name: "Codex",
    command: "codex mcp add knoww --url https://mcp.knoww.app/mcp",
    hint: "If prompted to authenticate, run codex mcp login knoww.",
  },
] as const;

export function McpHeroInstall() {
  const [clientIndex, setClientIndex] = useState(0);
  const [feedback, setFeedback] = useState<{
    command: string;
    success: boolean;
  } | null>(null);
  const client = CLIENTS[clientIndex];
  const currentFeedback =
    feedback?.command === client.command ? feedback : null;

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(client.command);
      setFeedback({ command: client.command, success: true });
    } catch {
      setFeedback({ command: client.command, success: false });
    }
  }

  return (
    <section
      aria-labelledby="mcp-install-heading"
      className="mt-8 max-w-[640px] text-shadow-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2
          id="mcp-install-heading"
          className="inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em]"
        >
          <span className="text-(--kw-accent-text)">MCP</span>
          <span aria-hidden="true" className="text-(--kw-fg)/30">
            /
          </span>
          <span className="text-(--kw-fg)/70">For your agents</span>
        </h2>
        <Link
          href="/mcp"
          className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-(--kw-fg)/70 transition-colors hover:text-(--kw-accent-text)"
        >
          Setup guide <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-(--kw-fg)/70">
        Live prediction-market data, connected to your agent.
      </p>

      <div className="kw-glass mt-3 rounded-[14px]">
        <div className="flex gap-1 border-b border-(--kw-fg)/10 p-2">
          {CLIENTS.map((option, index) => (
            <button
              key={option.name}
              type="button"
              aria-pressed={clientIndex === index}
              onClick={() => {
                setClientIndex(index);
                setFeedback(null);
              }}
              className={`min-h-11 rounded-[8px] border px-3 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors ${
                clientIndex === index
                  ? "border-(--kw-accent)/25 bg-(--kw-accent)/10 text-(--kw-accent-text)"
                  : "border-transparent text-(--kw-fg)/70 hover:border-(--kw-fg)/10 hover:bg-(--kw-fg)/3 hover:text-(--kw-fg)"
              }`}
            >
              {option.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 p-3 sm:px-4">
          <span
            aria-hidden="true"
            className="hidden font-mono text-xs text-(--kw-accent-text) sm:block"
          >
            $
          </span>
          <pre className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-[11px] leading-5 text-(--kw-fg)/85">
            <code>{client.command}</code>
          </pre>
          <button
            type="button"
            onClick={copyCommand}
            aria-label={`Copy ${client.name} installation command`}
            className="inline-flex min-h-11 w-20 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-(--kw-fg)/10 bg-(--kw-fg)/3 text-xs font-medium text-(--kw-fg)/80 transition-colors hover:border-(--kw-accent)/25 hover:bg-(--kw-accent)/10 hover:text-(--kw-accent-text)"
          >
            {currentFeedback?.success ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            <span>{currentFeedback?.success ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
      <p
        className="mt-2 min-h-5 text-[11px] leading-5 text-(--kw-fg)/70"
        aria-live="polite"
        role="status"
      >
        {currentFeedback
          ? currentFeedback.success
            ? "Command copied. Paste it into your terminal."
            : "Couldn't copy. Select and copy the command above."
          : client.hint}
      </p>
    </section>
  );
}
