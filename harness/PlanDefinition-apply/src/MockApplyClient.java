import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import ca.uhn.fhir.context.FhirContext;
import org.hl7.fhir.instance.model.api.IBaseBundle;
import org.hl7.fhir.instance.model.api.IBaseParameters;
import org.hl7.fhir.instance.model.api.IBaseDatatype;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.BooleanType;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.CommunicationRequest;
import org.hl7.fhir.r4.model.DateTimeType;
import org.hl7.fhir.r4.model.IdType;
import org.hl7.fhir.r4.model.Observation;
import org.hl7.fhir.r4.model.Parameters;
import org.hl7.fhir.r4.model.Questionnaire;
import org.hl7.fhir.r4.model.QuestionnaireResponse;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.RequestGroup;
import org.hl7.fhir.r4.model.Resource;

import org.opencds.cqf.fhir.utility.repository.InMemoryFhirRepository;
import org.opencds.cqf.fhir.cr.plandefinition.PlanDefinitionProcessor;
import org.opencds.cqf.fhir.cr.questionnaireresponse.QuestionnaireResponseProcessor;
import org.opencds.cqf.fhir.utility.monad.Eithers;

/**
 * Reusable MOCK PlanDefinition-apply CLIENT — drives the real cqf PlanDefinition/$apply
 * ($r5.apply) interaction loop programmatically (the operation is general: CPG /
 * prior-auth / etc., not DTR-specific).
 *
 * PRIMARY PATH (a) — server-side extract via a RE-CONTAINED QuestionnaireResponse.
 * Each iteration:
 *   1. applyR5(useServerData=false, data = accumulated resources) → read the fired
 *      disposition + the offered Questionnaire + the returned (REFERENCED) empty QR.
 *   2. If the answer-oracle can answer an offered-but-unanswered question:
 *      take the returned QR and RE-CONTAIN it — move the generated Questionnaire into
 *      QR.contained, set QR.questionnaire = "#<id>", fill the answer(s), status=completed
 *      — then GUARD it (see below), add it to the data payload (accumulate), and
 *      re-applyR5. The server AUTO-EXTRACTS the contained QR into the answer
 *      Observation(s), which drive the next iteration's decision.
 *   3. Terminate at a LEAF (no offered-unanswered question the oracle knows) or PAUSE
 *      (an offered-unanswered question the oracle CANNOT answer).
 *
 * The gate (cqf ApplyProcessor.initApply / getQuestionnaireResponses): a QR is only
 * extracted if it is in the `data` PAYLOAD (not the repo) and — for a cross-call QR —
 * CONTAINS its Questionnaire (`questionnaire="#id"`), whose url == the derivedUrl
 * (PD.url with /PlanDefinition/ -> /Questionnaire/). A referenced-canonical QR is NOT
 * extracted (the versioned/bare canonical won't resolve). Hence the re-containment.
 *
 * GUARDS (explicit — no silent footgun):
 *   - BEFORE sending: the re-contained QR must be well-formed against the gate —
 *     `questionnaire` starts with '#', the id resolves to a contained Questionnaire,
 *     and that Questionnaire's url == derivedUrl. Fail LOUD otherwise.
 *   - AFTER applying: the disposition must ADVANCE as the oracle expects (the answer
 *     took effect). If a silent extract-skip left it unchanged when it should have
 *     moved, FAIL LOUD.
 *
 * --mode extract → PATH (b): the client runs QuestionnaireResponseProcessor.extract on
 * the filled QR itself and pushes the extracted Observation into the payload (no
 * re-containment / no server-side extract). Kept for cross-checking.
 *
 * args: <dataBundle.json> <pdId> <patientRef> <oracle: "Title=bool;..."> <maxIters> [--mode extract]
 * The oracle is keyed by the Questionnaire GROUP title (the unique concept, e.g. "Q1?"/
 * "Age 18 Or Older?"); the boolean-leaf text "Observation.value[x]" collides across concepts.
 */
public class MockApplyClient {
    static FhirContext ctx = FhirContext.forR4Cached();

    public static void main(String[] args) throws Exception {
        String dataFile = args[0];
        String pdId = args[1];
        String patientRef = args[2];
        Map<String, Boolean> oracle = parseOracle(args.length > 3 ? args[3] : "");
        int maxIters = args.length > 4 ? Integer.parseInt(args[4]) : 6;
        boolean modeExtract = List.of(args).contains("--mode") && argAfter(args, "--mode").equals("extract");
        // TEST-ONLY: deliberately leave the QR REFERENCED (not contained) to prove the
        // BEFORE-guard fires loud on a malformed (un-extractable) QR.
        boolean malformReferenced = List.of(args).contains("--malform-referenced");

        String json = new String(Files.readAllBytes(Paths.get(dataFile)), java.nio.charset.StandardCharsets.UTF_8);
        // The input bundle is the "server" repo (def + subject + baseline data). The answer
        // PAYLOAD starts EMPTY and accumulates the re-contained QRs / extracted Observations.
        Bundle repo = ctx.newJsonParser().parseResource(Bundle.class, json);
        Bundle payload = new Bundle().setType(Bundle.BundleType.COLLECTION);

        String derivedUrl = deriveQuestionnaireUrl(repo, pdId);

        System.out.println("### MockApplyClient loop: PD=" + pdId + " subject=" + patientRef
                + " | path=" + (modeExtract ? "(b) client-side $extract" : "(a) server-side extract via re-contained QR"));
        System.out.println("### oracle=" + oracle + " | derivedUrl=" + derivedUrl);

        List<String> trace = new ArrayList<>();
        Set<String> answeredKeys = new HashSet<>();
        String lastDisposition = null;
        String terminalState = "UNKNOWN";

        for (int iter = 1; iter <= maxIters; iter++) {
            Bundle result = applyForResult(repo, payload, pdId, patientRef);
            String disposition = readDisposition(result);
            Questionnaire q = firstOf(result, Questionnaire.class);
            QuestionnaireResponse qr = firstOf(result, QuestionnaireResponse.class);
            lastDisposition = disposition;

            List<String> offered = groupTitles(q);
            List<String> unanswered = unansweredGroups(q, qr);
            System.out.println(String.format(
                "--- iter %d: disposition=%s | offeredQuestions=%s | unanswered=%s",
                iter, disposition, offered, unanswered));

            // First offered-unanswered question the oracle can answer.
            String toAnswer = null;
            Boolean answerVal = null;
            for (String key : unanswered) {
                if (oracle.containsKey(key) && !answeredKeys.contains(key)) {
                    toAnswer = key; answerVal = oracle.get(key); break;
                }
            }

            if (toAnswer == null) {
                List<String> stillOpen = new ArrayList<>();
                for (String key : unanswered) if (!answeredKeys.contains(key)) stillOpen.add(key);
                if (stillOpen.isEmpty()) {
                    terminalState = "LEAF";
                    trace.add(String.format("iter %d: no offered-unanswered question -> LEAF disposition=%s", iter, disposition));
                    System.out.println("### LEAF reached. disposition=" + disposition);
                } else {
                    terminalState = "PAUSE";
                    trace.add(String.format("iter %d: PAUSE — offered-unanswered %s the oracle cannot answer; provisional disposition=%s",
                            iter, stillOpen, disposition));
                    System.out.println("### PAUSE — awaiting answer to " + stillOpen + " (provisional disposition=" + disposition + ")");
                }
                break;
            }
            answeredKeys.add(toAnswer);

            String newDisposition;
            String mechanism;
            QuestionnaireResponse filled = reContainAndFill(q, qr, patientRef, oracle, iter, derivedUrl);
            if (modeExtract) {
                // (b) client-side $extract → push the Observation into the payload directly.
                // Extract needs the def/SD in the repo, so run it against `repo`.
                Observation obs = extractOneObservation(repo, filled);
                if (obs == null) {
                    throw new IllegalStateException(String.format(
                        "iter %d: (b) client $extract produced NO Observation for '%s' — cannot advance", iter, toAnswer));
                }
                String obsId = "answer-obs-" + safe(toAnswer);
                obs.setId(obsId);
                removeById(payload, obsId);
                payload.addEntry().setResource(obs);
                mechanism = "(b) client $extract -> Observation(code=" + codeOf(obs) + ")";
            } else {
                // (a) server-side extract via a RE-CONTAINED QR added to the PAYLOAD (not the repo).
                if (malformReferenced) {
                    // TEST: break the containment (reference the canonical instead) so the
                    // BEFORE-guard catches an un-extractable QR.
                    filled.getContained().clear();
                    filled.setQuestionnaire(derivedUrl);
                }
                guardReContainedQr(filled, derivedUrl, iter);              // BEFORE-guard (loud)
                String qrId = "answer-qr-" + safe(toAnswer);
                removeById(payload, qrId);
                filled.setId(qrId);
                payload.addEntry().setResource(filled);
                mechanism = "(a) server-side extract via re-contained QR (in `data` payload)";
            }

            Bundle afterResult = applyForResult(repo, payload, pdId, patientRef);
            newDisposition = readDisposition(afterResult);

            // AFTER-guard (loud): the answer must have TAKEN EFFECT — i.e. the case-feature
            // is now ANSWERED (the extract consumed the QR / the Observation is read), so the
            // question `toAnswer` must NO LONGER be offered-unanswered. A `false` answer may
            // legitimately keep the same disposition, so we check "answer registered", NOT
            // "disposition changed". If the question is STILL unanswered after we supplied it,
            // a silent extract-skip happened — fail rather than loop pointlessly.
            List<String> stillUnansweredAfter = unansweredGroups(
                    firstOf(afterResult, Questionnaire.class), firstOf(afterResult, QuestionnaireResponse.class));
            if (stillUnansweredAfter.contains(toAnswer)) {
                throw new IllegalStateException(String.format(
                    "iter %d: answered '%s'=%s via %s but it is STILL offered-unanswered afterwards — "
                    + "the answer was NOT applied (silent extract-skip). Check the gate: contained QR in the `data` "
                    + "payload (NOT the repo), contained Questionnaire.url == derivedUrl (%s).",
                    iter, toAnswer, answerVal, mechanism, derivedUrl));
            }

            trace.add(String.format("iter %d: answered '%s'=%s -> %s -> disposition %s => %s",
                    iter, toAnswer, answerVal, mechanism, disposition, newDisposition));
            lastDisposition = newDisposition;
        }

        System.out.println("\n### TERMINAL STATE = " + terminalState + " | FINAL disposition = " + lastDisposition);
        System.out.println("### TRACE:");
        for (String t : trace) System.out.println("  " + t);
        System.out.println("### FINAL payload (client-carried answers):");
        for (Bundle.BundleEntryComponent e : payload.getEntry()) {
            Resource r = (Resource) e.getResource();
            if (r instanceof Observation o) {
                System.out.println("  Observation id=" + o.getIdElement().getIdPart()
                        + " code=" + codeOf(o)
                        + " value=" + (o.hasValueBooleanType() ? o.getValueBooleanType().getValue() : "?"));
            } else if (r instanceof QuestionnaireResponse qrr) {
                System.out.println("  QuestionnaireResponse id=" + qrr.getIdElement().getIdPart()
                        + " questionnaire=" + qrr.getQuestionnaire() + " status=" + qrr.getStatus());
            }
        }
    }

    // ---- (a) build the re-contained, filled QR from the returned Questionnaire + QR ----
    static QuestionnaireResponse reContainAndFill(
            Questionnaire q, QuestionnaireResponse returnedQr, String patientRef,
            Map<String, Boolean> oracle, int iter, String derivedUrl) {
        Questionnaire contained = q.copy();
        contained.setId("q-" + iter);
        contained.setUrl(derivedUrl);       // ensure url == derivedUrl (the gate)
        QuestionnaireResponse qr = new QuestionnaireResponse();
        qr.addContained(contained);
        qr.setQuestionnaire("#q-" + iter);
        qr.setStatus(QuestionnaireResponse.QuestionnaireResponseStatus.COMPLETED);
        qr.setAuthored(new java.util.Date());
        qr.setSubject(new Reference(patientRef));
        for (Questionnaire.QuestionnaireItemComponent it : q.getItem()) {
            answerItem(qr.addItem(), it, null, oracle);
        }
        return qr;
    }

    // BEFORE-guard: assert the re-contained QR matches the extraction gate. Loud on failure.
    static void guardReContainedQr(QuestionnaireResponse qr, String derivedUrl, int iter) {
        String ref = qr.getQuestionnaire();
        if (ref == null || !ref.startsWith("#")) {
            throw new IllegalStateException(String.format(
                "iter %d: GUARD FAILED — QR.questionnaire=%s is not a contained ('#') reference; "
                + "cqf will NOT extract a referenced-canonical QR.", iter, ref));
        }
        String cid = ref.substring(1);
        Questionnaire contained = null;
        for (Resource r : qr.getContained()) {
            if (r instanceof Questionnaire cq && cid.equals(cq.getIdElement().getIdPart())) contained = cq;
        }
        if (contained == null) {
            throw new IllegalStateException(String.format(
                "iter %d: GUARD FAILED — QR.questionnaire=%s does not resolve to a contained Questionnaire.", iter, ref));
        }
        if (!derivedUrl.equals(contained.getUrl())) {
            throw new IllegalStateException(String.format(
                "iter %d: GUARD FAILED — contained Questionnaire.url=%s != derivedUrl=%s; the server won't match it.",
                iter, contained.getUrl(), derivedUrl));
        }
    }

    static void answerItem(QuestionnaireResponse.QuestionnaireResponseItemComponent ri,
                           Questionnaire.QuestionnaireItemComponent qi, String parentGroupTitle,
                           Map<String, Boolean> oracle) {
        ri.setLinkId(qi.getLinkId());
        String groupTitle = (qi.getType() == Questionnaire.QuestionnaireItemType.GROUP && qi.hasText())
                ? qi.getText() : parentGroupTitle;
        if (qi.hasItem()) for (Questionnaire.QuestionnaireItemComponent sub : qi.getItem())
            answerItem(ri.addItem(), sub, groupTitle, oracle);
        if (qi.getType() == Questionnaire.QuestionnaireItemType.BOOLEAN) {
            Boolean v = null;
            if (qi.hasText() && oracle.containsKey(qi.getText())) v = oracle.get(qi.getText());
            else if (groupTitle != null && oracle.containsKey(groupTitle)) v = oracle.get(groupTitle);
            if (v != null) ri.addAnswer().setValue(new BooleanType(v));
        }
    }

    // ---- $apply invocations ----
    // Loop apply: TWO bundles, kept SEPARATE deliberately.
    //   repo    — the stable "server": def resources + the subject (+ any baseline clinical
    //             data). Backs the InMemoryFhirRepository (subject/def resolution).
    //   payload — the accumulating CLIENT-CARRIED answers: the re-contained QRs and/or
    //             extracted Observations. Passed as the `data` PAYLOAD.
    // The answer QRs MUST be in the payload, NOT the repo: cqf's
    // getQuestionnaireResponses() reads only the payload, and (empirically) a QR that ALSO
    // sits in the repository is NOT auto-extracted. useServerData=true federates repo ∪
    // payload so retrieves see both. Returns the result Bundle.
    static Bundle applyForResult(Bundle repo, Bundle payload, String pdId, String subject) {
        InMemoryFhirRepository fhirRepo = new InMemoryFhirRepository(ctx, repo.copy());
        PlanDefinitionProcessor proc = new PlanDefinitionProcessor(fhirRepo);
        // Pass null (not an empty Bundle) when there are no client-carried answers yet —
        // an empty `data` bundle trips the populate-step resolver.
        IBaseBundle payloadArg = payload.getEntry().isEmpty() ? null : (IBaseBundle) payload.copy();
        IBaseParameters params = proc.applyR5(
                Eithers.forMiddle3(new IdType("PlanDefinition", pdId)),
                List.of(subject),
                (String) null, (String) null, (String) null,
                (IBaseDatatype) null, (IBaseDatatype) null, (IBaseDatatype) null,
                (IBaseDatatype) null, (IBaseDatatype) null,
                (IBaseParameters) null,
                true,                                     // useServerData=true (repo resolves subject/def)
                payloadArg,                               // the accumulated answer PAYLOAD (extract path)
                (List<? extends org.hl7.fhir.instance.model.api.IBaseBackboneElement>) null,
                (IBaseResource) null, (IBaseResource) null, (IBaseResource) null);
        return firstBundle((Parameters) params);
    }

    // (b) standalone $extract of a QR → its single Observation.
    static Observation extractOneObservation(Bundle data, QuestionnaireResponse qr) {
        InMemoryFhirRepository repo = new InMemoryFhirRepository(ctx, data.copy());
        QuestionnaireResponseProcessor qrp = new QuestionnaireResponseProcessor(repo);
        IBaseBundle eb = qrp.extract(Eithers.forRight(qr));
        for (Bundle.BundleEntryComponent e : ((Bundle) eb).getEntry()) {
            if (e.getResource() instanceof Observation o) return o;
        }
        return null;
    }

    // ---- derivedUrl (PD.url with /PlanDefinition/ -> /Questionnaire/) ----
    static String deriveQuestionnaireUrl(Bundle data, String pdId) {
        for (Bundle.BundleEntryComponent e : data.getEntry()) {
            if (e.getResource() instanceof org.hl7.fhir.r4.model.PlanDefinition pd
                    && pdId.equals(pd.getIdElement().getIdPart()) && pd.hasUrl()) {
                return pd.getUrl().replace("/PlanDefinition/", "/Questionnaire/");
            }
        }
        throw new IllegalStateException("PlanDefinition/" + pdId + " (with a url) not found in the data bundle");
    }

    // ---- result helpers ----
    static Bundle firstBundle(Parameters p) {
        for (Parameters.ParametersParameterComponent pp : p.getParameter()) {
            if (pp.getResource() instanceof Bundle) return (Bundle) pp.getResource();
        }
        throw new RuntimeException("no return Bundle in Parameters");
    }

    static <T extends Resource> T firstOf(Bundle b, Class<T> cls) {
        for (Bundle.BundleEntryComponent e : b.getEntry()) {
            if (cls.isInstance(e.getResource())) return cls.cast(e.getResource());
        }
        return null;
    }

    static Bundle removeById(Bundle b, String id) {
        b.getEntry().removeIf(e -> e.getResource() != null
                && id.equals(e.getResource().getIdElement().getIdPart()));
        return b;
    }

    static String codeOf(Observation o) {
        return o.hasCode() && !o.getCode().getCoding().isEmpty() ? o.getCode().getCodingFirstRep().getCode() : "?";
    }

    // Follow the top RequestGroup -> child action -> recommendation RequestGroup ->
    // CommunicationRequest to read the concrete disposition (approve/deny/...).
    static String readDisposition(Bundle b) {
        Map<String, RequestGroup> rgs = new HashMap<>();
        for (Bundle.BundleEntryComponent e : b.getEntry()) {
            if (e.getResource() instanceof RequestGroup rg) rgs.put(rg.getIdElement().getIdPart(), rg);
        }
        List<String> dispositions = new ArrayList<>();
        for (RequestGroup rg : rgs.values()) {
            for (RequestGroup.RequestGroupActionComponent a : allActions(rg)) {
                if (a.hasResource()) {
                    String ref = a.getResource().getReference();
                    if (ref != null && ref.startsWith("CommunicationRequest/")) {
                        dispositions.add(ref.substring("CommunicationRequest/".length()));
                    }
                }
            }
        }
        return dispositions.isEmpty() ? "NONE" : String.join(",", dispositions);
    }

    static List<RequestGroup.RequestGroupActionComponent> allActions(RequestGroup rg) {
        List<RequestGroup.RequestGroupActionComponent> out = new ArrayList<>();
        collect(rg.getAction(), out);
        return out;
    }
    static void collect(List<RequestGroup.RequestGroupActionComponent> acts,
                        List<RequestGroup.RequestGroupActionComponent> out) {
        for (RequestGroup.RequestGroupActionComponent a : acts) { out.add(a); if (a.hasAction()) collect(a.getAction(), out); }
    }

    // Offered case-feature questions, keyed by GROUP title (the unique concept).
    static List<String> groupTitles(Questionnaire q) {
        List<String> out = new ArrayList<>();
        if (q == null) return out;
        for (Questionnaire.QuestionnaireItemComponent it : q.getItem()) {
            if (it.getType() == Questionnaire.QuestionnaireItemType.GROUP && it.hasText()) out.add(it.getText());
        }
        return out;
    }

    // Offered groups whose boolean leaf has NO answer in the returned QR.
    static List<String> unansweredGroups(Questionnaire q, QuestionnaireResponse qr) {
        List<String> out = new ArrayList<>();
        if (q == null) return out;
        Map<String, Boolean> answered = new HashMap<>();
        if (qr != null) for (QuestionnaireResponse.QuestionnaireResponseItemComponent gi : qr.getItem()) {
            boolean any = false;
            for (QuestionnaireResponse.QuestionnaireResponseItemComponent sub : gi.getItem()) if (sub.hasAnswer()) any = true;
            answered.put(gi.getLinkId(), any);
        }
        for (Questionnaire.QuestionnaireItemComponent it : q.getItem()) {
            if (it.getType() == Questionnaire.QuestionnaireItemType.GROUP && it.hasText()) {
                if (!answered.getOrDefault(it.getLinkId(), false)) out.add(it.getText());
            }
        }
        return out;
    }

    static String safe(String s) { return s.replaceAll("[^A-Za-z0-9]", "-"); }

    static String argAfter(String[] args, String flag) {
        for (int i = 0; i < args.length - 1; i++) if (args[i].equals(flag)) return args[i + 1];
        return "";
    }

    static Map<String, Boolean> parseOracle(String s) {
        Map<String, Boolean> m = new HashMap<>();
        if (s == null || s.isBlank() || s.startsWith("--")) return m;
        for (String kv : s.split(";")) {
            int i = kv.lastIndexOf('=');
            if (i > 0) m.put(kv.substring(0, i).trim(), Boolean.parseBoolean(kv.substring(i + 1).trim()));
        }
        return m;
    }
}
