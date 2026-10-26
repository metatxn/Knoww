"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KnowwMark } from "@/components/knoww-mark";

const links = [
  { href: "/", label: "LTFM" },
  { href: "/use-cases", label: "Use cases" },
  { href: "/research", label: "Research" },
  { href: "/company", label: "Company" },
];
export function SiteNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  return (
    <header className="site">
      <div className="wrap grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link className="brand inline-flex w-fit items-center gap-3" href="/">
          <KnowwMark />
          <b>KNOWW</b>
        </Link>
        <nav
          className="primary hidden items-center justify-center gap-8 lg:flex"
          aria-label="Primary"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="head-actions hidden items-center justify-self-end gap-4 lg:flex">
          <Link
            className="textlink hidden xl:inline-flex"
            href="/research#experiment"
          >
            Experiment one <span aria-hidden="true">→</span>
          </Link>
          <a className="btn btn-accent btn-sm" href="#pilot">
            Request a pilot
          </a>
        </div>
        <button
          ref={button}
          className="menu-btn inline-flex items-center justify-self-end lg:hidden"
          type="button"
          aria-expanded={open}
          aria-controls="research-mobile-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? "CLOSE" : "MENU"}
        </button>
      </div>
      <div className="mobile-nav" id="research-mobile-nav" hidden={!open}>
        <div className="wrap">
          {links.map((link) => (
            <Link
              className="l"
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="acts">
            <Link
              className="btn btn-accent"
              href="#pilot"
              onClick={() => setOpen(false)}
            >
              Request a pilot
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
