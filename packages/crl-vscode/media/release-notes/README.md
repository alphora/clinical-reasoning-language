# CRL Release Notes

Updates since CRL 6.4.41 through 6.4.58.

Managed environments provide KALM AI: What's New for the combined Release Notes.

## 6.4.58 — Open the Nautilus log in managed projects

### Read your policy processing history

The Nautilus log now opens in workspaces using the current project configuration\. Its button glows gold when a log is available, and the log opens read\-only beside your review\.

## 6.4.57 — Find the Nautilus log in Medical Validation

### Open the Nautilus log from Actions

Nautilus log is the first action in Medical Validation\. It glows gold when a log is available and explains when no log has been delivered yet\. The log opens beside your review and stays read\-only in the editor\.

![Medical Validation toolbar with a glowing Nautilus log button first in Actions and bold blue section headings\.](nautilus-log.png)

Synthetic example; no patient information is shown\.

### Calmer review toolbar

Status, Legend, Actions and Source documents use bold headings in the theme's accent color\. Gold glow remains on attention indicators, making them easier to distinguish\.

## 6.4.56 — Read the fix report without losing your place

### Open the MV fix log

Choose MV fix log in Actions to read the running report of changes made after review\. Earlier entries remain visible\. The report opens read\-only; reading it does not approve a flag or change your verdict\.

![Medical Validation Actions beside a read\-only MV fix log showing two appended synthetic comparison entries\.](mv-fix-log.png)

Synthetic report with both the earlier comparison and its follow\-up visible\. No patient information is shown\.

### Keep your place during review

Expanding a terminal path or setting a Verdict from FHIR Questionnaire keeps the tree where you left it, including after the review refresh\. Focus still takes you to the selected question\.

## 6.4.55 — Review policy paths from the questionnaire

### Load a decision row when you choose

FHIR Questionnaire is now one editable form\. Select a Decision Table row, then choose Default to load its answers\. Changing rows keeps your current form until you choose Default again\. Change or clear answers, then re\-evaluate to see the result\.

![Synthetic six\-question form with Default, a Loaded row label, question review icons and a Met result\.](questionnaire-default.png)

A demonstration policy shows the selected row’s answers in the editable FHIR Questionnaire\.

### Review questions without losing your place

Use the controls to the right of each question to focus it in the tree, edit its wording with the pencil, or manage its flags\. Focus navigates to the question; editing and pinning preserve your place\. The result uses the terminal name, such as Met or Unmet, and offers Verdict for the corresponding route when available\.

### Review percentage and timing thresholds

Measurement questions can use percentages, such as LVEF, and milliseconds, such as QRS or PR duration\. Policies can compare those values with an inclusive at\-least or at\-most threshold while keeping the measurement unit explicit\.

## 6.4.54 — More reliable uncertainty checks

### Continue reviewing retained uncertain answers

Fixed an error that prevented questionnaires from opening for some policies that check uncertainty in earlier answers\. Retained uncertain answers remain available to review and correct\.

## 6.4.53 — More dependable policy validation

### Keep validation consistent through review

Policy validation can now check that results came from the expected validation tools and preserve the same policy calculations between testing and delivery\.

## 6.4.52 — A simpler decision\-tree legend

### Read the condition colors without a second group legend

The legend now focuses on review status, navigation, flags and True/False conditions\. ANY OF and ALL OF labels remain in the tree, where their connector colors follow the selected case and path\.

![Medical Validation legend with review, True and False condition colors, navigation and flags; no separate ANY OF or ALL OF row\.](condition-legend.png)

The condition samples keep their green and red glow\. This view uses a demonstration policy\.

## 6.4.51 — Keep policy review panels in order

### Read the source beside the tree

Highlighted Source opens immediately to the left of the Decision Tree or Decision Table\. The question panels stay to the right, and the tree keeps the remaining space\. You can close and reopen the source panel from Show Panel\.

![Sample workspace with Highlighted Source on the left, the Decision Table in the middle, and both question panels on the right\.](source-panel-left.png)

The source, decision paths and questions remain visible together\. This demonstration uses sample artifacts\.

### Read a simpler group legend

ANY OF and ALL OF each have one glowing line sample\. The duplicate paired lines have been removed\.

## 6.4.50 — A clearer policy review workspace

### Find review controls and policy files

Review actions are grouped together, with status and the legend alongside them\. Open Source and Refined source files directly from their named buttons\. Show Panel lets you open or close Highlighted Source, and Show Questionnaire groups the questionnaire controls\. The legend shows the KE flag badge and the green/red lines used by both ANY OF and ALL OF\.

![Medical Validation toolbar with Status and Legend on the left, grouped review actions and direct policy document buttons on the right\.](review-toolbar.png)

A fictional example of the review controls and source document buttons\.

### Keep the tree in view

Questionnaire panels and Highlighted Source open at compact, matching widths, leaving the remaining space for the tree or Decision Table\. These defaults return when you reopen the table or use Shallower and Deeper\. Selecting another row keeps your manual width adjustments\.

### See shared review progress across rows

When a branch passes review, its shared steps on the same path also show as passed in other Decision Table rows, including steps before the pin\. Different paths keep their own review colors\. A failed outcome remains failed even when its earlier shared steps passed\.

## 6.4.49 — Explore and compare policy paths

### Compare paths in a Decision Table

Select a node, then click its glowing yellow pin to see its downstream branches stacked in one view\. Use Shallower and Deeper to broaden or narrow the comparison\. Pinning an outcome shows one branch\. Branches without a test case are marked with a coverage error\.

![Two fictional policy paths stacked in Decision Table, with a yellow scope pin and inline questions in the first row\.](decision-table.png)

The familiar branch view is repeated for each path\. This example uses fictional questions and answers\.

### Keep questions beside the path you are reviewing

The question\-results icon cycles through a separate panel, questions inside the branch, and off\. The first row opens its question panel automatically\. If you move from a row using the panel to a row with questions switched off, the panel follows you\. The saved FHIR Questionnaire follows the focused row\. Both questionnaires can remain visible beside the tree\. Input groups keep your expand or collapse choice\.

### See which answers feed each path

Expand Answers under a question to see its choices grouped by the path they contribute to\. Each question has its own groups\. The headings use the connector colors and show the next outcome when it is known\. Green and red identify the paths\.

![Two treatment checks show different groups of answers under green and red path headings\.](answer-paths.png)

The same answer can contribute to different paths at different checks\. The example is fictional\.

### Show uncertainty checks when you need them

For policies prepared with marked uncertainty checks, the U control inside an outcome node shows or hides the check\. A blue border indicates that it is shown\. Some checks stay visible when needed for the selected case or a review flag\. Showing or hiding changes the view only\.

![A fictional policy tree with uncertainty checks expanded and blue\-bordered U controls inside outcome nodes\.](uncertainty-checks.png)

Use U to inspect the uncertainty check associated with an outcome\.

### Open the policy source documents

Choose Source documents in Medical Validation to list the selected policy's Source and Refined source files\. Select a file to open it in its usual editor, including the document viewers supplied in your workspace\.

### Keep the tree reachable beside a flag

While a flag panel is open, pan farther to bring nodes clear of the panel\. Opening the panel keeps your current position\. Selecting a flag from the flag list can still navigate to its target\.

### A reminder about multiple flags

Already available in 6\.4\.48, a node can hold several flags\. Click its flag icon to choose the flag to read\. To add another, right\-click the node and choose Add flag on the intended target\.

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
