import { createHash, randomBytes } from "node:crypto";

// Run interactively. Never run in CI or redirect credentials into the repository.
if (!process.stdout.isTTY) {
  process.stderr.write(
    "Run this command in an interactive terminal to generate reviewer credentials.\n"
  );
  process.exitCode = 1;
} else {
  const code = randomBytes(32).toString("hex");
  const digest = createHash("sha256").update(code).digest("hex");
  process.stdout.write(
    [
      "Store this digest as the Cloudflare Worker secret MCP_REVIEWER_CODE_SHA256:",
      digest,
      "",
      "Store this access code in your password manager and the OpenAI reviewer credentials field only:",
      code,
      "",
      "The Worker needs only the digest. The access code cannot be recovered from it.",
      "",
    ].join("\n")
  );
}
