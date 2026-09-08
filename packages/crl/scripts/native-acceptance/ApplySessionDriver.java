// Test-only native R4 applyR5 instrumentation. Does not choose answers or outcomes.
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import ca.uhn.fhir.context.FhirContext;
import org.hl7.fhir.instance.model.api.*;
import org.hl7.fhir.r4.model.*;
import org.opencds.cqf.fhir.cr.plandefinition.PlanDefinitionProcessor;
import org.opencds.cqf.fhir.utility.monad.Eithers;
import org.opencds.cqf.fhir.utility.repository.InMemoryFhirRepository;

public class ApplySessionDriver {
  static FhirContext ctx = FhirContext.forR4Cached();
  static Bundle read(String file) throws Exception {
    return ctx.newJsonParser().parseResource(Bundle.class, Files.readString(Path.of(file), StandardCharsets.UTF_8));
  }
  static void write(String file, IBaseResource resource) throws Exception {
    Files.writeString(Path.of(file), ctx.newJsonParser().setPrettyPrint(true).encodeResourceToString(resource), StandardCharsets.UTF_8);
  }
  public static void main(String[] args) throws Exception {
    if (args.length != 5) throw new IllegalArgumentException("repo data planId subject outputPrefix required");
    String[] names = {
      "org.opencds.cqf.fhir.cr.plandefinition.PlanDefinitionProcessor",
      "org.opencds.cqf.fhir.cr.questionnaireresponse.extract.ProcessDefinitionItem",
      "org.opencds.cqf.fhir.cr.questionnaire.populate.PopulateRequest",
      "org.opencds.cqf.fhir.cr.questionnaireresponse.extract.ExtractProcessor",
      "org.opencds.cqf.fhir.cr.questionnaireresponse.extract.r4.ObservationResolver",
      "org.opencds.cqf.fhir.cr.questionnaireresponse.extract.r5.ObservationResolver",
      "org.opencds.cqf.fhir.cr.common.IOperationRequest",
      "org.opencds.cqf.fhir.utility.GeneratedIds",
      "org.opencds.cqf.fhir.cr.CrSettings",
      "org.opencds.cqf.fhir.cr.plandefinition.apply.ApplyRequest",
      "org.opencds.cqf.fhir.cr.plandefinition.apply.ProcessAction"
    };
    StringBuilder origins = new StringBuilder();
    for (String name : names) {
      String source;
      try { source = Class.forName(name).getProtectionDomain().getCodeSource().getLocation().toString(); }
      catch (ClassNotFoundException e) { source = "ABSENT"; }
      origins.append(name).append('\t').append(source).append('\n');
    }
    Files.writeString(Path.of(args[4] + "-origins.txt"), origins, StandardCharsets.UTF_8);
    Bundle base = read(args[0]), data = read(args[1]);
    InMemoryFhirRepository repo = new InMemoryFhirRepository(ctx, base);
    PlanDefinitionProcessor processor = new PlanDefinitionProcessor(repo);
    write(args[4] + "-request-before.json", data);
    write(args[4] + "-repository-bundle-before.json", base);
    write(args[4] + "-stored-observations-before.json", repo.search(Bundle.class, Observation.class, com.google.common.collect.ImmutableMultimap.of(), Map.of()));
    IBaseParameters result = processor.applyR5(
      Eithers.forMiddle3(new IdType("PlanDefinition", args[2])), List.of(args[3]),
      (String)null, (String)null, (String)null,
      (IBaseDatatype)null, (IBaseDatatype)null, (IBaseDatatype)null,
      (IBaseDatatype)null, (IBaseDatatype)null, (IBaseParameters)null,
      true, data, (List<? extends IBaseBackboneElement>)null,
      (IBaseResource)null, (IBaseResource)null, (IBaseResource)null);
    write(args[4] + "-result.json", result);
    write(args[4] + "-request-after.json", data);
    write(args[4] + "-repository-bundle-after.json", base);
    write(args[4] + "-stored-observations-after.json", repo.search(Bundle.class, Observation.class, com.google.common.collect.ImmutableMultimap.of(), Map.of()));
  }
}
