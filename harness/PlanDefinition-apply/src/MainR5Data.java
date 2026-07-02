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

/**
 * $r5.apply with an EXPLICIT server-repo bundle + a separate DATA-PAYLOAD bundle
 * + a useServerData flag. Proves the session/data-source semantics:
 *   - repoFile     -> the InMemoryFhirRepository ("the FHIR server").
 *   - dataFile     -> the IBaseBundle `data` PAYLOAD the client carries forward.
 *   - useServerData-> whether apply queries the server repo (true) or ONLY the payload (false).
 *
 * args: <repoFile> <pdId> <patientRef> <useServerData:true|false> [<dataFile>]
 */
public class MainR5Data {
    public static void main(String[] args) throws Exception {
        String repoFile = args[0];
        String pdId = args[1];
        String subject = args[2];
        boolean useServerData = Boolean.parseBoolean(args[3]);
        String dataFile = args.length > 4 && !args[4].isBlank() ? args[4] : null;

        FhirContext ctx = FhirContext.forR4Cached();
        Bundle repoBundle = ctx.newJsonParser().parseResource(Bundle.class,
                new String(Files.readAllBytes(Paths.get(repoFile)), java.nio.charset.StandardCharsets.UTF_8));
        InMemoryFhirRepository repo = new InMemoryFhirRepository(ctx, repoBundle);
        PlanDefinitionProcessor processor = new PlanDefinitionProcessor(repo);

        Bundle dataBundle = null;
        if (dataFile != null) {
            dataBundle = ctx.newJsonParser().parseResource(Bundle.class,
                    new String(Files.readAllBytes(Paths.get(dataFile)), java.nio.charset.StandardCharsets.UTF_8));
        }

        System.out.println("=== applyR5 PD/" + pdId + " useServerData=" + useServerData
                + " dataPayload=" + (dataFile != null ? dataFile : "none") + " ===");

        IBaseParameters result = processor.applyR5(
                Eithers.forMiddle3(new IdType("PlanDefinition", pdId)),
                List.of(subject),
                (String) null, (String) null, (String) null,
                (IBaseDatatype) null, (IBaseDatatype) null, (IBaseDatatype) null,
                (IBaseDatatype) null, (IBaseDatatype) null,
                (IBaseParameters) null,
                useServerData,                                   // <-- the gate
                (org.hl7.fhir.instance.model.api.IBaseBundle) dataBundle,   // <-- the client payload
                (List<? extends org.hl7.fhir.instance.model.api.IBaseBackboneElement>) null,
                (IBaseResource) null, (IBaseResource) null, (IBaseResource) null);

        System.out.println(ctx.newJsonParser().setPrettyPrint(true).encodeResourceToString(result));
    }
}
