[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Run-NodeLogged {
  param(
    [Parameter(Mandatory = $true)][string]$Script,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Stdout,
    [Parameter(Mandatory = $true)][string]$Stderr
  )

  & node --max-old-space-size=8192 $Script @Arguments 1> $Stdout 2> $Stderr
  return $LASTEXITCODE
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
  throw "P05.12AJ must be run inside the EMETSEES Git repository."
}
Set-Location $repoRoot

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()
if ($branch -ne "main") {
  throw "P05.12AJ must run on main. Current branch: $branch"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportRoot = Join-Path $repoRoot ".private\reports\P05.12"
$reportDir = Join-Path $reportRoot "$stamp-isolated-kjv-translation-block-migration-preview"
$candidateA = Join-Path $reportDir "candidate-a"
$candidateB = Join-Path $reportDir "candidate-b"
New-Item -ItemType Directory -Force -Path $candidateA, $candidateB | Out-Null

$scriptRoot = Join-Path $repoRoot "scripts\p0512"
$snapshotScript = Join-Path $scriptRoot "snapshot-p0512aj-protected-state.js"
$buildScript = Join-Path $scriptRoot "build-isolated-kjv-translation-block-migration-preview.js"
$verifyScript = Join-Path $scriptRoot "verify-isolated-kjv-translation-block-migration-preview.js"
foreach ($required in @($snapshotScript, $buildScript, $verifyScript, (Join-Path $scriptRoot "p0512aj-lib.js"))) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required P05.12AJ script is missing: $required"
  }
}

Write-Step "Starting P05.12AJ isolated KJV translation-block migration preview"
Write-Host "Branch: $branch"
Write-Host "Commit: $commit"
Write-Host "This stage writes only under .private\reports\P05.12. It does not promote production Scripture."

$failures = New-Object System.Collections.Generic.List[string]

Write-Step "Capturing protected production state before staging"
$beforePath = Join-Path $reportDir "protected-state-before.json"
$exit = Run-NodeLogged `
  -Script $snapshotScript `
  -Arguments @("--repo-root", $repoRoot, "--output", $beforePath) `
  -Stdout (Join-Path $reportDir "protected-state-before.stdout.log") `
  -Stderr (Join-Path $reportDir "protected-state-before.stderr.log")
if ($exit -ne 0) { $failures.Add("protected-state-before") }

(& git status --short) | Set-Content -LiteralPath (Join-Path $reportDir "git-status-before.txt") -Encoding UTF8

Write-Step "Building independent staging candidate A"
$exit = Run-NodeLogged `
  -Script $buildScript `
  -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateA, "--label", "candidate-a") `
  -Stdout (Join-Path $candidateA "build.stdout.log") `
  -Stderr (Join-Path $candidateA "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-a") }

Write-Step "Building independent staging candidate B"
$exit = Run-NodeLogged `
  -Script $buildScript `
  -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateB, "--label", "candidate-b") `
  -Stdout (Join-Path $candidateB "build.stdout.log") `
  -Stderr (Join-Path $candidateB "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-b") }

if ((Test-Path -LiteralPath (Join-Path $candidateA "build-summary.json")) -and
    (Test-Path -LiteralPath (Join-Path $candidateB "build-summary.json")) -and
    (Test-Path -LiteralPath $beforePath)) {
  Write-Step "Comparing repeated builds and running staging route gates"
  $exit = Run-NodeLogged `
    -Script $verifyScript `
    -Arguments @(
      "--repo-root", $repoRoot,
      "--candidate-a", $candidateA,
      "--candidate-b", $candidateB,
      "--protected-before", $beforePath,
      "--report-dir", $reportDir
    ) `
    -Stdout (Join-Path $reportDir "verification.stdout.log") `
    -Stderr (Join-Path $reportDir "verification.stderr.log")
  if ($exit -ne 0) { $failures.Add("verification") }
}
else {
  $failures.Add("verification-not-run")
}

(& git status --short) | Set-Content -LiteralPath (Join-Path $reportDir "git-status-after.txt") -Encoding UTF8

@"
# EMETSEES P05.12AJ — Isolated KJV Translation-Block Migration Preview

This report was generated from the retained passing P05.12AI canonical staging candidate.

The stage:
- builds two independent KJV2006 translation-block candidates;
- uses the explicit P05.12AI token-level source-to-reader crosswalk;
- keeps all 31,102 KJV2006 reader coordinates visible;
- keeps the 17 reader-only coordinates visible and fail closed;
- represents one-source-to-many-reader and many-source-to-one-reader topology explicitly;
- applies P05.10 source-ownership and P05.11 aligned-route/fail-closed/tappability gates to staging;
- fingerprints KJV, WEB, Brenton, live canonical, and alignment production state before and after;
- does not authorize or perform production promotion.

Unresolved English-token migrations are deliberately left untappable. No synonym, fuzzy, or new versification heuristic is used.
"@ | Set-Content -LiteralPath (Join-Path $reportDir "README.md") -Encoding UTF8

Write-Step "Writing report checksums"
$checksumPath = Join-Path $reportDir "checksums.sha256"
$checksumLines = Get-ChildItem -LiteralPath $reportDir -Recurse -File |
  Where-Object { $_.FullName -ne $checksumPath } |
  Sort-Object FullName |
  ForEach-Object {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
    $relative = $_.FullName.Substring($reportDir.Length + 1).Replace("\", "/")
    "$hash  $relative"
  }
$checksumLines | Set-Content -LiteralPath $checksumPath -Encoding UTF8

Write-Step "Packaging P05.12AJ report"
$zipPath = Join-Path $reportRoot "EMETSEES-P0512AJ-ISOLATED-KJV-TRANSLATION-BLOCK-MIGRATION-PREVIEW-$stamp.zip"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $reportDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12AJ report package created:" -ForegroundColor Green
Write-Host $zipPath
Write-Host "OUTPUT_DIR=$reportDir"
Write-Host "OUTPUT_ZIP=$zipPath"
Write-Host "Production promotion performed: NO"

if ($failures.Count -gt 0) {
  throw "P05.12AJ completed with failed gates/stages: $($failures -join ', '). Upload the report ZIP; do not promote production KJV."
}

Write-Host "P05.12AJ staging preview passed. Upload the report ZIP before any promotion decision." -ForegroundColor Green
