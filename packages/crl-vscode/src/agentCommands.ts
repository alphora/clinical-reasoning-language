// #210 editor agent Todo A — the three `crl.agent.*` commands: store/clear the Anthropic key in SecretStorage, and a
// round-trip "test the provider" proof. These register EARLY in extension.ts (before provisioning) so they survive a
// provisioning failure, mirroring `crl.setup` / `crl.remove`. The output channel is passed in because `getOutputChannel`
// is private to extension.ts. The test command NEVER prints the key — only its SOURCE (environment | secret storage | none).
import * as vscode from "vscode";
import {
  resolveProvider,
  anthropicKeySource,
  ANTHROPIC_SECRET_KEY,
} from "./agentModelProvider";
import { anthropicErrorLabel } from "./anthropicClient";

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Register the agent commands. `log` is the shared CRL output channel (full detail lands here; notifications stay short). */
export function registerAgentCommands(context: vscode.ExtensionContext, log: vscode.OutputChannel): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("crl.agent.setAnthropicKey", () =>
      setAnthropicKey(context).catch((e) => vscode.window.showErrorMessage(`CRL: ${messageOf(e)}`)),
    ),
    vscode.commands.registerCommand("crl.agent.clearAnthropicKey", () =>
      clearAnthropicKey(context).catch((e) => vscode.window.showErrorMessage(`CRL: ${messageOf(e)}`)),
    ),
    vscode.commands.registerCommand("crl.agent.test", () =>
      testProvider(context, log).catch((e) => vscode.window.showErrorMessage(`CRL: ${messageOf(e)}`)),
    ),
  );
}

async function setAnthropicKey(context: vscode.ExtensionContext): Promise<void> {
  const key = await vscode.window.showInputBox({
    password: true,
    prompt: "Anthropic API key (stored in VS Code SecretStorage)",
    placeHolder: "sk-ant-…",
    ignoreFocusOut: true,
  });
  if (key === undefined) return; // cancelled — leave the stored key untouched
  const trimmed = key.trim();
  if (!trimmed) {
    // Empty input = clear, so an accidental blank doesn't leave a broken key in place.
    await context.secrets.delete(ANTHROPIC_SECRET_KEY);
    vscode.window.showInformationMessage("CRL: Anthropic API key cleared (empty input).");
    return;
  }
  await context.secrets.store(ANTHROPIC_SECRET_KEY, trimmed);
  vscode.window.showInformationMessage("CRL: Anthropic API key saved to SecretStorage.");
}

async function clearAnthropicKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(ANTHROPIC_SECRET_KEY);
  vscode.window.showInformationMessage("CRL: Anthropic API key cleared from SecretStorage.");
}

async function testProvider(context: vscode.ExtensionContext, log: vscode.OutputChannel): Promise<void> {
  const { provider, unavailableReason } = await resolveProvider({ secrets: context.secrets });
  if (unavailableReason) {
    log.appendLine(`[agent] test: provider '${provider.id}' unavailable — ${unavailableReason}`);
    vscode.window.showWarningMessage(`CRL agent: ${unavailableReason}`);
    return;
  }

  // For the anthropic backend, report the key SOURCE (never the key) in the output-channel detail.
  let source = "";
  if (provider.id === "anthropic") {
    const envKey = typeof process !== "undefined" ? process.env.ANTHROPIC_API_KEY : undefined;
    const secretKey = await context.secrets.get(ANTHROPIC_SECRET_KEY);
    source = anthropicKeySource(envKey, secretKey);
    log.appendLine(`[agent] test: provider 'anthropic', key source = ${source}`);
  } else {
    log.appendLine(`[agent] test: provider 'vscode-lm'`);
  }

  try {
    const res = await provider.complete({
      system: "You are a connectivity test.",
      messages: [{ role: "user", content: "Reply with exactly: agent online" }],
    });
    const reply = res.text.trim();
    if (!reply) {
      // The de-risk slice must prove the model ANSWERED — an empty reply (e.g. a thinking model that spent the budget
      // and stopped at max_tokens) is NOT a pass, even though the round-trip didn't throw.
      const hint = res.stopReason === "max_tokens" ? " — stopped at max_tokens (raise the cap or use a non-thinking model)" : "";
      log.appendLine(`[agent] test: '${provider.id}' connected but returned NO text${res.stopReason ? ` (stop_reason: ${res.stopReason})` : ""}`);
      vscode.window.showWarningMessage(`CRL agent: ${provider.id} connected but returned no text${hint}.`);
      return;
    }
    log.appendLine(`[agent] test OK — reply: ${reply}`);
    vscode.window.showInformationMessage(`CRL agent: ${provider.id} responded OK.`);
  } catch (e) {
    // Map the Anthropic failure to a short label; vscode-lm failures already carry an actionable message.
    const label = provider.id === "anthropic" ? anthropicErrorLabel(e) : messageOf(e);
    log.appendLine(`[agent] test FAILED — ${messageOf(e)}`);
    vscode.window.showErrorMessage(`CRL agent: ${provider.id} test failed — ${label}. See the CRL output channel.`);
  }
}
