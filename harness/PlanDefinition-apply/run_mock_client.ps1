# Demonstrates the reusable MOCK PlanDefinition-apply CLIENT (MockApplyClient): path (a)
# server-side extract via re-contained QR (primary), path (b) --mode extract, and the guard.
. "$PSScriptRoot\_env.ps1"
$PY = "python"

function Trace($out) {
  ($out -split "`n") | Where-Object { $_ -match "^###|^--- iter|^  iter|^  Observation|^  Questionnaire|GUARD FAILED|IllegalStateException" } | ForEach-Object { $_ }
}

function PatientAge($label, $oracle, $extra) {
  & $PY "$H\build_flow.py" "$H\work\pa-nothing.json" nothing | Out-Null
  Write-Host ""; Write-Host "########## $label ##########"
  $a = @("$H\work\pa-nothing.json", "patient-age-adult-eligibility-determination", "Patient/flow-pt", $oracle, "5") + $extra
  Trace (& $JAVA -cp $CP MockApplyClient @a 2>&1 | Out-String)
}
function TwoStep($label, $oracle, $extra) {
  & $PY "$H\build_twostep.py" "$H\policies\twostep" "$H\work\ts-empty.json" none none | Out-Null
  Write-Host ""; Write-Host "########## $label ##########"
  $a = @("$H\work\ts-empty.json", "twostep-two-step-eligibility", "Patient/ts-pt", $oracle, "6") + $extra
  Trace (& $JAVA -cp $CP MockApplyClient @a 2>&1 | Out-String)
}

PatientAge "PATIENT-AGE (a): no birthDate + age=TRUE  -> Approve (LEAF)" "Age 18 Or Older?=true"  @()
PatientAge "PATIENT-AGE (a): no birthDate + age=FALSE -> Deny (LEAF)"    "Age 18 Or Older?=false" @()
PatientAge "PATIENT-AGE (b) --mode extract: age=TRUE  -> Approve (LEAF)" "Age 18 Or Older?=true"  @("--mode", "extract")

TwoStep "TWOSTEP (a): Q1=true, NO Q2 -> Q2 revealed, PAUSE at Q2"    "Q1?=true" @()
TwoStep "TWOSTEP (a): Q1=true;Q2=true -> Approve (LEAF), progressive" "Q1?=true;Q2?=true" @()
TwoStep "TWOSTEP (a): Q1=false -> Deny A (LEAF), Q2 never asked"     "Q1?=false" @()

# GUARD TEST: deliberately malform the QR (leave it referenced, not contained) -> BEFORE-guard must FAIL LOUD.
PatientAge "GUARD TEST (--malform-referenced): expect a LOUD 'GUARD FAILED' + non-zero exit" "Age 18 Or Older?=true" @("--malform-referenced")
