// MCP server factory — the SINGLE source for the CRL MCP tools, consumed by the `crl-mcp` CLI bin
// AND the VS Code extension's bundled server (#132 step 4). Re-exports createServer/main/selfTest.
// The @modelcontextprotocol/sdk dependency lives behind this subpath; the core root (".") and
// "./language-services" stay SDK-free.
export * from "./server";
