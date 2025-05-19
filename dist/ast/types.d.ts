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
    conceptType: ConceptType;
    valueType: ConceptValueType;
    definition: ConceptDefinition;
    meta?: string;
    evidence?: string;
    location: Location;
}
export type ConceptDefinition = CodedFromDefinition | InferredFromDefinition;
export interface CodedFromDefinition extends ASTNode {
    type: "CodedFromDefinition";
    terminologyName: string;
    location: Location;
}
export interface ConceptReference extends ASTNode {
    type: "ConceptReference";
    name: string;
}
export interface InformalAnd extends ASTNode {
    type: "AndExpression";
    terms: InferredFromExpression[];
}
export interface InformalOr extends ASTNode {
    type: "OrExpression";
    terms: InferredFromExpression[];
}
export interface NotExpression extends ASTNode {
    type: "NotExpression";
    expression: InferredFromExpression;
}
export type InferredFromExpression = ConceptReference | InformalAnd | InformalOr | GroupExpression | NotExpression;
export interface GroupExpression extends ASTNode {
    type: "GroupExpression";
    expression: InferredFromExpression;
}
export interface InferredFromConcept extends ASTNode {
    type: "InferredFromDefinitionConcept";
    concept: string;
    patterns?: string[];
}
export interface InferredFromDefinition extends ASTNode {
    type: "InferredFromDefinition";
    body: InferredFromConcept | InferredFromExpression;
}
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
