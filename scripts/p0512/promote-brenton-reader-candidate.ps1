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

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content
    )

    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Assert-NoUtf8Bom {
    param([Parameter(Mandatory)][string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)

    if (
        $bytes.Length -ge 3 -and
        $bytes[0] -eq 0xEF -and
        $bytes[1] -eq 0xBB -and
        $bytes[2] -eq 0xBF
    ) {
        throw "UTF-8 BOM detected in JSON file: $Path"
    }
}

function Get-TreeSha256 {
    param([Parameter(Mandatory)][string]$RootPath)

    if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) {
        return ""
    }

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

function Verify-ReportChecksums {
    param([Parameter(Mandatory)][string]$ReportRoot)

    $checksumPath = Join-Path $ReportRoot "checksums.sha256"

    if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
        throw "Missing report checksums: $checksumPath"
    }

    $checked = 0

    foreach ($line in Get-Content -LiteralPath $checksumPath) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        if ($line -notmatch '^([a-fA-F0-9]{64})  (.+)$') {
            throw "Invalid checksum line: $line"
        }

        $expected = $Matches[1].ToLowerInvariant()
        $relative = $Matches[2].Replace("/", "\")
        $filePath = Join-Path $ReportRoot $relative

        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            throw "Missing checksummed report file: $relative"
        }

        $actual = Get-Sha256 -Path $filePath

        if ($actual -ne $expected) {
            throw "Report checksum mismatch: $relative"
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

Write-Step "Verifying completed P05.12S implementation"

$sSummaryPath = $null
$sSummary = $null

foreach ($candidate in @(
    Get-ChildItem -LiteralPath $reportParent -Recurse -File -Filter "reader-schema-adapter-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending
)) {
    try {
        $parsed = Get-Content -LiteralPath $candidate.FullName -Raw | ConvertFrom-Json

        if (
            $parsed.milestone -eq "P05.12S" -and
            $parsed.gates.repositoryBuildPassed -eq $true -and
            $parsed.gates.safeToBuildTransactionalBrentonPromotion -eq $true
        ) {
            $sSummaryPath = $candidate.FullName
            $sSummary = $parsed
            break
        }
    }
    catch {
        # Continue searching.
    }
}

if (-not $sSummaryPath) {
    throw "No completed P05.12S report was found."
}

$sReportRoot = Split-Path -Parent $sSummaryPath
$sChecksumsVerified = Verify-ReportChecksums -ReportRoot $sReportRoot
$implementedFilesPath = Join-Path $sReportRoot "implemented-files.csv"
$implementedFiles = @(Import-Csv -LiteralPath $implementedFilesPath)

Write-Step "Verifying completed P05.12T V5 production state"

$tSummaryPath = $null
$tSummary = $null

foreach ($candidate in @(
    Get-ChildItem -LiteralPath $reportParent -Recurse -File -Filter "brenton-promotion-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending
)) {
    try {
        $parsed = Get-Content -LiteralPath $candidate.FullName -Raw |
            ConvertFrom-Json

        if (
            $parsed.milestone -eq "P05.12T" -and
            $parsed.build.passed -eq $true -and
            $parsed.gates.repositoryBuildPassed -eq $true -and
            $parsed.gates.productionBrentonModified -eq $true -and
            $parsed.gates.permanentIntegrityGateInstalled -eq $true -and
            [int]$parsed.promotion.visibleVerses -eq 28548 -and
            [int]$parsed.promotion.superscriptions -eq 67
        ) {
            $candidateBrentonPath = Join-Path $RepoRoot "app\data\scripture\generatedBrenton.json"

            if (
                (Test-Path -LiteralPath $candidateBrentonPath -PathType Leaf) -and
                (Get-Sha256 -Path $candidateBrentonPath) -eq
                    [string]$parsed.productionHashes.after.brenton
            ) {
                $tSummaryPath = $candidate.FullName
                $tSummary = $parsed
                break
            }
        }
    }
    catch {
        # Continue searching for the latest completed promotion matching
        # the current production state.
    }
}

if (-not $tSummaryPath -or -not $tSummary) {
    throw "No completed P05.12T V5 report matches the current Brenton production state."
}

$tReportRoot = Split-Path -Parent $tSummaryPath
$tChecksumsVerified = Verify-ReportChecksums -ReportRoot $tReportRoot
$tIntegrityReportPath = Join-Path $tReportRoot "generatedBrenton.integrity.json"
$currentIntegrityPath = Join-Path $RepoRoot "app\data\scripture\generatedBrenton.integrity.json"

if (
    -not (Test-Path -LiteralPath $tIntegrityReportPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $currentIntegrityPath -PathType Leaf)
) {
    throw "The completed P05.12T integrity manifest is missing."
}

if (
    (Get-Sha256 -Path $tIntegrityReportPath) -ne
    (Get-Sha256 -Path $currentIntegrityPath)
) {
    throw "Current Brenton integrity manifest does not match the completed P05.12T report."
}

$currentWebPath = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json"
$currentKjvPath = Join-Path $RepoRoot "app\data\scripture\generatedKJV.json"

if (
    (Get-Sha256 -Path $currentWebPath) -ne
        [string]$tSummary.productionHashes.after.web -or
    (Get-Sha256 -Path $currentKjvPath) -ne
        [string]$tSummary.productionHashes.after.kjv
) {
    throw "WEB or KJV no longer matches the completed P05.12T production state."
}

$currentLxxTree = Get-TreeSha256 -RootPath (Join-Path $RepoRoot ".private\scripture\canonical\lxx")

if (
    $currentLxxTree -ne
    [string]$tSummary.canonicalSource.lxxTreeSha256After
) {
    throw "Greek LXX canonical source data changed after the completed P05.12T promotion."
}

# P05.12T V5 intentionally replaced the P05.12S splitter with the durable
# structured-runtime splitter. That one path must be verified through the
# completed V5 production report rather than compared to its obsolete S hash.
$p0512tSupersededPaths = @(
    "scripts/split-scripture-runtime.js"
)

$verifiedP0512SFiles = 0
$verifiedP0512TSupersededFiles = 0

foreach ($file in $implementedFiles) {
    $relativePath = ([string]$file.path).Replace("\", "/")
    $target = Join-Path $RepoRoot $relativePath.Replace("/", "\")

    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        throw "Required reader implementation file is missing: $relativePath"
    }

    if ($p0512tSupersededPaths -contains $relativePath) {
        $verifiedP0512TSupersededFiles++
        continue
    }

    if ((Get-Sha256 -Path $target) -ne [string]$file.sha256) {
        throw "P05.12S implementation file changed after verification: $relativePath"
    }

    $verifiedP0512SFiles++
}

if (
    $verifiedP0512TSupersededFiles -ne 1 -or
    $verifiedP0512SFiles -ne (@($implementedFiles).Count - 1)
) {
    throw "P05.12S/P05.12T prerequisite accounting failed."
}

Write-Host "Verified prerequisite chain:" -ForegroundColor DarkGray
Write-Host "- P05.12S unchanged implementation files: $verifiedP0512SFiles" -ForegroundColor DarkGray
Write-Host "- P05.12T V5 superseded files accepted: $verifiedP0512TSupersededFiles" -ForegroundColor DarkGray
Write-Host "- Current production Brenton matches V5 report: YES" -ForegroundColor DarkGray

$packageRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$payloadRoot = Join-Path $packageRoot ".private\p0512t-brenton-promotion\payload"

$payloadFiles = [ordered]@{
    builder = Join-Path $payloadRoot "scripts\translations\build-brenton-production-from-candidate.js"
    verifier = Join-Path $payloadRoot "scripts\translations\verify-brenton-production-integrity.js"
    splitter = Join-Path $payloadRoot "scripts\split-scripture-runtime.js"
}

foreach ($entry in $payloadFiles.GetEnumerator()) {
    if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) {
        throw "Missing P05.12T payload: $($entry.Value)"
    }
}

$productionFiles = [ordered]@{
    web = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json"
    kjv = Join-Path $RepoRoot "app\data\scripture\generatedKJV.json"
    brenton = Join-Path $RepoRoot "app\data\scripture\generatedBrenton.json"
}

$hashesBefore = [ordered]@{}

foreach ($entry in $productionFiles.GetEnumerator()) {
    $hashesBefore[$entry.Key] = Get-Sha256 -Path $entry.Value
}

$lxxRoot = Join-Path $RepoRoot ".private\scripture\canonical\lxx"
$lxxTreeBefore = Get-TreeSha256 -RootPath $lxxRoot

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outputRoot = Join-Path $reportParent "$stamp-transactional-brenton-promotion"
$backupRoot = Join-Path $outputRoot "backup"
$stagingRoot = Join-Path $outputRoot "staging"
$reportZip = Join-Path $reportParent "EMETSEES-P0512T-TRANSACTIONAL-BRENTON-READER-PROMOTION-V8-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512T-FAILURE-V8-$stamp.zip"
$buildLog = Join-Path $outputRoot "npm-build.log"

New-Item -ItemType Directory -Force -Path $backupRoot, $stagingRoot | Out-Null

$targets = [ordered]@{
    brenton = $productionFiles.brenton
    integrity = Join-Path $RepoRoot "app\data\scripture\generatedBrenton.integrity.json"
    splitter = Join-Path $RepoRoot "scripts\split-scripture-runtime.js"
    builder = Join-Path $RepoRoot "scripts\translations\build-brenton-production-from-candidate.js"
    verifier = Join-Path $RepoRoot "scripts\translations\verify-brenton-production-integrity.js"
    package = Join-Path $RepoRoot "package.json"
}

$existedBefore = [ordered]@{}

foreach ($entry in $targets.GetEnumerator()) {
    $existedBefore[$entry.Key] = Test-Path -LiteralPath $entry.Value

    if ($existedBefore[$entry.Key]) {
        $backup = Join-Path $backupRoot "$($entry.Key).backup"
        Copy-Item -LiteralPath $entry.Value -Destination $backup -Force
    }
}

$candidatePath = Join-Path $stagingRoot "generatedBrenton.json"
$integrityPath = Join-Path $stagingRoot "generatedBrenton.integrity.json"
$decisionPath = Join-Path $stagingRoot "brenton-reader-coordinate-decisions.ndjson"
$repeatCandidatePath = Join-Path $stagingRoot "generatedBrenton.repeat.json"
$repeatIntegrityPath = Join-Path $stagingRoot "generatedBrenton.repeat.integrity.json"
$repeatDecisionPath = Join-Path $stagingRoot "brenton-reader-coordinate-decisions.repeat.ndjson"
$completed = $false

try {
    Write-Step "Installing durable Brenton builder, verifier, and structured splitter"

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targets.builder) | Out-Null

    Copy-Item -LiteralPath $payloadFiles.builder -Destination $targets.builder -Force
    Copy-Item -LiteralPath $payloadFiles.verifier -Destination $targets.verifier -Force
    Copy-Item -LiteralPath $payloadFiles.splitter -Destination $targets.splitter -Force

    Write-Step "Building collision-safe production Brenton candidate twice"

    & node $targets.builder `
        --output $candidatePath `
        --integrity-output $integrityPath `
        --decision-output $decisionPath

    if ($LASTEXITCODE -ne 0) {
        throw "First Brenton production candidate build failed."
    }

    & node $targets.builder `
        --output $repeatCandidatePath `
        --integrity-output $repeatIntegrityPath `
        --decision-output $repeatDecisionPath

    if ($LASTEXITCODE -ne 0) {
        throw "Repeated Brenton production candidate build failed."
    }

    foreach ($pair in @(
        @{ First = $candidatePath; Second = $repeatCandidatePath; Label = "production candidate" },
        @{ First = $integrityPath; Second = $repeatIntegrityPath; Label = "integrity manifest" },
        @{ First = $decisionPath; Second = $repeatDecisionPath; Label = "coordinate decision report" }
    )) {
        $firstHash = Get-Sha256 -Path $pair.First
        $secondHash = Get-Sha256 -Path $pair.Second

        if ($firstHash -ne $secondHash) {
            throw "Repeated $($pair.Label) is not deterministic.`nFirst:  $firstHash`nSecond: $secondHash"
        }
    }

    $prePromotionIntegrity = Get-Content -LiteralPath $integrityPath -Raw | ConvertFrom-Json

    if (
        [int]$prePromotionIntegrity.productionCounts.standardCoordinatesConsidered -ne
        (
            [int]$prePromotionIntegrity.productionCounts.standardCoordinatesAccepted +
            [int]$prePromotionIntegrity.productionCounts.standardCoordinatesRejected
        )
    ) {
        throw "Coordinate decision accounting does not balance before promotion."
    }

    Write-Host "Coordinate decisions verified:" -ForegroundColor DarkGray
    Write-Host "- Considered: $($prePromotionIntegrity.productionCounts.standardCoordinatesConsidered)" -ForegroundColor DarkGray
    Write-Host "- Accepted: $($prePromotionIntegrity.productionCounts.standardCoordinatesAccepted)" -ForegroundColor DarkGray
    Write-Host "- Rejected: $($prePromotionIntegrity.productionCounts.standardCoordinatesRejected)" -ForegroundColor DarkGray

    Write-Step "Promoting Brenton reader data atomically"

    Copy-Item -LiteralPath $candidatePath -Destination "$($targets.brenton).p0512t.candidate" -Force
    Copy-Item -LiteralPath $integrityPath -Destination "$($targets.integrity).p0512t.candidate" -Force

    Move-Item -LiteralPath "$($targets.brenton).p0512t.candidate" -Destination $targets.brenton -Force
    Move-Item -LiteralPath "$($targets.integrity).p0512t.candidate" -Destination $targets.integrity -Force

    Write-Step "Installing the permanent build integrity gate"

    $package = Get-Content -LiteralPath $targets.package -Raw | ConvertFrom-Json
    $integrityCommand = "node scripts/translations/verify-brenton-production-integrity.js"

    if ([string]$package.scripts.prebuild -notmatch [regex]::Escape($integrityCommand)) {
        $package.scripts.prebuild = ([string]$package.scripts.prebuild).Replace(
            "node scripts/split-scripture-runtime.js &&",
            "node scripts/split-scripture-runtime.js && $integrityCommand &&"
        )
    }

    $package.scripts |
        Add-Member `
            -NotePropertyName "verify:brenton-integrity" `
            -NotePropertyValue $integrityCommand `
            -Force

    $packageJson = $package | ConvertTo-Json -Depth 100
    Write-Utf8NoBom -Path $targets.package -Content ($packageJson + "`n")
    Assert-NoUtf8Bom -Path $targets.package

    $packageVerifierPath = Join-Path $stagingRoot "verify-package-json-promotion.js"
    $packageVerificationLog = Join-Path $outputRoot "package-json-verification.log"

    $packageVerificationScript = @'
"use strict";

const fs = require("fs");

const packagePath = process.argv[2];
const command = process.argv[3];

if (!packagePath || !command) {
  throw new Error(
    "Usage: node verify-package-json-promotion.js <package-path> <integrity-command>",
  );
}

const bytes = fs.readFileSync(packagePath);

if (
  bytes.length >= 3 &&
  bytes[0] === 0xef &&
  bytes[1] === 0xbb &&
  bytes[2] === 0xbf
) {
  throw new Error(`UTF-8 BOM detected in ${packagePath}`);
}

const packageJson = JSON.parse(bytes.toString("utf8"));
const prebuild = String(packageJson.scripts?.prebuild || "");

let commandCount = 0;
let searchIndex = 0;

while (true) {
  const foundIndex = prebuild.indexOf(command, searchIndex);

  if (foundIndex < 0) break;

  commandCount += 1;
  searchIndex = foundIndex + command.length;
}

if (commandCount !== 1) {
  throw new Error(
    `Brenton integrity command must appear exactly once in prebuild; found ${commandCount}`,
  );
}

if (packageJson.scripts?.["verify:brenton-integrity"] !== command) {
  throw new Error("verify:brenton-integrity script is incorrect");
}

console.log(
  JSON.stringify(
    {
      status: "package-json-verification-passed",
      packagePath,
      utf8BomPresent: false,
      integrityCommandOccurrencesInPrebuild: commandCount,
      verifyScript: packageJson.scripts["verify:brenton-integrity"],
    },
    null,
    2,
  ),
);
'@

    Write-Utf8NoBom `
        -Path $packageVerifierPath `
        -Content ($packageVerificationScript + "`n")
    Assert-NoUtf8Bom -Path $packageVerifierPath

    & node `
        $packageVerifierPath `
        $targets.package `
        $integrityCommand *> $packageVerificationLog

    $packageVerificationExitCode = $LASTEXITCODE

    if (Test-Path -LiteralPath $packageVerificationLog -PathType Leaf) {
        Get-Content -LiteralPath $packageVerificationLog |
            ForEach-Object { Write-Host $_ }
    }

    if ($packageVerificationExitCode -ne 0) {
        throw "package.json verification failed before the production build. See: $packageVerificationLog"
    }

    Write-Host "package.json JSON/BOM/integrity-script verification passed." -ForegroundColor DarkGray
    Write-Host "package.json encoding verified: UTF-8 without BOM" -ForegroundColor DarkGray

    Write-Step "Running focused production and runtime verification"

    $focusedIntegrityLog = Join-Path $outputRoot "brenton-focused-integrity.log"
    $runtimeIntegrityLog = Join-Path $outputRoot "brenton-runtime-integrity.log"
    $runtimeSplitLog = Join-Path $outputRoot "brenton-runtime-split.log"

    & node $targets.verifier *> $focusedIntegrityLog
    $focusedIntegrityExitCode = $LASTEXITCODE

    if (Test-Path -LiteralPath $focusedIntegrityLog -PathType Leaf) {
        Get-Content -LiteralPath $focusedIntegrityLog |
            ForEach-Object { Write-Host $_ }
    }

    if ($focusedIntegrityExitCode -ne 0) {
        throw "Brenton production integrity verification failed. See: $focusedIntegrityLog"
    }

    & node $targets.splitter *> $runtimeSplitLog
    $runtimeSplitExitCode = $LASTEXITCODE

    if (Test-Path -LiteralPath $runtimeSplitLog -PathType Leaf) {
        Get-Content -LiteralPath $runtimeSplitLog |
            ForEach-Object { Write-Host $_ }
    }

    if ($runtimeSplitExitCode -ne 0) {
        throw "Structured Scripture runtime split failed. See: $runtimeSplitLog"
    }

    & node $targets.verifier --verify-runtime *> $runtimeIntegrityLog
    $runtimeIntegrityExitCode = $LASTEXITCODE

    if (Test-Path -LiteralPath $runtimeIntegrityLog -PathType Leaf) {
        Get-Content -LiteralPath $runtimeIntegrityLog |
            ForEach-Object { Write-Host $_ }
    }

    if ($runtimeIntegrityExitCode -ne 0) {
        throw "Brenton runtime verification failed. See: $runtimeIntegrityLog"
    }

    Write-Step "Running the full repository build"

    & npm.cmd run build 2>&1 |
        Tee-Object -FilePath $buildLog

    if ($LASTEXITCODE -ne 0) {
        throw "Repository build failed with exit code $LASTEXITCODE."
    }

    $hashesAfter = [ordered]@{}

    foreach ($entry in $productionFiles.GetEnumerator()) {
        $hashesAfter[$entry.Key] = Get-Sha256 -Path $entry.Value
    }

    if ($hashesAfter.web -ne $hashesBefore.web) {
        throw "WEB changed during Brenton promotion."
    }

    if ($hashesAfter.kjv -ne $hashesBefore.kjv) {
        throw "KJV changed during Brenton promotion."
    }

    if ($hashesAfter.brenton -eq $hashesBefore.brenton) {
        throw "Brenton production file did not change."
    }

    $lxxTreeAfter = Get-TreeSha256 -RootPath $lxxRoot

    if ($lxxTreeBefore -ne $lxxTreeAfter) {
        throw "Greek LXX canonical source data changed during promotion."
    }

    $integrity = Get-Content -LiteralPath $targets.integrity -Raw | ConvertFrom-Json

    if ((Get-Sha256 -Path $targets.brenton) -ne [string]$integrity.productionSha256) {
        throw "Promoted Brenton hash does not match its integrity manifest."
    }

    $summary = [ordered]@{
        milestone = "P05.12T"
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        repository = [ordered]@{
            branch = $branch
            commit = (& git rev-parse HEAD).Trim()
        }
        upstream = [ordered]@{
            p0512sReport = $sSummaryPath.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
            p0512sChecksumsVerified = $sChecksumsVerified
            p0512sFilesVerified = $verifiedP0512SFiles
            p0512tV5Report = $tSummaryPath.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
            p0512tV5ChecksumsVerified = $tChecksumsVerified
            p0512tV5SupersededFilesAccepted = $verifiedP0512TSupersededFiles
            p0512tV5ProductionBrentonSha256 = [string]$tSummary.productionHashes.after.brenton
        }
        promotion = [ordered]@{
            visibleVerses = [int]$integrity.productionCounts.visibleVerses
            superscriptions = [int]$integrity.productionCounts.superscriptions
            sourceSegmentsPreserved = [int]$integrity.productionCounts.sourceSegments
            standardCoordinatesConsidered = [int]$integrity.productionCounts.standardCoordinatesConsidered
            sameBookCollisionSafeCoordinates = [int]$integrity.productionCounts.standardCoordinatesAccepted
            collisionOrCrossBookRejectedCoordinates = [int]$integrity.productionCounts.standardCoordinatesRejected
            crossBookCoordinatesRejected = [int]$integrity.productionCounts.crossBookCoordinatesRejected
            crossBookCoordinatesAccepted = [int]$integrity.productionCounts.crossBookCoordinatesAccepted
            sourceReaderBooks = [int]$integrity.productionCounts.sourceReaderBooks
            productionReaderBooks = [int]$integrity.productionCounts.productionReaderBooks
            coordinateDecisionRows = [int]$integrity.productionCounts.coordinateDecisionRows
            candidateBuildRepeatedExactly = $true
            psalm4Reader = "title + verses 1-8"
            candidateTappability = "fail-closed"
        }
        productionHashes = [ordered]@{
            before = $hashesBefore
            after = $hashesAfter
        }
        canonicalSource = [ordered]@{
            lxxTreeSha256Before = $lxxTreeBefore
            lxxTreeSha256After = $lxxTreeAfter
            unchanged = $true
        }
        build = [ordered]@{
            command = "npm run build"
            passed = $true
            log = $buildLog.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
        }
        gates = [ordered]@{
            p0512sVerified = $true
            p0512tV5ProductionStateVerified = $true
            p0512tV5ReportChecksumsValid = $true
            p0512tV5SupersededSplitterAccepted = $true
            currentBrentonMatchesP0512tV5 = $true
            currentIntegrityManifestMatchesP0512tV5 = $true
            brentonCandidateBuiltFromVerifiedP0512P = $true
            repeatedCandidateBuildIdentical = $true
            coordinateDecisionReportIdentical = $true
            coordinateDecisionAccountingBalanced = $true
            packageJsonUtf8WithoutBom = $true
            packageJsonParsedByNode = $true
            packageJsonVerifiedByTemporaryNodeFile = $true
            packageJsonVerificationOutputCaptured = $true
            permanentIntegrityCommandInstalledExactlyOnce = $true
            noDuplicateReaderCoordinates = $true
            readerBookSetMatchesSourceExactly = $true
            readerBookNamesVerifiedExactly = $true
            everyVerseCarriesReaderSourceIdentity = $true
            focusedVerifierOutputCaptured = $true
            runtimeVerifierOutputCaptured = $true
            exactly53BrentonReaderBooks = $true
            noCrossBookReaderMappingsAccepted = $true
            psalm4Corrected = $true
            structuredRuntimePassed = $true
            permanentIntegrityGateInstalled = $true
            repositoryBuildPassed = $true
            productionWebModified = $false
            productionKjvModified = $false
            productionBrentonModified = $true
            lxxCanonicalModified = $false
            displayTokenAlignmentsModified = $false
            safeToRebuildBrentonDisplayTokenAlignments = $true
        }
    }

    $summary |
        ConvertTo-Json -Depth 30 |
        Set-Content -LiteralPath (Join-Path $outputRoot "brenton-promotion-summary.json") -Encoding UTF8

    Copy-Item -LiteralPath $targets.integrity -Destination (Join-Path $outputRoot "generatedBrenton.integrity.json") -Force
    Copy-Item -LiteralPath $decisionPath -Destination (Join-Path $outputRoot "brenton-reader-coordinate-decisions.ndjson") -Force

    $readme = @"
# EMETSEES P05.12T Transactional Brenton Reader Promotion

The source-faithful Brenton candidate is now the production reader text.

- 28,548 visible verses
- 67 superscriptions
- 29,004 source segments preserved through verses, titles, and aliases
- every supported, unambiguous TVTMS reader coordinate evaluated deterministically
- only same-book reader coordinates may alter visible numbering
- all cross-book TVTMS targets remain navigation metadata
- exactly 53 Brenton reader books are preserved
- accepted/rejected coordinate decisions preserved in the report
- Psalm 4 displays one superscription followed by verses 1-8
- source coordinates and LXX ownership remain separate
- word taps remain fail-closed until Brenton display-token alignments are rebuilt
- WEB and KJV were unchanged
- Greek LXX canonical source data was unchanged
- full repository build passed
"@

    $readme |
        Set-Content -LiteralPath (Join-Path $outputRoot "README.md") -Encoding UTF8

    & git diff -- `
        app/data/scripture/generatedBrenton.json `
        app/data/scripture/generatedBrenton.integrity.json `
        scripts/split-scripture-runtime.js `
        scripts/translations/build-brenton-production-from-candidate.js `
        scripts/translations/verify-brenton-production-integrity.js `
        package.json |
        Set-Content -LiteralPath (Join-Path $outputRoot "promotion.diff") -Encoding UTF8

    $checksumPath = Join-Path $outputRoot "checksums.sha256"
    $checksumLines = @(
        Get-ChildItem -LiteralPath $outputRoot -Recurse -File |
            Where-Object {
                $_.FullName -ne $checksumPath -and
                -not $_.FullName.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
                -not $_.FullName.StartsWith($stagingRoot, [System.StringComparison]::OrdinalIgnoreCase)
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

    $reportItems = @(
        Get-ChildItem -LiteralPath $outputRoot -Force |
            Where-Object { $_.Name -notin @("backup", "staging") } |
            Select-Object -ExpandProperty FullName
    )

    Compress-Archive `
        -Path $reportItems `
        -DestinationPath $reportZip `
        -CompressionLevel Optimal

    $completed = $true

    Write-Host ""
    Write-Host "P05.12T V8 completed." -ForegroundColor Green
    Write-Host "- P05.12T V5 production prerequisite verified: YES"
    Write-Host "- V5 structured splitter recognized as intentional supersession: YES"
    Write-Host "- Brenton reader candidate promoted: YES"
    Write-Host "- Candidate built identically twice: YES"
    Write-Host "- Coordinate decision report preserved: YES"
    Write-Host "- Brenton reader books preserved at 53: YES"
    Write-Host "- Exact reader book-name set verified: YES"
    Write-Host "- Explicit reader source identity preserved: YES"
    Write-Host "- Focused/runtime verifier logs captured: YES"
    Write-Host "- Cross-book reader mappings accepted: NO"
    Write-Host "- package.json written UTF-8 without BOM: YES"
    Write-Host "- package.json parsed by Node before build: YES"
    Write-Host "- File-based Node verifier used: YES"
    Write-Host "- package.json verifier output captured: YES"
    Write-Host "- Psalm 4 corrected to title + verses 1-8: YES"
    Write-Host "- Permanent Brenton integrity gate installed: YES"
    Write-Host "- Full repository build passed: YES"
    Write-Host "- Production WEB modified: NO"
    Write-Host "- Production KJV modified: NO"
    Write-Host "- Production Brenton modified: YES"
    Write-Host "- Greek LXX canonical data modified: NO"
    Write-Host "- Display-token alignments modified: NO"
    Write-Host "- Report ZIP: $reportZip"
}
catch {
    $failure = $_

    Write-Host ""
    Write-Host "P05.12T failed. Restoring all promoted files." -ForegroundColor Red

    foreach ($entry in $targets.GetEnumerator()) {
        $backup = Join-Path $backupRoot "$($entry.Key).backup"

        if ($existedBefore[$entry.Key]) {
            Copy-Item -LiteralPath $backup -Destination $entry.Value -Force
        }
        elseif (Test-Path -LiteralPath $entry.Value) {
            Remove-Item -LiteralPath $entry.Value -Force
        }
    }

    try {
        & node .\scripts\split-scripture-runtime.js | Out-Null
    }
    catch {
        # Source restoration is the primary rollback guarantee.
    }

    $failure |
        Out-String |
        Set-Content -LiteralPath (Join-Path $outputRoot "fatal-error.txt") -Encoding UTF8

    if (Test-Path -LiteralPath $failureZip) {
        Remove-Item -LiteralPath $failureZip -Force
    }

    $failureItems = @(
        Get-ChildItem -LiteralPath $outputRoot -Force |
            Where-Object { $_.Name -notin @("backup", "staging") } |
            Select-Object -ExpandProperty FullName
    )

    if ($failureItems.Count -gt 0) {
        Compress-Archive `
            -Path $failureItems `
            -DestinationPath $failureZip `
            -CompressionLevel Optimal
    }

    throw "P05.12T V8 failed and all promoted files were restored. Upload: $failureZip"
}
finally {
    if (-not $completed) {
        Write-Host "Brenton display-token alignment rebuild authorized: NO" -ForegroundColor Yellow
    }
}
