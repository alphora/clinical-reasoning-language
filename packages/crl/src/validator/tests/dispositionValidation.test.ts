import { parseInput } from "../../ast/tests/parseInput";
import { normalizeDispositionConfig } from "../../dispositions";
import type { ResolvedDispositionConfig } from "../../dispositions/types";
import { Validator } from "../validator";

// A configured project: certify has ONE option (Approve → bare `certify` also valid); not-certify has TWO.
const CONFIGURED: ResolvedDispositionConfig = normalizeDispositionConfig({
  options: {
    certify: { Approve: { label: "Approve" } },
    "not-certify": { Deny: { label: "Deny" }, EIU: { label: "Deny EIU" } },
  },
}).config;

const DEFAULTS: ResolvedDispositionConfig = normalizeDispositionConfig(undefined).config; // configured === false

function dispErrors(src: string, config: ResolvedDispositionConfig = CONFIGURED) {
  return new Validator()
    .validate(parseInput(src), { dispositionConfig: config })
    .errors.filter((e) => e.kind === "disposition-not-configured" || e.kind === "disposition-request-type");
}

const HEADER = `library "T".\nconcept "Q":\n- type is Condition.\n- code is \`q\`.\n`;
const activity = (name: string, req = "CPGCommunicationRequest") =>
  `activity "${name}":\n- request ${req}.\n- with \`text\`.\n`;

describe("DispositionValidator — closed-set (config-gated)", () => {
  it("clean: recommends only configured determinations, all CPGCommunicationRequest", () => {
    const src =
      HEADER +
      `decision "Cov":\nfirst:\n- when "Q" then recommend activity "certify.Approve".\n- otherwise then recommend activity "not-certify.Deny".\n` +
      activity("certify.Approve") +
      activity("not-certify.Deny");
    expect(dispErrors(src)).toEqual([]);
  });

  it("a recommended activity NOT in the configured set → disposition-not-configured", () => {
    const src =
      HEADER +
      `decision "Cov":\nfirst:\n- when "Q" then recommend activity "certify.Approve".\n- otherwise then recommend activity "Deny".\n` +
      activity("certify.Approve") +
      activity("Deny");
    const errs = dispErrors(src);
    expect(errs.map((e) => e.kind)).toContain("disposition-not-configured");
    expect(errs.some((e) => e.kind === "disposition-not-configured" && (e as any).activityName === "Deny")).toBe(true);
  });

  it("a configured determination activity with request CPGServiceRequest → disposition-request-type", () => {
    const src =
      HEADER +
      `decision "Cov":\nfirst:\n- when "Q" then recommend activity "certify.Approve".\n- otherwise then recommend activity "not-certify.Deny".\n` +
      activity("certify.Approve") +
      activity("not-certify.Deny", "CPGServiceRequest");
    const errs = dispErrors(src);
    expect(errs.some((e) => e.kind === "disposition-request-type" && (e as any).activityName === "not-certify.Deny")).toBe(true);
  });

  it("bare `certify` (single-option category) is valid; bare `not-certify` (multi-option) is NOT", () => {
    const ok =
      HEADER + `decision "D":\nfirst:\n- when "Q" then recommend activity "certify".\n- otherwise then recommend activity "not-certify.Deny".\n` +
      activity("certify") + activity("not-certify.Deny");
    expect(dispErrors(ok)).toEqual([]);

    const bad =
      HEADER + `decision "D":\nfirst:\n- when "Q" then recommend activity "not-certify".\n- otherwise then recommend activity "not-certify.Deny".\n` +
      activity("not-certify") + activity("not-certify.Deny");
    expect(dispErrors(bad).some((e) => e.kind === "disposition-not-configured" && (e as any).activityName === "not-certify")).toBe(true);
  });

  it("the second not-certify flavor (EIU) is accepted — distinct key under one category", () => {
    const src =
      HEADER + `decision "D":\nfirst:\n- when "Q" then recommend activity "not-certify.EIU".\n- otherwise then recommend activity "not-certify.Deny".\n` +
      activity("not-certify.EIU") + activity("not-certify.Deny");
    expect(dispErrors(src)).toEqual([]);
  });

  it("reaches recommend sites inside an `any:` menu", () => {
    const src =
      HEADER +
      `decision "D":\nfirst:\n- when "Q" then:\n  any:\n  - recommend activity "certify.Approve".\n  - recommend activity "Order MRI".\n  end.\n- otherwise then recommend activity "not-certify.Deny".\n` +
      activity("certify.Approve") + activity("not-certify.Deny") + activity("Order MRI", "CPGServiceRequest");
    expect(dispErrors(src).some((e) => e.kind === "disposition-not-configured" && (e as any).activityName === "Order MRI")).toBe(true);
  });

  it("reaches recommend sites nested inside a nested `when` block", () => {
    const src =
      HEADER +
      `decision "D":\nfirst:\n- when "Q" then:\n  first:\n  - when "Q" then recommend activity "Bogus".\n  - otherwise then recommend activity "not-certify.Deny".\n  end.\n- otherwise then recommend activity "not-certify.Deny".\n` +
      activity("not-certify.Deny") + activity("Bogus");
    expect(dispErrors(src).some((e) => e.kind === "disposition-not-configured" && (e as any).activityName === "Bogus")).toBe(true);
  });

  it("a configured-but-EMPTY vocabulary does not flood every recommend (empty-set guard)", () => {
    const empty = normalizeDispositionConfig({ options: {} }).config; // configured=true, zero leaves
    expect(empty.configured).toBe(true);
    const src = HEADER + `decision "D":\nfirst:\n- when "Q" then recommend activity "certify.Approve".\n- otherwise then recommend activity "not-certify.Deny".\n` +
      activity("certify.Approve") + activity("not-certify.Deny");
    expect(dispErrors(src, empty)).toEqual([]); // the empty-vocabulary warning is the signal, not a flood here
  });

  it("NOT configured (defaults) → nothing enforced, even for an arbitrary recommend", () => {
    const src =
      HEADER + `decision "D":\nfirst:\n- when "Q" then recommend activity "Whatever".\n- otherwise then recommend activity "Order MRI".\n` +
      activity("Whatever") + activity("Order MRI", "CPGServiceRequest");
    expect(dispErrors(src, DEFAULTS)).toEqual([]);
  });

  it("no dispositionConfig at all → the disposition rules do not run", () => {
    const src =
      HEADER + `decision "D":\nfirst:\n- when "Q" then recommend activity "Anything".\n- otherwise then recommend activity "Nope".\n` +
      activity("Anything") + activity("Nope");
    const errs = new Validator()
      .validate(parseInput(src), {})
      .errors.filter((e) => e.kind === "disposition-not-configured" || e.kind === "disposition-request-type");
    expect(errs).toEqual([]);
  });
});
