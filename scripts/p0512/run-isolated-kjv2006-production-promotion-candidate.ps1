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
  $nodeArgs = @("--max-old-space-size=8192", $Script) + $Arguments
  $process = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList $nodeArgs `
    -NoNewWindow `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $Stdout `
    -RedirectStandardError $Stderr
  return $process.ExitCode
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) { throw "P05.12AO must run inside the EMETSEES Git repository." }
Set-Location $repoRoot

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()
if ($branch -ne "main") { throw "P05.12AO must run on main. Current branch: $branch" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportRoot = Join-Path $repoRoot ".private\reports\P05.12"
$reportDir = Join-Path $reportRoot "$stamp-isolated-kjv2006-production-promotion-candidate"
$candidateA = Join-Path $reportDir "candidate-a"
$candidateB = Join-Path $reportDir "candidate-b"
New-Item -ItemType Directory -Force -Path $candidateA, $candidateB | Out-Null

$scriptRoot = Join-Path $repoRoot "scripts\p0512"
$buildScript = Join-Path $scriptRoot "build-isolated-kjv2006-production-promotion-candidate.js"
$verifyScript = Join-Path $scriptRoot "verify-isolated-kjv2006-production-promotion-candidate.js"
$snapshotScript = Join-Path $scriptRoot "snapshot-p0512ao-protected-state.js"
$libraryScript = Join-Path $scriptRoot "p0512ao-lib.js"
foreach ($required in @($buildScript, $verifyScript, $snapshotScript, $libraryScript)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Missing P05.12AO script: $required" }
}

Step "Starting P05.12AO isolated KJV2006 production-promotion candidate"
Write-Host "Branch: $branch"
Write-Host "Commit: $commit"
Write-Host "This stage packages promotion and rollback payloads only under .private\reports\P05.12."
Write-Host "Production promotion performed: NO"

$failures = New-Object System.Collections.Generic.List[string]
$protectedBefore = Join-Path $reportDir "protected-state-before.json"
$gitBefore = Join-Path $reportDir "git-status-before.txt"
$gitAfter = Join-Path $reportDir "git-status-after.txt"
(& git status --short --untracked-files=all) | Set-Content -LiteralPath $gitBefore -Encoding UTF8

Step "Capturing protected production state before packaging"
$exit = Run-NodeLogged -Script $snapshotScript -Arguments @("--repo-root", $repoRoot, "--output", $protectedBefore) -Stdout (Join-Path $reportDir "protected-state-before.stdout.log") -Stderr (Join-Path $reportDir "protected-state-before.stderr.log")
if ($exit -ne 0) { $failures.Add("protected-before") }

Step "Building independent promotion candidate A"
$exit = Run-NodeLogged -Script $buildScript -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateA) -Stdout (Join-Path $candidateA "build.stdout.log") -Stderr (Join-Path $candidateA "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-a") }

Step "Building independent promotion candidate B"
$exit = Run-NodeLogged -Script $buildScript -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateB) -Stdout (Join-Path $candidateB "build.stdout.log") -Stderr (Join-Path $candidateB "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-b") }

if ((Test-Path (Join-Path $candidateA "build-summary.json")) -and (Test-Path (Join-Path $candidateB "build-summary.json")) -and (Test-Path $protectedBefore)) {
  Step "Comparing both candidates and proving production remained unchanged"
  $exit = Run-NodeLogged -Script $verifyScript -Arguments @("--repo-root", $repoRoot, "--candidate-a", $candidateA, "--candidate-b", $candidateB, "--report-dir", $reportDir, "--protected-before", $protectedBefore) -Stdout (Join-Path $reportDir "verification.stdout.log") -Stderr (Join-Path $reportDir "verification.stderr.log")
  if ($exit -ne 0) { $failures.Add("verification") }
} else {
  $failures.Add("verification-not-run")
}

(& git status --short --untracked-files=all) | Set-Content -LiteralPath $gitAfter -Encoding UTF8

@"
# EMETSEES P05.12AO — Isolated KJV2006 Production-Promotion Candidate

This stage consumes only the latest independently passing P05.12AN result.

It builds two byte-identical copies of:

1. the exact five-root KJV2006 promotion payload;
2. the exact rollback payload for every currently existing target;
3. immutable file and directory checksums;
4. an installation map, precondition contract, and fail-closed rollback plan.

The five allowed production target roots are:

- app/data/scripture/generatedKJV.json
- app/data/scripture/generatedKJV.ts
- app/data/scripture/CanonicalVerseStore.ts
- public/scripture/runtime/kjv
- public/data/bibleiq/word-study-kjv-reader

P05.12AO does not write, replace, merge, or promote any production file. A separate controlled P05.12AP stage is required.
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

Step "Packaging P05.12AO report"
$zip = Join-Path $reportRoot "EMETSEES-P0512AO-ISOLATED-KJV2006-PRODUCTION-PROMOTION-CANDIDATE-$stamp.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $reportDir "*") -DestinationPath $zip -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12AO report package created:" -ForegroundColor Green
Write-Host $zip
Write-Host "OUTPUT_DIR=$reportDir"
Write-Host "OUTPUT_ZIP=$zip"
Write-Host "Production promotion performed: NO"

if ($failures.Count -gt 0) {
  throw "P05.12AO completed fail-closed with stages: $($failures -join ', '). Upload the report ZIP; do not promote production KJV."
}

Write-Host "P05.12AO passed. Upload the report ZIP for independent verification." -ForegroundColor Green
