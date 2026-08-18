// bb-plugin-runtime-shim:react
var runtime = globalThis.__bbPluginRuntime;
if (runtime == null || runtime.react == null) {
  throw new Error('Cannot load "react": this bundle must be loaded by the BB app, which provides the shared plugin runtime (globalThis.__bbPluginRuntime).');
}
var mod = runtime.react;
var {
  Activity,
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  act,
  cache,
  cacheSignal,
  captureOwnerStack,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  unstable_useCacheRefresh,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version
} = mod;

// bb-plugin-runtime-shim:@get-bb/plugin-sdk/app
var runtime2 = globalThis.__bbPluginRuntime;
if (runtime2 == null || runtime2.pluginSdkApp == null) {
  throw new Error('Cannot load "@get-bb/plugin-sdk/app": this bundle must be loaded by the BB app, which provides the shared plugin runtime (globalThis.__bbPluginRuntime).');
}
var mod2 = runtime2.pluginSdkApp;
var {
  Markdown,
  ThreadChat,
  definePluginApp,
  experimental_NewThreadComposer,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadPullRequest,
  experimental_useSidebarThreadSplit,
  experimental_useSidebarThreads,
  useBbContext,
  useBbNavigate,
  useComposer,
  useComposerView,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  useSettings
} = mod2;

// bb-plugin-runtime-shim:react/jsx-runtime
var runtime3 = globalThis.__bbPluginRuntime;
if (runtime3 == null || runtime3.jsxRuntime == null) {
  throw new Error('Cannot load "react/jsx-runtime": this bundle must be loaded by the BB app, which provides the shared plugin runtime (globalThis.__bbPluginRuntime).');
}
var mod3 = runtime3.jsxRuntime;
var {
  Fragment: Fragment2,
  jsx,
  jsxs
} = mod3;

// app.tsx
var POLL_MS = 3e4;
var compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 0
});
function formatTokens(value) {
  return compact.format(Math.max(0, Math.round(value))).toLowerCase();
}
function toneFor(percent) {
  if (percent >= 100) return "text-destructive";
  if (percent >= 75) return "text-warning-text";
  return "text-muted-foreground";
}
function ContextMeterBanner() {
  const view = useComposerView();
  const rpc = useRpc();
  const [usage, setUsage] = useState(null);
  const scope = view.scope;
  const threadId = scope.kind === "thread" || scope.kind === "queued-message" ? scope.threadId : null;
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const refresh = useCallback(() => {
    const id = threadIdRef.current;
    if (id === null) return;
    void rpc.call("usage", { threadId: id }).then((next) => {
      if (next && next.threadId !== threadIdRef.current) return;
      setUsage(next);
    }).catch(() => {
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
  useRealtime(
    "usage",
    useCallback((payload) => {
      const next = payload;
      if (!next || next.threadId !== threadIdRef.current) return;
      setUsage(next);
    }, [])
  );
  if (!usage || usage.usedTokens === null) return null;
  const used = usage.usedTokens;
  const percent = usage.limit > 0 ? used / usage.limit * 100 : 0;
  const tone = toneFor(percent);
  const fill = Math.min(Math.max(percent, 0), 100);
  const title = [
    `${used.toLocaleString("en-US")} tokens used`,
    `limit ${usage.limit.toLocaleString("en-US")}${usage.limitIsCustom ? " (yours)" : ""}`,
    usage.modelContextWindow === null ? null : `model window ${usage.modelContextWindow.toLocaleString("en-US")}`,
    usage.estimated ? "estimated by BB, not reported by the provider" : null
  ].filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `flex items-center gap-2 px-1.5 text-xs tabular-nums ${tone}`,
      title,
      "aria-label": `Context ${Math.round(percent)}% of limit used`,
      children: [
        /* @__PURE__ */ jsx("div", { className: "h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-border", children: /* @__PURE__ */ jsx(
          "div",
          {
            className: "h-full rounded-full bg-current transition-[width] duration-300",
            style: { width: `${fill}%` }
          }
        ) }),
        /* @__PURE__ */ jsxs("span", { className: "shrink-0", children: [
          usage.estimated ? "~" : "",
          formatTokens(used),
          " / ",
          formatTokens(usage.limit)
        ] })
      ]
    }
  );
}
var app_default = definePluginApp((app) => {
  app.composer.customize({
    id: "context-meter",
    scopes: ["thread", "queued-message"],
    banners: [
      {
        id: "context-meter-banner",
        chrome: "bare",
        component: ContextMeterBanner
      }
    ]
  });
});
export {
  app_default as default
};
