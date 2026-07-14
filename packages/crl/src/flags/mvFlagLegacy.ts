// #212 flags→MV slice 2 — the TRANSITION read-model. During S2→S5 the cockpit reads BOTH the new `.crl/flags/` JSON store
// AND legacy `.crl` meta-tag flags (via CRL core's `collectFlags`). To collapse the six downstream field-access shapes into
// ONE, a legacy `FlagInstance` is adapted to an `MvFlag` here. But the persisted `MvFlag` must stay PURE — the legacy
// write-back needs source coordinates (`.crl` file + line) that must NEVER be serialized into a store record. So the read
// unit is a DISCRIMINATED UNION `ReadFlag`: a store flag carries only its `MvFlag`; a legacy flag carries the `MvFlag` (for
// display/gate/anchor) PLUS a separate `src` handle (for the `.crl` write-back + the reveal meta-line fallback). `saveFlag`
// only ever sees a store/host `MvFlag` — the transient `src` can't leak (design review 246, gpt55+Claude).
import { createHash } from "node:crypto";

import type { FlagInstance } from "../meta/collectFlags";

import { coerceFlagStatus, type MvFlag, type MvFlagAnchor, type MvFlagCategory } from "./mvFlag";
import { isOccurrenceKey, parseOccurrenceKey } from "./occurrenceKey";

/** A fixed sentinel `createdAt` for adapted legacy flags — they have no real creation timestamp, and it must be DETERMINISTIC
 *  (a per-load "now" would mutate the record every rebuild). Migration (S5) stamps a real time when it writes the store record. */
export const LEGACY_CREATED_AT = "1970-01-01T00:00:00.000Z";

/** The source coordinates + RAW parsed values a legacy `.crl` flag needs for its in-place status write-back and its reveal
 *  meta-line fallback. NOT part of `MvFlag` (never persisted). `rawStatus`/`tag`/`body`/`key` are the UNCOERCED parsed
 *  values — the write-back stale-guard (`correspondenceCockpit.ts` writeFlagStatus) compares against these, not the coerced
 *  `MvFlag` fields (a coerced `"pending"→open` would falsely read as stale). */
export interface LegacyFlagSrc {
  filePath?: string;
  lineLocation: FlagInstance["lineLocation"];
  tag: string; // the RAW tag as written (may be an alias) — the stale-guard compares res.parsed.tag against this
  body: string;
  rawStatus: string; // the RAW `; status` field value (absent→"open" already applied by collectFlags)
  key?: string;
}

/** The unit every downstream cockpit site consumes. Origin-tagged so writes/reveal dispatch explicitly (never by sniffing a
 *  field on the flag). A store flag's `flag` is a real persisted record; a legacy flag's `flag` is an ADAPTED view + `src`. */
export type ReadFlag =
  | { origin: "store"; flag: MvFlag }
  | { origin: "legacy"; flag: MvFlag; src: LegacyFlagSrc };

/** Wrap a store record as a `ReadFlag`. */
export const storeReadFlag = (flag: MvFlag): ReadFlag => ({ origin: "store", flag });

/** A DETERMINISTIC file-safe id for an adapted legacy flag (a sha1 over its stable source coordinates). Deterministic —
 *  NOT `randomUUID` — because the cockpit re-runs the load after every toggle/create; a churning id would break list keys,
 *  gid sets, and dedup. `legacy-<hex>` passes `isValidFlagId`. (Legacy flags are never `saveFlag`'d — origin dispatch — so
 *  this id is for in-memory identity only.) */
function legacyId(fi: FlagInstance): string {
  const seed = [fi.filePath ?? "", fi.lineLocation.start.line, fi.lineLocation.start.column, fi.canonicalTag, fi.key ?? fi.body].join("|");
  return "legacy-" + createHash("sha1").update(seed).digest("hex");
}

/** Coerce a legacy `category` string to the enum. LENIENT (unlike `coerceFlag`'s strict store validation): a legacy flag is
 *  a LIVE record we must keep showing, so an absent/unknown category defaults to `validation` rather than dropping it. */
const legacyCategory = (c: string | undefined): MvFlagCategory => (c === "extraction" ? "extraction" : "validation");

/** A human label that survives orphaning ("this flag was about X"). Occurrence flags append the node signature. */
function legacyLabel(fi: FlagInstance, occurrenceKey: string | undefined): string {
  if (occurrenceKey) {
    const sig = parseOccurrenceKey(occurrenceKey).signature;
    return sig ? `${fi.targetName} · ${sig}` : fi.targetName;
  }
  return fi.targetName;
}

/** Adapt a legacy `FlagInstance` into a `ReadFlag` (origin `"legacy"`). The `MvFlag` view drives display/gate/anchor; the
 *  `src` handle drives the `.crl` write-back + reveal fallback. `; key` is promoted to `anchor.occurrenceKey` ONLY when it is
 *  a real occurrence key on a DECISION (`key.includes("~") && isOccurrenceKey && scope==="decision"`) — else it stays a
 *  `dedupKey` (a re-add-guard source-hash; a bare `when[0]`-looking hash must not be mistaken for an occurrence). `status`
 *  and `key` are stripped from the copied `fields` map (they live top-level / in the anchor); `ref` + tag-specific fields
 *  are preserved. */
export function legacyToMvFlag(fi: FlagInstance): ReadFlag {
  const occurrenceKey =
    fi.scope === "decision" && fi.key !== undefined && fi.key.includes("~") && isOccurrenceKey(fi.key) ? fi.key : undefined;
  const dedupKey = fi.key !== undefined && occurrenceKey === undefined ? fi.key : undefined;

  const anchor: MvFlagAnchor = { scope: fi.scope, name: fi.targetName, label: legacyLabel(fi, occurrenceKey) };
  if (fi.libraryName) anchor.library = fi.libraryName;
  if (occurrenceKey) anchor.occurrenceKey = occurrenceKey;

  const fields: Record<string, string> = {};
  for (const [k, v] of fi.fields) if (k !== "status" && k !== "key") fields[k] = v;

  const flag: MvFlag = {
    schemaVersion: 1,
    id: legacyId(fi),
    category: legacyCategory(fi.category),
    tag: fi.canonicalTag, // the canonical concern type (display/gate); the RAW tag lives in src for the write-back guard
    gist: fi.body,
    status: coerceFlagStatus(fi.status),
    fields,
    anchor,
    createdAt: LEGACY_CREATED_AT,
  };
  if (dedupKey) flag.dedupKey = dedupKey;

  return {
    origin: "legacy",
    flag,
    src: { filePath: fi.filePath, lineLocation: fi.lineLocation, tag: fi.tag, body: fi.body, rawStatus: fi.status, key: fi.key },
  };
}
