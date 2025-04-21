// Utility for activity normalization and deduplication
// [DEBUGGING] All debug logs are prefixed as per guidelines

import { randomInt } from "crypto";

export type Activity = { text: string } | Record<string, any>;

/**
 * Normalize an activity for deduplication purposes.
 * This should return a string or object that uniquely identifies the activity's semantics,
 * ignoring irrelevant differences (e.g., whitespace, order of keys, etc.).
 */
export function normalizeActivity(activity: Activity): string {
  // If the activity is of the form { text: string }, normalize based on text
  if ('text' in activity && typeof activity.text === 'string') {
    return activity.text.trim();
  }
  // Otherwise, sort keys and stringify for a stable, comparable representation
  const ordered = Object.keys(activity as Record<string, any>)
    .sort()
    .reduce((obj, key) => {
      (obj as any)[key] = (activity as Record<string, any>)[key];
      return obj;
    }, {} as Record<string, any>);
  return JSON.stringify(ordered);
}

/**
 * Deduplication map for activities.
 * Stores the first original activity for each normalized key.
 */
export class ActivityDeduplicator {
  private normalizedToOriginal: Map<string, Activity> = new Map();

  add(activity: Activity) {
    // const norm = normalizeActivity(activity);
    // if (!this.normalizedToOriginal.has(norm)) {
    //   this.normalizedToOriginal.set(norm, activity);
    // }
    this.normalizedToOriginal.set(activity.text, activity);
  }

  /**
   * Returns all unique original activities (deduplicated by normalization).
   */
  getUniqueActivities(): Activity[] {
    return Array.from(this.normalizedToOriginal.values());
  }
} 