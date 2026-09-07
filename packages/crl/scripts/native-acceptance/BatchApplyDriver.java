// Test-only wrapper. Invoke the unchanged shipped driver with fresh arguments/repositories per case.
// Compile with build-batch.cjs; no engine dependencies or extraction required.
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.Timer;
import java.util.TimerTask;

public final class BatchApplyDriver {
    // Install once: logging frameworks may retain their original System.err reference.
    static final class RoutedOutput extends OutputStream {
        private OutputStream target;
        private long remaining = Long.MAX_VALUE;
        RoutedOutput(OutputStream initial) { target = initial; }
        synchronized void route(OutputStream next, long limit) throws IOException {
            target.flush(); target = next; remaining = limit;
        }
        public synchronized void write(int value) throws IOException {
            write(new byte[] { (byte)value }, 0, 1);
        }
        public synchronized void write(byte[] bytes, int offset, int length) throws IOException {
            if (length > remaining) {
                target.write(bytes, offset, (int)remaining); target.flush();
                Runtime.getRuntime().halt(125);
            }
            target.write(bytes, offset, length); remaining -= length;
        }
        public synchronized void flush() throws IOException { target.flush(); }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 4) throw new IllegalArgumentException("driverClass jobs.txt timeoutMs maxBytes");
        long timeout = Long.parseLong(args[2]), maxBytes = Long.parseLong(args[3]);
        List<String> jobs = Files.readAllLines(Path.of(args[1]), StandardCharsets.UTF_8);
        if (timeout <= 0 || maxBytes <= 0 || jobs.isEmpty() || jobs.size() % 4 != 0 || jobs.size() > 128)
            throw new IllegalArgumentException("Invalid batch bounds/jobs");
        PrintStream originalOut = System.out, originalErr = System.err;
        RoutedOutput out = new RoutedOutput(originalOut), err = new RoutedOutput(originalErr);
        PrintStream routedOut = new PrintStream(out, true, StandardCharsets.UTF_8);
        PrintStream routedErr = new PrintStream(err, true, StandardCharsets.UTF_8);
        System.setOut(routedOut); System.setErr(routedErr);
        Timer watchdog = new Timer("acceptance-timeout", true);
        Object lock = new Object();
        Object[] active = new Object[1];
        try {
            // Do not initialize the driver/logger until the first case's streams are installed.
            Method main = Class.forName(args[0], false, Thread.currentThread().getContextClassLoader())
                    .getMethod("main", String[].class);
            for (int i = 0; i < jobs.size(); i += 4) {
                Path dir = Path.of(jobs.get(i + 3));
                if (!dir.isAbsolute() || !Path.of(jobs.get(i)).isAbsolute())
                    throw new IllegalArgumentException("Case paths must be absolute");
                long start = System.nanoTime();
                Object token = new Object();
                synchronized (lock) { active[0] = token; }
                TimerTask timer = new TimerTask() {
                    public void run() {
                        synchronized (lock) {
                            if (active[0] == token) Runtime.getRuntime().halt(124);
                        }
                    }
                };
                watchdog.schedule(timer, timeout);
                try (OutputStream caseOut = Files.newOutputStream(dir.resolve("stdout.log"), StandardOpenOption.CREATE_NEW);
                     OutputStream caseErr = Files.newOutputStream(dir.resolve("stderr.log"), StandardOpenOption.CREATE_NEW)) {
                    out.route(caseOut, maxBytes); err.route(caseErr, maxBytes);
                    try {
                        main.invoke(null, (Object)new String[] { jobs.get(i), jobs.get(i + 1), jobs.get(i + 2) });
                        if (routedOut.checkError() || routedErr.checkError()) throw new IOException("Case log write failed");
                    } catch (Throwable failure) {
                        failure.printStackTrace(routedErr); routedErr.flush();
                        throw failure;
                    } finally {
                        out.route(originalOut, Long.MAX_VALUE); err.route(originalErr, Long.MAX_VALUE);
                    }
                }
                Files.writeString(dir.resolve("completed.txt"), Long.toString((System.nanoTime() - start) / 1000000),
                        StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
                synchronized (lock) { active[0] = null; timer.cancel(); }
                originalOut.println("completed case " + (i / 4 + 1));
            }
        } finally {
            watchdog.cancel();
            System.setOut(originalOut); System.setErr(originalErr);
        }
        // Engine background threads must not keep a completed finite batch alive.
        System.exit(0);
    }
}
