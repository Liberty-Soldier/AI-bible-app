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

function Copy-RelativeFile {
    param(
        [Parameter(Mandatory)][string]$SourceRoot,
        [Parameter(Mandatory)][string]$DestinationRoot,
        [Parameter(Mandatory)][string]$RelativePath
    )

    $source = Join-Path $SourceRoot ($RelativePath.Replace("/", "\"))
    $destination = Join-Path $DestinationRoot ($RelativePath.Replace("/", "\"))
    $parent = Split-Path -Parent $destination

    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    Copy-Item -LiteralPath $source -Destination $destination -Force
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$packageRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$stagingRoot = Join-Path $packageRoot ".private\p0512s-reader-schema-adapter"
$payloadRoot = Join-Path $stagingRoot "payload"
$manifestPath = Join-Path $stagingRoot "implementation-manifest.json"

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Missing P05.12S implementation manifest."
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()

if ($branch -ne [string]$manifest.baseBranch) {
    throw "Expected branch $($manifest.baseBranch); found $branch."
}

if ($commit -ne [string]$manifest.baseCommit) {
    throw "Expected base commit $($manifest.baseCommit); found $commit."
}

$productionBiblePaths = [ordered]@{
    web = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json"
    kjv = Join-Path $RepoRoot "app\data\scripture\generatedKJV.json"
    brenton = Join-Path $RepoRoot "app\data\scripture\generatedBrenton.json"
}

$productionHashesBefore = [ordered]@{}

foreach ($entry in $productionBiblePaths.GetEnumerator()) {
    if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) {
        throw "Missing production Scripture file: $($entry.Value)"
    }

    $productionHashesBefore[$entry.Key] = Get-Sha256 -Path $entry.Value
}

Write-Step "Verifying the exact P05.12R source snapshot"

foreach ($file in $manifest.modifiedExisting) {
    $target = Join-Path $RepoRoot ([string]$file.path).Replace("/", "\")

    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        throw "Required implementation target is missing: $($file.path)"
    }

    $actual = Get-Sha256 -Path $target

    if ($actual -ne [string]$file.expectedSha256) {
        throw "Implementation target changed after P05.12R: $($file.path)`nExpected: $($file.expectedSha256)`nActual:   $actual"
    }
}

foreach ($relativePath in $manifest.newFiles) {
    $target = Join-Path $RepoRoot ([string]$relativePath).Replace("/", "\")

    if (Test-Path -LiteralPath $target) {
        throw "New P05.12S file already exists: $relativePath"
    }
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-reader-schema-adapter-implementation"
$backupRoot = Join-Path $outputRoot "backup"
$reportZip = Join-Path $reportParent "EMETSEES-P0512S-READER-SCHEMA-ADAPTER-IMPLEMENTATION-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512S-FAILURE-$stamp.zip"
$buildLog = Join-Path $outputRoot "npm-build.log"

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

Write-Step "Backing up the 12 implementation targets"

foreach ($file in $manifest.modifiedExisting) {
    Copy-RelativeFile `
        -SourceRoot $RepoRoot `
        -DestinationRoot $backupRoot `
        -RelativePath ([string]$file.path)
}

$appliedNewFiles = New-Object System.Collections.Generic.List[string]
$completed = $false

try {
    Write-Step "Installing the reader schema adapter implementation"

    foreach ($file in $manifest.modifiedExisting) {
        Copy-RelativeFile `
            -SourceRoot $payloadRoot `
            -DestinationRoot $RepoRoot `
            -RelativePath ([string]$file.path)
    }

    foreach ($relativePath in $manifest.newFiles) {
        Copy-RelativeFile `
            -SourceRoot $payloadRoot `
            -DestinationRoot $RepoRoot `
            -RelativePath ([string]$relativePath)

        $appliedNewFiles.Add([string]$relativePath)
    }

    Write-Step "Running focused adapter verification"

    & node .\scripts\p0512\verify-reader-schema-adapter-integration.js

    if ($LASTEXITCODE -ne 0) {
        throw "Focused P05.12S verification failed."
    }

    Write-Step "Running the full repository build"

    & npm.cmd run build 2>&1 |
        Tee-Object -FilePath $buildLog

    if ($LASTEXITCODE -ne 0) {
        throw "Repository build failed with exit code $LASTEXITCODE."
    }

    $productionHashesAfter = [ordered]@{}

    foreach ($entry in $productionBiblePaths.GetEnumerator()) {
        $productionHashesAfter[$entry.Key] = Get-Sha256 -Path $entry.Value

        if ($productionHashesAfter[$entry.Key] -ne $productionHashesBefore[$entry.Key]) {
            throw "Production Scripture JSON changed during P05.12S: $($entry.Key)"
        }
    }

    $changedFiles = @(
        $manifest.modifiedExisting | ForEach-Object { [string]$_.path }
    ) + @(
        $manifest.newFiles | ForEach-Object { [string]$_ }
    )

    $fileRows = @()

    foreach ($relativePath in $changedFiles) {
        $target = Join-Path $RepoRoot $relativePath.Replace("/", "\")

        $fileRows += [pscustomobject]@{
            path = $relativePath
            sha256 = Get-Sha256 -Path $target
            bytes = (Get-Item -LiteralPath $target).Length
            kind = if ($manifest.newFiles -contains $relativePath) {
                "new"
            } else {
                "modified"
            }
        }
    }

    $summary = [ordered]@{
        milestone = "P05.12S"
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        repository = [ordered]@{
            branch = $branch
            baseCommit = $commit
        }
        implementation = [ordered]@{
            modifiedExistingFiles = @($manifest.modifiedExisting).Count
            newFiles = @($manifest.newFiles).Count
            stringVerseLabels = $true
            superscriptionRendering = $true
            memoryAndShareRoutesPreserveLabels = $true
            candidateBrentonTappabilityFailClosed = $true
            productionCandidateApplied = $false
        }
        productionScriptureHashes = [ordered]@{
            before = $productionHashesBefore
            after = $productionHashesAfter
            unchanged = $true
        }
        build = [ordered]@{
            command = "npm run build"
            passed = $true
            log = $buildLog.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
        }
        gates = [ordered]@{
            exactSnapshotHashesVerified = $true
            focusedVerificationPassed = $true
            repositoryBuildPassed = $true
            productionWebModified = $false
            productionKjvModified = $false
            productionBrentonModified = $false
            alignmentsModified = $false
            safeToBuildTransactionalBrentonPromotion = $true
        }
    }

    $summary |
        ConvertTo-Json -Depth 20 |
        Set-Content -LiteralPath (Join-Path $outputRoot "reader-schema-adapter-summary.json") -Encoding UTF8

    $fileRows |
        Export-Csv -LiteralPath (Join-Path $outputRoot "implemented-files.csv") -NoTypeInformation -Encoding UTF8

    & git diff -- $changedFiles |
        Set-Content -LiteralPath (Join-Path $outputRoot "implementation.diff") -Encoding UTF8

    $readme = @"
# EMETSEES P05.12S Reader Schema Adapter Implementation

The actual application reader now supports string verse labels while remaining
backward compatible with the current numeric WEB, KJV, and Brenton runtime.

Implemented:

- normalized legacy and future candidate reader payloads;
- numeric and subverse ordering;
- exact string-label URL anchors and scrolling;
- superscription display outside the verse stream;
- string-label verse selector, bookmarks, highlights, notes, copy, and share;
- candidate-owned Brenton records fail closed for word taps until rebuilt
  display-token alignments are promoted;
- full npm build passed.

Not performed:

- generatedWEB.json was not replaced;
- generatedKJV.json was not replaced;
- generatedBrenton.json was not replaced;
- display tokens and alignments were not rebuilt;
- the P05.12P Brenton candidate was not promoted to production.
"@

    $readme |
        Set-Content -LiteralPath (Join-Path $outputRoot "README.md") -Encoding UTF8

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

    if (Test-Path -LiteralPath $reportZip) {
        Remove-Item -LiteralPath $reportZip -Force
    }

    $reportItems = @(
        Get-ChildItem -LiteralPath $outputRoot -Force |
            Where-Object { $_.Name -ne "backup" } |
            Select-Object -ExpandProperty FullName
    )

    Compress-Archive `
        -Path $reportItems `
        -DestinationPath $reportZip `
        -CompressionLevel Optimal

    $completed = $true

    Write-Host ""
    Write-Host "P05.12S completed." -ForegroundColor Green
    Write-Host "- Reader schema adapter implemented: YES"
    Write-Host "- String and subverse labels supported: YES"
    Write-Host "- Superscriptions supported: YES"
    Write-Host "- Full repository build passed: YES"
    Write-Host "- Production WEB modified: NO"
    Write-Host "- Production KJV modified: NO"
    Write-Host "- Production Brenton modified: NO"
    Write-Host "- Alignments modified: NO"
    Write-Host "- Report ZIP: $reportZip"
}
catch {
    $failure = $_

    Write-Host ""
    Write-Host "P05.12S failed. Rolling back application source." -ForegroundColor Red

    foreach ($file in $manifest.modifiedExisting) {
        Copy-RelativeFile `
            -SourceRoot $backupRoot `
            -DestinationRoot $RepoRoot `
            -RelativePath ([string]$file.path)
    }

    foreach ($relativePath in $appliedNewFiles) {
        $target = Join-Path $RepoRoot $relativePath.Replace("/", "\")

        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Force
        }
    }

    try {
        & node .\scripts\split-scripture-runtime.js | Out-Null
    }
    catch {
        # Source rollback remains the primary guarantee.
    }

    $failure |
        Out-String |
        Set-Content -LiteralPath (Join-Path $outputRoot "fatal-error.txt") -Encoding UTF8

    if (Test-Path -LiteralPath $failureZip) {
        Remove-Item -LiteralPath $failureZip -Force
    }

    $failureItems = @(
        Get-ChildItem -LiteralPath $outputRoot -Force |
            Where-Object { $_.Name -ne "backup" } |
            Select-Object -ExpandProperty FullName
    )

    if ($failureItems.Count -gt 0) {
        Compress-Archive `
            -Path $failureItems `
            -DestinationPath $failureZip `
            -CompressionLevel Optimal
    }

    throw "P05.12S failed and source files were rolled back. Upload: $failureZip"
}
finally {
    if (-not $completed) {
        Write-Host "P05.12S production candidate apply authorized: NO" -ForegroundColor Yellow
    }
}
