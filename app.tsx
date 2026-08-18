// Context Meter: frontend.
//
// A slim line above the composer showing context usage against a soft limit.
// The limit is where the smart zone ends, which sits far below the provider's
// window, so the bar has to fill against the user's number rather than the
// model's. Degradation thresholds are absolute, not a percentage of the window,
// so a bigger window does not buy a bigger safe range.
//
// It lives in the composer banner slot for a second reason: that slot renders
// on phones, unlike BB's own footer meter, which the compact layout collapses
// to zero height.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  useComposerView,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract, Usage } from "./server";

/** Backstop refresh, in case a realtime signal is missed. */
const POLL_MS = 30_000;

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 0,
});

/** 96971 -> "97k", matching BB's own meter. */
function formatTokens(value: number): string {
  return compact.format(Math.max(0, Math.round(value))).toLowerCase();
}

function toneFor(percent: number): string {
  if (percent >= 100) return "text-destructive";
  if (percent >= 75) return "text-warning-text";
  return "text-muted-foreground";
}

function ContextMeterBanner() {
  const view = useComposerView();
  const rpc = useRpc<typeof rpcContract>();
  const [usage, setUsage] = useState<Usage | null>(null);

  const scope = view.scope;
  const threadId =
    scope.kind === "thread" || scope.kind === "queued-message"
      ? scope.threadId
      : null;

  // Keep the latest thread id in a ref so the realtime handler stays stable.
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const refresh = useCallback(() => {
    const id = threadIdRef.current;
    if (id === null) return;
    void rpc
      .call("usage", { threadId: id })
      .then((next) => {
        // Ignore a response that lost the race against a thread switch.
        if (next && next.threadId !== threadIdRef.current) return;
        setUsage(next);
      })
      .catch(() => {
        // Leave the last known numbers on screen rather than blanking the row.
      });
  }, [rpc]);

  useEffect(() => {
    if (threadId === null) {
      setUsage(null);
      return;
    }
    setUsage(null);
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [threadId, refresh]);

  // The backend publishes the numbers themselves, so a signal for this thread
  // renders immediately with no round trip.
  useRealtime(
    "usage",
    useCallback((payload: unknown) => {
      const next = payload as Usage | null;
      if (!next || next.threadId !== threadIdRef.current) return;
      setUsage(next);
    }, []),
  );

  if (!usage || usage.usedTokens === null) return null;

  const used = usage.usedTokens;
  const percent = usage.limit > 0 ? (used / usage.limit) * 100 : 0;
  const tone = toneFor(percent);
  const fill = Math.min(Math.max(percent, 0), 100);

  const title = [
    `${used.toLocaleString("en-US")} tokens used`,
    `limit ${usage.limit.toLocaleString("en-US")}${usage.limitIsCustom ? " (yours)" : ""}`,
    usage.modelContextWindow === null
      ? null
      : `model window ${usage.modelContextWindow.toLocaleString("en-US")}`,
    usage.estimated ? "estimated by BB, not reported by the provider" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`flex items-center gap-2 px-1.5 text-xs tabular-nums ${tone}`}
      title={title}
      aria-label={`Context ${Math.round(percent)}% of limit used`}
    >
      <div className="h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-current transition-[width] duration-300"
          style={{ width: `${fill}%` }}
        />
      </div>
      <span className="shrink-0">
        {usage.estimated ? "~" : ""}
        {formatTokens(used)} / {formatTokens(usage.limit)}
      </span>
    </div>
  );
}

export default definePluginApp((app) => {
  app.composer.customize({
    id: "context-meter",
    scopes: ["thread", "queued-message"],
    banners: [
      {
        id: "context-meter-banner",
        chrome: "bare",
        component: ContextMeterBanner,
      },
    ],
  });
});
