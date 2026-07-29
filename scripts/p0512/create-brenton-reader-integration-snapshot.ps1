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

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory)][string]$BasePath,
        [Parameter(Mandatory)][string]$TargetPath
    )

    $baseFull = [System.IO.Path]::GetFullPath($BasePath).TrimEnd("\", "/")
    $targetFull = [System.IO.Path]::GetFullPath($TargetPath)

    if (-not $targetFull.StartsWith(
        $baseFull,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        return $targetFull.Replace("\", "/")
    }

    return $targetFull.Substring($baseFull.Length).TrimStart("\", "/").Replace("\", "/")
}

function Copy-SnapshotFile {
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$RelativePath,
        [Parameter(Mandatory)][string]$DestinationRoot,
        [Parameter(Mandatory)]
        [AllowEmptyCollection()]
        [System.Collections.Generic.List[object]]$ManifestRows,
        [string]$Category = "repository-source"
    )

    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
        throw "Required snapshot file is missing: $SourcePath"
    }

    $destination = Join-Path $DestinationRoot ($RelativePath.Replace("/", "\"))
    $destinationParent = Split-Path -Parent $destination

    if ($destinationParent) {
        New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    }

    Copy-Item -LiteralPath $SourcePath -Destination $destination -Force

    $sourceHash = (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()

    if ($sourceHash -ne $destinationHash) {
        throw "Snapshot copy hash mismatch: $RelativePath"
    }

    $item = Get-Item -LiteralPath $SourcePath

    $ManifestRows.Add([pscustomobject]@{
        category = $Category
        path = $RelativePath.Replace("\", "/")
        bytes = $item.Length
        sha256 = $sourceHash
    })
}

function Convert-ToCsvCell {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) {
        return ""
    }

    $text = [string]$Value

    if ($text -match '[,"\r\n]') {
        return '"' + $text.Replace('"', '""') + '"'
    }

    return $text
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$branch = (& git branch --show-current).Trim()
$commit = (& git rev-parse HEAD).Trim()

if ($branch -ne "p0512-translation-integrity-rebuild") {
    throw "Expected branch p0512-translation-integrity-rebuild; found $branch"
}

$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$qSummaries = @(
    Get-ChildItem -LiteralPath $reportParent -Recurse -File -Filter "brenton-reader-adapter-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending
)

$qSummaryPath = $null
$qSummary = $null

foreach ($candidate in $qSummaries) {
    try {
        $parsed = Get-Content -LiteralPath $candidate.FullName -Raw |
            ConvertFrom-Json

        if (
            $parsed.milestone -eq "P05.12Q" -and
            $parsed.status -eq "brenton-reader-adapter-preview-v2-complete" -and
            $parsed.gates.safeToImplementReaderAdapter -eq $true
        ) {
            $qSummaryPath = $candidate.FullName
            $qSummary = $parsed
            break
        }
    }
    catch {
        # Continue looking for the latest valid completed report.
    }
}

if (-not $qSummaryPath -or -not $qSummary) {
    throw "No completed P05.12Q V2 adapter report was found."
}

$qReportRoot = Split-Path -Parent $qSummaryPath
$qChecksums = Join-Path $qReportRoot "checksums.sha256"

if (-not (Test-Path -LiteralPath $qChecksums -PathType Leaf)) {
    throw "P05.12Q V2 checksums.sha256 is missing."
}

Write-Step "Verifying P05.12Q V2 report"

$checksumFailures = New-Object System.Collections.Generic.List[object]
$checksumCount = 0

foreach ($line in Get-Content -LiteralPath $qChecksums) {
    if ([string]::IsNullOrWhiteSpace($line)) {
        continue
    }

    if ($line -notmatch '^([a-fA-F0-9]{64})  (.+)$') {
        $checksumFailures.Add([pscustomobject]@{
            path = $line
            reason = "invalid-checksum-line"
        })
        continue
    }

    $expected = $Matches[1].ToLowerInvariant()
    $relative = $Matches[2].Replace("/", "\")
    $filePath = Join-Path $qReportRoot $relative

    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $checksumFailures.Add([pscustomobject]@{
            path = $relative
            reason = "missing"
        })
        continue
    }

    $checksumCount++
    $actual = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()

    if ($actual -ne $expected) {
        $checksumFailures.Add([pscustomobject]@{
            path = $relative
            reason = "hash-mismatch"
            expected = $expected
            actual = $actual
        })
    }
}

if ($checksumFailures.Count -ne 0) {
    throw "P05.12Q V2 checksum verification failed: $($checksumFailures | ConvertTo-Json -Depth 10)"
}

if (
    $qSummary.gates.generatedRuntimeNumericSortPassed -ne $true -or
    $qSummary.gates.generatedRuntimeSubverseSortPassed -ne $true -or
    $qSummary.gates.all28548VisibleVersesAdapted -ne $true -or
    $qSummary.gates.all67SuperscriptionsAttachSafely -ne $true -or
    $qSummary.gates.all389AliasesResolveSafely -ne $true -or
    $qSummary.gates.all2596FootnotesAvailable -ne $true -or
    $qSummary.gates.all1103ChaptersAdapterTested -ne $true
) {
    throw "P05.12Q V2 required gates are incomplete."
}

$dependencyCsv = Join-Path $qReportRoot "brenton-reader-adapter-dependencies.csv"

if (-not (Test-Path -LiteralPath $dependencyCsv -PathType Leaf)) {
    throw "P05.12Q V2 dependency CSV is missing."
}

$dependencyRows = @(Import-Csv -LiteralPath $dependencyCsv)
$appPaths = @(
    $dependencyRows |
        Where-Object { $_.file -like "app/*" } |
        Select-Object -ExpandProperty file -Unique |
        Sort-Object
)

if ($appPaths.Count -ne 28) {
    throw "Expected exactly 28 production app files from P05.12Q V2; found $($appPaths.Count)."
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outputRoot = Join-Path $reportParent "$stamp-brenton-reader-integration-snapshot"
$payloadRoot = Join-Path $outputRoot "payload"
$zipPath = Join-Path $reportParent "EMETSEES-P0512R-BRENTON-READER-INTEGRATION-SNAPSHOT-V2-$stamp.zip"

if (Test-Path -LiteralPath $outputRoot) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $payloadRoot | Out-Null

$manifestRows = [System.Collections.Generic.List[object]]::new()

if ($null -eq $manifestRows -or $manifestRows.Count -ne 0) {
    throw "Unable to initialize the snapshot manifest collection."
}

Write-Host "Manifest collection initialized: EMPTY and writable" -ForegroundColor DarkGray
Write-Step "Copying the 28 production app integration files"

foreach ($relativePath in $appPaths) {
    $sourcePath = Join-Path $RepoRoot ($relativePath.Replace("/", "\"))

    Copy-SnapshotFile `
        -SourcePath $sourcePath `
        -RelativePath $relativePath `
        -DestinationRoot $payloadRoot `
        -ManifestRows $manifestRows `
        -Category "production-app"
}

Write-Step "Copying build contracts and configuration"

$additionalPaths = @(
    "package.json",
    "tsconfig.json",
    "scripts/split-scripture-runtime.js",
    "scripts/export-bibleiq-canonical-runtime.js",
    "scripts/build-word-study-runtime.js",
    "scripts/build-word-study-entity-runtime.js",
    "scripts/verify-p05-language-display.js",
    "scripts/verify-p05-entity-routing.js",
    "scripts/verify-p05-unified-reader.js",
    "scripts/verify-p05-runtime-fix.js",
    "scripts/verify-p05-word-study-ux.js",
    "scripts/verify-p05-runtime-cache-policy.js"
)

foreach ($relativePath in $additionalPaths) {
    $sourcePath = Join-Path $RepoRoot ($relativePath.Replace("/", "\"))

    if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
        Copy-SnapshotFile `
            -SourcePath $sourcePath `
            -RelativePath $relativePath `
            -DestinationRoot $payloadRoot `
            -ManifestRows $manifestRows `
            -Category "build-contract"
    }
}

foreach ($candidateName in @(
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "package-lock.json"
)) {
    $sourcePath = Join-Path $RepoRoot $candidateName

    if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
        Copy-SnapshotFile `
            -SourcePath $sourcePath `
            -RelativePath $candidateName `
            -DestinationRoot $payloadRoot `
            -ManifestRows $manifestRows `
            -Category "configuration"
    }
}

Write-Step "Copying the staged adapter contract"

$adapterFiles = [ordered]@{
    runtime = [string]$qSummary.stagedAdapter.runtime.path
    typescript = [string]$qSummary.stagedAdapter.typescript.path
    aliasIndex = [string]$qSummary.stagedAdapter.aliasIndex.path
}

foreach ($entry in $adapterFiles.GetEnumerator()) {
    $sourcePath = Join-Path $RepoRoot ($entry.Value.Replace("/", "\"))
    $relativePath = "_candidate/$($entry.Key)/$(Split-Path -Leaf $sourcePath)"

    Copy-SnapshotFile `
        -SourcePath $sourcePath `
        -RelativePath $relativePath `
        -DestinationRoot $payloadRoot `
        -ManifestRows $manifestRows `
        -Category "staged-adapter"
}

$candidateRoot = Join-Path $RepoRoot ([string]$qSummary.sourceCandidate.candidateRoot).Replace("/", "\")
$schemaPath = Join-Path $candidateRoot "brenton-reader-schema.candidate.json"
$chapterIndexPath = Join-Path $candidateRoot "brenton-book-chapter-index.candidate.json"

foreach ($candidate in @(
    @{ Source = $schemaPath; Relative = "_candidate/schema/brenton-reader-schema.candidate.json" },
    @{ Source = $chapterIndexPath; Relative = "_candidate/index/brenton-book-chapter-index.candidate.json" }
)) {
    Copy-SnapshotFile `
        -SourcePath $candidate.Source `
        -RelativePath $candidate.Relative `
        -DestinationRoot $payloadRoot `
        -ManifestRows $manifestRows `
        -Category "staged-candidate-contract"
}

Write-Step "Writing snapshot metadata"

Copy-SnapshotFile `
    -SourcePath $qSummaryPath `
    -RelativePath "_reports/P05.12Q/brenton-reader-adapter-summary.json" `
    -DestinationRoot $payloadRoot `
    -ManifestRows $manifestRows `
    -Category "verified-report"

Copy-SnapshotFile `
    -SourcePath $dependencyCsv `
    -RelativePath "_reports/P05.12Q/brenton-reader-adapter-dependencies.csv" `
    -DestinationRoot $payloadRoot `
    -ManifestRows $manifestRows `
    -Category "verified-report"

Copy-SnapshotFile `
    -SourcePath (Join-Path $qReportRoot "brenton-non-numeric-verse-labels.csv") `
    -RelativePath "_reports/P05.12Q/brenton-non-numeric-verse-labels.csv" `
    -DestinationRoot $payloadRoot `
    -ManifestRows $manifestRows `
    -Category "verified-report"

Copy-SnapshotFile `
    -SourcePath (Join-Path $qReportRoot "brenton-legacy-numeric-route-collisions.csv") `
    -RelativePath "_reports/P05.12Q/brenton-legacy-numeric-route-collisions.csv" `
    -DestinationRoot $payloadRoot `
    -ManifestRows $manifestRows `
    -Category "verified-report"

$gitStatus = (& git status --short)
$gitStatusPath = Join-Path $outputRoot "git-status.txt"
$gitStatus | Set-Content -LiteralPath $gitStatusPath -Encoding UTF8

$metadata = [ordered]@{
    milestone = "P05.12R-V2"
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    repository = [ordered]@{
        branch = $branch
        commit = $commit
        statusLines = @($gitStatus).Count
    }
    sourceReport = [ordered]@{
        path = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $qSummaryPath
        checksumsVerified = $checksumCount
        candidateFingerprint = [string]$qSummary.sourceCandidate.candidateFingerprint
        adapterFingerprint = [string]$qSummary.stagedAdapter.fingerprint
    }
    scope = [ordered]@{
        productionAppFiles = $appPaths.Count
        totalSnapshotFiles = $manifestRows.Count
        dependencyRows = $dependencyRows.Count
        dependencyFiles = @($dependencyRows | Select-Object -ExpandProperty file -Unique).Count
        excludedHistoricalScriptMatches = @(
            $dependencyRows |
                Where-Object { $_.file -notlike "app/*" }
        ).Count
    }
    safety = [ordered]@{
        productionFilesModified = $false
        generatedBibleDataCopied = $false
        secretsCopied = $false
        privateSourceCorporaCopied = $false
        candidateRuntimeCopied = $true
        exactProductionSourceCopied = $true
    }
}

$metadataPath = Join-Path $outputRoot "snapshot-summary.json"
$metadata |
    ConvertTo-Json -Depth 20 |
    Set-Content -LiteralPath $metadataPath -Encoding UTF8

$manifestPath = Join-Path $outputRoot "snapshot-files.csv"
$manifestLines = New-Object System.Collections.Generic.List[string]
$manifestLines.Add("category,path,bytes,sha256")

foreach ($row in $manifestRows) {
    $manifestLines.Add(
        (Convert-ToCsvCell $row.category) + "," +
        (Convert-ToCsvCell $row.path) + "," +
        (Convert-ToCsvCell $row.bytes) + "," +
        (Convert-ToCsvCell $row.sha256)
    )
}

$manifestLines | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$readme = @"
# EMETSEES P05.12R Brenton Reader Integration Snapshot

This ZIP contains the exact current source required to implement the Brenton
reader adapter safely.

Included:

- all 28 production app files identified by P05.12Q V2;
- package and TypeScript configuration;
- the current build and P05 reader verification scripts;
- the staged adapter CommonJS and TypeScript contracts;
- the candidate reader schema and chapter index;
- the verified P05.12Q V2 dependency and collision reports;
- hashes for every copied file.

Excluded:

- `.env*` files and secrets;
- immutable raw Bible corpora;
- generated Bible JSON files;
- the 42 MB candidate projection;
- unrelated historical audit scripts;
- node_modules and build output.

No repository file was modified.
"@

$readmePath = Join-Path $outputRoot "README.md"
$readme | Set-Content -LiteralPath $readmePath -Encoding UTF8

$checksumPath = Join-Path $outputRoot "checksums.sha256"
$checksumLines = @(
    Get-ChildItem -LiteralPath $outputRoot -Recurse -File |
        Where-Object { $_.FullName -ne $checksumPath } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = Get-RelativePathCompat -BasePath $outputRoot -TargetPath $_.FullName
            $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            "$hash  $relative"
        }
)
$checksumLines | Set-Content -LiteralPath $checksumPath -Encoding ASCII

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12R V2 completed." -ForegroundColor Green
Write-Host "- Empty-manifest binding fixed: YES"
Write-Host "- P05.12Q V2 verified: YES"
Write-Host "- Production app files captured: $($appPaths.Count)"
Write-Host "- Historical script noise excluded: YES"
Write-Host "- Production files modified: NO"
Write-Host "- Secrets copied: NO"
Write-Host "- Snapshot ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP. The next package will contain the actual reader-adapter implementation." -ForegroundColor Cyan
