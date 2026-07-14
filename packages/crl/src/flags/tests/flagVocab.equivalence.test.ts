// #212 step 4a ORACLE — while the flag vocabulary lives in BOTH the `.crl` meta-registry AND the new core `flagVocab`, assert
// they are byte-for-byte equivalent for every flag tag: same canonicalization (incl. aliases), same category, same field rules
// (required / enum, in order), same flagTags() set. This catches a hand-transcription drop (a missing alias/enum/category)
// when flagVocab was ported from the registry. DELETED in 4b — once the registry flag entries are stripped, the registry no
// longer knows these tags and this comparison is meaningless (flagVocab becomes the sole source).
import { METADATA_REGISTRY } from "../../meta/generated/registry.generated";
import { canonicalTag, fieldRulesOf, flagCategory, flagTags as registryFlagTags, isFlag } from "../../meta/registry";
import { canonicalFlagTag, flagCategoryOf, flagFieldRulesOf, flagTags, isFlagTag } from "../flagVocab";

const CANONICAL = ["customer-confirmable", "internal-inconsistency", "open-fork", "fidelity-defect", "validation-concern"];
// DERIVED from the registry (not hand-maintained) so a registry alias addition before 4b is caught by this oracle (gpt55 nit).
const ALIASES = (METADATA_REGISTRY.tags as ReadonlyArray<{ flag?: boolean; aliases?: readonly string[] }>)
  .filter((t) => t.flag === true)
  .flatMap((t) => t.aliases ?? []);

describe("flagVocab ≡ registry (4a migration oracle)", () => {
  test("flagVocab knows exactly the registry's flag tags", () => {
    const registrySet = registryFlagTags().map((t) => t.id).sort();
    const vocabSet = flagTags().map((t) => t.id).sort();
    expect(vocabSet).toEqual(registrySet);
    expect(vocabSet).toEqual([...CANONICAL].sort()); // and it's the five we expect
  });

  for (const id of CANONICAL) {
    test(`@${id}: category + field rules + isFlag/canonical match the registry`, () => {
      expect(flagCategoryOf(id)).toBe(flagCategory(id));
      expect(canonicalFlagTag(id)).toBe(canonicalTag(id));
      expect(isFlagTag(id)).toBe(isFlag(id));
      expect(flagFieldRulesOf(id)).toEqual(fieldRulesOf(id)); // deep-equal: key/required/values, in order
    });
  }

  for (const alias of ALIASES) {
    test(`alias ${alias} canonicalizes identically in both`, () => {
      expect(canonicalFlagTag(alias)).toBe(canonicalTag(alias));
      expect(isFlagTag(alias)).toBe(isFlag(alias));
    });
  }

  test("flagTags() field arrays match the registry tag-by-tag", () => {
    const reg = new Map(registryFlagTags().map((t) => [t.id, t]));
    for (const t of flagTags()) {
      const r = reg.get(t.id)!;
      expect({ id: t.id, category: t.category, fields: t.fields }).toEqual({ id: r.id, category: r.category, fields: r.fields });
    }
  });
});
