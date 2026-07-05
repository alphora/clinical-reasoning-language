import { displayDetermination } from "../displayName";

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
