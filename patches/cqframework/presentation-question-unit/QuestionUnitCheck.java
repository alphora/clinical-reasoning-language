import java.util.List;
import org.hl7.fhir.r4.model.*;
import org.opencds.cqf.fhir.cr.plandefinition.apply.PresentationQuestionUnitProcessor;

/** Maintainer protocol controls against the candidate's actual compiled helper. */
public class QuestionUnitCheck {
    static final String URL = PresentationQuestionUnitProcessor.URL;
    static final String OPTION = "http://hl7.org/fhir/StructureDefinition/questionnaire-unitOption";
    static final String UCUM = "http://unitsofmeasure.org";
    static void check(boolean ok, String message) { if (!ok) throw new IllegalStateException(message); }
    static Questionnaire q(String unit) {
        var q = new Questionnaire();
        var item = q.addItem().setLinkId("value").setType(Questionnaire.QuestionnaireItemType.QUANTITY);
        item.addExtension(new Extension(URL, new Coding(UCUM, unit, unit)));
        item.addExtension(new Extension(OPTION, new Coding(UCUM, unit, unit)));
        return q;
    }
    static QuestionnaireResponse qr(Quantity quantity) {
        var qr = new QuestionnaireResponse();
        if (quantity != null) qr.addItem().setLinkId("value").addAnswer().setValue(quantity);
        return qr;
    }
    static List<Extension> options(Questionnaire q) { return q.getItemFirstRep().getExtensionsByUrl(OPTION); }
    static Coding first(Questionnaire q) { return (Coding) options(q).get(0).getValue(); }
    static void rejects(Questionnaire q) {
        try { PresentationQuestionUnitProcessor.preservePopulatedUnits(q, qr(null)); }
        catch (IllegalArgumentException expected) { check(expected.getMessage().startsWith("presentation-question-unit-invalid:"), "Typed marker error"); return; }
        throw new IllegalStateException("Accepted malformed question marker");
    }
    public static void main(String[] args) {
        var q = q("cm");
        q.getItemFirstRep().addExtension(new Extension(OPTION, new Coding(UCUM, "g", "stale")));
        var response = qr(new Quantity().setValue(1.8).setCode("m").setSystem(UCUM).setUnit("metres"));
        var before = response.copy();
        PresentationQuestionUnitProcessor.preservePopulatedUnits(q, response);
        check(options(q).size() == 2 && ((Coding) options(q).get(1).getValue()).getCode().equals("m"), "Current m replaces stale g");
        check(before.equalsDeep(response), "Never alter clinical response");
        var stable = q.copy(); PresentationQuestionUnitProcessor.preservePopulatedUnits(q, response);
        check(stable.equalsDeep(q), "Repeated options are idempotent");
        PresentationQuestionUnitProcessor.preservePopulatedUnits(q, qr(new Quantity().setValue(180).setCode("cm").setSystem(UCUM).setUnit("centimetres")));
        check(options(q).size() == 1 && first(q).getDisplay().equals("centimetres"), "Changed unit removes m and preserves current display");
        PresentationQuestionUnitProcessor.preservePopulatedUnits(q, qr(null));
        check(options(q).size() == 1 && first(q).getDisplay().equals("cm"), "Clear resets authored unit/label");
        q = q("kg/m2"); response = qr(new Quantity().setValue(40).setUnit("kg/m2")); before = response.copy();
        PresentationQuestionUnitProcessor.preservePopulatedUnits(q, response);
        var text = (Coding) options(q).get(1).getValue();
        check(!text.hasSystem() && !text.hasCode() && text.getDisplay().equals("kg/m2") && before.equalsDeep(response), "Text-only unit is not promoted to UCUM");
        q = q("cm"); response = qr(new Quantity().setValue(180).setCode("cm").setUnit("cm")); before = response.copy();
        PresentationQuestionUnitProcessor.preservePopulatedUnits(q, response);
        check(options(q).size() == 2 && !((Coding) options(q).get(1).getValue()).hasSystem() && before.equalsDeep(response), "Code-only source is not assigned a UCUM system");
        q.getItemFirstRep().getExtension().removeIf(e -> URL.equals(e.getUrl())); stable = q.copy();
        PresentationQuestionUnitProcessor.preservePopulatedUnits(q, qr(null));
        check(stable.equalsDeep(q), "Unmarked options untouched");
        q = q("cm"); q.getItemFirstRep().addExtension(q.getItemFirstRep().getExtensionByUrl(URL).copy()); rejects(q);
        q = q("cm"); q.getItemFirstRep().getExtensionByUrl(URL).setValue(new StringType("cm")); rejects(q);
        q = q("cm"); ((Coding) q.getItemFirstRep().getExtensionByUrl(URL).getValue()).setSystem("urn:invalid"); rejects(q);
        q = q("cm"); ((Coding) q.getItemFirstRep().getExtensionByUrl(URL).getValue()).setCode("bad code"); rejects(q);
        q = q("cm"); q.getItemFirstRep().setType(Questionnaire.QuestionnaireItemType.STRING); rejects(q);
        System.out.println("13 question-unit protocol controls passed");
    }
}
