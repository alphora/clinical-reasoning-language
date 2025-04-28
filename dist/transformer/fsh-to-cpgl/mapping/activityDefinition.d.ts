export declare const ACTIVITY_DEFINITION_URLS: string[];
interface ActivityDefRule {
    path: string;
    value?: unknown;
}
export interface ActivityDef {
    rules?: ActivityDefRule[];
    instanceOf?: string;
    title?: string;
    description?: string;
    extension?: {
        url: string;
        valueMarkdown?: string;
    }[];
    name?: string;
}
export declare function getActivityPerformClause(activityDef: ActivityDef): {
    clauseString: string;
    value: string | undefined;
    terminology?: {
        identifier: string;
        code: string;
        system: string;
    };
};
export declare function getNextActivityId(): string;
export declare function emitActivityBlock(node: ActivityDef, canonicalValueStr: string | undefined, allInstances: ActivityDef[], activities: {
    id: string;
    name: string;
    value: string | undefined;
    original: string;
    terminology?: {
        identifier: string;
        code: string;
        system: string;
    };
}[], indent: string, hasPlanDef: boolean, doReferences: {
    id: string;
    placeholder: string;
}[]): string;
export {};
