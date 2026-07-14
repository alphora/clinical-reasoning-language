// #212 step 4a ORACLE — the seam (`validateAndBuildMvFlagDraft`) now builds the `MvFlag` DIRECTLY instead of running the old
// `.crl` splicer `createFlag` as a dry-run and adapting its `FlagInstance` via `legacyToMvFlag`. This is the higher-risk half
// of the port (anchor / label / occurrence-key promotion / dedupKey fallback / fields-strip / category). While BOTH the new
// direct builder AND the old path are still live (4a), assert they produce the SAME MvFlag on every parity-relevant field for a
// representative set of inputs — the same rationale as flagVocab.equivalence.test.ts. DELETED in 4b (when createFlag /
// legacyToMvFlag are stripped). `id`/`createdAt` are host-injected (differ by construction); `dedupKey` is excluded because the
// direct builder synthesizes a content hash when no key is supplied while the legacy adapter leaves it undefined — both
// legitimate (the direct builder's dedupKey is separately tested in buildFlagDraft.test.ts).
import { createFlag } from "../../refactors/createFlag";
import { validateAndBuildMvFlagDraft } from "../buildFlagDraft";
import { legacyToMvFlag } from "../mvFlagLegacy";
import type { MvFlag } from "../mvFlag";
import type { CreateFlagInput, CreateFlagTarget } from "../flagVocab";

const CONCEPT = 'library "L".\nconcept "C":\n- type is Observation.\n- code is `c`.';
const DECISION = 'library "L".\nconcept "A":\n- type is Observation.\n- code is `a`.\ndecision "D":\nfirst:\n- when "A" then recommend activity "X".\n- otherwise then recommend activity "X".';

/** The fields that must match between the two build paths (exclude the legitimately-divergent id/createdAt/dedupKey). */
function parity(f: MvFlag): unknown {
  return {
    category: f.category,
    tag: f.tag,
    gist: f.gist,
    status: f.status,
    fields: f.fields,
    anchor: { scope: f.anchor.scope, name: f.anchor.name, library: f.anchor.library, label: f.anchor.label, occurrenceKey: f.anchor.occurrenceKey },
  };
}

const CASES: Array<{ name: string; source: string; target: CreateFlagTarget; input: CreateFlagInput }> = [
  { name: "concept + validation-concern (no fields)", source: CONCEPT, target: { kind: "concept", name: "C" }, input: { tag: "validation-concern", gist: "looks off" } },
  { name: "concept + fidelity-defect via ALIAS + direction (category strict, alias canon, field ride-along)", source: CONCEPT, target: { kind: "concept", name: "C" }, input: { tag: "over-reach-to-fix", gist: "dosage mismatch", fields: { direction: "over-reach" } } },
  { name: "concept + validation-concern + kind + ref (multiple fields, ordering)", source: CONCEPT, target: { kind: "concept", name: "C" }, input: { tag: "validation-concern", gist: "gap", fields: { kind: "narrative-error", ref: "#203" } } },
  { name: "library scope + internal-inconsistency", source: DECISION, target: { kind: "library", name: "L" }, input: { tag: "internal-inconsistency", gist: "self-contradiction" } },
  { name: "decision + open-fork + NON-occurrence key (dedupKey path; key stripped from fields)", source: DECISION, target: { kind: "decision", name: "D" }, input: { tag: "open-fork", gist: "unsettled", fields: { key: "src-hash-abc123", chosen: "branch-a" } } },
  { name: "decision + validation-concern + OCCURRENCE key (promotion + `name · sig` label)", source: DECISION, target: { kind: "decision", name: "D" }, input: { tag: "validation-concern", gist: "wrong node", fields: { key: "when[0]~A" } } },
];

describe("buildFlagDraft ≡ createFlag→legacyToMvFlag (4a build-parity oracle)", () => {
  for (const c of CASES) {
    test(c.name, () => {
      const direct = validateAndBuildMvFlagDraft(c.source, c.target, c.input, () => "id", () => "t");
      const made = createFlag(c.source, c.target, c.input);
      expect(direct.ok).toBe(true);
      expect(made.ok).toBe(true);
      if (!direct.ok || !made.ok) return;
      const legacy = legacyToMvFlag(made.flag).flag;
      expect(parity(direct.flag)).toEqual(parity(legacy));
    });
  }
});
