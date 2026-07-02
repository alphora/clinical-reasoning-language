import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Date;
import java.util.List;

import ca.uhn.fhir.context.FhirContext;
import org.hl7.fhir.instance.model.api.IBaseBundle;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.DateTimeType;
import org.hl7.fhir.r4.model.IdType;
import org.hl7.fhir.r4.model.Questionnaire;
import org.hl7.fhir.r4.model.QuestionnaireResponse;
import org.hl7.fhir.r4.model.Reference;

import org.opencds.cqf.fhir.utility.repository.InMemoryFhirRepository;
import org.opencds.cqf.fhir.cr.questionnaire.QuestionnaireProcessor;
import org.opencds.cqf.fhir.cr.questionnaireresponse.QuestionnaireResponseProcessor;
import org.opencds.cqf.fhir.utility.monad.Eithers;

/**
 * Full DTR round-trip harness (Part B / Step 4): generate the Questionnaire from
 * the emitted "Age 18 Or Older" case-feature StructureDefinition, then run
 * SDC $extract on a hand-filled QuestionnaireResponse and INSPECT the extracted
 * Observation (effectiveDateTime = QR.authored, subject, age code, valueBoolean,
 * meta.profile). This isolates the extract step so we can print the Observation
 * before the full $apply proves the recency merge picks it up.
 *
 * args: <input-bundle.json> <sdId> <patientRef> <authoredIso> <answerBoolean>
 */
public class MainExtract {
    public static void main(String[] args) throws Exception {
        String inputFile = args[0];
        String sdId = args.length > 1 ? args[1] : "patient-age-age-18-or-older";
        String patientRef = args.length > 2 ? args[2] : "Patient/age-rt";
        String authoredIso = args.length > 3 ? args[3] : "2026-06-01T00:00:00Z";
        boolean answer = args.length > 4 ? Boolean.parseBoolean(args[4]) : false;

        FhirContext ctx = FhirContext.forR4Cached();
        String json = new String(Files.readAllBytes(Paths.get(inputFile)), java.nio.charset.StandardCharsets.UTF_8);
        Bundle bundle = ctx.newJsonParser().parseResource(Bundle.class, json);
        InMemoryFhirRepository repo = new InMemoryFhirRepository(ctx, bundle);

        // 1) GENERATE the Questionnaire from the case-feature SD (by id in the repo).
        QuestionnaireProcessor qProc = new QuestionnaireProcessor(repo);
        IBaseResource generated = qProc.generateQuestionnaire(
                Eithers.forMiddle3(new IdType("StructureDefinition", sdId)));
        Questionnaire q = (Questionnaire) generated;
        System.out.println("=== GENERATED QUESTIONNAIRE ===");
        System.out.println(ctx.newJsonParser().setPrettyPrint(true).encodeResourceToString(q));

        // 2) Build a QuestionnaireResponse that CONTAINS the generated Questionnaire
        //    (apply's initApply filter requires QR.questionnaire to contain '#'),
        //    authored = the given timestamp, subject = the Patient, one boolean answer.
        QuestionnaireResponse qr = new QuestionnaireResponse();
        qr.setId("age-rt-qr");
        q.setId("contained-age-q");
        // OPTIONAL url override (arg[6]): apply's initApply only auto-extracts a QR
        // whose Questionnaire url == the PD-DERIVED canonical (PD url with
        // /PlanDefinition/ -> /Questionnaire/). A Questionnaire generated from the
        // SD carries the SD-derived url, which does NOT match — so set the
        // PD-derived url here to satisfy apply's DTR convention.
        if (args.length > 6 && !args[6].isEmpty()) {
            q.setUrl(args[6]);
        }
        qr.addContained(q);
        qr.setQuestionnaire("#contained-age-q");
        qr.setStatus(QuestionnaireResponse.QuestionnaireResponseStatus.COMPLETED);
        qr.setAuthored(new DateTimeType(authoredIso).getValue());
        qr.setSubject(new Reference(patientRef));
        // Answer the (single) item generated for Observation.value[x] boolean.
        // The generated Questionnaire's item linkId drives the mapping; we mirror
        // its first leaf item that targets Observation.value[x].
        addBooleanAnswer(qr, q, answer);

        System.out.println("=== FILLED QUESTIONNAIRE RESPONSE ===");
        String qrJson = ctx.newJsonParser().setPrettyPrint(true).encodeResourceToString(qr);
        System.out.println(qrJson);
        // Write the QR (with its contained generated Questionnaire) to a file so
        // the Python apply-bundle builder can inject it into the $apply DATA bundle.
        if (args.length > 5) {
            Files.write(Paths.get(args[5]), qrJson.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }

        // 3) EXTRACT — standalone, to inspect the extracted Observation.
        QuestionnaireResponseProcessor qrProc = new QuestionnaireResponseProcessor(repo);
        IBaseBundle extracted = qrProc.extract(Eithers.forRight(qr));
        System.out.println("=== EXTRACT RESULT BUNDLE ===");
        System.out.println(ctx.newJsonParser().setPrettyPrint(true).encodeResourceToString(extracted));

        // Write the extracted Observation(s) to a file (arg[7]) so the apply-bundle
        // builder can persist them into the $apply DATA bundle — exactly what a real
        // DTR app does: $extract -> persist -> $apply reads the persisted resource.
        if (args.length > 7) {
            org.hl7.fhir.r4.model.Bundle eb = (org.hl7.fhir.r4.model.Bundle) extracted;
            for (org.hl7.fhir.r4.model.Bundle.BundleEntryComponent e : eb.getEntry()) {
                if (e.getResource() instanceof org.hl7.fhir.r4.model.Observation) {
                    org.hl7.fhir.r4.model.Observation obs = (org.hl7.fhir.r4.model.Observation) e.getResource();
                    // Give it a stable id so the InMemory repo accepts it as a data resource.
                    if (obs.getIdElement().isEmpty()) obs.setId("extracted-age-obs");
                    Files.write(Paths.get(args[7]),
                            ctx.newJsonParser().setPrettyPrint(true).encodeResourceToString(obs)
                               .getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    break;
                }
            }
        }
    }

    // Walk the generated Questionnaire items; answer every leaf boolean item with `answer`.
    static void addBooleanAnswer(QuestionnaireResponse qr, Questionnaire q, boolean answer) {
        for (Questionnaire.QuestionnaireItemComponent item : q.getItem()) {
            answerItem(qr.addItem(), item, answer);
        }
    }

    static void answerItem(QuestionnaireResponse.QuestionnaireResponseItemComponent riChild,
                           Questionnaire.QuestionnaireItemComponent qi, boolean answer) {
        riChild.setLinkId(qi.getLinkId());
        if (qi.hasItem()) {
            for (Questionnaire.QuestionnaireItemComponent sub : qi.getItem()) {
                answerItem(riChild.addItem(), sub, answer);
            }
        }
        if (qi.getType() == Questionnaire.QuestionnaireItemType.BOOLEAN) {
            riChild.addAnswer().setValue(new org.hl7.fhir.r4.model.BooleanType(answer));
        }
    }
}
