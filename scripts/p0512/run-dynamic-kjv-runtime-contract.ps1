[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Run-NodeLogged {
  param(
    [string]$Script,
    [string[]]$Arguments,
    [string]$Stdout,
    [string]$Stderr
  )
  & node --max-old-space-size=8192 $Script @Arguments 1> $Stdout 2> $Stderr
  return $LASTEXITCODE
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) { throw "P05.12AM must run inside the EMETSEES Git repository." }
Set-Location $repoRoot

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()
if ($branch -ne "main") { throw "P05.12AM must run on main. Current branch: $branch" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportRoot = Join-Path $repoRoot ".private\reports\P05.12"
$reportDir = Join-Path $reportRoot "$stamp-dynamic-kjv-runtime-contract"
$candidateA = Join-Path $reportDir "candidate-a"
$candidateB = Join-Path $reportDir "candidate-b"
New-Item -ItemType Directory -Force -Path $candidateA, $candidateB | Out-Null

$scriptRoot = Join-Path $repoRoot "scripts\p0512"
$buildScript = Join-Path $scriptRoot "build-dynamic-kjv-runtime-contract.js"
$verifyScript = Join-Path $scriptRoot "verify-dynamic-kjv-runtime-contract.js"
$libraryScript = Join-Path $scriptRoot "p0512am-lib.js"
foreach ($required in @($buildScript, $verifyScript, $libraryScript)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Missing P05.12AM script: $required" }
}

Step "Starting P05.12AM dynamic KJV runtime contract"
Write-Host "Branch: $branch"
Write-Host "Commit: $commit"
Write-Host "This stage writes only under .private\reports\P05.12. It does not modify or promote Scripture."

$failures = New-Object System.Collections.Generic.List[string]

Step "Resolving dynamic KJV runtime flow independently as candidate A"
$exit = Run-NodeLogged -Script $buildScript -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateA) -Stdout (Join-Path $candidateA "build.stdout.log") -Stderr (Join-Path $candidateA "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-a") }

Step "Resolving dynamic KJV runtime flow independently as candidate B"
$exit = Run-NodeLogged -Script $buildScript -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateB) -Stdout (Join-Path $candidateB "build.stdout.log") -Stderr (Join-Path $candidateB "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-b") }

if ((Test-Path (Join-Path $candidateA "build-summary.json")) -and (Test-Path (Join-Path $candidateB "build-summary.json"))) {
  Step "Comparing both contracts and rechecking protected production state"
  $exit = Run-NodeLogged -Script $verifyScript -Arguments @("--repo-root", $repoRoot, "--candidate-a", $candidateA, "--candidate-b", $candidateB, "--report-dir", $reportDir) -Stdout (Join-Path $reportDir "verification.stdout.log") -Stderr (Join-Path $reportDir "verification.stderr.log")
  if ($exit -ne 0) { $failures.Add("verification") }
} else {
  $failures.Add("verification-not-run")
}

@"
# EMETSEES P05.12AM — Dynamic KJV Public-Runtime Dataflow and Generator Contract

This staging-only stage resolves the reader path that P05.12AL could not follow through a static import graph.

Exact path under test:

app/data/scripture/generatedKJV.json
→ scripts/split-scripture-runtime.js
→ public/scripture/runtime/kjv/{book}/{chapter}.json
→ app/read/[book]/[chapter]/page.tsx fetch
→ ReaderVerseAdapter.normalizeReaderChapter
→ VerseActionController

The stage compares the production visible KJV and public runtime text to retained P05.12AJ at all 31,102 coordinates. It does not modify production Scripture, create alignments, or authorize promotion.
"@ | Set-Content -LiteralPath (Join-Path $reportDir "README.md") -Encoding UTF8

Step "Writing report checksums"
$checksumPath = Join-Path $reportDir "checksums.sha256"
$lines = Get-ChildItem -LiteralPath $reportDir -Recurse -File |
  Where-Object { $_.FullName -ne $checksumPath } |
  Sort-Object FullName |
  ForEach-Object {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    $relative = $_.FullName.Substring($reportDir.Length + 1).Replace("\", "/")
    "$hash  $relative"
  }
$lines | Set-Content -LiteralPath $checksumPath -Encoding UTF8

Step "Packaging P05.12AM report"
$zip = Join-Path $reportRoot "EMETSEES-P0512AM-DYNAMIC-KJV-PUBLIC-RUNTIME-DATAFLOW-AND-GENERATOR-CONTRACT-$stamp.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $reportDir "*") -DestinationPath $zip -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12AM report package created:" -ForegroundColor Green
Write-Host $zip
Write-Host "OUTPUT_DIR=$reportDir"
Write-Host "OUTPUT_ZIP=$zip"
Write-Host "Production promotion performed: NO"

if ($failures.Count -gt 0) {
  throw "P05.12AM completed fail-closed with stages: $($failures -join ', '). Upload the report ZIP; do not promote production KJV."
}

Write-Host "P05.12AM passed. Upload the report ZIP for the isolated public-runtime adapter application preview." -ForegroundColor Green
