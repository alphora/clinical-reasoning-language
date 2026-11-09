// Opt-in raw bytes from the existing invocation, never a reconstructed evaluation.
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import path from 'node:path';

export interface NativeStreamCapture {
  bytes?: Buffer;
  /** Bytes observed before the existing bound/termination; null when unreadable. */
  observedBytes: number | null;
  retained: 'all' | 'prefix' | 'tail' | 'missing';
  complete: boolean;
  diagnostic?: string;
}
export interface NativeOutputCapture {
  origin: 'worker-job-files' | 'owned-process-transport';
  /** Actual dispatch owner and acknowledged-request versus process-exit status. */
  workerPid?: number;
  status?: {kind: 'worker-request' | 'worker-exit' | 'process-exit' | 'unavailable'; code: number | null};
  stdout: NativeStreamCapture;
  stderr: NativeStreamCapture;
  /** Host/protocol errors are not native stderr bytes. */
  diagnostics?: string[];
  requestControl?: Buffer;
  requestControlFormat?: 'worker-mailbox-utf8' | 'windows-supervisor-base64-json';
}

/** Read after stopping writers on failure, and before removing the mailbox. */
export function captureWorkerOutput(directory: string | undefined, maxBytes: number, completed: boolean): NativeOutputCapture {
  const stream = (name: string): NativeStreamCapture => {
    if (!directory) return { observedBytes: null, retained: 'missing', complete: false };
    const file = path.join(directory, name);
    let fd: number | undefined;
    try {
      if (!existsSync(file)) return { observedBytes: null, retained: 'missing', complete: false };
      fd = openSync(file, 'r');
      const info = fstatSync(fd);
      if (!info.isFile()) throw new Error('Native output is not a regular file.');
      const size = info.size, bytes = Buffer.alloc(Math.min(size, maxBytes));
      let offset = 0;
      while (offset < bytes.length) {
        const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (!count) break;
        offset += count;
      }
      const complete = completed && size <= maxBytes && offset === size;
      return { bytes: bytes.subarray(0, offset), observedBytes: size, retained: complete ? 'all' : 'prefix', complete };
    } catch (error) {
      return { observedBytes: null, retained: 'missing', complete: false, diagnostic: String(error).slice(0, 500) };
    } finally { if (fd !== undefined) { try { closeSync(fd); } catch { /* capture must not alter native execution */ } } }
  };
  return { origin: 'worker-job-files', stdout: stream('stdout.log'), stderr: stream('stderr.log') };
}
