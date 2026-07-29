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
if (-not $repoRoot) { throw "P05.12AL must run inside the EMETSEES Git repository." }
Set-Location $repoRoot

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()
if ($branch -ne "main") { throw "P05.12AL must run on main. Current branch: $branch" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportRoot = Join-Path $repoRoot ".private\reports\P05.12"
$reportDir = Join-Path $reportRoot "$stamp-exact-kjv-reader-dataflow-contract"
$candidateA = Join-Path $reportDir "candidate-a"
$candidateB = Join-Path $reportDir "candidate-b"
New-Item -ItemType Directory -Force -Path $candidateA, $candidateB | Out-Null

$scriptRoot = Join-Path $repoRoot "scripts\p0512"
$buildScript = Join-Path $scriptRoot "build-exact-kjv-reader-dataflow-contract.js"
$verifyScript = Join-Path $scriptRoot "verify-exact-kjv-reader-dataflow-contract.js"
$libraryScript = Join-Path $scriptRoot "p0512al-lib.js"
foreach ($required in @($buildScript, $verifyScript, $libraryScript)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Missing P05.12AL script: $required" }
}

Step "Starting P05.12AL exact KJV reader dataflow contract"
Write-Host "Branch: $branch"
Write-Host "Commit: $commit"
Write-Host "This stage writes only under .private\reports\P05.12. It does not modify or promote Scripture."

$failures = New-Object System.Collections.Generic.List[string]

Step "Tracing reader dataflow independently as candidate A"
$exit = Run-NodeLogged -Script $buildScript -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateA) -Stdout (Join-Path $candidateA "build.stdout.log") -Stderr (Join-Path $candidateA "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-a") }

Step "Tracing reader dataflow independently as candidate B"
$exit = Run-NodeLogged -Script $buildScript -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateB) -Stdout (Join-Path $candidateB "build.stdout.log") -Stderr (Join-Path $candidateB "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-b") }

if ((Test-Path (Join-Path $candidateA "build-summary.json")) -and (Test-Path (Join-Path $candidateB "build-summary.json"))) {
  Step "Comparing both traces and rechecking protected production state"
  $exit = Run-NodeLogged -Script $verifyScript -Arguments @("--repo-root", $repoRoot, "--candidate-a", $candidateA, "--candidate-b", $candidateB, "--report-dir", $reportDir) -Stdout (Join-Path $reportDir "verification.stdout.log") -Stderr (Join-Path $reportDir "verification.stderr.log")
  if ($exit -ne 0) { $failures.Add("verification") }
} else {
  $failures.Add("verification-not-run")
}

@"
# EMETSEES P05.12AL — Exact KJV Reader Dataflow and Adapter Contract

This staging-only stage follows the actual local TypeScript/JavaScript import graph from the reader entry points to the visible KJV artifact and the canonical token-availability store.

It was created because P05.12AK correctly failed closed when a lexical string scan could not resolve the indirect visible-reader consumer. P05.12AL does not modify production Scripture, create alignments, or authorize promotion.
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

Step "Packaging P05.12AL report"
$zip = Join-Path $reportRoot "EMETSEES-P0512AL-EXACT-KJV-READER-DATAFLOW-AND-ADAPTER-CONTRACT-$stamp.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $reportDir "*") -DestinationPath $zip -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12AL report package created:" -ForegroundColor Green
Write-Host $zip
Write-Host "OUTPUT_DIR=$reportDir"
Write-Host "OUTPUT_ZIP=$zip"
Write-Host "Production promotion performed: NO"

if ($failures.Count -gt 0) {
  throw "P05.12AL completed fail-closed with stages: $($failures -join ', '). Upload the report ZIP; do not promote production KJV."
}

Write-Host "P05.12AL passed. Upload the report ZIP for the isolated runtime-adapter application preview." -ForegroundColor Green
