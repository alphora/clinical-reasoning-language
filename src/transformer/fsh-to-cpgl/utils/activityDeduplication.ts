// Utility for activity normalization and deduplication
// [DEBUGGING] All debug logs are prefixed as per guidelines

import { randomInt } from "crypto";

export type Activity = { name: string, value: string | undefined, original: string };

/**
 * Normalize an activity for deduplication purposes.
 * This should return a string or object that uniquely identifies the activity's semantics,
 * ignoring irrelevant differences (e.g., whitespace, order of keys, etc.).
 */
export function normalizeActivity(activity: Activity): string {
  // Use a composite key of name and value for deduplication
  return `${activity.name}::${activity.value ?? ''}`;
}

/**
 * Deduplication map for activities.
 * Stores the first original activity for each normalized key.
 */
export class ActivityDeduplicator {
  private normalizedToOriginal: Map<string, Activity> = new Map();

  add(activity: Activity) {
    const norm = normalizeActivity(activity);
    if (!this.normalizedToOriginal.has(norm)) {
      this.normalizedToOriginal.set(norm, activity);
    }
  }

  /**
   * Returns all unique original activities (deduplicated by normalization).
   */
  getUniqueActivities(): Activity[] {
    return Array.from(this.normalizedToOriginal.values());
  }
} 