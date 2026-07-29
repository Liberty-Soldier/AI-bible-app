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

  # Use a child process so a fail-closed Node exit cannot terminate this
  # PowerShell wrapper before diagnostics and the report ZIP are written.
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
if (-not $repoRoot) { throw "P05.12AN must run inside the EMETSEES Git repository." }
Set-Location $repoRoot

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()
if ($branch -ne "main") { throw "P05.12AN must run on main. Current branch: $branch" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportRoot = Join-Path $repoRoot ".private\reports\P05.12"
$reportDir = Join-Path $reportRoot "$stamp-isolated-kjv-reader-runtime-route-overlay-preview"
$candidateA = Join-Path $reportDir "candidate-a"
$candidateB = Join-Path $reportDir "candidate-b"
New-Item -ItemType Directory -Force -Path $candidateA, $candidateB | Out-Null

$scriptRoot = Join-Path $repoRoot "scripts\p0512"
$buildScript = Join-Path $scriptRoot "build-isolated-kjv-reader-runtime-route-overlay-preview.js"
$verifyScript = Join-Path $scriptRoot "verify-isolated-kjv-reader-runtime-route-overlay-preview.js"
$snapshotScript = Join-Path $scriptRoot "snapshot-p0512an-protected-state.js"
$libraryScript = Join-Path $scriptRoot "p0512an-lib.js"
foreach ($required in @($buildScript, $verifyScript, $snapshotScript, $libraryScript)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Missing P05.12AN script: $required" }
}

Step "Starting P05.12AN V4 isolated KJV2006 reader-runtime and route-overlay preview"
Write-Host "Branch: $branch"
Write-Host "Commit: $commit"
Write-Host "This stage writes only under .private\reports\P05.12. It does not modify or promote production Scripture."

$failures = New-Object System.Collections.Generic.List[string]
$protectedBefore = Join-Path $reportDir "protected-state-before.json"
$gitBefore = Join-Path $reportDir "git-status-before.txt"
$gitAfter = Join-Path $reportDir "git-status-after.txt"
(& git status --short --untracked-files=all) | Set-Content -LiteralPath $gitBefore -Encoding UTF8

Step "Capturing protected production state before staging"
$exit = Run-NodeLogged -Script $snapshotScript -Arguments @("--repo-root", $repoRoot, "--output", $protectedBefore) -Stdout (Join-Path $reportDir "protected-state-before.stdout.log") -Stderr (Join-Path $reportDir "protected-state-before.stderr.log")
if ($exit -ne 0) { $failures.Add("protected-before") }

Step "Building independent staging candidate A"
$exit = Run-NodeLogged -Script $buildScript -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateA) -Stdout (Join-Path $candidateA "build.stdout.log") -Stderr (Join-Path $candidateA "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-a") }

Step "Building independent staging candidate B"
$exit = Run-NodeLogged -Script $buildScript -Arguments @("--repo-root", $repoRoot, "--output-dir", $candidateB) -Stdout (Join-Path $candidateB "build.stdout.log") -Stderr (Join-Path $candidateB "build.stderr.log")
if ($exit -ne 0) { $failures.Add("candidate-b") }

if ((Test-Path (Join-Path $candidateA "build-summary.json")) -and (Test-Path (Join-Path $candidateB "build-summary.json")) -and (Test-Path $protectedBefore)) {
  Step "Comparing both staging applications and rechecking protected production state"
  $exit = Run-NodeLogged -Script $verifyScript -Arguments @("--repo-root", $repoRoot, "--candidate-a", $candidateA, "--candidate-b", $candidateB, "--report-dir", $reportDir, "--protected-before", $protectedBefore) -Stdout (Join-Path $reportDir "verification.stdout.log") -Stderr (Join-Path $reportDir "verification.stderr.log")
  if ($exit -ne 0) { $failures.Add("verification") }
} else {
  $failures.Add("verification-not-run")
}

(& git status --short --untracked-files=all) | Set-Content -LiteralPath $gitAfter -Encoding UTF8

@"
# EMETSEES P05.12AN — Isolated KJV2006 Reader-Runtime and Route-Overlay Application Preview

This V4 stage preserves every approved source-token tuple exactly and always packages fail-closed diagnostics. It performs the staging-only application preview.

The approved runtime contains 111 source tokens with no entity ID. They remain preserved as evidence but are not exposed as tappable routes. One AJ-aligned visible token (Acts 5:2, “being”) is therefore intentionally left untappable rather than assigning a guessed entity.

It builds two independent copies of:

1. KJV2006 visible reader data at all 31,102 coordinates;
2. public KJV chapter runtime using the repository's exact unmodified splitter;
3. an exact reader-coordinate KJV word-route overlay derived only from retained P05.12AJ;
4. a staged CanonicalVerseStore adapter that uses the overlay only for KJV;
5. explicit fail-closed token keys for the 17 reader-only coordinates.

Production KJV, WEB, Brenton, canonical data, alignments, runtime files, and source modules are not modified. Production promotion is not authorized or performed.
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

Step "Packaging P05.12AN report"
$zip = Join-Path $reportRoot "EMETSEES-P0512AN-ISOLATED-KJV2006-READER-RUNTIME-ROUTE-OVERLAY-PREVIEW-$stamp.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $reportDir "*") -DestinationPath $zip -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12AN report package created:" -ForegroundColor Green
Write-Host $zip
Write-Host "OUTPUT_DIR=$reportDir"
Write-Host "OUTPUT_ZIP=$zip"
Write-Host "Production promotion performed: NO"

if ($failures.Count -gt 0) {
  throw "P05.12AN completed fail-closed with stages: $($failures -join ', '). Upload the report ZIP; do not promote production KJV."
}

Write-Host "P05.12AN passed. Upload the report ZIP for independent verification." -ForegroundColor Green
