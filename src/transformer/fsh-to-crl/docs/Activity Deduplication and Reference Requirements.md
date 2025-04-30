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

## Example issue

### Example Source

activity "Client Age Less Than 6 Months"
    perform CPGCommunicationRequest
    of "Should not vaccinate client for MCV0 as client is less than 6 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV0.".

activity "Last Live Vaccine Administered Within 4 Weeks"
    perform CPGCommunicationRequest
    of "Should not vaccinate client for MCV0 as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for MCV0.".

activity "Provide Measles Vaccine" 
    perform CPGMedicationRequest
    of "Measles vaccines".

activity "MCV0 Dose Administered"
    perform CPGCommunicationRequest
    of "MCV0 was administered. Check measles routine immunization schedule.".

activity "Client Age Less Than 12 Months"
    perform CPGCommunicationRequest
    of "Should not vaccinate client as client's age is less than 12 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV1.".

activity "Last Live Vaccine Administered Within 4 Weeks"
    perform CPGCommunicationRequest
    of "Should not vaccinate client for MCV1 as live vaccine was administered in the last 4 weeks. Check for any vaccines due and inform the caregiver of when to come back for MCV1.".

activity "Provide Measles Vaccine" 
    perform CPGMedicationRequest
    of "Measles vaccines".

activity "Client Age Less Than 15 Months"
    perform CPGCommunicationRequest
    of "Should not vaccinate client for MCV2 as client's age is less than 15 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV2.".

activity "Last Live Vaccine Administered Within 4 Weeks"
    perform CPGCommunicationRequest
    of "Should not vaccinate client for MCV2 as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for MCV2.".

activity "Provide Measles Vaccine" 
    perform CPGMedicationRequest
    of "Measles vaccines".

activity "Measles primary series is complete."
    perform CPGCommunicationRequest
    of "Measles primary series is complete. Two measles primary series doses were administered. Check if a measles supplementary dose is appropriate for the client.".

activity "Client Age Less Than 9 Months"
    perform CPGCommunicationRequest
    of "Should not vaccinate client as client's age is less than 9 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV1.".

activity "Last Live Vaccine Administered Within 4 Weeks"
    perform CPGCommunicationRequest
    of "Should not vaccinate client for MCV1 as live vaccine was administered in the last 4 weeks. Check for any vaccines due and inform the caregiver of when to come back for MCV1.".

activity "Provide Measles Vaccine" 
    perform CPGMedicationRequest
    of "Measles vaccines".

activity "Client Age Less Than 15 Months"
    perform CPGCommunicationRequest
    of "Should not vaccinate client for MCV2 as client's age is less than 15 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV2.".

activity "Last Live Vaccine Administered Within 4 Weeks"
    perform CPGCommunicationRequest
    of "Should not vaccinate client for MCV2 as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for MCV2.".

activity "Provide Measles Vaccine" 
    perform CPGMedicationRequest
    of "Measles vaccines".

activity "Measles primary series is complete"
    perform CPGCommunicationRequest
    of "Measles primary series is complete. Two measles primary series doses were administered. Check if a measles supplementary dose is appropriate for the client.".

activity "Last Live Vaccine Administered Within 4 Weeks"
    perform CPGCommunicationRequest
    of "Should not vaccinate client for measles supplementary dose as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for supplementary dose.".

activity "Provide Measles Vaccine" 
    perform CPGMedicationRequest
    of "Measles vaccines".

activity "Supplementary Dose Administered"
    perform CPGCommunicationRequest
    of "Measles immunization schedule is complete. Measles supplementary dose was administered.".

activity "Check Contraindication for Measles Immunization" 
    perform CPGMedicationRequest
    of "Measles vaccines".

activity "Evaluate Contraindication for Measles" 
    perform CPGServiceRequest
    of "Measles Code".

---
**Number of activities: 23**
**Total count: 23**

## Example Target

1. activity "Check Contraindication for Measles Immunization"
   - of "Measles vaccines"
   - count 1

2. activity "Client Age Less Than 12 Months"
   - of "Should not vaccinate client as client's age is less than 12 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV1."
   - count 1

3. activity "Client Age Less Than 15 Months"
   - of "Should not vaccinate client for MCV2 as client's age is less than 15 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV2."
   - count 2

4. activity "Client Age Less Than 6 Months"
   - of "Should not vaccinate client for MCV0 as client is less than 6 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV0."
   - count 1

5. activity "Client Age Less Than 9 Months"
   - of "Should not vaccinate client as client's age is less than 9 months. Check for any vaccines due, and inform the caregiver of when to come back for MCV1."
   - count 1

6. activity "Evaluate Contraindication for Measles"
   - of "Measles Code"
   - count 1

7. activity "Last Live Vaccine Administered Within 4 Weeks"
   - of "Should not vaccinate client for MCV0 as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for MCV0."
   - count 1

8. activity "Last Live Vaccine Administered Within 4 Weeks"
   - of "Should not vaccinate client for MCV1 as live vaccine was administered in the last 4 weeks. Check for any vaccines due and inform the caregiver of when to come back for MCV1."
   - count 2

9. activity "Last Live Vaccine Administered Within 4 Weeks"
   - of "Should not vaccinate client for MCV2 as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for MCV2."
   - count 2

10. activity "Last Live Vaccine Administered Within 4 Weeks"
    - of "Should not vaccinate client for measles supplementary dose as live vaccine was administered in the last 4 weeks. Check for any vaccines due, and inform the caregiver of when to come back for supplementary dose."
    - count 1

11. activity "MCV0 Dose Administered"
    - of "MCV0 was administered. Check measles routine immunization schedule."
    - count 1

12. activity "Measles primary series is complete"
    - of "Measles primary series is complete. Two measles primary series doses were administered. Check if a measles supplementary dose is appropriate for the client."
    - count 1

13. activity "Measles primary series is complete."
    - of "Measles primary series is complete. Two measles primary series doses were administered. Check if a measles supplementary dose is appropriate for the client."
    - count 1

14. activity "Provide Measles Vaccine"
    - of "Measles vaccines"
    - count 6

15. activity "Supplementary Dose Administered"
    - of "Measles immunization schedule is complete. Measles supplementary dose was administered."
    - count 1

---
**Number of activities: 15**
**Total count: 23**
