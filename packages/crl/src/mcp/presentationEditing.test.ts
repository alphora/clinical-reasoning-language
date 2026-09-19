import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerPresentationEditing } from "./presentationEditing";

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })),
);
// @kit shared-wording-editing:mcp
test("MCP JSON preview/apply/revert is discoverable and enforces stale request refusal", async () => {
  const projectRoot = fs.mkdtempSync(join(tmpdir(), "crl-wording-mcp-"));
  directories.push(projectRoot);
  fs.writeFileSync(
    join(projectRoot, "package.json"),
    JSON.stringify({
      name: "wording",
      version: "1.0.0",
      crl: { canonicalBase: "https://example.org/wording" },
    }),
  );
  const source =
    'library "L".\nconcept "Answer":\n- shape is Record.\n- type is Observation.\n- value type is boolean.\n- code is `answer`.\n- shape reduction is most recent.\npresentation for "Answer":\n- question text is "Answer?".\n';
  const filePath = join(projectRoot, "main.crl");
  fs.writeFileSync(filePath, source);
  const server = new McpServer({ name: "editing-test", version: "1" });
  registerPresentationEditing(server);
  const client = new Client({ name: "editing-test-client", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const request = { library: "L", concept: "Answer", questionText: "New answer?" };
  const args = { projectRoot, filePath, request };
  const call = async (name: string, arguments_: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: arguments_ });
    return {
      isError: result.isError,
      data: JSON.parse((result.content as { text: string }[])[0].text),
    };
  };
  try {
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      "preview_presentation_edit",
      "apply_presentation_edit",
      "revert_presentation_edit",
    ]);
    const preview = await call("preview_presentation_edit", args);
    expect(preview.data.success).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe(source);
    const stale = await call("apply_presentation_edit", {
      ...args,
      request: { ...request, questionText: "Other?" },
      previewToken: preview.data.previewToken,
    });
    expect(stale.isError).toBe(true);
    expect(stale.data.code).toBe("stale-preview");
    expect(fs.readFileSync(filePath, "utf8")).toBe(source);
    for (const name of ["preview_presentation_edit", "apply_presentation_edit"]) {
      const rejected = await client.callTool({
        name,
        arguments: {
          ...args,
          ...(name.startsWith("apply") ? { previewToken: preview.data.previewToken } : {}),
          onlyThisUse: true,
        },
      });
      expect(rejected.isError).toBe(true);
      expect(fs.readFileSync(filePath, "utf8")).toBe(source);
    }
    const applied = await call("apply_presentation_edit", {
      ...args,
      previewToken: preview.data.previewToken,
    });
    expect(applied.data.success).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe(preview.data.candidateSource);
    const receipt = applied.data.receipt;
    receipt.edit.inverseEdits = receipt.edit.inverseEdits.map((e: any) => ({
      text: e.text,
      end: e.end,
      before: e.before,
      start: e.start,
    }));
    const undone = await call("revert_presentation_edit", { receipt });
    expect(undone.data.success).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe(source);
    const duplicateUndo = await call("revert_presentation_edit", { receipt });
    expect(duplicateUndo.isError).toBe(true);
    expect(duplicateUndo.data.code).toBe("stale-source");
    const unsupported = await client.callTool({
      name: "preview_presentation_edit",
      arguments: { ...args, request: { ...request, onlyThisUse: true } },
    });
    expect(unsupported.isError).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe(source);
  } finally {
    await client.close();
    await server.close();
  }
});
