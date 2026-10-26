import { describe, expect, it } from "vitest";
import { preparePilotRequest } from "./pilot-request-model";

const validRequest = {
  org: "Example team",
  question: "Will this shipment be late?",
  industry: "Financial services",
  baseline: "Spreadsheet or rules",
  kind: "Yes / no probability",
  notes: "Two years of history.",
};

describe("pilot request validation", () => {
  it("prepares a request with trimmed fields and an encoded email draft", () => {
    const result = preparePilotRequest({
      ...validRequest,
      org: " Example team ",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const url = new URL(result.draft.mailto);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("contact@knoww.app");
    expect(url.searchParams.get("subject")).toBe(
      "LTFM pilot request - Example team"
    );
    expect(url.searchParams.get("body")).toBe(result.draft.body);
  });

  it.each([
    { org: " " },
    { org: "a".repeat(161) },
    { question: "a".repeat(501) },
    { notes: "a".repeat(3001) },
    { industry: "unknown industry" },
    { baseline: "unknown baseline" },
    { kind: "unknown answer type" },
    { org: "Example\r\nBcc: someone@example.com" },
  ])("rejects invalid request values %j", (invalid) => {
    expect(preparePilotRequest({ ...validRequest, ...invalid }).success).toBe(
      false
    );
  });

  it("keeps untrusted text inside the email body parameter", () => {
    const question = "<script>alert(1)</script>&bcc=someone@example.com";
    const result = preparePilotRequest({ ...validRequest, question });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const url = new URL(result.draft.mailto);
    expect(url.searchParams.has("bcc")).toBe(false);
    expect(url.searchParams.get("body")).toContain(question);
  });
});
