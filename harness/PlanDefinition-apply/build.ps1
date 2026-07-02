# Compile the PlanDefinition-apply client Java sources into ./out.
# Requires JDK 23 (or set JAVA_HOME) and the cqf-fhir-cr runtime jars in ./lib
# (or set CRL_APPLY_HARNESS_LIB to a dir of jars). See README.md "Setup & run".
$ErrorActionPreference = "Stop"
$H = $PSScriptRoot
$JAVA_HOME_BIN = if ($env:JAVA_HOME) { "$env:JAVA_HOME\bin" } else { "C:\Program Files\Java\jdk-23" + "\bin" }
$JAVAC = "$JAVA_HOME_BIN\javac.exe"
$LIB = if ($env:CRL_APPLY_HARNESS_LIB) { $env:CRL_APPLY_HARNESS_LIB } else { "$H\lib" }

$jars = Get-ChildItem "$LIB\*.jar" -ErrorAction SilentlyContinue
if (-not $jars) {
  Write-Error "No jars found under '$LIB'. Populate ./lib with the cqf-fhir-cr runtime jars (see README.md) or set CRL_APPLY_HARNESS_LIB."
  exit 1
}
$cp = ($jars | ForEach-Object { $_.FullName }) -join ";"

New-Item -ItemType Directory -Force -Path "$H\out" | Out-Null
$sources = (Get-ChildItem "$H\src\*.java" | ForEach-Object { $_.FullName })
Write-Host "Compiling $($sources.Count) sources -> $H\out (lib=$LIB)"
& $JAVAC -cp $cp -d "$H\out" $sources
if ($LASTEXITCODE -ne 0) { Write-Error "javac failed (exit $LASTEXITCODE)"; exit $LASTEXITCODE }
Write-Host "OK — compiled to $H\out"
