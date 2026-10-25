/** Warm the existing runtime, without creating an editor or any file models. */
export function preloadEditor() {
  return import("./monaco-runtime").then(({ loadMonaco }) => loadMonaco());
}

/** A speculative failure must not block navigation; the visible editor retries and reports errors. */
export function prepareEditor() {
  void preloadEditor().catch(() => {});
}
