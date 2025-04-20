import type { ActivityType } from '../grammar/activityTypes';
import type { ConceptType } from '../grammar/conceptTypes';
import type { ConceptValueType } from '../grammar/conceptValueTypes';
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
export interface CPGL extends ASTNode {
    type: 'CPGL';
    statements: Statement[];
    location: Location;
}
export declare const FileType: {
    type: "CPGL";
};
export type Statement = Decision | Concept | Activity | Terminology;
export interface Decision extends ASTNode {
    type: 'Decision';
    name: string;
    body: DecisionBody;
    location: Location;
}
export declare const DecisionType: {
    type: "Decision";
};
export interface DecisionBody extends ASTNode {
    type: 'DecisionBody';
    statements: WhenBlock[];
    location: Location;
}
export declare const DecisionBodyType: {
    type: "DecisionBody";
};
export interface WhenBlock extends ASTNode {
    type: 'WhenBlock';
    conceptName: string;
    body: BlockBody | SingleAction;
    location: Location;
}
export declare const WhenBlockType: {
    type: "WhenBlock";
};
export type WhenBlockBody = BlockBody | SingleAction;
export interface BlockBody extends ASTNode {
    type: 'BlockBody';
    qualifier?: string;
    statements: (WhenBlock | ActionStatement)[];
    location: Location;
}
export declare const BlockBodyType: {
    type: "BlockBody";
};
export interface SingleAction extends ASTNode {
    type: 'SingleAction';
    action: Action;
    location: Location;
}
export declare const SingleActionType: {
    type: "SingleAction";
};
export interface ActionStatement extends ASTNode {
    type: 'ActionStatement';
    action: Action;
    location: Location;
}
export declare const ActionStatementType: {
    type: "ActionStatement";
};
export interface DoActivity extends ASTNode {
    type: 'DoActivity';
    activityName: string;
    location: Location;
}
export declare const DoActivityType: {
    type: "DoActivity";
};
export interface UseDecision extends ASTNode {
    type: 'UseDecision';
    decisionName: string;
    location: Location;
}
export declare const UseDecisionType: {
    type: "UseDecision";
};
export interface Terminology extends ASTNode {
    type: 'Terminology';
    name: string;
    definition: TerminologyDefinition;
    location: Location;
}
export declare const TerminologyType: {
    type: "Terminology";
};
export type TerminologyDefinition = TerminologyValueset | TerminologyFreeText | TerminologySystemCode;
export interface TerminologyValueset extends ASTNode {
    type: 'TerminologyValueset';
    valuesetName: string;
    location: Location;
}
export declare const TerminologyValuesetType: {
    type: "TerminologyValueset";
};
export interface TerminologyFreeText extends ASTNode {
    type: 'TerminologyFreeText';
    value: string;
    location: Location;
}
export declare const TerminologyFreeTextType: {
    type: "TerminologyFreeText";
};
export interface TerminologySystemCode extends ASTNode {
    type: 'TerminologySystemCode';
    system: string;
    code: string;
    location: Location;
}
export declare const TerminologySystemCodeType: {
    type: "TerminologySystemCode";
};
export interface Activity extends ASTNode {
    type: 'Activity';
    name: string;
    perform: ActivityType;
    terminologyReference?: string;
    activityTypeValue?: string;
    rationale?: string;
    location: Location;
}
export interface Concept extends ASTNode {
    type: 'Concept';
    name: string;
    conceptType: ConceptType;
    valueType: ConceptValueType;
    definition: ConceptDefinition;
    provenance?: string;
    location: Location;
}
export type ConceptDefinition = CodedByDefinition | InferredByDefinition;
export interface CodedByDefinition extends ASTNode {
    type: 'CodedByDefinition';
    terminologyName: string;
    location: Location;
}
export declare const CodedByDefinitionType: {
    type: "CodedByDefinition";
};
export interface ConceptReference extends ASTNode {
    type: 'ConceptReference';
    name: string;
}
export declare const ConceptReferenceType: {
    type: "ConceptReference";
};
export interface InformalAnd extends ASTNode {
    type: 'AndExpression';
    terms: InferredByExpression[];
}
export declare const InformalAndType: {
    type: "AndExpression";
};
export interface InformalOr extends ASTNode {
    type: 'OrExpression';
    terms: InferredByExpression[];
}
export declare const InformalOrType: {
    type: "OrExpression";
};
export interface NotExpression extends ASTNode {
    type: 'NotExpression';
    expression: InferredByExpression;
}
export declare const NotExpressionType: {
    type: "NotExpression";
};
export type InferredByExpression = ConceptReference | InformalAnd | InformalOr | GroupExpression | NotExpression;
export interface GroupExpression extends ASTNode {
    type: 'GroupExpression';
    expression: InferredByExpression;
}
export declare const GroupExpressionType: {
    type: "GroupExpression";
};
export interface InferredByConcept extends ASTNode {
    type: 'InferredByDefinitionConcept';
    concept: string;
    pattern?: string;
}
export declare const InferredByConceptType: {
    type: "InferredByDefinitionConcept";
};
export interface InferredByDefinition extends ASTNode {
    type: 'InferredByDefinition';
    body: InferredByConcept | InferredByExpression;
}
export declare const InferredByDefinitionType: {
    type: "InferredByDefinition";
};
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
export type Action = DoActivity | UseDecision;
export type { ActivityType } from "../grammar/activityTypes";
export type { ConceptType } from "../grammar/conceptTypes";
export type { ConceptValueType } from "../grammar/conceptValueTypes";
export { activityTypes } from "../grammar/activityTypes";
export { conceptTypes } from "../grammar/conceptTypes";
export { conceptValueTypes } from "../grammar/conceptValueTypes";
