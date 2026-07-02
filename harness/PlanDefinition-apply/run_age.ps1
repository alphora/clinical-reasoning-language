# Patient-age single-$apply recency cases (a-f) — verifies the recency both-rep merge
# (effective-keyed, null-lastUpdated) on the real cqf engine. One $apply per case.
. "$PSScriptRoot\_env.ps1"
$PY = "python"
$pdId = "patient-age-adult-eligibility-determination"
foreach ($case in @("a", "b", "c", "d", "e", "f")) {
  $pat = & $PY "$H\build_age.py" $case 2>$null
  $out = & $JAVA -cp $CP MainR5 "$H\work\age-input-$case.json" $pdId "Patient/$pat" 2>&1 | Out-String
  Set-Content -Path "$H\work\out-age-$case.txt" -Value $out
  $loadErr = (($out -split "`n") | Select-String -Pattern "Could not load|could not resolve|CqlException|Unable to load|Unable to resolve|Exception|ERROR" | Measure-Object).Count
  $approve = (($out -split "`n") | Select-String -Pattern "apply operation on PlanDefinition/patient-age-approve-recommendation" | Measure-Object).Count
  $deny = (($out -split "`n") | Select-String -Pattern "apply operation on PlanDefinition/patient-age-deny-recommendation" | Measure-Object).Count
  $disp = if ($approve -gt 0 -and $deny -eq 0) { "Approve(TRUE)" } elseif ($deny -gt 0 -and $approve -eq 0) { "Deny(FALSE/NOTDET)" } elseif ($approve -gt 0 -and $deny -gt 0) { "BOTH?" } else { "NONE" }
  $qItem = (($out -split "`n") | Select-String -Pattern "patient-age-age-18-or-older" | Measure-Object).Count
  "case $case | pat=$pat | loadErr=$loadErr | approve=$approve deny=$deny => $disp | ageInputRefs=$qItem"
}
