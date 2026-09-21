import { PLATFORM_IDS } from "@knoww/services/core";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { currentRequestId } from "../context";
import { isPlatformEnabled, platformRegistry } from "../platforms";
import { buildToolMeta, READ_ONLY_ANNOTATIONS, toolMetaSchema } from "./meta";
import { executePublicRead } from "./public-read";

const LIST_PLATFORMS_DESCRIPTION = [
  "List every prediction-market platform this server knows about and whether it is enabled.",
  "Enabled platforms report their market-data and trading capabilities.",
  "Cross-platform tools accept an optional platform argument; disabled platforms fail with PLATFORM_DISABLED.",
].join(" ");

const platformSummarySchema = z.object({
  id: z.enum(PLATFORM_IDS),
  enabled: z.boolean(),
  capabilities: z
    .record(z.string(), z.boolean())
    .optional()
    .describe("Present for enabled platforms only."),
});

const listPlatformsOutputSchema = z.object({
  platforms: z.array(platformSummarySchema),
  meta: toolMetaSchema,
});

export function registerListPlatformsTool(server: McpServer): void {
  server.registerTool(
    "list_platforms",
    {
      title: "List platforms",
      description: LIST_PLATFORMS_DESCRIPTION,
      inputSchema: z.object({}),
      outputSchema: listPlatformsOutputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (_args, context) =>
      executePublicRead("list_platforms", context, async () => {
        const registry = platformRegistry();
        const platforms = PLATFORM_IDS.map((id) => {
          const enabled = isPlatformEnabled(id);
          return {
            id,
            enabled,
            ...(enabled
              ? {
                  capabilities: {
                    ...registry.getMarketDataAdapter(id).capabilities(),
                  },
                }
              : {}),
          };
        });
        const enabledIds = platforms
          .filter((platform) => platform.enabled)
          .map((platform) => platform.id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Enabled platforms: ${enabledIds.length > 0 ? enabledIds.join(", ") : "none"}.`,
            },
          ],
          structuredContent: {
            platforms,
            meta: buildToolMeta({
              requestId: currentRequestId(),
              sources: [],
            }),
          },
        };
      })
  );
}
