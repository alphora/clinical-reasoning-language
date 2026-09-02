// REFACTOR:grounded (#189 Piece 2, disc 508). The ONE canonical-token parser for a CEL fact's `code is`, shared
// by the CEL emitter (`cel/emitter/emitFhir.ts`) and the CRE membership lane (`cre/run.ts`) so the two never split
// a `<system>|<code>` token differently — a drift that would let the tree lane and `$apply` disagree on membership,
// the exact coherence #189 protects. Charter §4: "a CEL fact carries a code … that code is checked, explicitly,
// against each representation's set … in both lanes."

export interface CodeParts {
  system?: string;
  code: string;
}

/** The tolerant split (pitch v4 decision #3): `<system>|<code>`, first pipe wins, a pipe-less token is a bare
 *  (system-less) code. Kept for the REMOTE/authored placement path that has always tolerated bare codes; the LOCAL
 *  membership path uses `classifyCanonicalToken` to separate a malformed token from a well-formed non-member. */
export function parseCanonicalToken(raw: string): CodeParts {
  const pipe = raw.indexOf("|");
  if (pipe === -1) return { code: raw };
  return { system: raw.slice(0, pipe), code: raw.slice(pipe + 1) };
}

/** A CEL fact `code is` token, classified for the LOCAL membership path (disc 508 — Claude #4 / gpt56 #7):
 *  - `malformed`  — empty code, or a pipe with an empty system or empty code (`""`, `"|c"`, `"s|"`). Emitting this
 *                   "as authored" would produce `coding.code:""` etc. — invalid FHIR `$apply` drops SILENTLY. The
 *                   emitter turns this into an ERROR + skip (never a partial); the wrong-code negative test uses a
 *                   well-formed token instead.
 *  - `systemless` — a pipe-less non-empty token (`"code"`). Well-formed but system-less: a system-qualified retrieve
 *                   never matches it, so BOTH lanes agree it is a non-member (closed-world false). A legitimate
 *                   wrong-code datum → warning, still emitted/evaluated.
 *  - `coded`      — `<system>|<code>` with both parts non-empty (`"s|c"`, `"s|c|extra"` → system `s`, code
 *                   `c|extra`, first-pipe split preserved). Membership is the exact `{system,code}` comparison. */
export type CanonicalTokenClass =
  | { kind: "malformed"; reason: string }
  | { kind: "systemless"; parts: CodeParts }
  | { kind: "coded"; parts: CodeParts };

export function classifyCanonicalToken(raw: string): CanonicalTokenClass {
  const pipe = raw.indexOf("|");
  if (pipe === -1) {
    if (raw.trim() === "") return { kind: "malformed", reason: `empty code token \`${raw}\`` };
    return { kind: "systemless", parts: { code: raw } };
  }
  const system = raw.slice(0, pipe);
  const code = raw.slice(pipe + 1);
  if (system.trim() === "" || code.trim() === "") {
    return {
      kind: "malformed",
      reason: `a canonical token requires \`<system>|<code>\` with a non-empty system and code (got \`${raw}\`)`,
    };
  }
  return { kind: "coded", parts: { system, code } };
}

/**
 * ⭐⭐ THE STRICT parse for a CODED `value is` — `<system>|<code>`, both non-empty, no tolerance.
 *
 * ⚠ DELIBERATELY NOT `classifyCanonicalToken` above. That one is for a fact's IDENTITY (`code is`), where a
 * pipe-less token is a legal LOCAL code and defaulting the system is correct. A coded VALUE has no such
 * shorthand: a datum carrying no system cannot be mechanically compared against an emitted value set, so a
 * systemless token here is an author error rather than a defaulting case.
 *
 * ⚠⚠ SHARED, because TWO LANES MUST AGREE BY CONSTRUCTION about what a coded answer says. The CEL FHIR
 * writer parses `value is` with this to build `valueCodeableConcept`; the CRE parses the same field with it
 * to evaluate membership. Two hand-mirrored copies would be two chances to disagree on the system axis —
 * exactly the drift `sourceMembership.ts` avoids by mirroring `valueSet.ts` rather than restating it.
 *
 * ⚠ A panel round proposed mirroring `classifyCanonicalToken` here instead; reading the writer settled it
 * (`emitFhir.ts` uses THIS for the value and that one for the identity). Mirroring the wrong authority would
 * have made a systemless answer silently comparable.
 */
export function parseCheckedCanonicalToken(raw: string): { parts: CodeParts } | { error: string } {
  const segs = raw.split("|");
  if (segs.length !== 2) {
    return { error: `a CodeableConcept \`value is\` requires exactly \`<system>|<code>\` (got \`${raw}\`)` };
  }
  const [system, code] = segs;
  if (system.trim() === "" || code.trim() === "") {
    return { error: `a CodeableConcept \`value is\` requires a non-empty system and code (got \`${raw}\`)` };
  }
  return { parts: { system, code } };
}
