import { describe, expect, it } from "vitest";

import { activityDefinitionCanonicalUrl, activityDefinitionId } from "../activity";
import { decisionId, planDefinitionCanonicalUrl } from "../decision";
import { recommendationDefinitionCanonicalUrl, recommendationId } from "../recommendation";
import { caseFeatureCanonicalUrl, caseFeatureId } from "../structureDefinition";
import { localCodeSystemSlug, policyIdBase, uniqueCapSlug, uniqueCapSlugForSuffix } from "../slug";
import { localCodeSystemUrl } from "../../cql-emitter/lowerLocalCodes";
import type { CpgMetadata } from "../types";

/**
 * #237/T1 — the durable locks for the UNIFIED FHIR id formatter. These pin the
 * cross-site / cross-lane byte-agreement that "one formatter" is supposed to give,
 * at the two inputs that actually distinguish the new implementation from the old
 * lossy caps: an OVERFLOW composite (>64) and a DOTTED domain. A future revert of a
 * single site to `slugify`/`capSlug`/`localSlug`/an uncapped tail breaks one of
 * these even though every same-length short-name golden would stay green.
 */
const META: CpgMetadata = {
  version: "1.0.0",
  name: "cms22",
  title: "CMS22 Demo",
  description: "CMS22 demonstration corpus",
  publisher: "Smile Digital Health",
  contact: [],
  canonicalBase: "http://example.org/base",
  status: "draft",
  experimental: true,
  jurisdiction: [],
  useContext: [],
};

const tail = (url: string): string => url.slice(url.lastIndexOf("/") + 1);
const LONG = "a".repeat(70); // a declaration name that forces the composite over 64

describe("#237/T1 unified id formatter — id == canonical url-tail at overflow (per CRL kind)", () => {
  const cases: Array<
    [string, (m: CpgMetadata, n: string) => string, (m: CpgMetadata, n: string) => string]
  > = [
    ["ActivityDefinition", activityDefinitionId, activityDefinitionCanonicalUrl],
    ["PlanDefinition (decision)", decisionId, planDefinitionCanonicalUrl],
    ["PlanDefinition (recommendation)", recommendationId, recommendationDefinitionCanonicalUrl],
    ["StructureDefinition (case-feature)", caseFeatureId, caseFeatureCanonicalUrl],
  ];
  for (const [label, idFn, urlFn] of cases) {
    it(`${label}: id is <= 64 and equals its canonical url-tail`, () => {
      const id = idFn(META, LONG);
      expect(id.length).toBeLessThanOrEqual(64);
      expect(tail(urlFn(META, LONG))).toBe(id);
    });
  }

  it("distinct >64 declaration names disambiguate (hash apart), not collide", () => {
    expect(decisionId(META, LONG + "-x")).not.toBe(decisionId(META, LONG + "-y"));
  });
});

describe("#237/T1 unified id formatter — component-wise 'unnamed' boundary (no bare-base collision)", () => {
  it("caseFeatureId of a pure-non-ASCII concept becomes <base>-unnamed, NOT the bare Library base", () => {
    const id = caseFeatureId(META, "高血圧");
    expect(id).toBe(uniqueCapSlug(`${policyIdBase(META)}-unnamed`));
    expect(id).not.toBe(policyIdBase(META)); // the latent Library-id collision the fix closes
    expect(id.endsWith("-unnamed")).toBe(true);
  });

  it("decisionId of a pure-non-ASCII name is likewise <base>-unnamed", () => {
    expect(decisionId(META, "高血圧")).toBe(`${policyIdBase(META)}-unnamed`);
  });
});

describe("#237/T1 scope-B — local-domain CodeSystem id == url-tail (both lanes) at overflow + dotted", () => {
  it("overflow domain: CodeSystem id equals the url-tail (urn and canonicalBase forms)", () => {
    const domain = "d".repeat(80);
    const id = localCodeSystemSlug(domain);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id.endsWith("-local")).toBe(true);
    expect(localCodeSystemUrl(undefined, domain)).toBe(`urn:crl:codesystem:${id}`);
    expect(tail(localCodeSystemUrl(META.canonicalBase, domain))).toBe(id);
  });

  it("dotted domain: dot→hyphen (matches the id), NOT the old localSlug dot-strip", () => {
    const id = localCodeSystemSlug("a.b.c");
    expect(id).toBe(uniqueCapSlugForSuffix("a-b-c", "-local"));
    expect(id).toBe("a-b-c-local");
    expect(localCodeSystemUrl(undefined, "a.b.c")).toBe("urn:crl:codesystem:a-b-c-local");
  });
});
