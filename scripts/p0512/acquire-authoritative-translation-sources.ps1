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

    $canonicalText = ($canonicalLines -join "`n")
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($canonicalText)
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

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "RepoRoot is not a Git repository: $RepoRoot"
}

$currentBranch = (git branch --show-current).Trim()
if (-not $currentBranch) {
    throw "Unable to determine the current Git branch."
}

$expectedExistingWeb = Join-Path $RepoRoot ".private\sources\web-usfm\eng-web"
if (-not (Test-Path -LiteralPath $expectedExistingWeb -PathType Container)) {
    throw "Expected existing WEB USFM directory was not found: $expectedExistingWeb"
}

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$privateRoot = Join-Path $RepoRoot ".private\sources\translation-integrity"
$archiveRoot = Join-Path $privateRoot "raw-archives"
$extractRoot = Join-Path $privateRoot "extracted"
$reportRoot = Join-Path $RepoRoot ".private\reports\P05.12\$timestamp-source-acquisition"
$inventoryRoot = Join-Path $reportRoot "inventories"

New-Item -ItemType Directory -Path $archiveRoot, $extractRoot, $reportRoot, $inventoryRoot -Force | Out-Null

$sources = @(
    [pscustomobject]@{
        id          = "web"
        title       = "World English Bible Classic"
        provider    = "eBible.org"
        format      = "USFM"
        url         = "https://ebible.org/Scriptures/eng-web_usfm.zip"
        archiveName = "eng-web_usfm.zip"
        role        = "primary-raw-source"
    },
    [pscustomobject]@{
        id          = "kjv"
        title       = "King James Version"
        provider    = "eBible.org"
        format      = "USFM"
        url         = "https://ebible.org/Scriptures/eng-kjv_usfm.zip"
        archiveName = "eng-kjv_usfm.zip"
        role        = "census-input-pending-independent-cross-check"
    },
    [pscustomobject]@{
        id          = "brenton"
        title       = "Brenton Septuagint Translation"
        provider    = "eBible.org"
        format      = "USFM"
        url         = "https://ebible.org/Scriptures/eng-Brenton_usfm.zip"
        archiveName = "eng-Brenton_usfm.zip"
        role        = "primary-raw-source-pending-edition-verification"
    }
)

$downloadResults = @()

foreach ($source in $sources) {
    Write-Step "Acquiring $($source.title)"

    $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("emet-p0512-" + [guid]::NewGuid().ToString("N") + ".zip")
    try {
        Invoke-WebRequest -Uri $source.url -OutFile $tempFile -MaximumRedirection 10
        $archiveHash = Get-Sha256 -Path $tempFile
        $archiveDir = Join-Path $archiveRoot $source.id
        $immutableArchive = Join-Path $archiveDir "$archiveHash.zip"
        New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null

        if (Test-Path -LiteralPath $immutableArchive) {
            $existingHash = Get-Sha256 -Path $immutableArchive
            if ($existingHash -ne $archiveHash) {
                throw "Immutable archive collision for $($source.id): $immutableArchive"
            }
            Remove-Item -LiteralPath $tempFile -Force
        }
        else {
            Move-Item -LiteralPath $tempFile -Destination $immutableArchive
        }

        $sourceExtractRoot = Join-Path (Join-Path $extractRoot $source.id) $archiveHash
        if (-not (Test-Path -LiteralPath $sourceExtractRoot)) {
            New-Item -ItemType Directory -Path $sourceExtractRoot -Force | Out-Null
            Expand-Archive -LiteralPath $immutableArchive -DestinationPath $sourceExtractRoot
        }

        $inventoryPath = Join-Path $inventoryRoot "$($source.id)-downloaded-usfm-files.csv"
        $tree = Get-TreeInventory -RootPath $sourceExtractRoot -SourceId $source.id -InventoryPath $inventoryPath

        $downloadResults += [pscustomobject]@{
            id                  = $source.id
            title               = $source.title
            provider            = $source.provider
            format              = $source.format
            sourceUrl           = $source.url
            role                = $source.role
            downloadedAtUtc     = (Get-Date).ToUniversalTime().ToString("o")
            archiveSha256       = $archiveHash
            archiveSizeBytes    = (Get-Item -LiteralPath $immutableArchive).Length
            archivePath         = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $immutableArchive
            extractedPath       = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $sourceExtractRoot
            extractedFiles      = $tree.fileCount
            extractedTreeSha256 = $tree.treeSha256
        }
    }
    finally {
        if (Test-Path -LiteralPath $tempFile) {
            Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Step "Registering the previously extracted WEB USFM tree"

$existingWebInventory = Join-Path $inventoryRoot "web-existing-usfm-files.csv"
$existingWebTree = Get-TreeInventory `
    -RootPath $expectedExistingWeb `
    -SourceId "web-existing" `
    -InventoryPath $existingWebInventory

$gitCommit = (git rev-parse HEAD).Trim()
$gitStatus = @(git status --short)

$manifest = [ordered]@{
    milestone      = "P05.12A"
    purpose        = "Immutable source acquisition before translation-integrity census"
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    repository     = [ordered]@{
        root             = $RepoRoot
        branch           = $currentBranch
        commit           = $gitCommit
        workingTreeClean = ($gitStatus.Count -eq 0)
        status           = $gitStatus
    }
    rules          = @(
        "No generated Bible data was modified.",
        "No display tokens were rebuilt.",
        "No alignments were modified.",
        "Downloaded archives are stored by SHA-256 and never overwritten.",
        "KJV remains unverified until independently compared with the CrossWire 1769 reference."
    )
    existingWebSource = [ordered]@{
        path       = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $expectedExistingWeb
        fileCount  = $existingWebTree.fileCount
        treeSha256 = $existingWebTree.treeSha256
    }
    downloadedSources = $downloadResults
}

$manifestPath = Join-Path $reportRoot "source-acquisition-manifest.json"
$manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$checksumsPath = Join-Path $reportRoot "checksums.sha256"

$readme = @"
# EMETSEES P05.12A Source Acquisition

Generated: $((Get-Date).ToUniversalTime().ToString("o"))
Branch: $currentBranch
Commit: $gitCommit

This report registers immutable raw-source inputs for the external
translation-integrity census.

No production Bible data, display tokens, source tokens, entities, SEE packets,
cached EMET explanations, reader files, or alignments were changed.

Important:
- WEB, KJV, and Brenton downloads were stored using their archive SHA-256.
- The already extracted WEB USFM tree was separately inventoried.
- The KJV USFM is a census input, not yet certified authoritative.
- KJV certification requires an independent comparison against the CrossWire
  1769 Blayney reference.
"@
$readme | Set-Content -LiteralPath (Join-Path $reportRoot "README.md") -Encoding UTF8

$checksumLines = @()
Get-ChildItem -LiteralPath $reportRoot -Recurse -File |
    Where-Object { $_.FullName -ne $checksumsPath } |
    Sort-Object FullName |
    ForEach-Object {
        $relative = Get-RelativePathCompat -BasePath $reportRoot -TargetPath $_.FullName
        $hash = Get-Sha256 -Path $_.FullName
        $checksumLines += "$hash  $relative"
    }
$checksumLines | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

$zipPath = Join-Path (Split-Path $reportRoot -Parent) "EMETSEES-P0512A-SOURCE-ACQUISITION-$timestamp.zip"
Compress-Archive -Path (Join-Path $reportRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Step "P05.12A source acquisition complete"
Write-Host "Manifest: $manifestPath"
Write-Host "Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload the ZIP report to ChatGPT before running any importer or changing Bible data." -ForegroundColor Green
