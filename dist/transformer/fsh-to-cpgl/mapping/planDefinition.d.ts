export declare function mapPlanDefinitionToDecision(instance: any, allInstances: any[]): {
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
