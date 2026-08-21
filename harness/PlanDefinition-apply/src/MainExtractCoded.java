import java.nio.file.Files;
import java.nio.file.Paths;

import ca.uhn.fhir.context.FhirContext;
import org.hl7.fhir.instance.model.api.IBaseBundle;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.DateTimeType;
import org.hl7.fhir.r4.model.IdType;
import org.hl7.fhir.r4.model.Questionnaire;
import org.hl7.fhir.r4.model.QuestionnaireResponse;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.Type;

import org.opencds.cqf.fhir.utility.repository.InMemoryFhirRepository;
import org.opencds.cqf.fhir.cr.questionnaire.QuestionnaireProcessor;
import org.opencds.cqf.fhir.cr.questionnaireresponse.QuestionnaireResponseProcessor;
import org.opencds.cqf.fhir.utility.monad.Eithers;

/**
 * #189 2d P3 probe — like MainExtract but ANSWERS CHOICE items with their first answerOption (the local code),
 * so we can see the POSITIVE extract of a natural valueless case-feature (Condition/MedicationRequest) and inspect
 * the produced resource for VALIDITY (esp. MedicationRequest required status/intent).
 * args: <input-bundle.json> <sdId> <patientRef> <authoredIso>
 */
public class MainExtractCoded {
    public static void main(String[] args) throws Exception {
        String inputFile = args[0];
        String sdId = args[1];
        String patientRef = args.length > 2 ? args[2] : "Patient/probe-p";
        String authoredIso = args.length > 3 ? args[3] : "2026-06-01T00:00:00Z";

        FhirContext ctx = FhirContext.forR4Cached();
        String json = new String(Files.readAllBytes(Paths.get(inputFile)), java.nio.charset.StandardCharsets.UTF_8);
        Bundle bundle = ctx.newJsonParser().parseResource(Bundle.class, json);
        InMemoryFhirRepository repo = new InMemoryFhirRepository(ctx, bundle);

        QuestionnaireProcessor qProc = new QuestionnaireProcessor(repo);
        IBaseResource generated = qProc.generateQuestionnaire(
                Eithers.forMiddle3(new IdType("StructureDefinition", sdId)));
        Questionnaire q = (Questionnaire) generated;

        QuestionnaireResponse qr = new QuestionnaireResponse();
        qr.setId("coded-qr");
        q.setId("contained-q");
        qr.addContained(q);
        qr.setQuestionnaire("#contained-q");
        qr.setStatus(QuestionnaireResponse.QuestionnaireResponseStatus.COMPLETED);
        qr.setAuthored(new DateTimeType(authoredIso).getValue());
        qr.setSubject(new Reference(patientRef));
        for (Questionnaire.QuestionnaireItemComponent item : q.getItem()) {
            answerItem(qr.addItem(), item);
        }

        QuestionnaireResponseProcessor qrProc = new QuestionnaireResponseProcessor(repo);
        IBaseBundle extracted = qrProc.extract(Eithers.forRight(qr));
        System.out.println("=== EXTRACT RESULT BUNDLE ===");
        System.out.println(ctx.newJsonParser().setPrettyPrint(true).encodeResourceToString(extracted));

        // Validate each extracted resource and print a per-resource validity summary.
        ca.uhn.fhir.validation.FhirValidator validator = ctx.newValidator();
        Bundle eb = (Bundle) extracted;
        for (Bundle.BundleEntryComponent e : eb.getEntry()) {
            IBaseResource r = e.getResource();
            ca.uhn.fhir.validation.ValidationResult vr = validator.validateWithResult(r);
            System.out.println("=== VALIDATION: " + r.fhirType() + " valid=" + vr.isSuccessful() + " ===");
            vr.getMessages().forEach(m -> {
                if (m.getSeverity() == ca.uhn.fhir.validation.ResultSeverityEnum.ERROR
                        || m.getSeverity() == ca.uhn.fhir.validation.ResultSeverityEnum.FATAL) {
                    System.out.println("  [" + m.getSeverity() + "] " + m.getLocationString() + ": " + m.getMessage());
                }
            });
        }
    }

    static void answerItem(QuestionnaireResponse.QuestionnaireResponseItemComponent riChild,
                           Questionnaire.QuestionnaireItemComponent qi) {
        riChild.setLinkId(qi.getLinkId());
        if (qi.hasItem()) {
            for (Questionnaire.QuestionnaireItemComponent sub : qi.getItem()) {
                answerItem(riChild.addItem(), sub);
            }
        }
        if (qi.getType() == Questionnaire.QuestionnaireItemType.BOOLEAN) {
            riChild.addAnswer().setValue(new org.hl7.fhir.r4.model.BooleanType(true));
        } else if ((qi.getType() == Questionnaire.QuestionnaireItemType.CHOICE
                || qi.getType() == Questionnaire.QuestionnaireItemType.OPENCHOICE)
                && qi.hasAnswerOption()) {
            Type v = qi.getAnswerOption().get(0).getValue();
            riChild.addAnswer().setValue(v);
        }
    }
}
