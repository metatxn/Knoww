import type { Metadata } from "next";
import Link from "next/link";
import {
  CONTENT_NAV,
  LandingFooter,
  LandingHeader,
} from "@/components/landing/landing-chrome";
import { LandingShell } from "@/components/landing/landing-shell";
import { buildPageMetadata } from "@/lib/seo";
import "../styles/landing-route.css";

export const metadata: Metadata = buildPageMetadata({
  title: "Knoww MCP",
  description:
    "Connect your AI assistant to prediction market data with Knoww MCP. Learn what it does, why it uses Google sign-in, and how it handles your data.",
  path: "/mcp",
});

export default function McpPage() {
  return (
    <LandingShell>
      <LandingHeader nav={CONTENT_NAV} />
      <main id="content" tabIndex={-1}>
        <article className="max-w-[820px] mx-auto px-6 sm:px-8 py-14 md:py-20">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-(--kw-fg)/60 mb-4">
            Prediction markets in your AI assistant
          </p>
          <h1 className="text-[32px] sm:text-[40px] font-bold tracking-[-0.03em] leading-[1.08] mb-5">
            Knoww MCP
          </h1>
          <div className="kw-legal kw-guide mt-8">
            <p>
              Knoww MCP is Knoww&apos;s connection for AI assistants that
              support the Model Context Protocol. It lets your assistant search
              prediction markets and read market details, prices, price history,
              and order books to help answer your questions with market data.
              The current connection provides read-only access and cannot place
              trades or move funds.
            </p>
            <p>
              You can read this page and our{" "}
              <Link href="/privacy">privacy policy</Link> without signing in.
            </p>

            <h2>Connect your assistant</h2>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                Add <code>https://mcp.knoww.app/mcp</code> as a remote MCP
                server in an assistant that supports OAuth connections.
              </li>
              <li>
                Review the Knoww MCP permission request, then sign in with
                Google to approve the connection.
              </li>
              <li>
                Return to your assistant and ask it to find a market or check
                the current odds.
              </li>
            </ol>

            <h2>Why we use Google sign-in</h2>
            <p>
              Google sign-in confirms who is authorizing the connection. Knoww
              MCP requests the <code>openid</code> and <code>email</code>{" "}
              permissions to verify your Google account identifier, email
              address, and verified-email status. We keep an identifier linked
              to your Google account to manage access and usage limits. We
              discard the email address and Google tokens after verification.
            </p>
            <p>
              These permissions do not give Knoww MCP access to your Gmail
              messages, Google Drive files, Calendar, or contacts. Your
              assistant receives a Knoww authorization token, not your Google
              tokens.
            </p>

            <h2>Privacy and support</h2>
            <p>
              Our{" "}
              <Link href="/privacy#google-data">
                Google sign-in privacy details
              </Link>{" "}
              explain data use, sharing, protection, retention, and deletion
              requests. The <Link href="/terms">terms of service</Link> also
              apply. For help or a data deletion request, email{" "}
              <a href="mailto:contact@knoww.app">contact@knoww.app</a>.
            </p>
          </div>
        </article>
      </main>
      <LandingFooter />
    </LandingShell>
  );
}
