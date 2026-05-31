import type { CRL } from "../ast/types";
import { ValidationError } from "./validator";
export declare class CycleDetector {
    validate(ast: CRL): ValidationError[];
    private collectRefs;
    private collectFromComposition;
    private collectFromNarrative;
    private collectFromNarrativeElement;
    private collectFromArgValue;
    private canonicalizeCycle;
}
