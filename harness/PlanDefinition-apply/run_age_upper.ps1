# #215 UPPER-BOUND patient-age matrix on the real cqf engine. One $apply per (decision,case).
# Proves the BOTH-REP `under 21` (exclusive) and `at most 21` (inclusive) predicates + an
# authored decision-layer `when not`. Cases (build_age_upper.py): a=age15, b=age46,
# c=UNKNOWN, d=age21, e=recency-local-under21. The headline is (pediatric,c): UNKNOWN age
# DENIES — the exact cell where `sem-not "Age 21 Or Older"` produced a wrong APPROVE.
#
# Re-emit the policy from source after a CRL/emitter change (needs a built crl dist):
#   node ../../packages/crl/dist/cli/run-emitter.js --path src/patient-age-upper/src/crl/patient-age-upper.crl \
#     --out-dir policies/patient-age-upper --target fhir-def --date 2026-07-30 --quiet
# Run: $env:JAVA_HOME="C:\Program Files\Java\jdk-23"; ./run_age_upper.ps1   (needs build.ps1 first)
. "$PSScriptRoot\_env.ps1"
$PY = "python"
$APP = "patient-age-upper-certify-approve-recommendation"
$DEN = "patient-age-upper-not-certify-deny-recommendation"

# (decision-pd-suffix, case, expected, why)  — BOTH-REP lane (the KE's measured case)
$matrix = @(
  # both-rep EXCLUSIVE under-21 — the core 5-case proof
  @("pediatric-eligibility-determination", "a", "Approve", "under-21: age 15 -> TRUE"),
  @("pediatric-eligibility-determination", "b", "Deny", "under-21: age 46 -> FALSE"),
  @("pediatric-eligibility-determination", "c", "Deny", "under-21: UNKNOWN -> FALSE  [THE FIX: sem-not would GRANT]"),
  @("pediatric-eligibility-determination", "d", "Deny", "under-21: age 21 -> 21<21 FALSE (exclusive)"),
  @("pediatric-eligibility-determination", "e", "Approve", "under-21: recency local TRUE wins over computed FALSE"),
  # both-rep INCLUSIVE at-most-21 — proves <= vs <
  @("inclusive-boundary-determination", "d", "Approve", "at-most-21: age 21 -> 21<=21 TRUE (inclusive; under-21 DENIED same patient)"),
  @("inclusive-boundary-determination", "c", "Deny", "at-most-21: UNKNOWN -> FALSE"),
  @("inclusive-boundary-determination", "b", "Deny", "at-most-21: age 46 -> FALSE"),
  # NEGATED both-rep (authored decision-layer `when not`) — unknown truth-set empty -> not fires
  @("negated-both-rep-determination", "a", "Deny", "NOT under-21: age 15 -> TRUE -> not = FALSE -> deny"),
  @("negated-both-rep-determination", "b", "Approve", "NOT under-21: age 46 -> FALSE -> not = TRUE -> FIRES"),
  @("negated-both-rep-determination", "c", "Approve", "NOT under-21: UNKNOWN -> empty/FALSE -> not FALSE = TRUE -> FIRES (closed-world: unknown is not-under-21)")
)

$fail = 0
foreach ($row in $matrix) {
  $suffix, $case, $expect, $why = $row
  $pdId = "patient-age-upper-$suffix"
  $pat = & $PY "$H\build_age_upper.py" $case 2>$null
  $out = & $JAVA -cp $CP MainR5 "$H\work\age-upper-input-$case.json" $pdId "Patient/$pat" 2>&1 | Out-String
  Set-Content -Path "$H\work\out-age-upper-$suffix-$case.txt" -Value $out
  $loadErr = (($out -split "`n") | Select-String -Pattern "Could not load|could not resolve|CqlException|Unable to load|Unable to resolve|Exception|ERROR" | Measure-Object).Count
  $approve = (($out -split "`n") | Select-String -Pattern "apply operation on PlanDefinition/$APP" | Measure-Object).Count
  $deny = (($out -split "`n") | Select-String -Pattern "apply operation on PlanDefinition/$DEN" | Measure-Object).Count
  $disp = if ($approve -gt 0 -and $deny -eq 0) { "Approve" } elseif ($deny -gt 0 -and $approve -eq 0) { "Deny" } elseif ($approve -gt 0 -and $deny -gt 0) { "BOTH?" } else { "NONE" }
  $ok = if ($disp -eq $expect -and $loadErr -eq 0) { "PASS" } else { $fail++; "FAIL" }
  "{0,-34} {1} | {2,-7} exp={3,-7} [{4}] {5}" -f $suffix, $case, $disp, $expect, $ok, $why
}
if ($fail -eq 0) { "`nRESULT: PASS — all $($matrix.Count) upper-bound matrix cells match on the cqf engine." }
else { "`nRESULT: FAIL — $fail of $($matrix.Count) mismatched." ; exit 1 }
