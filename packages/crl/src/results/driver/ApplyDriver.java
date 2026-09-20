/*
 * ApplyDriver — the ONE Java file CRL ships for result production.
 *
 * Adapted from a working harness contributed by the IEHP knowledge-engineering project, whose operator
 * cleared it for use here. Their version also derived the case list, built the repository and chose the
 * answers; all of that now lives in TypeScript, where the CRL parser, the emit result and the path
 * authorities already are. What remains here is the part that genuinely needs a JVM: driving the engine.
 *
 * ⚠ DELIBERATELY ARGUMENT-DRIVEN AND STATELESS. It reads one repository bundle, applies one
 * PlanDefinition for one subject. Legacy mode writes Parameters to stdout; explicit session mode
 * accepts request data and writes bounded native artifacts. It does not
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
        if (args.length > 0 && "--runtime-info".equals(args[0])) {
            String[] values = {
                System.getProperty("java.version"), System.getProperty("java.runtime.version"),
                System.getProperty("java.vendor"), System.getProperty("java.vm.name"),
                java.time.ZoneId.systemDefault().getId(), java.util.TimeZone.getDefault().getID(),
                java.util.Locale.getDefault().toLanguageTag(),
                java.util.Locale.getDefault(java.util.Locale.Category.DISPLAY).toLanguageTag(),
                java.util.Locale.getDefault(java.util.Locale.Category.FORMAT).toLanguageTag()
            };
            String line = "CRL_RUNTIME_INFO:" + java.util.Arrays.stream(values)
                .map(value -> java.util.Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8)))
                .collect(java.util.stream.Collectors.joining(".")) + "\n";
            System.out.write(line.getBytes(StandardCharsets.UTF_8));
            System.out.flush();
            return;
        }
        boolean session = args.length == 8 && "--session".equals(args[3]);
        if (args.length != 3 && !session) {
            System.err.println("usage: ApplyDriver <repo.json> <planDefinitionId> <Patient/id> [--session <data.json> <output-prefix> <file-byte-limit> <total-byte-limit>]");
            System.exit(1);
        }
        String repoFile = args[0], pdId = args[1], subject = args[2];

        FhirContext ctx = FhirContext.forR4Cached();
        ca.uhn.fhir.parser.IParser parser = ctx.newJsonParser();
        if (session) parser.setParserErrorHandler(new ca.uhn.fhir.parser.StrictErrorHandler());
        Bundle bundle = parser.parseResource(Bundle.class,
                new String(Files.readAllBytes(Paths.get(repoFile)), StandardCharsets.UTF_8));

        Bundle requestData = session ? parser.parseResource(Bundle.class,
                Files.readString(Paths.get(args[4]), StandardCharsets.UTF_8)) : null;
        long fileLimit = session ? Long.parseLong(args[6]) : 0;
        long totalLimit = session ? Long.parseLong(args[7]) : 0;
        if (session && (fileLimit <= 0 || totalLimit <= 0)) throw new IllegalArgumentException("Positive artifact byte limits required");
        InMemoryFhirRepository repo = new InMemoryFhirRepository(ctx, bundle);
        // Resolve the standard qualified helper include without a FHIR Library resource.
        org.opencds.cqf.fhir.cr.CrSettings settings = org.opencds.cqf.fhir.cr.CrSettings.getDefault();
        settings.getEvaluationSettings().addRegisteredNamespace("hl7.fhir.uv.cql", "http://hl7.org/fhir/uv/cql");
        PlanDefinitionProcessor processor = new PlanDefinitionProcessor(repo, settings);

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
                requestData,                        // explicit session data; null in legacy mode
                (List<? extends IBaseBackboneElement>) null, // prefetchData
                (IBaseResource) null,                // dataEndpoint
                (IBaseResource) null,                // contentEndpoint
                (IBaseResource) null);               // terminologyEndpoint

        // REFACTOR:grounded: session output budgets cover files, not only captured log streams.
        if (session) {
            long used = writeSessionArtifact(ctx, result, args[5] + "-result.json", fileLimit, totalLimit);
            used += writeSessionArtifact(ctx, requestData, args[5] + "-data.json", fileLimit, totalLimit - used);
            writeSessionArtifact(ctx, bundle, args[5] + "-repository.json", fileLimit, totalLimit - used);
            return;
        }

        // ⚠ STDOUT IS NOT CLEAN, AND THIS WAS MEASURED. An earlier version of this comment claimed the
        // result is the only thing on stdout. It is not: a transitive dependency prints
        //     kotlin-logging: initializing... active logger factory: Slf4jLoggerFactory
        // to STDOUT before main() runs, so nothing this class does can prevent it. Most engine logging
        // does go to stderr, but "parse stdout as JSON" fails on the first line.
        //
        // Consequences the caller MUST handle, not this file:
        //   - locate the JSON rather than assuming stdout starts with it;
        //   - never let this child's stdout reach an MCP parent's, where it is the JSON-RPC transport.
        // REFACTOR:grounded: JSON crosses a UTF-8 byte boundary, independent of the JVM's console charset.
        // Preserve the current stream: reflective batch callers route it to per-case bounded captures.
        String json = ctx.newJsonParser().setPrettyPrint(false).encodeResourceToString(result);
        System.out.write((json + "\n").getBytes(StandardCharsets.UTF_8));
        System.out.flush();
    }
    private static long writeSessionArtifact(FhirContext ctx, IBaseResource resource, String file,
            long fileLimit, long remaining) throws java.io.IOException {
        byte[] bytes = ctx.newJsonParser().setPrettyPrint(false).encodeResourceToString(resource)
                .getBytes(StandardCharsets.UTF_8);
        if (bytes.length > fileLimit || bytes.length > remaining) {
            throw new java.io.IOException("CRL_OUTPUT_LIMIT: native session artifacts exceeded the byte budget");
        }
        Files.write(Paths.get(file), bytes, java.nio.file.StandardOpenOption.CREATE_NEW);
        return bytes.length;
    }

}
