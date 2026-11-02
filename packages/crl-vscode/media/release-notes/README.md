# CRL Release Notes

Updates since CRL 6.4.41 through 6.4.48.

Managed environments provide KALM AI: What's New for the combined Release Notes.

## 6.4.48 — Simpler review flags

### Focus on the review question

The flag view keeps the question, policy quotation, description and review status in view\. Internal classifications and technical identifiers are tucked into Details\.

![Example review flag showing its question, policy quotation and description with Details collapsed\.](flag-context.png)

A fictional example of a question for the reviewer\.

### Compare Before and After

Changes shows Before and After beside the flag's description, without repeating the request in another field\. If a request has not been implemented, the reason stays visible\. Affected questions and evidence links remain available\.

![Example review flag with its description, visible Before and After, and affected question\.](flag-summary.png)

The request and the resulting change stay together for review\.

### Open and close the interactive questionnaire

The Interactive FHIR Questionnaire button turns blue while its tab is open\. Click it again to close the tab, just as you can with FHIR Questionnaire\.

## 6.4.46 — Clearer questions and review flags

### Measurement questions supply their unit

When a measurement question has a specified unit, such as BMI in kg/m2, enter the number and the form supplies the unit\. You can change or clear the answer\.

![Example BMI question with 40 entered and the unit kg/m2 supplied by the form\.](quantity-entry.png)

Illustrative BMI question; no patient information is shown\.

### Read the review question separately

A knowledge engineer can provide a short question and a quotation from the policy separately from the supporting explanation, making it easier to see what needs your review\.

### See what changed after a review request

A flag can include a summary of the earlier wording and the change made, with links to supporting evidence\. You can review the result before marking the flag Fixed or Approved\.

Images and demonstrations use sample artifacts.
