# 🧩 Activity Deduplication and Reference Resolution (Implementation Guide)

## 1. Activity and Reference Collection (During Emission)

### a. Assign Internal IDs
- When creating an activity (definition or reference), generate a unique internal ID, e.g., `activity_1`, `activity_2`, etc.
- Store this ID with every activity and every reference to it.

### b. Emit Placeholders for References
- When emitting a `do` statement (or any reference to an activity), output a placeholder:

````ts
output += `do <<ACTIVITY_REF:${activityId}>>.`;
````

- Store sufficient metadata with each placeholder to resolve it later (e.g., `activityId`).

### c. Collect Activity Metadata
For each activity, store:
- `id`: the internal ID (e.g., `activity_1`)
- `baseName`: the original activity name (e.g., `"Last Live Vaccine Administered Within 4 Weeks"`)
- `value`: the `of` value (e.g., `"Should not vaccinate client for MCV1..."`)
- `original`: the full original activity block string
- any additional metadata required for disambiguation or comment context

---

## 2. Postprocessing: Deduplication and Unique Name Assignment

### a. Deduplicate Activities
- Group activities by `(baseName, value)`
- For each unique `(baseName, value)` pair:
  - The first occurrence uses `baseName` as the final name
  - Subsequent duplicates get suffixes: `baseName_2`, `baseName_3`, etc.
- Build a lookup:

````ts
const idToFinalName = {
  activity_1: "Last Live Vaccine Administered Within 4 Weeks",
  activity_4: "Last Live Vaccine Administered Within 4 Weeks_2",
  activity_6: "Last Live Vaccine Administered Within 4 Weeks_3",
};
````

### b. Update Activity Definitions
- Emit a single `activity` block for each unique `(baseName, value)` using the final name
- Reuse the exact formatting (including `perform` and `of` clauses)

---

## 3. Postprocessing: Reference Replacement

### a. Replace Placeholders in Output
- Find and replace all `<<ACTIVITY_REF:id>>` with the correct quoted name from the lookup:

````ts
output = output.replace(/<<ACTIVITY_REF:(activity_\d+)>>/g, (_, id) => `"${idToFinalName[id]}"`);
````

### b. Ensure Suffix is Inside the Quotes
- When creating `uniqueName`, always append the suffix before quoting:

````ts
const uniqueName = baseName + (suffix > 1 ? `_${suffix}` : '');
const quoted = `"${uniqueName}"`;
````

---

## 4. Summary Table

| Step               | What to Store/Emit                     | How to Update Later                   |
|--------------------|----------------------------------------|----------------------------------------|
| Activity Definition| id, baseName, value, original          | Emit once with final name              |
| `do` Statement     | `do <<ACTIVITY_REF:id>>.`              | Replace with `do "FinalName".`         |

---

## 5. Edge Cases Handled
- Multiple references to same (name, value): all point to same activity
- Same `baseName` with different `value`: get suffixes
- Suffixes are placed inside the quotes
- Works for both single and multiple references

---

## 6. Implementation Sketch

````ts
// 1. During emission
const activityId = getNextActivityId();
activities.push({ id: activityId, baseName, value, ... });
output += `do <<ACTIVITY_REF:${activityId}>>.`;

// 2. Deduplicate and assign final names
const deduped = deduplicateActivities(activities);
const idToFinalName = Object.fromEntries(
  deduped.map(a => [a.id, a.uniqueName])
);

// 3. Replace all placeholders
output = output.replace(/<<ACTIVITY_REF:(activity_\d+)>>/g, (_, id) => `"${idToFinalName[id]}"`);
````

---

## 7. Testing

Ensure tests cover:
- Repeated activities with same baseName + value → deduped to one
- Same baseName, different value → suffixed versions
- All `do` references updated
- Final names are quoted correctly

---

## 8. Documentation
- Document placeholder format: `<<ACTIVITY_REF:id>>`
- Document postprocessing and replacement steps for maintainers
