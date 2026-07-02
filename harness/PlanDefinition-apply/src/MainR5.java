import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

import ca.uhn.fhir.context.FhirContext;
import org.hl7.fhir.instance.model.api.IBaseParameters;
import org.hl7.fhir.instance.model.api.IBaseDatatype;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.IdType;

import org.opencds.cqf.fhir.utility.repository.InMemoryFhirRepository;
import org.opencds.cqf.fhir.cr.plandefinition.PlanDefinitionProcessor;
import org.opencds.cqf.fhir.utility.monad.Eithers;

public class MainR5 {
    public static void main(String[] args) throws Exception {
        String inputFile = args.length > 0 ? args[0] : "apply-input.json";
        String pdId = args.length > 1 ? args[1] : "example-semand-a-and-b-coverage-determination";
        String subject = args.length > 2 ? args[2] : "Patient/example";

        FhirContext ctx = FhirContext.forR4Cached();

        String json = new String(Files.readAllBytes(Paths.get(inputFile)), java.nio.charset.StandardCharsets.UTF_8);
        Bundle bundle = ctx.newJsonParser().parseResource(Bundle.class, json);

        InMemoryFhirRepository repo = new InMemoryFhirRepository(ctx, bundle);
        PlanDefinitionProcessor processor = new PlanDefinitionProcessor(repo);

        System.out.println("=== applyR5 on PlanDefinition/" + pdId + " with input " + inputFile + " ===");

        // 16-arg overload (id counts as arg 1 => 17 positional args total):
        // (Either3 id, List<String> subject, String encounter, String practitioner,
        //  String organization, IBaseDatatype userType, IBaseDatatype userLanguage,
        //  IBaseDatatype userTaskContext, IBaseDatatype setting, IBaseDatatype settingContext,
        //  IBaseParameters parameters, boolean useServerData, IBaseBundle dataBundle,
        //  List<IBaseBackboneElement> prefetchData, IBaseResource dataEndpoint,
        //  IBaseResource contentEndpoint, IBaseResource terminologyEndpoint)
        IBaseParameters result = processor.applyR5(
                Eithers.forMiddle3(new IdType("PlanDefinition", pdId)),
                List.of(subject),             // subject list
                (String) null,                // encounter
                (String) null,                // practitioner
                (String) null,                // organization
                (IBaseDatatype) null,         // userType
                (IBaseDatatype) null,         // userLanguage
                (IBaseDatatype) null,         // userTaskContext
                (IBaseDatatype) null,         // setting
                (IBaseDatatype) null,         // settingContext
                (IBaseParameters) null,       // parameters
                true,                         // useServerData
                (org.hl7.fhir.instance.model.api.IBaseBundle) null,   // dataBundle
                (List<? extends org.hl7.fhir.instance.model.api.IBaseBackboneElement>) null, // prefetchData
                (IBaseResource) null,         // dataEndpoint
                (IBaseResource) null,         // contentEndpoint
                (IBaseResource) null);        // terminologyEndpoint

        String encoded = ctx.newJsonParser().setPrettyPrint(true).encodeResourceToString(result);
        System.out.println(encoded);
    }
}
