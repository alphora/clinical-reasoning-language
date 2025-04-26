"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityDeduplicator = void 0;
exports.normalizeActivity = normalizeActivity;
function normalizeActivity(activity) {
    return `${activity.name}::${activity.value ?? ""}`;
}
class ActivityDeduplicator {
    constructor() {
        this.normalizedToOriginal = new Map();
    }
    add(activity) {
        const norm = normalizeActivity(activity);
        if (!this.normalizedToOriginal.has(norm)) {
            this.normalizedToOriginal.set(norm, activity);
        }
    }
    getUniqueActivities() {
        return Array.from(this.normalizedToOriginal.values());
    }
}
exports.ActivityDeduplicator = ActivityDeduplicator;
//# sourceMappingURL=activityDeduplication.js.map