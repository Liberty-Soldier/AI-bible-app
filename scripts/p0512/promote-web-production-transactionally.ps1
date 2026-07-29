[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TreeSha256 {
    param([Parameter(Mandatory)][string]$RootPath)

    $root = (Resolve-Path -LiteralPath $RootPath).Path
    $lines = @(
        Get-ChildItem -LiteralPath $root -Recurse -File |
            Sort-Object FullName |
            ForEach-Object {
                $relative = $_.FullName.Substring($root.Length).TrimStart("\", "/").Replace("\", "/")
                "$relative`t$($_.Length)`t$(Get-Sha256 -Path $_.FullName)"
            }
    )

    $temporary = [System.IO.Path]::GetTempFileName()

    try {
        [System.IO.File]::WriteAllText(
            $temporary,
            ($lines -join "`n"),
            [System.Text.UTF8Encoding]::new($false)
        )
        return Get-Sha256 -Path $temporary
    }
    finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

function Copy-Tree {
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Destination
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    $process = Start-Process `
        -FilePath "robocopy.exe" `
        -ArgumentList @(
            $Source,
            $Destination,
            "/MIR",
            "/COPY:DAT",
            "/DCOPY:DAT",
            "/R:2",
            "/W:1",
            "/NFL",
            "/NDL",
            "/NP",
            "/NJH",
            "/NJS"
        ) `
        -Wait `
        -PassThru `
        -NoNewWindow

    if ($process.ExitCode -gt 7) {
        throw "Robocopy failed with exit code $($process.ExitCode)."
    }
}

function Invoke-NodeCaptured {
    param(
        [Parameter(Mandatory)][string]$ScriptPath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$StdoutPath,
        [Parameter(Mandatory)][string]$StderrPath,
        [Parameter(Mandatory)][string]$Label
    )

    foreach ($logPath in @($StdoutPath, $StderrPath)) {
        $parent = Split-Path -Parent $logPath
        if ($parent) {
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }
        if (Test-Path -LiteralPath $logPath) {
            Remove-Item -LiteralPath $logPath -Force
        }
    }

    $process = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList (@($ScriptPath) + $Arguments) `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $StdoutPath `
        -RedirectStandardError $StderrPath `
        -Wait `
        -PassThru `
        -NoNewWindow

    Write-Host ""
    Write-Host "--- $Label stdout ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $StdoutPath) {
        Get-Content -LiteralPath $StdoutPath | ForEach-Object { Write-Host $_ }
    }

    Write-Host "--- $Label stderr ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $StderrPath) {
        Get-Content -LiteralPath $StderrPath | ForEach-Object { Write-Host $_ }
    }

    return $process.ExitCode
}

function Verify-Checksums {
    param([Parameter(Mandatory)][string]$ReportRoot)

    $checksumPath = Join-Path $ReportRoot "checksums.sha256"
    if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
        throw "Missing checksums.sha256 in $ReportRoot"
    }

    $checked = 0

    foreach ($line in Get-Content -LiteralPath $checksumPath) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^([a-fA-F0-9]{64})  (.+)$') {
            throw "Invalid checksum line: $line"
        }

        $expected = $Matches[1].ToLowerInvariant()
        $relative = $Matches[2].Replace("/", "\")
        $filePath = Join-Path $ReportRoot $relative

        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            throw "Missing checksummed file: $relative"
        }

        if ((Get-Sha256 -Path $filePath) -ne $expected) {
            throw "Checksum mismatch: $relative"
        }

        $checked++
    }

    return $checked
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$branch = (& git branch --show-current).Trim()
if ($branch -ne "p0512-translation-integrity-rebuild") {
    throw "Expected branch p0512-translation-integrity-rebuild; found $branch"
}

$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"

Write-Step "Verifying completed P05.12W alignment-preservation report"

$wSummaryPath = $null
$wSummary = $null

foreach ($candidateSummary in @(
    Get-ChildItem -LiteralPath $reportParent -Recurse -File -Filter "p0512w-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending
)) {
    try {
        $parsed = Get-Content -LiteralPath $candidateSummary.FullName -Raw |
            ConvertFrom-Json

        if (
            $parsed.milestone -eq "P05.12W" -and
            $parsed.gates.safeToReviewRepair -eq $true -and
            $parsed.verification.passed -eq $true -and
            [int]$parsed.verification.approvedBlocksExact -eq 51 -and
            [int]$parsed.verification.approvedRoutesExact -eq 207
        ) {
            $wSummaryPath = $candidateSummary.FullName
            $wSummary = $parsed
            break
        }
    }
    catch {
        # Continue searching.
    }
}

if (-not $wSummaryPath -or -not $wSummary) {
    throw "No completed P05.12W report was found."
}

$wReportRoot = Split-Path -Parent $wSummaryPath
$wChecksumsVerified = Verify-Checksums -ReportRoot $wReportRoot

$productionWeb = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json"
$productionKjv = Join-Path $RepoRoot "app\data\scripture\generatedKJV.json"
$productionBrenton = Join-Path $RepoRoot "app\data\scripture\generatedBrenton.json"
$canonicalRoot = Join-Path $RepoRoot ".private\scripture\canonical"
$candidateWeb = Join-Path $RepoRoot ".private\generated\translation-ingestion\web\8be4eee9f896f96e\generatedWEB.candidate.json"
$sourceRoot = Join-Path $RepoRoot ".private\sources\web-usfm\eng-web"
$repairedCanonical = Join-Path $RepoRoot ([string]$wSummary.repairedCanonical.path).Replace("/", "\")
$integrityScriptTarget = Join-Path $RepoRoot "scripts\translations\verify-web-production-integrity.js"
$integrityManifestTarget = Join-Path $RepoRoot "app\data\scripture\generatedWEB.integrity.json"
$p0510VerifierTarget = Join-Path $RepoRoot "scripts\p0510\verify-p0510-canonical-source.cjs"
$p0510CanonicalUtils = Join-Path $RepoRoot "scripts\p0510\p0510-canonical-utils.cjs"
$p0511VerifierTarget = Join-Path $RepoRoot "scripts\p0511\verify-p0511-safe-parallel.cjs"
$packageTarget = Join-Path $RepoRoot "package.json"

$packageRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$payloadRoot = Join-Path $packageRoot "payload"
$integrityScriptPayload = Join-Path $payloadRoot "scripts\translations\verify-web-production-integrity.js"
$p0510VerifierPayload = Join-Path $payloadRoot "scripts\p0510\verify-p0510-canonical-source.cjs"
$p0511VerifierPayload = Join-Path $payloadRoot "scripts\p0511\verify-p0511-safe-parallel.cjs"
$p0511RepairPayload = Join-Path $payloadRoot "scripts\p0511\repair-p0511-route-provenance.cjs"
$patchPackagePayload = Join-Path $payloadRoot "scripts\translations\patch-package-web-integrity.js"

foreach ($required in @(
    $productionWeb,
    $productionKjv,
    $productionBrenton,
    $canonicalRoot,
    $candidateWeb,
    $sourceRoot,
    $repairedCanonical,
    $packageTarget,
    $p0510VerifierTarget,
    $p0510CanonicalUtils,
    $p0511VerifierTarget,
    $integrityScriptPayload,
    $p0510VerifierPayload,
    $p0511VerifierPayload,
    $p0511RepairPayload,
    $patchPackagePayload
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required P05.12X input is missing: $required"
    }
}

$approvedOldWebHash = "f55ca3577d763dcf68a8a5883fca811929b1b8f59ba31598363db5d08e66e541"
$productionWebHashBefore = Get-Sha256 -Path $productionWeb
$productionKjvHashBefore = Get-Sha256 -Path $productionKjv
$productionBrentonHashBefore = Get-Sha256 -Path $productionBrenton
$canonicalHashBefore = Get-TreeSha256 -RootPath $canonicalRoot
$candidateHash = Get-Sha256 -Path $candidateWeb
$repairedCanonicalHash = Get-TreeSha256 -RootPath $repairedCanonical

if ($productionWebHashBefore -ne $approvedOldWebHash) {
    throw "Current WEB is not the approved pre-rebuild production file."
}

if ($candidateHash -ne [string]$wSummary.inputs.candidateSha256) {
    throw "Approved WEB candidate no longer matches P05.12W."
}

if ($canonicalHashBefore -ne [string]$wSummary.inputs.liveCanonicalSha256Before) {
    throw "Live canonical source changed after P05.12W."
}

if ($repairedCanonicalHash -ne [string]$wSummary.repairedCanonical.treeSha256) {
    throw "Repaired canonical staging tree no longer matches P05.12W."
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outputRoot = Join-Path $reportParent "$stamp-transactional-web-production-promotion"
$backupRoot = Join-Path $outputRoot "backup"
$reportZip = Join-Path $reportParent "EMETSEES-P0512X-TRANSACTIONAL-WEB-PRODUCTION-PROMOTION-V6-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512X-FAILURE-V6-$stamp.zip"
$buildStdout = Join-Path $outputRoot "npm-build.stdout.log"
$buildStderr = Join-Path $outputRoot "npm-build.stderr.log"
$routeVerifyStdout = Join-Path $outputRoot "p0510-route-rebased-verification.stdout.log"
$routeVerifyStderr = Join-Path $outputRoot "p0510-route-rebased-verification.stderr.log"
$p0511RepairStdout = Join-Path $outputRoot "p0511-route-provenance-repair.stdout.log"
$p0511RepairStderr = Join-Path $outputRoot "p0511-route-provenance-repair.stderr.log"
$p0511VerifyStdout = Join-Path $outputRoot "p0511-route-identity-verification.stdout.log"
$p0511VerifyStderr = Join-Path $outputRoot "p0511-route-identity-verification.stderr.log"
$p0511RepairReport = Join-Path $outputRoot "p0511-route-provenance-repair.json"
$integrityBuildStdout = Join-Path $outputRoot "integrity-build.stdout.log"
$integrityBuildStderr = Join-Path $outputRoot "integrity-build.stderr.log"
$integrityVerifyStdout = Join-Path $outputRoot "integrity-verify.stdout.log"
$integrityVerifyStderr = Join-Path $outputRoot "integrity-verify.stderr.log"

New-Item -ItemType Directory -Force -Path $outputRoot, $backupRoot | Out-Null

Copy-Item -LiteralPath $productionWeb -Destination (Join-Path $backupRoot "generatedWEB.json") -Force
Copy-Item -LiteralPath $packageTarget -Destination (Join-Path $backupRoot "package.json") -Force
Copy-Item -LiteralPath $p0510VerifierTarget -Destination (Join-Path $backupRoot "verify-p0510-canonical-source.cjs") -Force
Copy-Item -LiteralPath $p0511VerifierTarget -Destination (Join-Path $backupRoot "verify-p0511-safe-parallel.cjs") -Force
Copy-Tree -Source $canonicalRoot -Destination (Join-Path $backupRoot "canonical")

$targetExistence = [ordered]@{
    integrityScript = Test-Path -LiteralPath $integrityScriptTarget
    integrityManifest = Test-Path -LiteralPath $integrityManifestTarget
}

if ($targetExistence.integrityScript) {
    Copy-Item -LiteralPath $integrityScriptTarget -Destination (Join-Path $backupRoot "verify-web-production-integrity.js") -Force
}
if ($targetExistence.integrityManifest) {
    Copy-Item -LiteralPath $integrityManifestTarget -Destination (Join-Path $backupRoot "generatedWEB.integrity.json") -Force
}

$promotionValidated = $false
$completed = $false
$failure = $null

try {
    Write-Step "Preflighting P05.11 shared canonical utility resolution"

    $modulePreflightScript = Join-Path $outputRoot "p0511-module-preflight.cjs"
    $modulePreflightSource = @'
"use strict";

const path = require("path");
const utilityPath = path.join(
  process.cwd(),
  "scripts",
  "p0510",
  "p0510-canonical-utils.cjs",
);
const utility = require(utilityPath);

const requiredExports = [
  "normalizedToken",
  "routeIds",
  "arraysEqual",
  "findRecord",
  "localSourceIds",
];

for (const name of requiredExports) {
  if (typeof utility[name] !== "function") {
    throw new Error(`Missing required canonical utility export: ${name}`);
  }
}

console.log(
  JSON.stringify(
    {
      status: "p0511-shared-utility-preflight-passed",
      utilityPath,
      requiredExports,
    },
    null,
    2,
  ),
);
'@

    [System.IO.File]::WriteAllText(
        $modulePreflightScript,
        ($modulePreflightSource + "`n"),
        [System.Text.UTF8Encoding]::new($false)
    )

    $modulePreflightStdout = Join-Path $outputRoot "p0511-module-preflight.stdout.log"
    $modulePreflightStderr = Join-Path $outputRoot "p0511-module-preflight.stderr.log"

    foreach ($preflightLog in @(
        $modulePreflightStdout,
        $modulePreflightStderr
    )) {
        if (Test-Path -LiteralPath $preflightLog) {
            Remove-Item -LiteralPath $preflightLog -Force
        }
    }

    $modulePreflightProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @($modulePreflightScript) `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $modulePreflightStdout `
        -RedirectStandardError $modulePreflightStderr `
        -Wait `
        -PassThru `
        -NoNewWindow

    Write-Host ""
    Write-Host "--- P05.11 shared utility preflight stdout ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $modulePreflightStdout) {
        Get-Content -LiteralPath $modulePreflightStdout |
            ForEach-Object { Write-Host $_ }
    }

    Write-Host "--- P05.11 shared utility preflight stderr ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $modulePreflightStderr) {
        Get-Content -LiteralPath $modulePreflightStderr |
            ForEach-Object { Write-Host $_ }
    }

    if ($modulePreflightProcess.ExitCode -ne 0) {
        throw "P05.11 shared canonical utility preflight failed. See: $modulePreflightStderr"
    }

    Write-Step "Promoting corrected WEB reader and repaired canonical layer together"

    Copy-Item -LiteralPath $candidateWeb -Destination "$productionWeb.p0512x.candidate" -Force
    Move-Item -LiteralPath "$productionWeb.p0512x.candidate" -Destination $productionWeb -Force
    Copy-Tree -Source $repairedCanonical -Destination $canonicalRoot

    if ((Get-Sha256 -Path $productionWeb) -ne $candidateHash) {
        throw "Promoted WEB does not match the approved candidate."
    }

    Write-Step "Installing permanent WEB, P05.10, and P05.11 route-identity verifiers"

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $integrityScriptTarget) | Out-Null
    Copy-Item -LiteralPath $integrityScriptPayload -Destination $integrityScriptTarget -Force
    Copy-Item -LiteralPath $p0510VerifierPayload -Destination $p0510VerifierTarget -Force
    Copy-Item -LiteralPath $p0511VerifierPayload -Destination $p0511VerifierTarget -Force

    Write-Step "Repairing the two stale P05.11 route provenance records"

    $p0511RepairExit = Invoke-NodeCaptured `
        -ScriptPath $p0511RepairPayload `
        -Arguments @(
            "--canonical-root=$canonicalRoot",
            "--output=$p0511RepairReport"
        ) `
        -StdoutPath $p0511RepairStdout `
        -StderrPath $p0511RepairStderr `
        -Label "P05.11 route provenance repair"

    if ($p0511RepairExit -ne 0) {
        throw "P05.11 route provenance repair failed. See: $p0511RepairStderr"
    }

    $p0511Repair = Get-Content -LiteralPath $p0511RepairReport -Raw |
        ConvertFrom-Json

    if (
        $p0511Repair.passed -ne $true -or
        [int]$p0511Repair.expectedRoutes -ne 120 -or
        [int]$p0511Repair.correctedRoutes -ne 2 -or
        @($p0511Repair.failures).Count -ne 0
    ) {
        throw "P05.11 repair report did not resolve exactly two routes."
    }

    $alignmentSummaryPath = Join-Path $wReportRoot "web-alignment-preservation-summary.json"

    $integrityBuildExit = Invoke-NodeCaptured `
        -ScriptPath $integrityScriptTarget `
        -Arguments @(
            "--build",
            "--production", $productionWeb,
            "--canonical-root", $canonicalRoot,
            "--manifest", $integrityManifestTarget,
            "--candidate", $candidateWeb,
            "--source-root", $sourceRoot,
            "--source-candidate-fingerprint", "8be4eee9f896f96e",
            "--alignment-summary", $alignmentSummaryPath
        ) `
        -StdoutPath $integrityBuildStdout `
        -StderrPath $integrityBuildStderr `
        -Label "WEB integrity manifest build"

    if ($integrityBuildExit -ne 0) {
        throw "WEB integrity manifest build failed. See: $integrityBuildStderr"
    }

    & node $patchPackagePayload $packageTarget
    if ($LASTEXITCODE -ne 0) {
        throw "package.json WEB integrity gate installation failed."
    }

    $packageBytes = [System.IO.File]::ReadAllBytes($packageTarget)
    if (
        $packageBytes.Length -ge 3 -and
        $packageBytes[0] -eq 0xEF -and
        $packageBytes[1] -eq 0xBB -and
        $packageBytes[2] -eq 0xBF
    ) {
        throw "package.json contains a UTF-8 BOM."
    }

    Write-Step "Verifying promoted WEB against candidate, source, and canonical layer"

    $integrityVerifyExit = Invoke-NodeCaptured `
        -ScriptPath $integrityScriptTarget `
        -Arguments @(
            "--verify",
            "--production", $productionWeb,
            "--canonical-root", $canonicalRoot,
            "--manifest", $integrityManifestTarget,
            "--candidate", $candidateWeb,
            "--source-root", $sourceRoot,
            "--require-candidate",
            "--require-source"
        ) `
        -StdoutPath $integrityVerifyStdout `
        -StderrPath $integrityVerifyStderr `
        -Label "WEB production integrity verification"

    if ($integrityVerifyExit -ne 0) {
        throw "WEB production integrity verification failed. See: $integrityVerifyStderr"
    }

    Write-Step "Verifying permanent route-rebased P05.10 canonical guard"

    $routeVerifyExit = Invoke-NodeCaptured `
        -ScriptPath $p0510VerifierTarget `
        -Arguments @(
            "--canonical-root=$canonicalRoot",
            "--label=web-production-route-rebased"
        ) `
        -StdoutPath $routeVerifyStdout `
        -StderrPath $routeVerifyStderr `
        -Label "P05.10 route-rebased canonical verification"

    if ($routeVerifyExit -ne 0) {
        throw "Route-rebased canonical verification failed. See: $routeVerifyStderr"
    }

    $routeVerifyReportPath = Join-Path $RepoRoot "reports\p0510-canonical-source-repair\verify-web-production-route-rebased.json"

    if (-not (Test-Path -LiteralPath $routeVerifyReportPath -PathType Leaf)) {
        throw "Route-rebased P05.10 verifier did not produce its report."
    }

    $routeVerifyReport = Get-Content -LiteralPath $routeVerifyReportPath -Raw |
        ConvertFrom-Json

    if (
        $routeVerifyReport.passed -ne $true -or
        [int]$routeVerifyReport.approvedRoutesExact -ne 207 -or
        [int]$routeVerifyReport.approvedRoutesRebased -ne 2 -or
        @($routeVerifyReport.approvedRouteMismatches).Count -ne 0
    ) {
        throw "Route-rebased P05.10 report did not pass 205 legacy + 2 rebased routes."
    }

    Write-Step "Verifying all 120 P05.11 safe-parallel routes by route identity"

    $p0511VerifyExit = Invoke-NodeCaptured `
        -ScriptPath $p0511VerifierTarget `
        -Arguments @(
            "--canonical-root=$canonicalRoot",
            "--label=web-production-route-identity"
        ) `
        -StdoutPath $p0511VerifyStdout `
        -StderrPath $p0511VerifyStderr `
        -Label "P05.11 route-identity canonical verification"

    if ($p0511VerifyExit -ne 0) {
        throw "P05.11 route-identity verification failed. See: $p0511VerifyStderr"
    }

    $p0511VerifyReportPath = Join-Path $RepoRoot "reports\p0511-safe-parallel-apply\verify-web-production-route-identity.json"

    if (-not (Test-Path -LiteralPath $p0511VerifyReportPath -PathType Leaf)) {
        throw "P05.11 route-identity verifier did not produce its report."
    }

    $p0511VerifyReport = Get-Content -LiteralPath $p0511VerifyReportPath -Raw |
        ConvertFrom-Json

    if (
        $p0511VerifyReport.passed -ne $true -or
        [int]$p0511VerifyReport.exactRoutes -ne 120 -or
        @($p0511VerifyReport.mismatches).Count -ne 0
    ) {
        throw "P05.11 route-identity verifier did not pass all 120 routes."
    }

    Write-Step "Running full repository production build with complete output capture"

    $buildProcess = Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList @("run", "build") `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $buildStdout `
        -RedirectStandardError $buildStderr `
        -Wait `
        -PassThru `
        -NoNewWindow

    Write-Host ""
    Write-Host "--- npm build stdout ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $buildStdout) {
        Get-Content -LiteralPath $buildStdout | ForEach-Object { Write-Host $_ }
    }

    Write-Host "--- npm build stderr ---" -ForegroundColor DarkGray
    if (Test-Path -LiteralPath $buildStderr) {
        Get-Content -LiteralPath $buildStderr | ForEach-Object { Write-Host $_ }
    }

    if ($buildProcess.ExitCode -ne 0) {
        throw "Repository build failed with exit code $($buildProcess.ExitCode). See: $buildStderr"
    }

    $productionWebHashAfter = Get-Sha256 -Path $productionWeb
    $productionKjvHashAfter = Get-Sha256 -Path $productionKjv
    $productionBrentonHashAfter = Get-Sha256 -Path $productionBrenton

    if ($productionWebHashAfter -ne $candidateHash) {
        throw "WEB changed during the production build."
    }
    if ($productionKjvHashAfter -ne $productionKjvHashBefore) {
        throw "KJV changed during WEB promotion."
    }
    if ($productionBrentonHashAfter -ne $productionBrentonHashBefore) {
        throw "Brenton changed during WEB promotion."
    }

    # All reader, canonical, route, runtime, and full-build gates have passed.
    # From this point forward, report serialization must not roll back a valid
    # production promotion.
    $promotionValidated = $true

    $manifest = Get-Content -LiteralPath $integrityManifestTarget -Raw |
        ConvertFrom-Json

    Write-Step "Finalizing the verified promotion report"

    foreach ($requiredSummaryFile in @(
        $buildStdout,
        $buildStderr,
        $integrityManifestTarget,
        $p0511RepairReport
    )) {
        if (-not (Test-Path -LiteralPath $requiredSummaryFile -PathType Leaf)) {
            throw "Required success-report input is missing: $requiredSummaryFile"
        }
    }

    $summary = [ordered]@{
        milestone = "P05.12X"
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        repository = [ordered]@{
            branch = $branch
            commit = (& git rev-parse HEAD).Trim()
        }
        upstream = [ordered]@{
            p0512wReport = $wSummaryPath.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
            p0512wChecksumsVerified = $wChecksumsVerified
            recoveredLegacySignatures = [int]$wSummary.repair.recoveredSignatures
            unresolvedLegacySignatures = [int]$wSummary.repair.droppedSignaturesAfter
        }
        promotion = [ordered]@{
            webSha256Before = $productionWebHashBefore
            webSha256After = $productionWebHashAfter
            visibleVerses = [int]$manifest.production.verses
            uniqueCoordinates = [int]$manifest.production.uniqueCoordinates
            canonicalWebRecords = [int]$manifest.canonicalWeb.webRecords
            canonicalWebTokens = [int]$manifest.canonicalWeb.webTokens
            canonicalAlignedWebTokens = [int]$manifest.canonicalWeb.alignedWebTokens
            immutableSourceFiles = [int]$manifest.immutableSource.files
            immutableSourceSha256 = [string]$manifest.immutableSource.sha256
            p0510RoutesExact = [int]$routeVerifyReport.approvedRoutesExact
            p0510RoutesLegacyIndexExact = [int]$routeVerifyReport.approvedRoutesLegacyIndexExact
            p0510RoutesRebased = [int]$routeVerifyReport.approvedRoutesRebased
            p0511RoutesExact = [int]$p0511VerifyReport.exactRoutes
            p0511RoutesLegacyIndexExact = [int]$p0511VerifyReport.legacyIndexExact
            p0511RoutesRouteIdentityRebased = [int]$p0511VerifyReport.routeIdentityRebased
            p0511RoutesCorrected = [int]$p0511Repair.correctedRoutes
            p0511RoutesCorrectedAtLegacyIndex = [int]$p0511Repair.correctedAtLegacyIndex
            p0511RoutesCorrectedAtRebasedIndex = [int]$p0511Repair.correctedAtRebasedIndex
        }
        unaffectedTranslations = [ordered]@{
            kjvSha256Before = $productionKjvHashBefore
            kjvSha256After = $productionKjvHashAfter
            brentonSha256Before = $productionBrentonHashBefore
            brentonSha256After = $productionBrentonHashAfter
        }
        build = [ordered]@{
            command = "npm run build"
            passed = $true
            stdoutLog = $buildStdout.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
            stderrLog = $buildStderr.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
        }
        gates = [ordered]@{
            p0512wVerified = $true
            correctedWebPromoted = $true
            repairedCanonicalPromoted = $true
            productionMatchesApprovedCandidate = $true
            immutableSourceFingerprintVerified = $true
            canonicalWebDigestVerified = $true
            permanentWebIntegrityGateInstalled = $true
            permanentRouteRebasedP0510VerifierInstalled = $true
            all207P0510RoutesExact = $true
            exactly2P0510RoutesRebased = $true
            p0511SharedCanonicalUtilityPreflightPassed = $true
            p0511PreflightUsesDirectNodeInvocation = $true
            p0511PayloadUsesRepositoryRootUtilityResolution = $true
            permanentP0511RouteIdentityVerifierInstalled = $true
            exactly2P0511RoutesCorrected = $true
            all120P0511RoutesExact = $true
            repositoryBuildPassed = $true
            promotionValidatedBeforeReportSerialization = $true
            buildStdoutAndStderrRecordedSeparately = $true
            productionKjvModified = $false
            productionBrentonModified = $false
            displayAlignmentExpansionPerformed = $false
            safeToProceedToKjvIntegrity = $true
        }
    }

    $summary |
        ConvertTo-Json -Depth 30 |
        Set-Content -LiteralPath (Join-Path $outputRoot "web-promotion-summary.json") -Encoding UTF8

    Copy-Item -LiteralPath $integrityManifestTarget -Destination (Join-Path $outputRoot "generatedWEB.integrity.json") -Force

    $completed = $true
}
catch {
    $failure = $_
    $failure | Out-String |
        Set-Content -LiteralPath (Join-Path $outputRoot "fatal-error.txt") -Encoding UTF8
}
finally {
    if (-not $promotionValidated) {
        Write-Step "Rolling back WEB reader, canonical layer, and build configuration"

        Copy-Item -LiteralPath (Join-Path $backupRoot "generatedWEB.json") -Destination $productionWeb -Force
        Copy-Tree -Source (Join-Path $backupRoot "canonical") -Destination $canonicalRoot
        Copy-Item -LiteralPath (Join-Path $backupRoot "package.json") -Destination $packageTarget -Force
        Copy-Item -LiteralPath (Join-Path $backupRoot "verify-p0510-canonical-source.cjs") -Destination $p0510VerifierTarget -Force
        Copy-Item -LiteralPath (Join-Path $backupRoot "verify-p0511-safe-parallel.cjs") -Destination $p0511VerifierTarget -Force

        if ($targetExistence.integrityScript) {
            Copy-Item -LiteralPath (Join-Path $backupRoot "verify-web-production-integrity.js") -Destination $integrityScriptTarget -Force
        }
        elseif (Test-Path -LiteralPath $integrityScriptTarget) {
            Remove-Item -LiteralPath $integrityScriptTarget -Force
        }

        if ($targetExistence.integrityManifest) {
            Copy-Item -LiteralPath (Join-Path $backupRoot "generatedWEB.integrity.json") -Destination $integrityManifestTarget -Force
        }
        elseif (Test-Path -LiteralPath $integrityManifestTarget) {
            Remove-Item -LiteralPath $integrityManifestTarget -Force
        }

        try {
            & node .\scripts\split-scripture-runtime.js | Out-Null
        }
        catch {
            # Source restoration is the primary rollback guarantee.
        }
    }
}

$checksumPath = Join-Path $outputRoot "checksums.sha256"
$checksumLines = @(
    Get-ChildItem -LiteralPath $outputRoot -Recurse -File |
        Where-Object {
            $_.FullName -ne $checksumPath -and
            -not $_.FullName.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)
        } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($outputRoot.Length).TrimStart("\", "/").Replace("\", "/")
            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
)
$checksumLines | Set-Content -LiteralPath $checksumPath -Encoding ASCII

if ($null -ne $failure -or -not $completed) {
    if (Test-Path -LiteralPath $failureZip) {
        Remove-Item -LiteralPath $failureZip -Force
    }

    $items = @(
        Get-ChildItem -LiteralPath $outputRoot -Force |
            Where-Object { $_.Name -ne "backup" } |
            Select-Object -ExpandProperty FullName
    )

    Compress-Archive `
        -Path $items `
        -DestinationPath $failureZip `
        -CompressionLevel Optimal

    if ($promotionValidated) {
        throw "P05.12X V6 production gates passed, but report finalization failed. The validated WEB/canonical promotion was retained. Upload: $failureZip"
    }

    throw "P05.12X V6 failed and WEB/canonical state was restored. Upload: $failureZip"
}

$readme = @"
# EMETSEES P05.12X Transactional WEB Production Promotion

The authoritative 31,098-verse WEB reader and its repaired canonical WEB layer
were promoted together.

The permanent integrity verifier pins:

- production WEB SHA-256;
- 31,098 unique verse coordinates;
- the complete canonical WEB translation/token digest;
- the immutable WEB USFM source-tree fingerprint;
- the approved deterministic candidate.

No alignment expansion was performed. Unsafe legacy routes and newly restored
words remain fail-closed for the later unified alignment rebuild.
"@
$readme | Set-Content -LiteralPath (Join-Path $outputRoot "README.md") -Encoding UTF8

$checksumLines = @(
    Get-ChildItem -LiteralPath $outputRoot -Recurse -File |
        Where-Object {
            $_.FullName -ne $checksumPath -and
            -not $_.FullName.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)
        } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($outputRoot.Length).TrimStart("\", "/").Replace("\", "/")
            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
)
$checksumLines | Set-Content -LiteralPath $checksumPath -Encoding ASCII

if (Test-Path -LiteralPath $reportZip) {
    Remove-Item -LiteralPath $reportZip -Force
}

$items = @(
    Get-ChildItem -LiteralPath $outputRoot -Force |
        Where-Object { $_.Name -ne "backup" } |
        Select-Object -ExpandProperty FullName
)

Compress-Archive `
    -Path $items `
    -DestinationPath $reportZip `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12X V6 completed." -ForegroundColor Green
Write-Host "- Corrected 31,098-verse WEB promoted: YES"
Write-Host "- Repaired canonical WEB layer promoted: YES"
Write-Host "- Permanent WEB integrity gate installed: YES"
Write-Host "- Permanent route-rebased P05.10 verifier installed: YES"
Write-Host "- P05.10 routes verified: 205 legacy indexes + 2 rebased"
Write-Host "- P05.11 shared canonical utility preflight passed: YES"
Write-Host "- P05.11 preflight used direct Node invocation: YES"
Write-Host "- Permanent route-identity P05.11 verifier installed: YES"
Write-Host "- P05.11 stale routes corrected: 2"
Write-Host "- P05.11 routes verified: 120/120"
Write-Host "- Approved candidate comparison passed: YES"
Write-Host "- Immutable WEB source fingerprint passed: YES"
Write-Host "- Full repository build passed: YES"
Write-Host "- Promotion validated before report serialization: YES"
Write-Host "- Build stdout/stderr recorded separately: YES"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Alignment expansion performed: NO"
Write-Host "- Safe to proceed to KJV integrity: YES"
Write-Host "- Report ZIP: $reportZip"
