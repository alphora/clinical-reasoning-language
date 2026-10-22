# Multi-select presentation demo

In this repository's Run and Debug menu, select **Run Multi-select Demo (isolated)** and press **F5**.
The extension builds and opens Medical Validation on this demo automatically.

- Select **Two activities selected** to see the saved native `$apply` questionnaire with two checked choices.
- Open **Interactive FHIR Questionnaire** from the MV tool and click **Start** for a blank form.
- Check several activities, then click **Continue / Re-evaluate**. Each activity keeps its own Boolean answer.
- A mixed checkbox is unanswered; checked is Yes; unchecked is an explicit No. Use **Clear** to return a choice to unanswered.
- The group requests three columns and adapts to the pane width. Widen the questionnaire pane to see the columns.

This is a synthetic presentation example, not a medical policy. Its ordered decision returns Met when an activity is Yes and Unmet when all six are explicitly No. Unanswered choices retain their unknown state.

The debug target uses the released default engine and the ordinary session adapter.
It copies the extension into `tmp/presentation-choice-debug/extension` and uses a
separate profile/cache. Preparation downloads and verifies the default engine if
that isolated cache is empty; it does not need a maintainer engine checkout or a
native build. The normal Bleph debug target is unchanged.

To regenerate this demo's saved FHIR/CQL, case data and native questionnaires after editing its source, run from the repository root:

```powershell
node examples/presentation-choice-demo/prepare-debug.cjs --results
```

That command needs the current core/extension builds and access to the default engine download (or its cache). F5 builds the current code; normal debug preparation reuses the saved questionnaires without rerunning their cases.
