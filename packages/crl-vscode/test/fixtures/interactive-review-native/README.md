# Original native result readback

These are unchanged synthetic native `$apply` results captured on 2026-11-18 by
the quantity-threshold qualification, milliseconds-lower steps 2 and 4. They
contain only synthetic Patient/p data. The source and publication identity are
included so current host provenance can be joined to the original bytes.

- meets.json SHA256: 1c48098030976742780bdfeea19fb54a9511abd7d3434ac03857b42d989957a9
- unmet.json SHA256: 154bd480e5f426513b41326c4feaa12c77fa4d24ba12f88a380c64f171670bed

Tests read these results; they do not run the engine. They pin the root ID,
selected condition-result carriers, recommendation nesting and terminal joins
for these two measured paths. Shared decisions and compound/criterion/unless
routes also have structural tests; these files do not claim native qualification
of every possible orchestration shape.
