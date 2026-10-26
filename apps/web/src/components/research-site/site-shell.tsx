import Link from "next/link";
import type { ReactNode } from "react";
import { SiteNavigation } from "./site-navigation";
import "./site.css";

export function ResearchSiteShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="kw-research-site relative isolate min-h-svh overflow-x-clip bg-research-canvas font-research-sans text-research-text"
      data-palette="paper"
      data-theme="light"
    >
      <a className="skip" href="#main">
        Skip to content
      </a>
      <SiteNavigation />
      {children}
      <footer className="site">
        <div className="wrap">
          <p className="big" aria-hidden="true">
            One model.
            <br />
            <span>Every table.</span>
          </p>
          <div className="foot-grid">
            <div className="foot-brand">
              <Link className="brand" href="/">
                <b>KNOWW</b>
                <span>RESEARCH LAB</span>
              </Link>
              <p>
                Knoww builds LTFM, a longitudinal tabular foundation model for
                anyone who wants to predict from tables. We start with financial
                services.
              </p>
            </div>
            <div>
              <h3>LTFM</h3>
              <ul>
                <li>
                  <Link href="/#console">See it predict</Link>
                </li>
                <li>
                  <Link href="/#reads">What it reads</Link>
                </li>
                <li>
                  <Link href="/#industries">Who it's for</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3>Use cases</h3>
              <ul>
                <li>
                  <Link href="/use-cases#industries">Industries</Link>
                </li>
                <li>
                  <Link href="/use-cases#fit">Is it a fit?</Link>
                </li>
                <li>
                  <Link href="/use-cases#trust">Validation &amp; trust</Link>
                </li>
                <li>
                  <Link href="/use-cases#faq">Questions</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3>Research &amp; company</h3>
              <ul>
                <li>
                  <Link href="/research#how">How it works</Link>
                </li>
                <li>
                  <Link href="/research#experiment">Experiment one</Link>
                </li>
                <li>
                  <Link href="/company#team">Team</Link>
                </li>
                <li>
                  <Link href="/company#roadmap">Roadmap</Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span className="label">© 2026 Knoww Research Lab</span>
            <a className="label" href="mailto:contact@knoww.app">
              contact@knoww.app
            </a>
            <Link className="label" href="/privacy">
              Privacy
            </Link>
            <Link className="label" href="/terms">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
