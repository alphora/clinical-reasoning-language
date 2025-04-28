import { ActivityDef } from "./activityDefinition";
export declare function mapPlanDefinitionToDecision(instance: unknown, allInstances: ActivityDef[]): {
    decision: string;
    activities: {
        id: string;
        name: string;
        value: string | undefined;
        original: string;
    }[];
    doReferences: {
        id: string;
        placeholder: string;
    }[];
};
