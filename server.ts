// Context Meter: backend.
//
// Reads a thread's context-window usage from the timeline summary and serves it
// to the composer banner. Also relays the numbers over realtime so the banner
// updates the moment a turn ends, instead of waiting for the next poll.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

/**
 * Fallback when the user's soft limit is blank or unparseable.
 *
 * Published guidance puts the smart zone edge near 100k, with a warning band up
 * to 200k. 150k is chosen so the amber threshold (75% of the limit) lands at
 * 112k, just past that edge, and red lands mid warning band. See the README for
 * the sources.
 */
const DEFAULT_SOFT_LIMIT = 150_000;

/** Thread events that move the context number. */
const USAGE_EVENT_TYPES = new Set([
  "thread/contextWindowUsage/updated",
  "thread/tokenUsage/updated",
]);

/** Realtime channel the banner listens on. */
export const USAGE_CHANNEL = "usage";

const usageSchema = z.object({
  threadId: z.string(),
  /** Tokens currently in the context window; null when the thread has no turns yet. */
  usedTokens: z.number().nullable(),
  /** The provider's real window, for the tooltip and as the limit fallback. */
  modelContextWindow: z.number().nullable(),
  /** True when BB estimated the count rather than reading it from the provider. */
  estimated: z.boolean(),
  /** What the bar fills against: the user's soft limit, or the provider window. */
  limit: z.number(),
  /** True when `limit` came from settings rather than the provider. */
  limitIsCustom: z.boolean(),
});

export type Usage = z.infer<typeof usageSchema>;

export const rpcContract = defineRpcContract({
  usage: {
    input: z.object({ threadId: z.string().min(1) }),
    output: usageSchema.nullable(),
  },
});

/**
 * Accepts "150000", "150k", "150 K", "1.5m". Returns null for anything else so
 * the caller can fall back to the provider window.
 */
function parseSoftLimit(raw: string | undefined): number | null {
  const text = (raw ?? "").trim().toLowerCase().replace(/[_,\s]/g, "");
  if (text === "") return null;
  const match = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(text);
  if (!match) return null;
  const scale = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  const value = Math.round(Number(match[1]) * scale);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    softLimit: {
      type: "string",
      label: "Soft limit",
      description:
        "Where the smart zone ends for you, e.g. 150000 or 150k. This is the point to compact or start a fresh thread, not the model's full window. Leave blank to fall back to the provider's window.",
      default: String(DEFAULT_SOFT_LIMIT),
    },
  });

  // Read settings per call so edits apply without reloading the plugin.
  async function readUsage(threadId: string): Promise<Usage | null> {
    const timeline = await bb.sdk.threads.timeline({
      threadId,
      summaryOnly: "true",
      segmentLimit: "1",
    });
    const usage = timeline.contextWindowUsage;
    if (!usage) return null;

    const { softLimit } = await settings.get();
    const custom = parseSoftLimit(softLimit);
    const providerWindow =
      usage.modelContextWindow && usage.modelContextWindow > 0
        ? usage.modelContextWindow
        : null;

    return {
      threadId,
      usedTokens: usage.usedTokens,
      modelContextWindow: providerWindow,
      estimated: usage.estimated,
      limit: custom ?? providerWindow ?? DEFAULT_SOFT_LIMIT,
      limitIsCustom: custom !== null,
    };
  }

  bb.rpc.register(rpcContract, {
    usage: async ({ threadId }) => {
      try {
        return await readUsage(threadId);
      } catch (error) {
        bb.log.warn(`usage read failed for ${threadId}: ${String(error)}`);
        return null;
      }
    },
  });

  // Push fresh numbers when a turn updates them. The changed event only names
  // the event types, so re-read the summary and publish the values themselves.
  // That way the banner never has to round-trip on receipt.
  const unsubscribe = bb.sdk.subscribe({
    event: "thread:changed",
    callback: (event) => {
      const threadId = event.id;
      if (typeof threadId !== "string" || threadId === "") return;

      const eventTypes = event.metadata?.eventTypes;
      if (!Array.isArray(eventTypes)) return;
      if (!eventTypes.some((type) => USAGE_EVENT_TYPES.has(type))) return;

      void readUsage(threadId)
        .then((usage) => {
          if (usage) bb.realtime.publish(USAGE_CHANNEL, usage);
        })
        .catch((error) => {
          bb.log.warn(`usage relay failed for ${threadId}: ${String(error)}`);
        });
    },
  });

  bb.onDispose(() => {
    unsubscribe();
  });
}
