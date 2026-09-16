import { shutdownProducer } from "../results/produce";

/** CLI signals must await the same owned-process cleanup as MCP shutdown. */
export function installNativeSignals(): { interrupted: boolean } {
  const state = { interrupted: false };
  const stop = (code: number) => {
    if (state.interrupted) return;
    state.interrupted = true;
    void shutdownProducer().finally(() => process.exit(code));
  };
  process.on("SIGINT", () => stop(130));
  process.on("SIGTERM", () => stop(143));
  return state;
}
