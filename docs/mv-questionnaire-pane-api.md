# MV PlanDefinition-Questionnaire pane — API pencil-in

**Status:** draft for the other CRL session to implement the producer + tools against.
**Branch:** `feat/mv-plandefinition-questionnaire` (worktree `E:\src\mv-plandefinition-questionnaire`).

---

## 1. Scope — what the pane is

The pane **renders**. That is the whole of it.

1. User clicks a tree node or a CEL pane row (same trigger as the existing CRL Questionnaire pane).
2. That selection identifies a case.
3. The pane asks for that case's **Questionnaire** and **QuestionnaireResponse**.
4. It renders the two documents with the LForms open-source renderer.

The pane does **not**: run `$apply`, spawn a JVM, read qa patient data, reason about which
concepts become fields, or filter data client-side.

LForms' on-the-fly data-entry capability is unused for now, but is why the renderer is worth
adopting rather than hand-rolling — later uses may want it.

## 2. Pipeline

```
qa case data  ──►  upstream producer ($apply-driven)  ──►  Questionnaire + QuestionnaireResponse  ──►  pane renders
                   [build/emit time, JVM here]            [artifacts on disk]                        [MCP tool reads]
```

**Producer contract:** given a case's data, emit a Questionnaire *and* a QuestionnaireResponse
**populated with answers**. A producer that emits an empty-answer QR has not done its job.

Two deferred decisions, both behind the API and therefore cheap to change later:

- **Progressive reveal.** For now the producer flattens **to the leaf** — one complete Questionnaire.
  Progressive question reveal is a later variant; because the pane's contract is with the artifacts,
  it is an extension rather than a redesign.
- **Where the producer runs.** For now, locally on desktop. It will eventually need to run in
  codespaces too, which is when jar distribution becomes a live problem again
  (see §6).

## 3. The tools

Both are runtime lookups. The pane must never reconstruct a path from a convention — the
two KE workspaces already use different layouts, and the canonical one is the other session's
to define.

### `crl_list_questionnaire_cases` — feeds the picker

```jsonc
// args
{ "workspaceRoot": "<abs>", "libraryId": "<optional filter>" }

// returns
{ "libraries": [{
    "libraryId": "um-css-03",
    "cases": [{
      "caseSlug": "age-gate-adult-cannot-use-minor-dmc-route",
      "available": true,
      "unavailableReason": null,        // "no-qa-data" | "lane-mismatch" | "not-built"
      "lane": "local",                  // "local" | "source" | "mixed"
      "laneMatchesArtifact": true
    }]
}]}
```

### `crl_get_questionnaire_case` — the load

```jsonc
// args
{ "workspaceRoot": "<abs>", "libraryId": "um-css-03", "caseSlug": "age-gate-..." }

// returns
{ "questionnaire":         { /* FHIR Questionnaire */ },
  "questionnaireResponse": { /* FHIR QuestionnaireResponse, answers populated to leaf */ },
  "lane": "mixed",
  "warnings": [] }
```

## 4. Arguments to settle with the other session

1. **Case identity.** `libraryId` + `caseSlug` is the assumed stable key. The two KE workspaces'
   middle path segments differ (`<policy>-cases` vs `<library-slug>`); whatever the other session
   treats as canonical should be the key. The pane should not know about paths at all.
2. **Where built Questionnaires land.** Operator leans QA, with MV consuming them the way it
   already consumes qa patient data. The tool hides this either way — a producer-side decision.
3. **What `lane` is computed from.** This is an emit-time marker. The emitter knows which arm a
   resource serves; nothing downstream can re-derive it, and `resourceType` mis-classifies because
   **both lanes emit Observations**.

## 5. Why the local/source axis is not a folder picker

The original design was a folder split with select-one-or-more. Both KE workspaces independently
said this does not work, and IEHP measured why.

In `um-css-03`, the concept `Age Twenty One Or Older` carries both arms in one case — a local
Observation (`age-twenty-one-or-older = true`) and a Patient (`birthDate` + a deliberately-set
`meta.lastUpdated`). The two arms **recency-merge**: newest of the local Observation's `effective`
vs the Patient's `meta.lastUpdated` wins. The arbitration is what the cases exist to pin.

| case | birthDate | local age Observation |
|---|---|---|
| `age-gate-adult-cannot-use-minor-dmc-route` | 1980-01-01 | `= true` |
| `age-gate-minor-cannot-use-adult-dmc-route` | 2015-01-01 | none |
| `age-silence-adult-reaches-under-21-dmc-pathway` | 1980-01-01 | none |

Hiding the local Observation from row 1 does not produce a filtered view of row 1 — it produces
row 2, which has a **different expected determination**. Rows 2–3 are distinguished by a file that
is *absent* plus a field on the subject, which folder membership cannot express.

**Consequence:** the axis is already expressed as separate **cases**, and the picker selects cases.
"Run just local / just source / both" is case selection. The `lane` marker's job is the narrower and
more valuable one: **mismatch detection** — `laneMatchesArtifact: false` is what catches a case whose
data is in one lane while the artifact's retrieve expects the other, before someone runs it and gets a
confusing result.

## 6. Deferred: jar distribution

No slimmed `$apply` jar exists. Confirmed with KELP (structural no), HCSC KE and IEHP KE. Carving one
is unclaimed work with at least two other interested consumers.

It is no longer a setup burden. `emit_results` ships ONE compiled class (`ApplyDriver`) and runs the
engine jar **unextracted**, through Spring Boot's `PropertiesLauncher`. A knowledge engineer supplies
the jar path and its sha256; nothing is unpacked, no classpath is composed, and a **JRE 17+** suffices
— `javac` and `jar` were requirements of our own earlier design, not the engine's.

The remaining cost is the 216 MB download. That is what a slimmed jar would address, and it stays
deferred: not a blocker while the producer runs on desktop, live when it moves to codespaces.
The operator's shape when it does: host the carved artifact on GitHub, download-if-missing into
globalStorage, let the codespace image pre-bake it as a cache warm — one code path for desktop and
codespace, following the KALM precedent.

## 7. Known content constraints for the picker

- **No Questionnaires exist in any content today.** Both KE workspaces confirm `src/fhir/` holds only
  `ActivityDefinition`, `CodeSystem`, `Library`, `PlanDefinition`, `StructureDefinition`. This
  introduces the convention rather than adopting one.
- **`um-css-04` has zero qa files** — valid config, full `.crl`/`.cel`, no data. The picker will meet
  artifacts that are configured but unbuilt; that is what `available: false` is for.
- **The qa root is KELP-discoverable** — the `qa` entity's folder is `tests`, reported via `kelp status`
  from `kelp.project.json`. It holds TWO trees: `tests/data/fhir/patient/` (CEL case data) and
  `tests/results/fhir/patient/` (engine results, where built Questionnaires land). The tools should resolve
  them, not the pane.

## 8. Sources — what is and is not authoritative

- **`harness/PlanDefinition-apply/README.md` is NOT a specification.** It is one contributor's lab
  notebook, contains an explicit self-correction (§9 reversing §8), and was produced by a workspace
  known to run the wrong emit lane. Claims taken from it have already had to be retracted twice.
  Treat it as a source of hypotheses to re-verify, never as fact.
- **Emit behaviours are version-bound and currently in flight.** #189 is mid-build and is exactly a
  value-type-driven reduction with a boolean-totality redesign, landing as one atomic CQL+CEL flip.
  Nothing about what makes a case feature true should be encoded here until after that lands.
- HCSC KE has content pinned to current boolean semantics and asked to be notified at flip time.
