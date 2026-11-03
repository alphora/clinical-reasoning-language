// REFACTOR:grounded: transport reuses classes; ApplyDriver creates each request's clinical state.
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.AtomicMoveNotSupportedException;
import java.util.Base64;
import java.util.List;

/** Two permanent stream routers also cover logging frameworks retaining System.out/err. */
public final class ApplyWorker extends OutputStream {
    private OutputStream target = OutputStream.nullOutputStream();
    private long remaining = Long.MAX_VALUE;
    private static long deadline;
    private static String activeToken;
    static synchronized void beginRequest(String token, long timeout) {
        activeToken = token; deadline = System.currentTimeMillis() + timeout;
    }
    static synchronized void finishRequest(String token) {
        if (token.equals(activeToken)) { activeToken = null; deadline = 0; }
    }
    static synchronized void enforceDeadline() {
        if (activeToken != null && System.currentTimeMillis() >= deadline) {
            ProcessHandle.current().descendants().forEach(child -> child.destroyForcibly());
            Runtime.getRuntime().halt(124);
        }
    }
    private synchronized void route(OutputStream next, long limit) throws IOException {
        target.flush(); target = next; remaining = limit;
    }
    public synchronized void write(int value) throws IOException { write(new byte[] {(byte)value}, 0, 1); }
    public synchronized void write(byte[] bytes, int offset, int length) throws IOException {
        if (length > remaining) {
            target.write(bytes, offset, (int)remaining); target.flush();
            Runtime.getRuntime().halt(125);
        }
        target.write(bytes, offset, length); remaining -= length;
    }
    public synchronized void flush() throws IOException { target.flush(); }
    private static void atomic(Path file, String content) throws IOException {
        Path temporary = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(temporary, content, StandardCharsets.UTF_8);
        try { Files.move(temporary, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
        catch (AtomicMoveNotSupportedException unsupported) { Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING); }
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("ApplyWorker <private-mailbox> <owner-pid>");
        Path mailbox = Path.of(args[0]);
        ProcessHandle owner = ProcessHandle.of(Long.parseLong(args[1])).orElseThrow();
        Thread monitor = new Thread(() -> {
            try {
                while (true) {
                    if (!owner.isAlive()) {
                        ProcessHandle.current().descendants().forEach(child -> child.destroyForcibly());
                        Runtime.getRuntime().halt(126);
                    }
                    enforceDeadline(); Thread.sleep(20);
                }
            } catch (InterruptedException stopped) { Thread.currentThread().interrupt(); }
        }, "crl-worker-owner");
        monitor.setDaemon(true); monitor.start();
        ApplyWorker out = new ApplyWorker(), err = new ApplyWorker();
        PrintStream stdout = new PrintStream(out, true, StandardCharsets.UTF_8);
        PrintStream stderr = new PrintStream(err, true, StandardCharsets.UTF_8);
        System.setOut(stdout); System.setErr(stderr);
        ByteArrayOutputStream info = new ByteArrayOutputStream();
        out.route(info, 65536); ApplyDriver.main(new String[] {"--runtime-info"});
        out.route(OutputStream.nullOutputStream(), Long.MAX_VALUE);
        atomic(mailbox.resolve("ready"), ProcessHandle.current().pid() + "\n" + info.toString(StandardCharsets.UTF_8));
        Path request = mailbox.resolve("request");
        while (owner.isAlive()) {
            if (!Files.exists(request)) { Thread.sleep(10); continue; }
            if (Files.size(request) > 65536) throw new IllegalArgumentException("Worker request exceeds limit");
            List<String> lines = Files.readAllLines(request, StandardCharsets.UTF_8);
            Files.delete(request);
            if (lines.size() != 7 && lines.size() != 12) throw new IllegalArgumentException("Invalid worker request");
            String token = lines.get(0);
            if (!token.matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Invalid request token");
            long maxBytes = Long.parseLong(lines.get(1)), timeout = Long.parseLong(lines.get(2));
            if (maxBytes <= 0 || maxBytes > 268435456 || timeout <= 0 || timeout > 2147483647L)
                throw new IllegalArgumentException("Invalid request bounds");
            Path logs = Path.of(new String(Base64.getDecoder().decode(lines.get(3)), StandardCharsets.UTF_8));
            if (!logs.getParent().equals(mailbox)) throw new IllegalArgumentException("Invalid log destination");
            String[] call = new String[lines.size() - 4];
            for (int i = 4; i < lines.size(); i++) call[i - 4] = new String(Base64.getDecoder().decode(lines.get(i)), StandardCharsets.UTF_8);
            beginRequest(token, timeout);
            int status = 0;
            try (OutputStream jobOut = Files.newOutputStream(logs.resolve("stdout.log"));
                 OutputStream jobErr = Files.newOutputStream(logs.resolve("stderr.log"))) {
                out.route(jobOut, maxBytes); err.route(jobErr, maxBytes);
                try { ApplyDriver.main(call); if (stdout.checkError() || stderr.checkError()) throw new IOException("Native log write failed"); }
                catch (Throwable failure) { failure.printStackTrace(stderr); stderr.flush(); status = 1; }
                finally {
                    out.route(OutputStream.nullOutputStream(), Long.MAX_VALUE);
                    err.route(OutputStream.nullOutputStream(), Long.MAX_VALUE);
                }
            }
            finishRequest(token);
            atomic(mailbox.resolve("response"), token + "\n" + status + "\n");
            if (status != 0) System.exit(status);
        }
    }
}
