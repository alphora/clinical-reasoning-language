export type Activity = {
    name: string;
    value: string | undefined;
    original: string;
};
export declare function normalizeActivity(activity: Activity): string;
export declare class ActivityDeduplicator {
    private normalizedToOriginal;
    add(activity: Activity): void;
    getUniqueActivities(): Activity[];
}
