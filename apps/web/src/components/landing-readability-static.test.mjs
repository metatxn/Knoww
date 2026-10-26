import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = [
  "src/app/globals.css",
  "src/app/styles/base.css",
  "src/app/styles/marketing.css",
  "src/app/styles/landing.css",
  "src/app/styles/tweet-overlay.css",
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const landing = readFileSync("src/app/page.tsx", "utf8");
const researchHome = readFileSync(
  "src/components/research-site/home-content.tsx",
  "utf8"
);
const researchStyles = readFileSync(
  "src/components/research-site/home.css",
  "utf8"
);
const inferenceChart = readFileSync(
  "src/components/research-site/inference-chart.tsx",
  "utf8"
);
const landingChrome = readFileSync(
  "src/components/landing/landing-chrome.tsx",
  "utf8"
);
const landingWithChrome = `${landing}\n${landingChrome}`;
const sections = readFileSync(
  "src/components/landing/knoww-sections.tsx",
  "utf8"
);
const themePicker = readFileSync("src/components/kw-theme.tsx", "utf8");
const bloombergMock = readFileSync(
  "src/components/tweet-overlay-bloomberg.tsx",
  "utf8"
);
const redditMock = readFileSync(
  "src/components/tweet-overlay-reddit.tsx",
  "utf8"
);
const heroMock = readFileSync("src/components/tweet-overlay-hero.tsx", "utf8");

test("landing accent text token clears the readability contrast target", () => {
  assert.match(globals, /--kw-accent-text:\s*#166534;/);
  assert.doesNotMatch(globals, /--kw-accent-text:\s*#15803d;/);
});

test("theme picker accessible name includes the visible theme label", () => {
  assert.match(themePicker, /aria-label=\{[^}]*activeTheme\?\.label/s);
  assert.doesNotMatch(themePicker, /aria-label="Select theme"/);
  assert.match(themePicker, /hidden min-w-0 truncate sm:inline/);
});

test("LTFM chart exposes motion controls and respects reduced motion", () => {
  assert.match(researchHome, /<InferenceChart hero/);
  assert.match(inferenceChart, /prefers-reduced-motion: reduce/);
  assert.match(inferenceChart, /if \(motion\.matches\) setPlaying\(false\)/);
  assert.match(inferenceChart, /\{playing \? "Pause" : "Play"\}/);
  assert.match(inferenceChart, /if \(!visible \|\| document\.hidden\) return/);
});

test("decorative hero mock feeds do not add document headings", () => {
  assert.doesNotMatch(bloombergMock, /<h[1-6][^>]*className="kwt-bb-headline"/);
  assert.doesNotMatch(redditMock, /<h[1-6][^>]*className="kwt-rd-title"/);
  assert.match(bloombergMock, /<div className="kwt-bb-headline">/);
  assert.match(redditMock, /<div className="kwt-rd-title">/);
});

test("decorative hero mock is hidden from assistive tech", () => {
  assert.match(heroMock, /aria-hidden="true"/);
  assert.doesNotMatch(heroMock, /\binert\b/);
  assert.match(heroMock, /tabIndex=\{-1\}/);
});

test("landing narrative copy uses the upgraded readability classes", () => {
  assert.doesNotMatch(
    sections,
    /text-\[15px\]\s+leading-\[1\.6\]\s+text-\(--kw-fg\)\/70/
  );
  assert.doesNotMatch(
    sections,
    /text-\[14px\]\s+leading-\[1\.6\]\s+text-\(--kw-fg\)\/65/
  );
  assert.doesNotMatch(
    sections,
    /text-\[13\.5px\]\s+leading-\[1\.55\]\s+text-\(--kw-fg\)\/65/
  );
  assert.match(sections, /text-base\s+leading-\[1\.6\]\s+text-\(--kw-fg\)\/80/);
  assert.match(
    sections,
    /text-\[15px\]\s+leading-\[1\.6\]\s+text-\(--kw-fg\)\/75/
  );
  assert.match(
    sections,
    /text-\[14px\]\s+leading-\[1\.55\]\s+text-\(--kw-fg\)\/75/
  );
});

test("landing nav and footer metadata are not rendered as low-contrast microcopy", () => {
  assert.match(
    landingWithChrome,
    /<nav className="hidden lg:flex items-center gap-8 text-\[14px\] font-medium"/
  );
  assert.match(landingWithChrome, /inline-flex items-center py-1/);
  assert.match(landingWithChrome, /aria-label="Add to Chrome"/);
  assert.match(landingWithChrome, /hidden sm:inline">Add to Chrome/);
  assert.doesNotMatch(
    landingWithChrome,
    /text-\[12px\]\s+text-\(--kw-fg\)\/60/
  );
  assert.match(landingWithChrome, /text-\[12px\]\s+text-\(--kw-fg\)\/70/);
});

test("landing focus-visible outline clears the stronger focus target", () => {
  assert.match(
    globals,
    /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--kw-accent-text\);[^}]*outline-offset:\s*2px;/s
  );
});

test("LTFM hero allows content to grow on short laptop screens", () => {
  assert.match(researchHome, /className="hx"/);
  assert.match(
    researchStyles,
    /@media \(min-width: 1101px\) and \(max-height: 760px\)\s*\{\s*\.kw-research-site \.hx\s*\{\s*height:\s*auto;\s*min-height:\s*calc\(100svh - 73px\);/s
  );
  assert.match(
    researchStyles,
    /\.kw-research-site \.hx-chart\s*\{\s*min-height:\s*240px;/
  );
});

test("active hero mock highlights promote highlighted text contrast", () => {
  assert.match(globals, /\.kwt-hl\s*\{[\s\S]*?transition:\s*color 0\.12s/s);
  assert.doesNotMatch(
    globals,
    /\.kwt-hl\s*\{[\s\S]*?transition:\s*color 0\.4s/s
  );
  assert.match(
    globals,
    /\.kwt-hl\.on\s*\{[\s\S]*?color:\s*var\(--kwt-x-text\);/s
  );
});
