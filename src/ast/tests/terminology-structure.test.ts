import { Terminology, TerminologyValueset, TerminologySystemCode } from "../types";

import { parseInput } from "./parseInput";

describe("Terminology Structure", () => {
  it("should correctly structure terminology with valueset", () => {
    const input = `
terminology "MeaslesVaccineCodes" valueset "bmi valueset".
`;

    const result = parseInput(input);
    const terminology = result.statements[0] as Terminology;

    // Verify basic terminology structure
    expect(terminology.type).toBe("Terminology");
    expect(terminology.name).toBe("MeaslesVaccineCodes");
    expect(terminology.definition).toBeDefined();
    expect(terminology.definition?.type).toBe("TerminologyValueset");
    const valuesetDef = terminology.definition as TerminologyValueset;
    expect(valuesetDef.valuesetName).toBe("bmi valueset");
  });

  it("should correctly structure terminology with system and code", () => {
    const input = `
terminology "MeaslesVaccineCodes" system \`http://snomed.info/sct\` code \`871807003\`.
`;

    const result = parseInput(input);
    const terminology = result.statements[0] as Terminology;

    // Verify basic terminology structure
    expect(terminology.type).toBe("Terminology");
    expect(terminology.name).toBe("MeaslesVaccineCodes");
    expect(terminology.definition).toBeDefined();
    expect(terminology.definition?.type).toBe("TerminologySystemCode");
    const systemCodeDef = terminology.definition as TerminologySystemCode;
    expect(systemCodeDef.system).toBe("http://snomed.info/sct");
    expect(systemCodeDef.code).toBe("871807003");
  });
});
