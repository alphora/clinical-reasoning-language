// This file provides a type-safe export of the activity types extracted from the grammar.
// It is auto-generated/updated by scripts/extractActivityTypes.js as part of `npm run generate`.
// Do not edit manually—edit the grammar's validTypes array instead.

import activityTypesJson from './generated/types/activityTypes.json';
export const activityTypes = activityTypesJson as string[];
export type ActivityType = typeof activityTypes[number]; 