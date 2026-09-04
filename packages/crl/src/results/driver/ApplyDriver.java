/*
 * ApplyDriver — the ONE Java file CRL ships for result production.
 *
 * Adapted from a working harness contributed by the IEHP knowledge-engineering project, whose operator
 * cleared it for use here. Their version also derived the case list, built the repository and chose the
 * answers; all of that now lives in TypeScript, where the CRL parser, the emit result and the path
 * authorities already are. What remains here is the part that genuinely needs a JVM: driving the engine.
 *
 * ⚠ DELIBERATELY ARGUMENT-DRIVEN AND STATELESS. It reads one repository bundle, applies one
 * PlanDefinition for one subject, and writes the returned Parameters to stdout as JSON. It does not
 * choose a case, compose a path, or decide what is a pass. Every one of those was a source of drift in
 * the harness this replaces.
 *
 * ⚠ THE COMPILED CLASS IS COMMITTED BESIDE THIS FILE AND IS WHAT SHIPS. Editing this source alone
 * changes NOTHING at runtime. Rebuild with:
 *
 *     node packages/crl/scripts/build-driver.mjs <engine.jar>
 *
 * which extracts the engine (javac cannot see a fat jar's nested BOOT-INF/lib), compiles at
 * --release 17, and verifies the class-file major before letting you commit. A full JDK is needed
 * for THAT step only; running the driver needs a JRE.
 *
 * ⚠ applyR5 ONLY. The R4 processor re-opens the null-behaviour findings this project spent #189 closing.
 */
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

import ca.uhn.fhir.context.FhirContext;
import org.hl7.fhir.instance.model.api.IBaseBackboneElement;
import org.hl7.fhir.instance.model.api.IBaseBundle;
import org.hl7.fhir.instance.model.api.IBaseDatatype;
import org.hl7.fhir.instance.model.api.IBaseParameters;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.IdType;

import org.opencds.cqf.fhir.cr.plandefinition.PlanDefinitionProcessor;
import org.opencds.cqf.fhir.utility.monad.Eithers;
import org.opencds.cqf.fhir.utility.repository.InMemoryFhirRepository;

public class ApplyDriver {
    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            System.err.println("usage: ApplyDriver <repo.json> <planDefinitionId> <Patient/id>");
            System.exit(1);
        }
        String repoFile = args[0], pdId = args[1], subject = args[2];

        FhirContext ctx = FhirContext.forR4Cached();
        Bundle bundle = ctx.newJsonParser().parseResource(Bundle.class,
                new String(Files.readAllBytes(Paths.get(repoFile)), StandardCharsets.UTF_8));

        InMemoryFhirRepository repo = new InMemoryFhirRepository(ctx, bundle);
        PlanDefinitionProcessor processor = new PlanDefinitionProcessor(repo);

        IBaseParameters result = processor.applyR5(
                Eithers.forMiddle3(new IdType("PlanDefinition", pdId)),
                List.of(subject),
                (String) null,                       // encounter
                (String) null,                       // practitioner
                (String) null,                       // organization
                (IBaseDatatype) null,                // userType
                (IBaseDatatype) null,                // userLanguage
                (IBaseDatatype) null,                // userTaskContext
                (IBaseDatatype) null,                // setting
                (IBaseDatatype) null,                // settingContext
                (IBaseParameters) null,              // parameters
                true,                                // useServerData — the repository IS the data
                (IBaseBundle) null,                  // dataBundle
                (List<? extends IBaseBackboneElement>) null, // prefetchData
                (IBaseResource) null,                // dataEndpoint
                (IBaseResource) null,                // contentEndpoint
                (IBaseResource) null);               // terminologyEndpoint

        // ⚠ STDOUT IS NOT CLEAN, AND THIS WAS MEASURED. An earlier version of this comment claimed the
        // result is the only thing on stdout. It is not: a transitive dependency prints
        //     kotlin-logging: initializing... active logger factory: Slf4jLoggerFactory
        // to STDOUT before main() runs, so nothing this class does can prevent it. Most engine logging
        // does go to stderr, but "parse stdout as JSON" fails on the first line.
        //
        // Consequences the caller MUST handle, not this file:
        //   - locate the JSON rather than assuming stdout starts with it;
        //   - never let this child's stdout reach an MCP parent's, where it is the JSON-RPC transport.
        System.out.println(ctx.newJsonParser().setPrettyPrint(false).encodeResourceToString(result));
    }
}
