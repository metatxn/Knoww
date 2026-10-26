import { z } from "zod";

export const PILOT_EMAIL = "contact@knoww.app";
export const PILOT_INDUSTRIES = [
  "Financial services",
  "Insurance",
  "Healthcare",
  "Supply chain & logistics",
  "Retail & consumer",
  "Energy & industrials",
  "Public sector & policy",
  "Other",
] as const;
export const PILOT_BASELINES = [
  "Gradient-boosted trees (XGBoost, LightGBM)",
  "Regression or scorecard",
  "Deep learning",
  "Spreadsheet or rules",
  "Vendor tool",
  "Nothing yet",
] as const;
export const PILOT_ANSWER_TYPES = [
  "Yes / no probability",
  "A number (forecast)",
] as const;
export const PILOT_LIMITS = { org: 160, question: 500, notes: 3000 } as const;

function isSingleLine(value: string): boolean {
  return [...value].every(
    (character) =>
      character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
  );
}
function isNoteText(value: string): boolean {
  return [...value].every(
    (character) =>
      character === "\n" ||
      character === "\r" ||
      character === "\t" ||
      isSingleLine(character)
  );
}
const pilotRequestSchema = z.object({
  org: z
    .string()
    .trim()
    .min(1, "Enter your organisation's name.")
    .max(PILOT_LIMITS.org, "Use 160 characters or fewer.")
    .refine(isSingleLine, "Use a single line for the organisation name."),
  industry: z.enum(PILOT_INDUSTRIES, {
    error: "Choose an industry from the list.",
  }),
  question: z
    .string()
    .trim()
    .min(1, "Write the question you want LTFM to answer.")
    .max(PILOT_LIMITS.question, "Use 500 characters or fewer.")
    .refine(isSingleLine, "Use a single line for the question."),
  kind: z.enum(PILOT_ANSWER_TYPES, {
    error: "Choose one of the answer types.",
  }),
  baseline: z.enum(PILOT_BASELINES, {
    error: "Choose a current model from the list.",
  }),
  notes: z
    .string()
    .trim()
    .max(PILOT_LIMITS.notes, "Use 3,000 characters or fewer.")
    .refine(isNoteText, "Remove unsupported control characters from the notes.")
    .default(""),
});

export const PILOT_FIELD_IDS = {
  org: "pf-org",
  industry: "pf-industry",
  question: "pf-question",
  kind: "pf-kind",
  baseline: "pf-baseline",
  notes: "pf-notes",
} as const;
export type PilotField = keyof typeof PILOT_FIELD_IDS;
export type PilotErrors = Partial<Record<PilotField, string>>;
export type PilotDraft = { subject: string; body: string; mailto: string };
type PilotResult =
  | { success: true; draft: PilotDraft }
  | { success: false; errors: PilotErrors };

export function preparePilotRequest(input: unknown): PilotResult {
  const parsed = pilotRequestSchema.safeParse(input);
  if (!parsed.success) {
    const errors: PilotErrors = {};
    const fields = Object.keys(PILOT_FIELD_IDS) as PilotField[];
    for (const issue of parsed.error.issues) {
      const field = fields.find((field) => field === issue.path[0]);
      if (field && !errors[field]) errors[field] = issue.message;
    }
    return { success: false, errors };
  }
  const { org, industry, question, kind, baseline, notes } = parsed.data;
  const subject = `LTFM pilot request - ${org}`;
  const body = [
    `Organisation: ${org}`,
    `Industry: ${industry}`,
    `Question: ${question}`,
    `Answer type: ${kind}`,
    `Today we use: ${baseline}`,
    notes ? `Notes: ${notes}` : "",
    "",
    "We'd like to start in shadow mode, then compare side by side before sign-off.",
  ].join("\n");
  return {
    success: true,
    draft: {
      subject,
      body,
      mailto: `mailto:${PILOT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    },
  };
}
