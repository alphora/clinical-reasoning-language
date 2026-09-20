// REFACTOR:grounded: inspect JSON structurally, but transport and edit original tokens without numeric coercion.
import { parseTree, findNodeAtLocation, type Node, type ParseError } from "jsonc-parser";
import { createHash } from "node:crypto";
export type JsonNode = Node;
export class SessionInputError extends Error {
  constructor(public readonly code: string, message: string, public readonly path = "") { super(message); this.name = "SessionInputError"; }
}
export const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
export class JsonDocument {
  readonly root: Node;
  constructor(readonly text: string, maxBytes = 32 * 1024 * 1024) {
    if (typeof text !== "string" || Buffer.byteLength(text) > maxBytes) throw new SessionInputError("input-limit", "JSON input exceeds its byte limit.");
    const errors: ParseError[] = [];
    let root: Node | undefined;
    try { root = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false }); }
    catch { throw new SessionInputError("invalid-json", "JSON is malformed or too deeply nested."); }
    if (!root || errors.length) throw new SessionInputError("invalid-json", "Strict JSON required; parse error at offset " + (errors[0]?.offset ?? 0));
    this.root = root;
    const pending: Array<[Node, number]> = [[root, 0]];
    while (pending.length) {
      const [node, depth] = pending.pop()!;
      if (depth > 256) throw new SessionInputError("input-depth", "JSON nesting exceeds 256 levels.");
      if (node.type === "object") {
        const keys = (node.children ?? []).map(p => p.children![0].value);
        if (new Set(keys).size !== keys.length) throw new SessionInputError("duplicate-property", "Duplicate JSON property is ambiguous.");
      }
      for (const child of node.children ?? []) pending.push([child, depth + 1]);
    }
  }
  raw(node: Node): string { return this.text.slice(node.offset, node.offset + node.length); }
  at(parts: (string | number)[]): Node | undefined { return findNodeAtLocation(this.root, parts); }
  object(node: Node, changes: ReadonlyMap<string, string | undefined>): string {
    if (node.type !== "object") throw new SessionInputError("invalid-object", "Expected a JSON object.");
    const seen = new Set<string>(), members: string[] = [];
    for (const property of node.children ?? []) {
      const [key, value] = property.children!; const name: string = key.value; seen.add(name);
      const json = changes.has(name) ? changes.get(name) : this.raw(value);
      if (json !== undefined) members.push(this.raw(key) + ":" + json);
    }
    for (const [key, value] of changes) if (!seen.has(key) && value !== undefined) members.push(JSON.stringify(key) + ":" + value);
    return "{" + members.join(",") + "}";
  }
}
export const prop = (node: Node | undefined, name: string): Node | undefined => node?.type === "object" ? node.children?.find(p => p.children?.[0].value === name)?.children?.[1] : undefined;
export const str = (node: Node | undefined): string | undefined => node?.type === "string" ? node.value : undefined;
export const bool = (node: Node | undefined): boolean | undefined => node?.type === "boolean" ? node.value : undefined;
export function array(node: Node | undefined, location: string): Node[] {
  if (!node) return [];
  if (node.type !== "array") throw new SessionInputError("invalid-array", "Expected an array.", location);
  return node.children ?? [];
}
