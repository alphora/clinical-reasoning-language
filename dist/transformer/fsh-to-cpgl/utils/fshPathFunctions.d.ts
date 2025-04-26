export declare function toIdentifier(value: string): string;
export declare function toString(value: string): string;
export declare function remove(value: string, removeStr: string): string;
export declare function prefix(value: string, prefixStr: string): string;
export declare function where(rules: {
    path: string;
    value: unknown;
}[], leftArg: string, rightArg: string, value: string): string;
export declare function extractCode(value: string): string;
export declare function extractCodeDisplay(value: string): string;
export declare function extractCodeExpression(value: string): string;
export declare function toCode(value: string): string;
