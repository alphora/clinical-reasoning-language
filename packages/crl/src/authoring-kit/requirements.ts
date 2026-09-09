// REFACTOR:grounded (review642): the served example context is the emission gate's input.
import { ANSWER_EXAMPLE_BASE } from "./answerExample";
import type { ArtifactRequirements } from "./types";

export function artifactRequirements(name: string): ArtifactRequirements {
  const base = name.replace(/\.(crl|cel)$/, "");
  const paired = ["selection-reference", "named-answer-reference", "pa-determination-reference",
    "source-delegated-decision-reference", "disposition-arbitration-reference"].includes(base);
  const artifacts = paired ? [`artifact:${base}.${name.endsWith(".crl") ? "cel" : "crl"}`] : [];
  if (base === "named-answer-reference") artifacts.push("artifact:named-answer-terms.crl");
  const crl: Record<string, unknown> = {
    canonicalBase: name.startsWith("named-answer-") ? ANSWER_EXAMPLE_BASE : "http://example.org/publication",
    status: "draft", experimental: true, date: "2026-01-01T00:00:00.000Z",
  };
  if (["pa-determination-reference", "source-delegated-decision-reference", "disposition-arbitration-reference"].includes(base)) {
    crl.dispositions = {
      version: 1, mode: "standalone", options: {
        certify: { Approve: { label: "Certified" } },
        "not-certify": { Deny: { label: "Not certified" }, EIU: { label: "Experimental/investigational/unproven" } },
      },
    };
  }
  return { artifacts, crl };
}
