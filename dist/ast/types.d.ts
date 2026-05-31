import type { ActivityType } from "../grammar/activityTypes";
import type { ConceptType } from "../grammar/conceptTypes";
import type { ConceptValueType } from "../grammar/conceptValueTypes";
export interface ASTNode {
    type: string;
    location: {
        start: {
            line: number;
            column: number;
        };
        end: {
            line: number;
            column: number;
        };
    };
}
export interface CRL extends ASTNode {
    type: "CRL";
    statements: Statement[];
    location: Location;
    header?: string;
}
export type Statement = Decision | Concept | Activity | Terminology;
export interface Decision extends ASTNode {
    type: "Decision";
    name: string;
    body: DecisionBody;
    location: Location;
}
export interface DecisionBody extends ASTNode {
    type: "DecisionBody";
    statements: WhenBlock[];
    location: Location;
}
export interface WhenBlock extends ASTNode {
    type: "WhenBlock";
    conceptName: string;
    body: WhenBlockBody;
    location: Location;
}
export type WhenBlockBody = BlockBody | ActionStatement;
export interface BlockBody extends ASTNode {
    type: "BlockBody";
    qualifier?: string;
    statements: (WhenBlock | ActionStatement)[];
    location: Location;
}
export interface ActionStatement extends ASTNode {
    type: "ActionStatement";
    action: Action;
    location: Location;
}
export interface RecommendActivity extends ASTNode {
    type: "RecommendActivity";
    activityName: string;
    location: Location;
}
export interface UseDecision extends ASTNode {
    type: "UseDecision";
    decisionName: string;
    location: Location;
}
export interface Terminology extends ASTNode {
    type: "Terminology";
    name: string;
    body: TerminologyBodyLine[];
    location: Location;
}
export type TerminologyBodyLine = TerminologyValueset | TerminologySystem | TerminologyCode;
export interface TerminologyValueset extends ASTNode {
    type: "TerminologyValueset";
    valuesetName: string;
    location: Location;
}
export interface TerminologySystem extends ASTNode {
    type: "TerminologySystem";
    system: string;
    location: Location;
}
export interface TerminologyCode extends ASTNode {
    type: "TerminologyCode";
    code: string;
    location: Location;
}
export interface Activity extends ASTNode {
    type: "Activity";
    name: string;
    body: ActivityBody;
    location: Location;
}
export interface ActivityBody extends ASTNode {
    type: "ActivityBody";
    request: ActivityRequest;
    withClause?: ActivityWith;
    becauseClause?: ActivityBecause;
    location: Location;
}
export interface ActivityRequest extends ASTNode {
    type: "ActivityRequest";
    activityType: ActivityType;
    doNotPerform?: boolean;
    location: Location;
}
export interface ActivityWith extends ASTNode {
    type: "ActivityWith";
    terminologyReference?: string;
    activityTypeValue?: string;
    location: Location;
}
export interface ActivityBecause extends ASTNode {
    type: "ActivityBecause";
    rationale: string;
    location: Location;
}
export interface Concept extends ASTNode {
    type: "Concept";
    name: string;
    conceptType?: ConceptType;
    valueTypes: ConceptValueType[];
    definition: ConceptDefinition;
    meta?: string[];
    evidence?: string;
    location: Location;
}
export type ConceptDefinition = CodedFromDefinition | InferredFromDefinition | LogicIsDefinition;
export interface CodedFromDefinition extends ASTNode {
    type: "CodedFromDefinition";
    terminologyName: string;
    location: Location;
}
export interface ConceptReference extends ASTNode {
    type: "ConceptReference";
    name: string;
}
export interface InferredFromDefinition extends ASTNode {
    type: "InferredFromDefinition";
    body: InferredFromBareRef | InferredFromComposition;
}
export interface InferredFromBareRef extends ASTNode {
    type: "InferredFromBareRef";
    ref: string;
}
export interface InferredFromComposition extends ASTNode {
    type: "InferredFromComposition";
    expression: CompositionExpression;
}
export type CompositionExpression = SemOrExpression | SemAndExpression | SemNotExpression | CompositionRef | CompositionGroup;
export interface SemOrExpression extends ASTNode {
    type: "SemOrExpression";
    terms: CompositionExpression[];
}
export interface SemAndExpression extends ASTNode {
    type: "SemAndExpression";
    terms: CompositionExpression[];
}
export interface SemNotExpression extends ASTNode {
    type: "SemNotExpression";
    expression: CompositionExpression;
}
export interface CompositionRef extends ASTNode {
    type: "CompositionRef";
    ref: string;
}
export interface CompositionGroup extends ASTNode {
    type: "CompositionGroup";
    expression: CompositionExpression;
}
export interface LogicIsDefinition extends ASTNode {
    type: "LogicIsDefinition";
    body: NarrativeClause;
}
export interface NarrativeClause extends ASTNode {
    type: "NarrativeClause";
    elements: NarrativeElement[];
    location: Location;
}
export type NarrativeElement = NConceptRef | NWord | Quantity | NDisjunction | NConjunction;
export interface NConceptRef extends ASTNode {
    type: "NConceptRef";
    value: string;
    location: Location;
}
export interface NWord extends ASTNode {
    type: "NWord";
    value: string;
    location: Location;
}
export interface Quantity extends ASTNode {
    type: "Quantity";
    value: number;
    unit: string;
    location: Location;
}
export interface NDisjunction extends ASTNode {
    type: "NDisjunction";
    disjuncts: ArgValue[];
    location: Location;
}
export interface NConjunction extends ASTNode {
    type: "NConjunction";
    conjuncts: ArgValue[];
    location: Location;
}
export type ArgValue = NConceptRef | Quantity | NDisjunction | NConjunction;
export interface Location {
    start: {
        line: number;
        column: number;
    };
    end: {
        line: number;
        column: number;
    };
}
export type Action = RecommendActivity | UseDecision;
export type { ActivityType } from "../grammar/activityTypes";
export type { ConceptType } from "../grammar/conceptTypes";
export type { ConceptValueType } from "../grammar/conceptValueTypes";
export { activityTypes } from "../grammar/activityTypes";
export { conceptTypes } from "../grammar/conceptTypes";
export { conceptValueTypes } from "../grammar/conceptValueTypes";
