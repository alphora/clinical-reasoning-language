# PlanDefinition-apply client harness

A small, self-contained harness that drives the real cqf **PlanDefinition/$apply**
(`$r5.apply`) interaction loop programmatically — a reusable MOCK apply CLIENT plus
single-`$apply` verification scripts. The operation is general (CPG / prior-auth / etc.),
not DTR-specific.

## Setup & run

**Prereqs**
- **JDK 23** on `PATH`, or set `JAVA_HOME` (the scripts fall back to
  `C:\Program Files\Java\jdk-23`).
- **Python 3** on `PATH` (the `build_*.py` data builders).
- **The cqf-fhir-cr runtime jars.** Put them in `./lib/` (gitignored), OR set
  `CRL_APPLY_HARNESS_LIB` to a directory containing them. They are the classpath the
  `$apply` engine runs on (cqf-fhir-cr 4.7.0 + its transitive deps — HAPI FHIR, the CQL
  engine, etc.). They can be extracted from the cqf-fhir-cr-cli fat jar's
  `BOOT-INF/lib/` (e.g. the repo's `tmp/cqf-fhir-cr-cli-4.7.0.jar`):
  ```powershell
  # from this harness dir, populate ./lib from the cli fat jar:
  New-Item -ItemType Directory -Force ./lib | Out-Null
  & "$env:JAVA_HOME\bin\jar.exe" xf <path-to>\cqf-fhir-cr-cli-4.7.0.jar BOOT-INF/lib
  Move-Item BOOT-INF/lib/*.jar ./lib; Remove-Item -Recurse BOOT-INF
  ```

**Build** (compiles `src/*.java` -> `out/`):
```powershell
./build.ps1
```

**Run the demos**
```powershell
./run_mock_client.ps1    # the reusable apply-client loop: patient-age + twostep, path a + b + guard
./run_age.ps1            # patient-age single-$apply recency cases a-f
./run_twostep.ps1        # twostep single-$apply progressive/pause cases
```

**Layout**
```
src/                      the 4 Java sources
policies/patient-age/     emitted patient-age def (fhir/ + cql/) — the "server" content
policies/twostep/         emitted twostep def (fhir/ + cql/)
build_defbundle.py        patient-age def bundle (imported by build_flow.py)
build_flow.py             patient-age server bundle (nothing / birthdate-adult / birthdate-child)
build_twostep.py          twostep server bundle (+ optional Q1/Q2 baseline answers)
build_age.py              patient-age a-f single-$apply case bundles
build.ps1 / _env.ps1      compile + shared portable env (JDK/lib/classpath resolution)
run_*.ps1                 the demo scripts (portable — no hardcoded paths)
work/                     generated data + logs (gitignored)
lib/                      cqf runtime jars (gitignored — you provide them)
```

Generated data and logs go under `work/` (gitignored); nothing is written outside this dir.

---

# Mock PlanDefinition-apply client — protocol map + reusable harness

> **Naming:** this tool is the **PlanDefinition-apply client** (it drives the FHIR
> **PlanDefinition/$apply** operation — general to CPG / prior-auth / etc., not DTR-specific).
> Earlier sections say "DTR client" / "$apply client"; read those as "PlanDefinition-apply client".
> **The FINAL reworked client + verification are in §10 — the authoritative spec.** §1–§9 are the
> protocol-mapping investigation that led to it.

Scope: drive the real cqf **PlanDefinition/$apply** (`$r5.apply`) interaction loop programmatically
against the emitted **patient-age** and **twostep** policies. cqf-fhir 4.7.0, JDK 23, R4 model /
`applyR5`. All findings below are backed by (1) cqf source/bytecode (`ApplyProcessor`) and (2) real
`$r5.apply` result JSON from experiments in this folder.

---

## 1. The `$apply` result shape (both flows)

`applyR5` returns a `Parameters` with ONE `parameter name="return"` whose `resource` is a
**Bundle** containing (for patient-age):

```
Parameters
└─ parameter "return" -> Bundle
     ├─ RequestGroup  id=<pd-id>                     status=active   (the DECISION; 1 grouping action, cqf-applicabilityBehavior "any")
     │     └─ action title="otherwise"|"Age 18 Or Older"  resource=RequestGroup/<pd>-{deny,approve}-recommendation
     ├─ CommunicationRequest id=<pd>-{deny,approve}   (the concrete disposition activity)
     ├─ RequestGroup  id=<pd>-{deny,approve}-recommendation  status=active
     │     └─ action title="Deny"|"Approve"  resource=CommunicationRequest/<pd>-{deny,approve}
     ├─ Questionnaire id=<pd-id>   url=<PD-DERIVED canonical>  version=0.0.0-<subject>-<yyyy-MM-dd-hh.mm.ss>
     └─ QuestionnaireResponse id=<pd-id>-<subject>  status=in-progress  questionnaire=<PD-DERIVED canonical>|<version>
```

Key facts:
- **The disposition is ALWAYS resolved in ONE call.** The top RequestGroup already
  references the fired recommendation RequestGroup → its CommunicationRequest. Reading the
  disposition = follow RequestGroup.action.resource → `CommunicationRequest/<pd>-{approve,deny}`.
- **A Questionnaire + a pre-populated (empty-answer) QuestionnaireResponse are ALWAYS emitted**
  for the case-feature input — even when the criterion already resolved from data (e.g.
  birthDate). They are an *offered input for a human to supply/override the local answer*,
  NOT a gate on termination.
- The generated **Questionnaire.url IS the PD-derived `$questionnaire` canonical**:
  the PD url with `/PlanDefinition/` → `/Questionnaire/`, e.g.
  `http://example.org/crl/patient-age/Questionnaire/patient-age-adult-eligibility-determination`,
  `version = 0.0.0-<subject-id>-<yyyy-MM-dd-hh.mm.ss>` (a **fresh timestamp every call**).
- The returned QR's `questionnaire` = that **versioned** canonical (no `#`).

### Flow A ("start with nothing" — Patient, no birthDate, no answer)
Result: disposition = **Deny** (computed age null ⇒ recency lattice "not determined" ⇒
`when` false ⇒ otherwise). Plus the Questionnaire + empty QR (answer=None).

### Flow B ("start with something" — Patient birthDate ≥18, no answer)
Result: disposition = **Approve** (computed age ≥18 ⇒ true). The Questionnaire + empty QR
are STILL emitted, IDENTICAL in shape to Flow A. **The only difference between A and B is the
fired disposition** — driven by the CQL reading `Patient.birthDate` directly, NOT by the QR.
(So "fewer questions when data is present" does NOT happen for this policy — the case feature
is always offered; the answer is simply pre-resolved by data.)

---

## 2. How a client supplies an answer to advance the NEXT `$apply`

Two mechanisms were tested:

### (a) Auto-extract via a contained QuestionnaireResponse — **does NOT reliably self-close**
`ApplyProcessor.initApply` (runs BEFORE CQL evaluation) auto-extracts a QR from the data
bundle, but ONLY if the QR passes strict gating:
- QR filter `lambda$initApply$0`: `QR.questionnaire` must `contains("#")` — i.e. reference a
  **contained** Questionnaire.
- QR→Questionnaire resolved via `Helpers.getQuestionnaireFromContained` (contained id after `#`).
- Questionnaire match `lambda$initApply$3/…`: the resolved Questionnaire's url/canonical must
  `equals` the **freshly-generated PD-derived canonical**, whose version carries a
  **per-call timestamp** (`0.0.0-<subject>-<yyyy-MM-dd-hh.mm.ss>`).

Because that timestamp is regenerated on every `$apply` call, a client cannot pre-build a
contained Questionnaire whose versioned canonical matches the next call's. **Empirically, the
contained-QR path did NOT move the disposition** in the mock loop (mechanism (a) always
fell through). This is the place the loop does NOT self-close.

Then, when it DOES match, `extractQuestionnaireResponse` calls
`QuestionnaireResponseProcessor.extract(...)` and `BundleHelper.addEntry(request.getData(), …)`
— i.e. the extracted Observation is injected into the same data bundle the CQL reads. Ordering:
**`applyR5` → `initApply` (filter QRs → extract → addEntry to data) → `applyPlanDefinition`
(CQL eval, sees the extracted Observation) → populate.**

### (b) Direct-data (`$extract` yourself → persist the Observation) — **WORKS, robust**
Run `QuestionnaireResponseProcessor.extract(Eithers.forRight(qr))` yourself (standalone —
this is `MainExtract`), take the extracted **Observation** (effectiveDateTime = QR.authored,
subject, age code, valueBoolean, meta.profile = the case-feature SD), and add it directly to
the `$apply` data bundle. The recency merge reads it. This is what a real DTR app does:
`$extract` → persist → `$apply`. **This mechanism always works** and is what the mock client
uses to advance.

---

## 3. Termination / LEAF detection

Because the disposition resolves in one call and the Questionnaire is always offered, LEAF is
**NOT** "no Questionnaire in the result". LEAF = **the disposition is stable for the client's
answer oracle**: the mock terminates when there is no further *unanswered* case-feature the
oracle can answer (or a max-iteration guard). The final RequestGroup + its CommunicationRequest
is the leaf disposition.

---

## 4. ⚠ Real emitted-CQL bug found by the loop: multi-Observation `sort by effective`

With **two or more** local age Observations in the data bundle, the emitted
`PatientAgeInferred.cql` recency subquery `Last((…) O where O.value is FHIR.boolean
sort by effective, id)` throws at RUNTIME on the cqf engine:

```
ERROR CqlEngine - Exception for Library: PatientAgeInterface,
      Message: Type org.hl7.fhir.r4.model.DateTimeType is not comparable
ERROR ProcessAction - Condition expression Age 18 Or Older encountered exception: … not comparable
```

The condition returns null ⇒ `when` false ⇒ **Deny** (the criterion silently fails regardless
of recency). With a SINGLE Observation there is nothing to sort, so it never surfaced in the
earlier a–f single-answer cases — it only appears once ≥2 rows must be COMPARED.

Root cause: `sort by effective` sorts by the raw `effective[x]` **choice** element, which the
engine sees as a non-comparable `DateTimeType` (the choice, not the unwrapped comparable value).
It PASSES cql-to-elm translation but FAILS at runtime on multi-row sort.

Likely fix (SOURCE change — out of harness scope; operator decision): sort by the unwrapped
value, e.g. `sort by (effective as FHIR.dateTime).value, id` (mirror the comparable cast the
lattice already uses in `recencyAgeAssertedWins`). The mock client works around it by keeping a
single answer Observation (stable id, replaced each iteration) — one answer per case feature is
the realistic client model anyway.

---

## 5. Files

- `MainR5.java`        — single `$r5.apply` (unchanged utility).
- `MainExtract.java`   — standalone `$questionnaire` generate + fill + `$extract`; writes the
                          extracted Observation. Proves the extract round-trip.
- `MockApplyClient.java` — the reusable mock `$apply` DTR client loop (below).
- `build_flow.py`      — minimal data bundles (nothing / birthdate-adult / birthdate-child).
- `build_defbundle.py` — the emitted closure bundle (Libraries w/ inlined CQL + SD/CodeSystem/PDs).
- `run_mock.ps1`       — runs the four demos.

## 6. `MockApplyClient` usage

```
java -cp "out;lib/*" MockApplyClient <dataBundle.json> <pdId> <patientRef> \
     "<question-key>=<bool>;…" <maxIters>
```
Oracle keys: the Questionnaire item's `text` (element path, e.g. `Observation.value[x]`) or the
enclosing group `text` (concept title, e.g. `Age 18 Or Older?`). The loop: applyR5 → read
disposition + outstanding Questionnaire → if the oracle can answer an unanswered item, try (a)
contained-QR auto-extract then (b) direct-data `$extract`→persist → re-apply → repeat to LEAF.

### Demonstrated on patient-age (traces)
- **Demo 1** start adult(≥18)=Approve, answer age `false` → **flips to Deny** via (b), then LEAF.
- **Demo 2** start adult(≥18), NO oracle → **Approve**, no answer, immediate LEAF.
- **Demo 3** start child(<18), NO oracle → **Deny**, immediate LEAF.
- **Demo 4** start-nothing (no birthDate)=not-determined→Deny, answer age `true` → **Approve** via (b), LEAF.

---

## 7. Multi-question (nested) policy — PROGRESSIVE vs ALL-UPFRONT

Tested with a two-criterion NESTED policy (`twostep`): `first: when Q1 then (first: when Q2
then Approve; otherwise Deny B); otherwise Deny A`. Q1, Q2 are directly-asserted `code is`
boolean case-features. Emit produces BOTH case-feature StructureDefinitions and nests the
inputs in the PlanDefinition: **Q1's input on the outer action, Q2's input on the nested
(Q1-gated) action** — so the recursive-input deferral (#180, which is about INFERRED `when`s)
does NOT apply to these directly-asserted nested `when`s; both inputs ARE generated.

### Answer: PROGRESSIVE (Q2 revealed only after Q1 answered).
Evidence from real `$r5.apply`:

- **Pass-1 (no answers):** the generated Questionnaire contains **ONLY Q1**:
  ```
  linkId=1 group "Q1?"  ├ linkId=1.1 boolean "Observation.value[x]"
  ```
  (Q2 is absent.) Disposition = Deny A (outer otherwise).
- **Pass-2 (Q1=true supplied):** the Questionnaire now contains **BOTH Q1 AND Q2**:
  ```
  linkId=1 group "Q1?"  ├ 1.1 boolean
  linkId=2 group "Q2?"  ├ 2.1 boolean      <-- revealed only after Q1=true routed into the nested branch
  ```
  Disposition = Deny B (Q1 true → nested branch → Q2 unanswered/false → Deny B).

So `$apply` walks the action tree and emits case-feature questions **for the branch the current
data routes into** — it does NOT offer every case feature in the whole tree upfront. Answering
an outer question and re-applying reveals the next-level questions.

### Mock client — PAUSE vs LEAF (multi-question)
`MockApplyClient` now keys answers by the Questionnaire GROUP TITLE (the unique concept, e.g.
`Q1?`/`Q2?`; the boolean-leaf text `Observation.value[x]` collides across concepts). Each answer
is a DISTINCT case-feature Observation built from that question's SD (code + profile resolved via
the group item's `definition`), value = the oracle boolean; answers ACCUMULATE. Terminal states:
- **LEAF** — no outstanding *unanswered* question remains (a disposition with the tree fully
  resolved for the oracle).
- **PAUSE** — an outstanding question remains that the oracle cannot answer; the client STOPS and
  returns the outstanding question(s) + the provisional (non-final) disposition, rather than
  forcing a leaf.

Demonstrated (traces printed by `run_twostep.ps1`):
- **Demo A** Q1=false → only Q1 ever offered → **Deny A** (LEAF); Q2 never asked.
- **Demo B** Q1=true, no Q2 answer → iter 1 offers Q1; iter 2 **reveals Q2** → **PAUSE** at Q2
  (provisional Deny B).
- **Demo C** Q1=true, Q2=true → Q2 revealed then answered → **Approve** (LEAF). Obs codes q1+q2.
- **Demo D** Q1=true, Q2=false → **Deny B** (LEAF).

### Files (multi-question)
- fixture: `<scratch>/twostep/src/crl/twostep.crl` (+ package.json); emitted to `<scratch>/twostep-out/`.
- `build_twostep.py` — twostep def bundle + optional Q1/Q2 answer Observations.
- `run_twostep.ps1` — the four demos above.

---

## 8. `$apply` SESSION / data-source semantics (stateless client recipe)

### Source (cqf 4.7.0, ApplyProcessor / PlanDefinitionProcessor)
`applyR5(... boolean useServerData, IBaseBundle data, ... IBaseResource dataEndpoint,
contentEndpoint, terminologyEndpoint)` wires TWO data channels:

1. **The repository ("server").** `PlanDefinitionProcessor.applyR5(...)` calls
   `Repositories.proxy(this.repository, useServerData, dataEndpoint, content, terminology)`
   → a `ProxyRepository` whose `data` field is chosen by `useServerData`:
   - `useServerData==true`, dataEndpoint present → `FederatedRepository(server, [dataEndpoint])`.
   - `useServerData==true`, no dataEndpoint     → the **server** repo.
   - `useServerData==false`                     → the **dataEndpoint** repo, or a FRESH EMPTY
     `InMemoryFhirRepository()` if none. **The server repository is NOT consulted.**
   The proxied repo replaces `this.repository`; the `LibraryEngine` is built over it.
2. **The `data` payload bundle.** Independently, CQL retrieves are federated with the passed
   `IBaseBundle data` via `Engines.forRepository(repo, settings, bundle)` →
   `buildDataProviders` ALWAYS builds a `FederatedDataProvider` over TWO
   `RepositoryRetrieveProvider`s: one on the (proxied) repo + one on
   `new InMemoryFhirRepository(ctx, dataBundle)`. So retrieves read (proxied repo) ∪ (payload).

Net: with `useServerData=false` + a `data` payload, retrieves see ONLY the payload (+ endpoints)
— the server is never queried. That is the **query-once / stable-session** mode.

### Harness proof (patient-age; birthDate ⇒ computed age)
- **Call 1** server repo = Patient birthDate ≥18, `useServerData=true`, no payload → **Approve**
  (resolved age from the server).
- **Call 2b (control)** server MUTATED to birthDate <18, `useServerData=true` → **Deny**
  — re-queried the server, reflects the mutation.
- **Call 2a (stable)** server MUTATED to <18, `useServerData=FALSE`, payload = adult Patient
  → **Approve** — tracks the PAYLOAD, IGNORES the mutated repo. ✓ stable session.

**Operator's model is CORRECT for `useServerData=false`:** the engine reads the payload, not the
live server, so a mid-session server update does not change the result ("bounce the client" =
call again with `useServerData=true` to re-query).

### Does the response carry the queried data back? NO — the client must own it.
The Call-1 response `Parameters.return` Bundle contains only **RequestGroup(s) +
CommunicationRequest + Questionnaire + QuestionnaireResponse**. It carries **NO Patient and NO
Observation** back, and the returned **QR is EMPTY** (answers = None) — it is NOT pre-populated
with the queried/computed value. So the queried data is NOT echoed; a stateless client must
carry the clinical data itself in the next payload.

### (a) server-side extract of the returned QR — FAILS, not salvageable (in this apply path)
Putting a filled QR into call-2's `$apply` data bundle does NOT get auto-extracted. `initApply`
selects a QR only via one of:
- **referenced path** — `QR.getQuestionnaire().equals(<derivedUrl>|<pdVersion>-<timestamp>)`
  where `<derivedUrl>` = PD url with `/PlanDefinition/`→`/Questionnaire/` and the version is
  rebuilt EACH CALL as `"<pdVersion>-" + new SimpleDateFormat("yyyy-MM-dd-hh.mm.ss").format(now)`
  (ApplyProcessor.initApply, offsets ~193-270). The per-call timestamp means a RETURNED QR
  (old timestamp) never matches.
- **contained path** — `QR.getQuestionnaire().contains("#")` + a contained Questionnaire whose
  `getUrl().equals(<derivedUrl>)`.

Exact checks (bytecode `equals`/`contains`):
```
lambda$initApply$0:  QR.hasQuestionnaire() && QR.getQuestionnaire().contains("#")
lambda$initApply$4:  QR.getQuestionnaire().equals( <derivedUrl>|<pdVersion>-<fresh-timestamp> )
lambda$initApply$3:  Questionnaire.getUrl().equals( <derivedUrl> )
```
Tested FOUR QR forms against `$apply` (server has no birthDate; QR answers age=TRUE → extract
would flip to Approve): **all → Deny (NOT extracted):**
- verbatim returned canonical (old timestamp) — no.
- versionless bare canonical — no.
- contained Questionnaire (with version) `questionnaire=#id` — no.
- contained Questionnaire (url = derived base, version removed) `questionnaire=#id` — no.

So "hand the QR back, server extracts" is NOT usable here.

### (b) client-side extract — CONFIRMED, this is the recipe
Client runs `QuestionnaireResponseProcessor.extract(Eithers.forRight(qr))` on the returned+filled
QR → an `age-18-or-older` Observation (valueBoolean=true, effectiveDateTime=authored). Put that
Observation into call-2's `data` payload with `useServerData=false` → **Approve** (the extracted
answer drives the decision; the mutated server is ignored). ✓

### Stateless client recipe
1. **Call 1:** `applyR5(useServerData=true, data=<any client-held resources>)` → the server (+
   payload) resolves; response gives the RequestGroup disposition + a Questionnaire + empty QR.
   The client must retain its own clinical resources (the response does not echo them).
2. **Human fills the QR.** Client runs **`$extract` locally** → answer Observation(s).
3. **Call 2..N:** `applyR5(useServerData=false, data = prior resources + new extracted
   Observation(s))` → stable, payload-driven; re-querying the server only happens if you set
   `useServerData=true` ("bounce to refresh"). Server-side auto-extract of a handed-back QR is
   NOT available (per-call-timestamp canonical gate) — client-side extract is mandatory.

### Files (session)
- `MainR5Data.java` — apply with explicit repo bundle + `data` payload + `useServerData` flag.
- `build_session.py` / `build_qr_variants.py` / `build_ii_clean.py` — the session + (a)-salvage bundles.

---

## 9. CORRECTION — (a) server-side extract IS VIABLE (I formed the request wrong in §8)

§8's "(a) fails" conclusion was WRONG. It failed because my earlier harness (`MainR5`) loaded
the QR into the REPOSITORY and passed the `data` payload as null. `ApplyProcessor.initApply`
extracts from `ApplyRequest.getQuestionnaireResponses()`, which reads ONLY `request.getData()`
(the `data`/`additionalData` PAYLOAD), NOT the repository:
```java
// ApplyRequest.getQuestionnaireResponses()  (v4.7.0) — NO url/# filter; EVERY QR in `data`:
data == null ? [] : getEntryResources(data).stream()
    .filter(r -> r.fhirType().equals("QuestionnaireResponse")).map(...).toList();

// ApplyProcessor.extractQuestionnaireResponse(...) — iterates ALL of them, extracts EACH:
responses.forEach(qr -> { var extractBundle = extractProcessor.extract(
    Eithers.forRight(qr.get()), <questionnaire hint or null>, params, request.getData(), libraryEngine);
    for (var entry : getEntry(extractBundle)) addEntry(request.getData(), entry); });
```
Ordering: `applyR5(request)` → `initApply` (extract → `addEntry` into `request.getData()`, which
`BundleHelper.addEntry` mutates IN PLACE) → `applyPlanDefinition` → conditions eval via
`request.getLibraryEngine().resolveExpression(..., request.getData(), ...)` — the LIVE post-extract
bundle. So the extracted Observation IS visible to the CQL.

cqf's own test `PlanDefinitionProcessorTests.generateQuestionnaireR4()` proves the flow: it takes
the QR returned by call-1, wraps it in a Bundle, and passes it via `additionalData(bundle)` to a
second apply.

### derivedUrl (Part 2)
`ApplyProcessor.initApply`: `var questionnaireUrl = url.replace("/PlanDefinition/", "/Questionnaire/");`
For our PD:
```
PD.url     = http://example.org/crl/patient-age/PlanDefinition/patient-age-adult-eligibility-determination
derivedUrl = http://example.org/crl/patient-age/Questionnaire/patient-age-adult-eligibility-determination
```

### What actually gates extraction — empirical (QR in the `data` PAYLOAD, server has NO birthDate;
extract firing ⇒ Approve, else Deny):
| QR form (in `data` payload) | result |
|---|---|
| CONTAINED Questionnaire, `questionnaire="#id"`, WITH version | **Approve** (extracted) |
| CONTAINED Questionnaire, `questionnaire="#id"`, NO version   | **Approve** (extracted) |
| referenced, `questionnaire="<derivedUrl>"` (bare)            | Deny (not extracted) |
| referenced, `questionnaire="<derivedUrl>|<version>"`         | Deny (not extracted) |
| referenced canonical + the Questionnaire resource ALSO in payload | Deny (not extracted) |

⇒ The QR must (1) live in the `data`/`additionalData` PAYLOAD (not the repo) AND (2) CONTAIN its
Questionnaire (`questionnaire="#id"` + `contained:[Questionnaire]`). Version optional; the contained
Questionnaire's `url` = derivedUrl (as returned). Referenced-canonical QRs do NOT extract (extract
can't resolve the versioned/bare canonical to a persisted Questionnaire).

### Full cross-call recipe (VERIFIED end-to-end)
1. **Call 1** `applyR5(useServerData=true, data=<held resources>)` → disposition + a generated
   Questionnaire + a REFERENCED empty QR (`questionnaire=<derivedUrl>|<version>`).
2. **Client re-packages:** move the returned Questionnaire into the QR's `contained`, set
   `QR.questionnaire = "#<containedId>"`, fill the answers, `status=completed`.
3. **Call 2** `applyR5(useServerData=..., data = prior resources + the contained QR)` → the server
   AUTO-EXTRACTS the QR into the answer Observation(s) → drives the decision.
   Verified: Call 1 (no birthDate) → Deny; re-package with age=true → Call 2 → **Approve**.

So BOTH mechanisms work: **(a) server-side extract** (QR must be contained + in the `data` payload)
AND **(b) client-side `$extract`** (§8b). (a) needs one client transform (re-containment of the
returned referenced QR); (b) needs a local `$extract` call. Either yields the correct decision.

### Files
- `MainR5Data.java` (repo + `data` payload + useServerData), `ExtractQr.java`/`ExtractQr5.java`
  (standalone extract probes), and the rt-* / qr-* payload builders above.

---

## 10. FINAL — the reusable PlanDefinition-apply client (authoritative)

`MockApplyClient.java` drives the real cqf `PlanDefinition/$apply` loop generically.

### Model
- **Two bundles, kept separate:**
  - `repo` — the stable "server": the emitted def resources + the subject Patient (+ any
    baseline clinical data). Backs the `InMemoryFhirRepository`.
  - `payload` — starts EMPTY, accumulates the CLIENT-CARRIED answers (re-contained QRs, or
    extracted Observations in `--mode extract`). Passed as the `data` PAYLOAD.
  - The answer QRs MUST be in the `payload`, NOT the `repo`: cqf's `getQuestionnaireResponses()`
    reads only the payload, and (empirically) a QR that ALSO sits in the repo is NOT extracted.
  - `useServerData=true` federates repo ∪ payload; an EMPTY payload is passed as `null`
    (an empty `data` bundle trips the populate-step resolver).

### Loop (per iteration)
1. `applyR5(useServerData=true, repo, data=payload)` → read the disposition + the offered
   Questionnaire + the returned (referenced, empty) QR.
2. Determine offered questions (by GROUP title = the unique concept) and which are unanswered.
3. If the oracle can answer an offered-unanswered question:
   - **Path (a) DEFAULT — server-side extract via re-contained QR:** take the returned
     Questionnaire, put it in `QR.contained`, set `QR.questionnaire="#<id>"`, set the contained
     Questionnaire's `url = derivedUrl` (`PD.url.replace("/PlanDefinition/","/Questionnaire/")`),
     fill the answer(s), `status=completed`; **BEFORE-guard** it; add it to `payload`.
   - **Path (b) `--mode extract`:** run `QuestionnaireResponseProcessor.extract` on the filled QR
     yourself, push the extracted Observation into `payload` (no re-containment).
   - re-`applyR5`; **AFTER-guard**; loop.
4. Terminate: **LEAF** (no offered-unanswered question the oracle knows) or **PAUSE** (an
   offered-unanswered question the oracle CANNOT answer → stop, return it + provisional disposition).

### Guards (explicit, loud — cover reasons 1 & 2)
- **BEFORE (`guardReContainedQr`)**: the re-contained QR must match the extraction gate —
  `QR.questionnaire` starts with `#`, resolves to a contained Questionnaire, and that
  Questionnaire's `url == derivedUrl`. Else `IllegalStateException("GUARD FAILED …")`.
- **AFTER**: the supplied answer must have TAKEN EFFECT — the question must NOT still be
  offered-unanswered on the next apply. (Checks "answer registered", NOT "disposition changed",
  because a `false` answer legitimately keeps the same disposition.) A silent extract-skip →
  `IllegalStateException` naming the gate to check.

### Usage
```
java -cp "out;lib/*" MockApplyClient <serverBundle.json> <pdId> <patientRef> \
     "<GroupTitle>=<bool>;…" <maxIters> [--mode extract] [--malform-referenced]
```
- Oracle keyed by the Questionnaire GROUP title (unique concept, e.g. `Age 18 Or Older?`, `Q1?`).
- `--mode extract` → path (b). `--malform-referenced` → TEST-ONLY: leaves the QR referenced so the
  BEFORE-guard fires (proves the guard).

### Verified (run_mock_client.ps1), path (a) primary
| policy / case | result |
|---|---|
| patient-age, no birthDate + age=TRUE | Approve (LEAF), extracted via re-contained QR |
| patient-age, no birthDate + age=FALSE | Deny (LEAF), answer registered |
| patient-age, `--mode extract`, age=TRUE | Approve (LEAF) — path (b) cross-check |
| twostep, Q1=true / no Q2 | Q2 revealed progressively → **PAUSE** at Q2 |
| twostep, Q1=true;Q2=true | Approve (LEAF), progressive (Q1→Q2) |
| twostep, Q1=false | Deny A (LEAF), Q2 never asked |
| GUARD TEST `--malform-referenced` | **LOUD `GUARD FAILED`** + non-zero exit ✓ |

### File set
See the **Layout** table in the top **Setup & run** section for the file inventory. In brief:
`src/` = the 4 Java sources (MockApplyClient + the MainR5 / MainR5Data / MainExtract utilities);
`build_{defbundle,flow,twostep,age}.py` = the data builders the run scripts invoke;
`policies/{patient-age,twostep}/` = the emitted def content ("server"); `build.ps1` / `_env.ps1`
= compile + portable env; `run_*.ps1` = the demos; `work/` + `lib/` + `out/` are gitignored.
