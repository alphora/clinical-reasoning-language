# Twostep (nested Q1->Q2) single-$apply progressive/pause cases via MockApplyClient.
. "$PSScriptRoot\_env.ps1"
$PY = "python"
$PD = "twostep-two-step-eligibility"

function RunDemo($label, $oracle) {
  & $PY "$H\build_twostep.py" "$H\policies\twostep" "$H\work\ts-empty.json" none none | Out-Null
  Write-Host ""; Write-Host "########## $label ##########"
  $out = & $JAVA -cp $CP MockApplyClient "$H\work\ts-empty.json" $PD "Patient/ts-pt" $oracle 6 2>&1 | Out-String
  ($out -split "`n") | Where-Object { $_ -match "^###|^--- iter|^  iter|^  Observation|^  Questionnaire" } | ForEach-Object { $_ }
}

RunDemo "DEMO A: Q1=false -> Deny A (LEAF, Q2 never asked)"                "Q1?=false"
RunDemo "DEMO B: Q1=true, NO Q2 -> Q2 revealed progressively, PAUSE at Q2" "Q1?=true"
RunDemo "DEMO C: Q1=true;Q2=true -> Approve (LEAF)"                        "Q1?=true;Q2?=true"
RunDemo "DEMO D: Q1=true;Q2=false -> Deny B (LEAF)"                        "Q1?=true;Q2?=false"
