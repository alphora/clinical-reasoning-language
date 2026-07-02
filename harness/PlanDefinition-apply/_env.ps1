# Shared portable environment for the run scripts. Dot-source this: . "$PSScriptRoot\_env.ps1"
# Sets $H (harness dir), $JAVA (jdk-23 or $JAVA_HOME), $LIB (jars dir), $CP (classpath),
# and ensures $H\work exists. Does NOT compile — run build.ps1 first.
$H = $PSScriptRoot
$JAVA = if ($env:JAVA_HOME) { "$env:JAVA_HOME\bin\java.exe" } else { "C:\Program Files\Java\jdk-23\bin\java.exe" }
$LIB = if ($env:CRL_APPLY_HARNESS_LIB) { $env:CRL_APPLY_HARNESS_LIB } else { "$H\lib" }
$jars = Get-ChildItem "$LIB\*.jar" -ErrorAction SilentlyContinue
if (-not $jars) { Write-Error "No jars under '$LIB' — populate ./lib or set CRL_APPLY_HARNESS_LIB (see README.md)."; exit 1 }
if (-not (Test-Path "$H\out\MockApplyClient.class")) { Write-Error "Not compiled — run build.ps1 first."; exit 1 }
$CP = "$H\out;" + (($jars | ForEach-Object { $_.FullName }) -join ";")
New-Item -ItemType Directory -Force -Path "$H\work" | Out-Null
