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

/**
 * ⭐⭐ #189 — A CODED `value is` THAT MAY BE A BARE INLINE-OPTION CODE.
 *
 * Both arms of a review round raised this INDEPENDENTLY as [critical], and the reason is worth keeping:
 * without it the inline-options design does not remove the URL problem, it MOVES IT INTO `.cel` AND MAKES
 * IT WORSE. The concept-level answer CodeSystem is a MINTED url that appears in no authored source at all,
 * so a CEL author would have to reproduce the emitter's slug scheme by hand — and a typo'd system silently
 * makes the value a NON-MEMBER, i.e. a confident deny in the lane whose whole job is catching confident
 * denies.
 *
 *     - value is `chronic-blepharitis`.        ← resolves against the `defined by` concept's options
 *     - value is "http://x|37722".             ← still legal: wrong-system and external-code rows need it
 *
 * ⚠ THIS IS A STATED RULE, NOT INFERENCE, and that distinction is the whole licence for it: the author
 * stated the CODE, and the CRL declaration stated its owning SYSTEM. It is the same precedent as a bare fact
 * defaulting to its concept's DECLARED local code — nothing is guessed, one declaration is read.
 *
 * ⚠ AN UNOFFERED BARE CODE IS AN ERROR, and that does NOT contradict "`value from` is OFFERED, not
 * ADMISSIBLE". That rule governs a DATUM already in the record, which may legitimately carry a code nobody
 * offered and is then a determinate non-member. A BARE token is different: there is nothing to resolve its
 * system AGAINST except the declared options, so an unoffered one has no system at all. To author a
 * non-member deliberately — which the adversarial rows must — write the explicit `<system>|<code>` form.
 *
 * ⚠⚠ SHARED, because TWO LANES MUST AGREE BY CONSTRUCTION about what a coded answer says. The CEL FHIR
 * writer builds `valueCodeableConcept` from this; the CRE evaluates membership from this. Two hand-mirrored
 * copies would be two chances to disagree on the system axis.
 */
export function parseCodedValueToken(
  raw: string,
  inline?: { system: string; codes: ReadonlySet<string> },
): { parts: CodeParts } | { error: string } {
  if (raw.includes("|")) return parseCheckedCanonicalToken(raw);
  if (inline === undefined) return parseCheckedCanonicalToken(raw);

  const code = raw.trim();
  if (code === "") {
    return { error: `a CodeableConcept \`value is\` requires a non-empty code (got \`${raw}\`)` };
  }
  if (!inline.codes.has(code)) {
    return {
      error:
        `\`${code}\` is not one of the concept's declared \`value from:\` options, so there is no system to ` +
        `resolve it against. Use one of the declared codes, or write an explicit \`<system>|<code>\` token if ` +
        `you mean a value the question never offered.`,
    };
  }
  return { parts: { system: inline.system, code } };
}
