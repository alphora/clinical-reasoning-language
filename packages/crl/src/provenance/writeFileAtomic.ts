import { randomUUID } from "node:crypto";
import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Write `data` to `filePath` tear-free (#250 T14): write a SIBLING temp in the SAME directory (→ same filesystem, so the
 * final rename is atomic and never crosses a device boundary — libuv's `uv_fs_rename` passes `MOVEFILE_COPY_ALLOWED` on
 * Windows, which would silently degrade a cross-volume rename to a non-atomic copy+delete; the same-dir temp makes that
 * branch unreachable), then rename it over the target. `renameSync` REPLACES an existing destination on both POSIX and
 * Windows (`MOVEFILE_REPLACE_EXISTING`). The temp name is SHORT and fixed-length (it does not extend `filePath`, so a
 * destination basename near the OS component limit cannot push the temp over it) and per-CALL-unique (pid + a fresh uuid)
 * so two writers to the same path can't clobber a shared temp; the temp is best-effort cleaned up on any failure.
 * THROWS on a real IO failure — the caller surfaces it, exactly as the plain `writeFileSync` it replaces did.
 *
 * Bounds of the guarantee:
 *  - PER-FILE only — this makes ONE file's write all-or-nothing; it does NOT make a multi-file set (e.g. the canonicalize
 *    `.txt` + `.anchormeta.json` pair) transactional: a failure between two atomic writes leaves the first in place.
 *  - Crash-atomic, NOT power-durable — no `fsync` of the temp or its directory (deliberately: the T14 pin does not ask
 *    for it, and forced I/O is a known hazard on the ReFS Dev Drive), so on power loss the rename may be visible while
 *    the data blocks are not. A SIGKILL between write and rename leaves a uniquely-named temp behind (harmless, unswept).
 *  - On Windows a rename can transiently throw EPERM/EACCES if the destination is held open (AV scanner / indexer / an
 *    editor); there is no retry loop — it fails loudly and the prior target content is intact.
 */
export function writeFileAtomic(filePath: string, data: string | Buffer): void {
  const tmp = join(dirname(filePath), `.crl-tmp-${process.pid}-${randomUUID()}`);
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, filePath);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      // best-effort cleanup — the original write/rename error is the one that matters, so swallow this and rethrow it.
    }
    throw e;
  }
}
