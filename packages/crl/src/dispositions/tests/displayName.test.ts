import { determinationCategory, displayDetermination, parseDeterminationName } from "../displayName";

describe("dispositions/displayName — displayDetermination (DISPLAY-only)", () => {
  it("strips the `<category>.` prefix, returning just the human key", () => {
    expect(displayDetermination("certify.Met")).toBe("Met");
    expect(displayDetermination("not-certify.Unmet")).toBe("Unmet");
    expect(displayDetermination("pended.Info Needed")).toBe("Info Needed");
    // the default/baseline vocabulary keys too
    expect(displayDetermination("certify.Approve")).toBe("Approve");
    expect(displayDetermination("not-certify.Deny")).toBe("Deny");
  });

  it("preserves a key that contains spaces (only the first `.` is the separator)", () => {
    expect(displayDetermination("not-certify.Unmet EIU")).toBe("Unmet EIU");
    expect(displayDetermination("not-certify.Experimental / Investigational")).toBe(
      "Experimental / Investigational",
    );
  });

  it("returns a non-determination name UNCHANGED (ordinary activity / decision names untouched)", () => {
    expect(displayDetermination("Order MRI")).toBe("Order MRI");
    expect(displayDetermination("Ultrasonic Osteogenesis Stimulator Coverage")).toBe(
      "Ultrasonic Osteogenesis Stimulator Coverage",
    );
    // a prefix that is NOT one of the PAS categories is not stripped, even though it has a dot
    expect(displayDetermination("recommend.something")).toBe("recommend.something");
    // a bare category (no `.<key>`) is not a match → unchanged
    expect(displayDetermination("certify")).toBe("certify");
    expect(displayDetermination("not-certify")).toBe("not-certify");
    // empty key after the dot does not match `(.+)` → unchanged
    expect(displayDetermination("certify.")).toBe("certify.");
  });
});

describe("dispositions/displayName — parseDeterminationName + determinationCategory (the MV Tree color join)", () => {
  it("parses a dotted determination into { category, key }", () => {
    expect(parseDeterminationName("certify.Met")).toEqual({ category: "certify", key: "Met" });
    expect(parseDeterminationName("not-certify.Unmet EIU")).toEqual({ category: "not-certify", key: "Unmet EIU" });
    expect(parseDeterminationName("pended.Info Needed")).toEqual({ category: "pended", key: "Info Needed" });
    // only the FIRST `.` separates → a multi-dot key is preserved whole
    expect(parseDeterminationName("not-certify.a.b")).toEqual({ category: "not-certify", key: "a.b" });
  });

  it("parses a BARE single-option category (no key)", () => {
    expect(parseDeterminationName("certify")).toEqual({ category: "certify" });
    expect(parseDeterminationName("pended")).toEqual({ category: "pended" });
  });

  it("returns undefined for a non-determination, a non-category prefix, and an empty key", () => {
    expect(parseDeterminationName("Order MRI")).toBeUndefined();
    expect(parseDeterminationName("recommend.something")).toBeUndefined(); // prefix is not a PAS category
    expect(parseDeterminationName("certifyX.y")).toBeUndefined(); // "certifyX" is not a category
    expect(parseDeterminationName("certify.")).toBeUndefined(); // empty key → malformed
  });

  it("determinationCategory returns just the category (or undefined)", () => {
    expect(determinationCategory("certify.Approve")).toBe("certify");
    expect(determinationCategory("not-certify.Deny")).toBe("not-certify");
    expect(determinationCategory("pended.Info")).toBe("pended");
    expect(determinationCategory("certify")).toBe("certify"); // bare
    expect(determinationCategory("Order MRI")).toBeUndefined();
    expect(determinationCategory("certify.")).toBeUndefined();
  });
});
