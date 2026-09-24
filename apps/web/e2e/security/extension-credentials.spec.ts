import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:8000";
const signingUrl = `${origin}/extension-credentials.html`;
const html = readFileSync(
  resolve(__dirname, "../../public/extension-credentials.html"),
  "utf8"
);
const headers = readFileSync(
  resolve(__dirname, "../../public/_headers"),
  "utf8"
);
const policy = headers
  .match(
    /^\/extension-credentials\.html\r?\n(?:[ \t]+[^\n]*\r?\n)*?[ \t]+Content-Security-Policy:\s*([^\n]+)/m
  )?.[1]
  ?.trim();
if (!policy) throw new Error("The signing asset must have a static CSP");

test("the browser blocks inline scripts, site scripts, and inline handlers while retaining the signing UI", async ({
  page,
}) => {
  const scriptRequests: string[] = [];
  await page.route("**/*", async (route) => {
    if (route.request().url() === signingUrl) {
      await route.fulfill({
        contentType: "text/html",
        headers: { "Content-Security-Policy": policy },
        body: html.replace(
          "</body>",
          `<script>window.inlineExecuted = true</script><script src="/site-script.js"></script><button id="attack" onclick="window.handlerExecuted = true">Test handler</button></body>`
        ),
      });
      return;
    }
    scriptRequests.push(route.request().url());
    await route.fulfill({
      contentType: "text/javascript",
      body: "window.siteScriptExecuted = true",
    });
  });
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") cspErrors.push(message.text());
  });
  await page.goto(signingUrl);
  await expect(
    page.getByRole("heading", { name: "Confirm trading setup in your wallet" })
  ).toBeVisible();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(11, 16, 34)"
  );
  await page.locator("#attack").click();
  expect(
    await page.evaluate(() => {
      const state = window as Window & {
        inlineExecuted?: boolean;
        handlerExecuted?: boolean;
        siteScriptExecuted?: boolean;
      };
      return [
        state.inlineExecuted,
        state.handlerExecuted,
        state.siteScriptExecuted,
      ];
    })
  ).toEqual([undefined, undefined, undefined]);
  expect(scriptRequests).toEqual([]);
  expect(
    cspErrors.some(
      (error) =>
        error.includes("Content Security Policy") &&
        error.includes("script-src")
    )
  ).toBe(true);
});

test("the browser blocks fetch and beacon attempts from the signing document", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/*", async (route) => {
    requests.push(route.request().url());
    if (route.request().url() === signingUrl) {
      await route.fulfill({
        contentType: "text/html",
        headers: { "Content-Security-Policy": policy },
        body: html,
      });
    } else await route.abort();
  });
  await page.goto(signingUrl);
  const result = await page.evaluate(async (base) => {
    const violations: string[] = [];
    const observed = new Promise<void>((resolve) => {
      document.addEventListener("securitypolicyviolation", (event) => {
        violations.push(event.effectiveDirective);
        if (violations.length >= 2) resolve();
      });
    });
    const fetched = await fetch(`${base}/capture-fetch`).then(
      () => true,
      () => false
    );
    navigator.sendBeacon(`${base}/capture-beacon`, "synthetic-test-data");
    await observed;
    return { fetched, violations };
  }, origin);
  expect(result.fetched).toBe(false);
  // sendBeacon can report that it queued the data even when CSP blocks it.
  // Assert enforcement using both violation events and actual requests.
  expect(result.violations).toEqual(["connect-src", "connect-src"]);
  expect(requests).toEqual([signingUrl]);
});

test("the browser refuses to embed the signing page in a site iframe", async ({
  page,
}) => {
  await page.route("**/*", async (route) => {
    if (route.request().url() === signingUrl) {
      await route.fulfill({
        contentType: "text/html",
        headers: { "Content-Security-Policy": policy },
        body: html,
      });
    } else {
      await route.fulfill({
        contentType: "text/html",
        body: `<iframe src="${signingUrl}"></iframe>`,
      });
    }
  });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${origin}/embedding-page`);
  await expect
    .poll(() => errors.some((error) => error.includes("frame-ancestors")))
    .toBe(true);
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("heading", { name: "Confirm trading setup in your wallet" })
  ).toHaveCount(0);
});
