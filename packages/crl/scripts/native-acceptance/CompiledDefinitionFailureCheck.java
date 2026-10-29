// Maintainer control: good -> invalid CQL -> same invalid CQL -> restored good.
// Run with the shipped driver and complete engine via PropertiesLauncher.
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.lang.reflect.*;
import java.io.*;
import java.util.Base64;

public class CompiledDefinitionFailureCheck {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("NEW_OUTPUT");
        Path out = Path.of(args[0]);
        Files.createDirectory(out);
        Path repo = out.resolve("active-repo.json"), data = out.resolve("active-data.json");
        Files.writeString(data, "{\"resourceType\":\"Bundle\",\"type\":\"collection\",\"entry\":[{\"resource\":{\"resourceType\":\"Patient\",\"id\":\"p\"}}]}");
        PrintStream original = System.err;
        ByteArrayOutputStream capture = new ByteArrayOutputStream();
        PrintStream captured = new PrintStream(capture, true, StandardCharsets.UTF_8);
        System.setErr(captured);
        try {
            Method apply = Class.forName("ApplyDriver").getMethod("main", String[].class);
            for (int i = 0; i < 4; i++) {
                capture.reset();
                boolean invalid = i == 1 || i == 2;
                String cql = "library CacheFailure version '1.0.0'\nusing FHIR version '4.0.1'\ncontext Patient\ndefine Eligible: " + (invalid ? "!!! invalid CQL !!!" : "true") + "\n";
                String encoded = Base64.getEncoder().encodeToString(cql.getBytes(StandardCharsets.UTF_8));
                String bundle = "{\"resourceType\":\"Bundle\",\"type\":\"collection\",\"entry\":[{\"resource\":{\"resourceType\":\"Library\",\"id\":\"cache-failure\",\"url\":\"http://example.test/Library/CacheFailure\",\"name\":\"CacheFailure\",\"version\":\"1.0.0\",\"status\":\"draft\",\"content\":[{\"contentType\":\"text/cql\",\"data\":\"" + encoded + "\"}]}},{\"resource\":{\"resourceType\":\"PlanDefinition\",\"id\":\"cache-failure\",\"status\":\"draft\",\"library\":[\"http://example.test/Library/CacheFailure\"],\"action\":[{\"id\":\"switch\",\"condition\":[{\"kind\":\"applicability\",\"expression\":{\"language\":\"text/cql-identifier\",\"expression\":\"Eligible\"}}]}]}}]}";
                Files.writeString(repo, bundle);
                Path dir = out.resolve("step-" + i);
                Files.createDirectory(dir);
                Files.copy(repo, dir.resolve("repository-input.json"));
                try {
                    apply.invoke(null, (Object) new String[]{repo.toString(), "cache-failure", "Patient/p", "--session", data.toString(), dir.resolve("native").toString(), "33554432", "100663296"});
                } catch (InvocationTargetException failure) {
                    Files.writeString(dir.resolve("exception.txt"), failure.getCause().getClass().getName() + ": " + failure.getCause().getMessage());
                } finally {
                    captured.flush();
                    Files.write(dir.resolve("stderr.log"), capture.toByteArray());
                }
            }
        } finally {
            System.setErr(original);
            captured.close();
        }
        System.out.println("COMPILED_DEFINITION_FAILURE_CALLS=4");
    }
}
