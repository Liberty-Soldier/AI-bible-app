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

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory)][string]$BasePath,
        [Parameter(Mandatory)][string]$TargetPath
    )

    $baseFull = [System.IO.Path]::GetFullPath($BasePath)
    $targetFull = [System.IO.Path]::GetFullPath($TargetPath)
    $separator = [System.IO.Path]::DirectorySeparatorChar

    if (-not $baseFull.EndsWith([string]$separator)) {
        $baseFull += $separator
    }

    $baseUri = New-Object System.Uri($baseFull)
    $targetUri = New-Object System.Uri($targetFull)

    if ($baseUri.Scheme -ne $targetUri.Scheme) {
        return $targetFull.Replace("\", "/")
    }

    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    return ([System.Uri]::UnescapeDataString($relativeUri.ToString())).Replace("\", "/")
}

function Get-TreeInventory {
    param(
        [Parameter(Mandatory)][string]$RootPath,
        [Parameter(Mandatory)][string]$SourceId,
        [Parameter(Mandatory)][string]$InventoryPath
    )

    $resolvedRoot = (Resolve-Path -LiteralPath $RootPath).Path
    $rows = @(
        Get-ChildItem -LiteralPath $resolvedRoot -Recurse -File |
            Sort-Object FullName |
            ForEach-Object {
                $relative = Get-RelativePathCompat -BasePath $resolvedRoot -TargetPath $_.FullName
                [pscustomobject]@{
                    sourceId     = $SourceId
                    relativePath = $relative
                    sizeBytes    = $_.Length
                    sha256       = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                }
            }
    )

    $rows | Export-Csv -LiteralPath $InventoryPath -NoTypeInformation -Encoding UTF8

    $canonicalLines = @(
        $rows | ForEach-Object {
            "{0}`t{1}`t{2}" -f $_.relativePath, $_.sizeBytes, $_.sha256
        }
    )

    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($canonicalLines -join "`n"))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $treeHash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }

    return [pscustomobject]@{
        fileCount  = $rows.Count
        treeSha256 = $treeHash
    }
}

function Get-UsfmInventory {
    param(
        [Parameter(Mandatory)][string]$RootPath,
        [Parameter(Mandatory)][string]$TranslationId,
        [Parameter(Mandatory)][string]$OutputPath
    )

    $resolvedRoot = (Resolve-Path -LiteralPath $RootPath).Path
    $rows = @()

    foreach ($file in (Get-ChildItem -LiteralPath $resolvedRoot -Recurse -File -Filter "*.usfm" | Sort-Object FullName)) {
        $bookId = ""
        $idLine = Get-Content -LiteralPath $file.FullName -TotalCount 30 |
            Where-Object { $_ -match '^\s*\\id\s+([A-Z0-9]{3})\b' } |
            Select-Object -First 1

        if ($idLine -and $idLine -match '^\s*\\id\s+([A-Z0-9]{3})\b') {
            $bookId = $Matches[1].ToUpperInvariant()
        }

        $rows += [pscustomobject]@{
            translationId = $TranslationId
            bookId        = $bookId
            relativePath  = Get-RelativePathCompat -BasePath $resolvedRoot -TargetPath $file.FullName
            sizeBytes     = $file.Length
            sha256        = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }

    $rows | Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Encoding UTF8
    return $rows
}

function Assert-ExactBookProfile {
    param(
        [Parameter(Mandatory)][string]$TranslationId,
        [Parameter(Mandatory)][object[]]$Rows,
        [Parameter(Mandatory)][string[]]$ExpectedBookIds
    )

    $actualIds = @(
        $Rows |
            Where-Object { $_.bookId } |
            Select-Object -ExpandProperty bookId -Unique |
            Sort-Object
    )

    $expectedIds = @($ExpectedBookIds | Sort-Object -Unique)
    $missing = @($expectedIds | Where-Object { $_ -notin $actualIds })
    $extra = @($actualIds | Where-Object { $_ -notin $expectedIds })
    $duplicates = @(
        $Rows |
            Where-Object { $_.bookId } |
            Group-Object bookId |
            Where-Object { $_.Count -gt 1 } |
            ForEach-Object { [pscustomobject]@{ bookId = $_.Name; count = $_.Count } }
    )

    if ($missing.Count -gt 0 -or $extra.Count -gt 0 -or $duplicates.Count -gt 0) {
        $details = [ordered]@{
            translationId = $TranslationId
            expectedCount = $expectedIds.Count
            actualCount = $actualIds.Count
            missing = $missing
            extra = $extra
            duplicates = $duplicates
        } | ConvertTo-Json -Depth 8

        throw "Book profile validation failed for $TranslationId.`n$details"
    }

    return [pscustomobject]@{
        translationId = $TranslationId
        expectedCount = $expectedIds.Count
        actualCount = $actualIds.Count
        missing = @()
        extra = @()
        duplicates = @()
        passed = $true
    }
}

function Assert-ExactBookProfileWithAllowedContainers {
    param(
        [Parameter(Mandatory)][string]$TranslationId,
        [Parameter(Mandatory)][object[]]$Rows,
        [Parameter(Mandatory)][string[]]$ExpectedBookIds,
        [Parameter(Mandatory)][string[]]$AllowedContainerIds
    )

    $actualIds = @(
        $Rows |
            Where-Object { $_.bookId } |
            Select-Object -ExpandProperty bookId -Unique |
            Sort-Object
    )

    $expectedIds = @($ExpectedBookIds | Sort-Object -Unique)
    $allowedIds = @($AllowedContainerIds | Sort-Object -Unique)
    $expectedRawIds = @(($expectedIds + $allowedIds) | Sort-Object -Unique)

    $missingBooks = @($expectedIds | Where-Object { $_ -notin $actualIds })
    $missingContainers = @($allowedIds | Where-Object { $_ -notin $actualIds })
    $unexpected = @($actualIds | Where-Object { $_ -notin $expectedRawIds })
    $duplicates = @(
        $Rows |
            Where-Object { $_.bookId } |
            Group-Object bookId |
            Where-Object { $_.Count -gt 1 } |
            ForEach-Object { [pscustomobject]@{ bookId = $_.Name; count = $_.Count } }
    )
    $missingIdFiles = @(
        $Rows |
            Where-Object { -not $_.bookId } |
            Select-Object -ExpandProperty relativePath
    )

    if (
        $missingBooks.Count -gt 0 -or
        $missingContainers.Count -gt 0 -or
        $unexpected.Count -gt 0 -or
        $duplicates.Count -gt 0 -or
        $missingIdFiles.Count -gt 0
    ) {
        $details = [ordered]@{
            translationId = $TranslationId
            expectedScriptureBookCount = $expectedIds.Count
            expectedContainerCount = $allowedIds.Count
            expectedRawIdCount = $expectedRawIds.Count
            actualRawIdCount = $actualIds.Count
            missingScriptureBooks = $missingBooks
            missingAllowedContainers = $missingContainers
            unexpectedIds = $unexpected
            duplicates = $duplicates
            filesWithoutId = $missingIdFiles
        } | ConvertTo-Json -Depth 8

        throw "Book/container profile validation failed for $TranslationId.`n$details"
    }

    return [pscustomobject]@{
        translationId = $TranslationId
        expectedProductionBookCount = $expectedIds.Count
        expectedRawContainerCount = $expectedRawIds.Count
        actualRawContainerCount = $actualIds.Count
        includedBookIds = $expectedIds
        excludedContainerIds = $allowedIds
        missingScriptureBooks = @()
        missingAllowedContainers = @()
        unexpectedIds = @()
        duplicates = @()
        filesWithoutId = @()
        passed = $true
    }
}

function Assert-ExpectedBooksPresent {
    param(
        [Parameter(Mandatory)][string]$TranslationId,
        [Parameter(Mandatory)][object[]]$Rows,
        [Parameter(Mandatory)][string[]]$ExpectedBookIds
    )

    $actualIds = @(
        $Rows |
            Where-Object { $_.bookId } |
            Select-Object -ExpandProperty bookId -Unique |
            Sort-Object
    )

    $expectedIds = @($ExpectedBookIds | Sort-Object -Unique)
    $missing = @($expectedIds | Where-Object { $_ -notin $actualIds })
    $excluded = @($actualIds | Where-Object { $_ -notin $expectedIds })

    if ($missing.Count -gt 0) {
        throw "Required books missing from $TranslationId source: $($missing -join ', ')"
    }

    return [pscustomobject]@{
        translationId = $TranslationId
        expectedCount = $expectedIds.Count
        actualRawBookCount = $actualIds.Count
        includedBookIds = $expectedIds
        excludedBookIds = $excluded
        passed = $true
    }
}

function Acquire-ZipSource {
    param(
        [Parameter(Mandatory)][string]$SourceId,
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$ArchiveRoot,
        [Parameter(Mandatory)][string]$ExtractRoot
    )

    $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("emet-p0512c-" + [guid]::NewGuid().ToString("N") + ".zip")

    try {
        Invoke-WebRequest -Uri $Url -OutFile $tempFile -MaximumRedirection 10
        $archiveHash = Get-Sha256 -Path $tempFile

        $sourceArchiveDir = Join-Path $ArchiveRoot $SourceId
        New-Item -ItemType Directory -Force -Path $sourceArchiveDir | Out-Null

        $immutableArchive = Join-Path $sourceArchiveDir "$archiveHash.zip"

        if (Test-Path -LiteralPath $immutableArchive) {
            $existingHash = Get-Sha256 -Path $immutableArchive
            if ($existingHash -ne $archiveHash) {
                throw "Immutable archive collision: $immutableArchive"
            }
            Remove-Item -LiteralPath $tempFile -Force
        }
        else {
            Move-Item -LiteralPath $tempFile -Destination $immutableArchive
        }

        $sourceExtractRoot = Join-Path (Join-Path $ExtractRoot $SourceId) $archiveHash
        if (-not (Test-Path -LiteralPath $sourceExtractRoot)) {
            New-Item -ItemType Directory -Force -Path $sourceExtractRoot | Out-Null
            Expand-Archive -LiteralPath $immutableArchive -DestinationPath $sourceExtractRoot
        }

        return [pscustomobject]@{
            sourceId = $SourceId
            sourceUrl = $Url
            archiveSha256 = $archiveHash
            archivePath = $immutableArchive
            extractedPath = $sourceExtractRoot
            archiveSizeBytes = (Get-Item -LiteralPath $immutableArchive).Length
        }
    }
    finally {
        if (Test-Path -LiteralPath $tempFile) {
            Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
        }
    }
}

function Acquire-CrossWireRepository {
    param(
        [Parameter(Mandatory)][string]$RemoteUrl,
        [Parameter(Mandatory)][string]$ArchiveRoot,
        [Parameter(Mandatory)][string]$ExtractRoot
    )

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("emet-p0512c-crosswire-" + [guid]::NewGuid().ToString("N"))
    $cloneRoot = Join-Path $tempRoot "repo"
    $tempArchive = Join-Path $tempRoot "crosswire-kjv.zip"

    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

    try {
        & git clone --depth 1 $RemoteUrl $cloneRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to clone CrossWire KJV repository."
        }

        $commit = (& git -C $cloneRoot rev-parse HEAD).Trim()
        if (-not $commit) {
            throw "Unable to resolve CrossWire KJV commit."
        }

        & git -C $cloneRoot archive --format=zip --output=$tempArchive HEAD
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tempArchive)) {
            throw "Unable to archive CrossWire KJV repository."
        }

        $archiveHash = Get-Sha256 -Path $tempArchive
        $sourceArchiveDir = Join-Path $ArchiveRoot "crosswire-kjv"
        New-Item -ItemType Directory -Force -Path $sourceArchiveDir | Out-Null
        $immutableArchive = Join-Path $sourceArchiveDir "$archiveHash.zip"

        if (Test-Path -LiteralPath $immutableArchive) {
            $existingHash = Get-Sha256 -Path $immutableArchive
            if ($existingHash -ne $archiveHash) {
                throw "Immutable CrossWire archive collision: $immutableArchive"
            }
        }
        else {
            Copy-Item -LiteralPath $tempArchive -Destination $immutableArchive
        }

        $sourceExtractRoot = Join-Path (Join-Path $ExtractRoot "crosswire-kjv") $commit
        if (-not (Test-Path -LiteralPath $sourceExtractRoot)) {
            New-Item -ItemType Directory -Force -Path $sourceExtractRoot | Out-Null
            Expand-Archive -LiteralPath $immutableArchive -DestinationPath $sourceExtractRoot
        }

        $osisCandidates = @(
            Get-ChildItem -LiteralPath $sourceExtractRoot -Recurse -File |
                Where-Object {
                    $_.Name -match '^kjv(full|lite)?\.xml$' -or
                    $_.Extension -eq ".xml"
                } |
                Sort-Object FullName
        )

        if ($osisCandidates.Count -eq 0) {
            throw "CrossWire repository archive contains no XML source candidates."
        }

        return [pscustomobject]@{
            sourceId = "crosswire-kjv"
            remoteUrl = $RemoteUrl
            commit = $commit
            archiveSha256 = $archiveHash
            archivePath = $immutableArchive
            extractedPath = $sourceExtractRoot
            archiveSizeBytes = (Get-Item -LiteralPath $immutableArchive).Length
            xmlCandidates = @(
                $osisCandidates |
                    ForEach-Object {
                        Get-RelativePathCompat -BasePath $sourceExtractRoot -TargetPath $_.FullName
                    }
            )
        }
    }
    finally {
        if (Test-Path -LiteralPath $tempRoot) {
            Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "RepoRoot is not a Git repository: $RepoRoot"
}

$currentBranch = (& git branch --show-current).Trim()
$currentCommit = (& git rev-parse HEAD).Trim()

if ($currentBranch -ne "p0512-translation-integrity-rebuild") {
    throw "Expected branch p0512-translation-integrity-rebuild; found $currentBranch"
}

$acquisitionManifest = Get-ChildItem -LiteralPath (Join-Path $RepoRoot ".private\reports\P05.12") `
        -Recurse -File -Filter "source-acquisition-manifest.json" |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

if (-not $acquisitionManifest) {
    throw "No P05.12A source-acquisition-manifest.json found."
}

$acquisition = Get-Content -LiteralPath $acquisitionManifest.FullName -Raw | ConvertFrom-Json
if ($acquisition.milestone -ne "P05.12A") {
    throw "Latest acquisition manifest is not P05.12A."
}

$webSource = $acquisition.downloadedSources | Where-Object { $_.id -eq "web" } | Select-Object -First 1
$brentonSource = $acquisition.downloadedSources | Where-Object { $_.id -eq "brenton" } | Select-Object -First 1

if (-not $webSource -or -not $brentonSource) {
    throw "P05.12A manifest does not contain WEB and Brenton sources."
}

$webRoot = Join-Path $RepoRoot ($webSource.extractedPath.Replace("/", "\"))
$brentonRoot = Join-Path $RepoRoot ($brentonSource.extractedPath.Replace("/", "\"))

if (-not (Test-Path -LiteralPath $webRoot -PathType Container)) {
    throw "WEB extracted source missing: $webRoot"
}

if (-not (Test-Path -LiteralPath $brentonRoot -PathType Container)) {
    throw "Brenton extracted source missing: $brentonRoot"
}

$privateSourceRoot = Join-Path $RepoRoot ".private\sources\translation-integrity"
$archiveRoot = Join-Path $privateSourceRoot "raw-archives"
$extractRoot = Join-Path $privateSourceRoot "extracted"
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$reportRoot = Join-Path $reportParent "$timestamp-authoritative-source-profiles"
$inventoryRoot = Join-Path $reportRoot "inventories"

New-Item -ItemType Directory -Force -Path $archiveRoot, $extractRoot, $reportRoot, $inventoryRoot | Out-Null

$canonical66 = @(
    "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI",
    "1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER",
    "LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP",
    "HAG","ZEC","MAL","MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL",
    "EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE",
    "2PE","1JN","2JN","3JN","JUD","REV"
)

$brenton53 = @(
    "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI",
    "1CH","2CH","EZR","NEH","JOB","PSA","PRO","ECC","SNG","ISA","JER","LAM",
    "EZK","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP","HAG","ZEC",
    "MAL","TOB","JDT","ESG","WIS","SIR","BAR","LJE","SUS","BEL","1MA","2MA",
    "1ES","MAN","3MA","4MA","DAG"
)

Write-Step "Acquiring eBible KJV2006 protocanon USFM"

$kjv2006 = Acquire-ZipSource `
    -SourceId "kjv2006" `
    -Url "https://ebible.org/Scriptures/eng-kjv2006_usfm.zip" `
    -ArchiveRoot $archiveRoot `
    -ExtractRoot $extractRoot

Write-Step "Acquiring immutable CrossWire KJV OSIS source"

$crosswire = Acquire-CrossWireRepository `
    -RemoteUrl "https://gitlab.com/crosswire-bible-society/kjv.git" `
    -ArchiveRoot $archiveRoot `
    -ExtractRoot $extractRoot

Write-Step "Building explicit translation source profiles"

$webUsfm = Get-UsfmInventory `
    -RootPath $webRoot `
    -TranslationId "web" `
    -OutputPath (Join-Path $inventoryRoot "web-usfm-files.csv")

$kjvUsfm = Get-UsfmInventory `
    -RootPath $kjv2006.extractedPath `
    -TranslationId "kjv2006" `
    -OutputPath (Join-Path $inventoryRoot "kjv2006-usfm-files.csv")

$brentonUsfm = Get-UsfmInventory `
    -RootPath $brentonRoot `
    -TranslationId "brenton" `
    -OutputPath (Join-Path $inventoryRoot "brenton-usfm-files.csv")

$webProfileValidation = Assert-ExpectedBooksPresent `
    -TranslationId "web" `
    -Rows $webUsfm `
    -ExpectedBookIds $canonical66

$kjvProfileValidation = Assert-ExactBookProfile `
    -TranslationId "kjv2006" `
    -Rows $kjvUsfm `
    -ExpectedBookIds $canonical66

$brentonNonScriptureContainers = @("FRT","INT","BAK","OTH","XXA","XXB","XXC")

$brentonProfileValidation = Assert-ExactBookProfileWithAllowedContainers `
    -TranslationId "brenton" `
    -Rows $brentonUsfm `
    -ExpectedBookIds $brenton53 `
    -AllowedContainerIds $brentonNonScriptureContainers

$webTree = Get-TreeInventory `
    -RootPath $webRoot `
    -SourceId "web" `
    -InventoryPath (Join-Path $inventoryRoot "web-tree.csv")

$kjvTree = Get-TreeInventory `
    -RootPath $kjv2006.extractedPath `
    -SourceId "kjv2006" `
    -InventoryPath (Join-Path $inventoryRoot "kjv2006-tree.csv")

$brentonTree = Get-TreeInventory `
    -RootPath $brentonRoot `
    -SourceId "brenton" `
    -InventoryPath (Join-Path $inventoryRoot "brenton-tree.csv")

$crosswireTree = Get-TreeInventory `
    -RootPath $crosswire.extractedPath `
    -SourceId "crosswire-kjv" `
    -InventoryPath (Join-Path $inventoryRoot "crosswire-kjv-tree.csv")

$sourceProfiles = [ordered]@{
    milestone = "P05.12C"
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    policy = [ordered]@{
        preserveRawSourceCompletely = $true
        productionImportUsesExplicitBookProfile = $true
        emptyVerseLabelsAreMetadataUntilReviewed = $true
        headingsAreNotVerseText = $true
        footnotesAreNotVerseText = $true
        crossReferencesAreNotVerseText = $true
        strongsMetadataIsEvidenceNotAutomaticAlignment = $true
    }
    translations = [ordered]@{
        web = [ordered]@{
            edition = "World English Bible Classic"
            sourceId = "eng-web"
            role = "authoritative-visible-text-and-structure"
            rawSourcePath = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $webRoot
            rawArchiveSha256 = $webSource.archiveSha256
            rawTreeSha256 = $webTree.treeSha256
            includedBookIds = $canonical66
            excludedBookIds = $webProfileValidation.excludedBookIds
            expectedProductionBooks = 66
            validationPassed = $webProfileValidation.passed
        }
        kjv = [ordered]@{
            edition = "King James Authorized Version, standardized 1769"
            sourceId = "eng-kjv2006"
            role = "authoritative-visible-text-and-structure"
            rawSourcePath = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $kjv2006.extractedPath
            rawArchivePath = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $kjv2006.archivePath
            rawArchiveSha256 = $kjv2006.archiveSha256
            rawTreeSha256 = $kjvTree.treeSha256
            includedBookIds = $canonical66
            excludedBookIds = @()
            expectedProductionBooks = 66
            validationPassed = $kjvProfileValidation.passed
            deprecatedCensusInput = "eng-kjv from P05.12A remains preserved but is not the production KJV source."
            independentVerifier = [ordered]@{
                sourceId = "crosswire-kjv"
                remote = $crosswire.remoteUrl
                commit = $crosswire.commit
                archivePath = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $crosswire.archivePath
                archiveSha256 = $crosswire.archiveSha256
                extractedPath = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $crosswire.extractedPath
                treeSha256 = $crosswireTree.treeSha256
                xmlCandidates = $crosswire.xmlCandidates
            }
        }
        brenton = [ordered]@{
            edition = "Brenton Septuagint Translation"
            sourceId = "eng-Brenton"
            role = "authoritative-visible-text-and-structure"
            rawSourcePath = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $brentonRoot
            rawArchiveSha256 = $brentonSource.archiveSha256
            rawTreeSha256 = $brentonTree.treeSha256
            includedBookIds = $brenton53
            excludedContainerIds = $brentonProfileValidation.excludedContainerIds
            expectedProductionBooks = 53
            expectedRawUsfmContainers = 60
            validationPassed = $brentonProfileValidation.passed
            versificationPolicy = "Source labels are preserved. Reader and Greek-LXX verse ownership require an explicit mapping layer."
        }
    }
}

$profilePath = Join-Path $reportRoot "authoritative-source-profiles.json"
$sourceProfiles | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $profilePath -Encoding UTF8

$manifest = [ordered]@{
    milestone = "P05.12C"
    status = "authoritative-source-profiles-locked-no-bible-data-modified"
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    repository = [ordered]@{
        branch = $currentBranch
        commit = $currentCommit
        workingTreeStatus = @(& git status --short)
    }
    inputs = [ordered]@{
        p0512aManifest = [ordered]@{
            path = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $acquisitionManifest.FullName
            sha256 = Get-Sha256 -Path $acquisitionManifest.FullName
        }
        webArchiveSha256 = $webSource.archiveSha256
        brentonArchiveSha256 = $brentonSource.archiveSha256
        kjv2006ArchiveSha256 = $kjv2006.archiveSha256
        crosswireCommit = $crosswire.commit
        crosswireArchiveSha256 = $crosswire.archiveSha256
    }
    gates = [ordered]@{
        bibleDataModified = $false
        displayTokensModified = $false
        alignmentsModified = $false
        sourceProfilesValidated = $true
        safeToRunCertifiedCensus = $true
        safeToRebuildTranslations = $false
    }
}

$manifestPath = Join-Path $reportRoot "manifest.json"
$manifest | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$readme = @"
# EMETSEES P05.12C Authoritative Source Profiles

Generated: $((Get-Date).ToUniversalTime().ToString("o"))
Branch: $currentBranch
Commit: $currentCommit

## Locked source decisions

- WEB production scope is the explicit 66-book profile from the preserved
  eng-web source. All deuterocanonical files and Greek Daniel remain preserved
  in raw storage but are excluded from the current WEB reader profile.
- KJV production source is eng-kjv2006, the 66-book standardized 1769 source.
  The older eng-kjv source from P05.12A remains preserved as historical census
  evidence but is not the production source.
- CrossWire's KJV OSIS repository is preserved by exact Git commit and archive
  SHA-256 as the independent KJV verifier.
- Brenton production scope is its exact 53-book Scripture set. The seven raw
  USFM containers FRT, INT, BAK, OTH, XXA, XXB, and XXC are preserved and
  inventoried as non-Scripture front/back/auxiliary matter, but excluded from
  the production book profile. Source verse labels are preserved; reader/LXX
  ownership will be handled by an explicit mapping.

## Safety

No production Bible JSON, display token, source token, alignment, entity, SEE
packet, cached EMET explanation, or reader UI file was modified.

The next allowed step is P05.12D: rerun the certified census using these locked
profiles and compare KJV2006 against the pinned CrossWire OSIS source.
"@

$readme | Set-Content -LiteralPath (Join-Path $reportRoot "README.md") -Encoding UTF8

$checksumsPath = Join-Path $reportRoot "checksums.sha256"
$checksumLines = @()

Get-ChildItem -LiteralPath $reportRoot -Recurse -File |
    Where-Object { $_.FullName -ne $checksumsPath } |
    Sort-Object FullName |
    ForEach-Object {
        $relative = Get-RelativePathCompat -BasePath $reportRoot -TargetPath $_.FullName
        $checksumLines += "$(Get-Sha256 -Path $_.FullName)  $relative"
    }

$checksumLines | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

$zipPath = Join-Path $reportParent "EMETSEES-P0512C-AUTHORITATIVE-SOURCE-PROFILES-$timestamp.zip"
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $reportRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Step "P05.12C source profiles complete"
Write-Host "- WEB production books: 66"
Write-Host "- KJV2006 production books: 66"
Write-Host "- Brenton production books: 53"
Write-Host "- Bible data modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP before running the certified census." -ForegroundColor Green
