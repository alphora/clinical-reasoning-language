import { Terminology, TerminologyValueset, TerminologySystem, TerminologyCode } from "../types";

import { parseInput } from "./parseInput";

describe("Terminology Structure", () => {
  it("should correctly structure terminology with valueset", () => {
    const input = `# Test
terminology "MeaslesVaccineCodes":
- valueset is "bmi valueset".
`;

    const result = parseInput(input);
    const terminology = result.statements[0] as Terminology;

    // Verify basic terminology structure
    expect(terminology.type).toBe("Terminology");
    expect(terminology.name).toBe("MeaslesVaccineCodes");
    const valuesetLine = terminology.body.find(
      (l) => l.type === "TerminologyValueset",
    ) as TerminologyValueset;
    expect(valuesetLine).toBeDefined();
    expect(valuesetLine.valuesetName).toBe("bmi valueset");
  });

  it("should correctly structure terminology with system and code", () => {
    const input = `# Test
terminology "MeaslesVaccineCodes":
- system is \`http://snomed.info/sct\`.
- code is \`871807003\`.
`;

    const result = parseInput(input);
    const terminology = result.statements[0] as Terminology;

    // Verify basic terminology structure
    expect(terminology.type).toBe("Terminology");
    expect(terminology.name).toBe("MeaslesVaccineCodes");
    const systemLine = terminology.body.find(
      (l) => l.type === "TerminologySystem",
    ) as TerminologySystem;
    const codeLine = terminology.body.find((l) => l.type === "TerminologyCode") as TerminologyCode;
    expect(systemLine).toBeDefined();
    expect(systemLine.system).toBe("http://snomed.info/sct");
    expect(codeLine).toBeDefined();
    expect(codeLine.code).toBe("871807003");
  });
});
