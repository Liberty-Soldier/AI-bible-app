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

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$nodeScript = Join-Path $RepoRoot "scripts\p0512\census-stepbible-tvtms-source.js"

if (-not (Test-Path -LiteralPath $nodeScript -PathType Leaf)) {
    throw "Missing P05.12J V3 Node script: $nodeScript"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-stepbible-tvtms-source-census"
$zipPath = Join-Path $reportParent "EMETSEES-P0512J-TVTMS-VERSIFICATION-SOURCE-CENSUS-V3-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512J-TVTMS-FAILURE-V3-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Acquiring and pinning STEPBible TVTMS with Windows-safe local paths"

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("emet-p0512j-v3-" + [guid]::NewGuid().ToString("N"))
$cloneRoot = Join-Path $tempRoot "STEPBible-Data"

try {
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

    & git clone `
        --depth 1 `
        --filter=blob:none `
        --sparse `
        https://github.com/STEPBible/STEPBible-Data.git `
        $cloneRoot

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to clone STEPBible/STEPBible-Data."
    }

    & git -C $cloneRoot sparse-checkout set Versification

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to checkout the STEPBible Versification directory."
    }

    $commit = (& git -C $cloneRoot rev-parse HEAD).Trim()

    if (-not $commit) {
        throw "Unable to resolve the pinned STEPBible commit."
    }

    $sourceVersification = Join-Path $cloneRoot "Versification"

    if (-not (Test-Path -LiteralPath $sourceVersification -PathType Container)) {
        throw "Pinned STEPBible repository has no Versification directory."
    }

    $tvtmsFiles = @(
        Get-ChildItem -LiteralPath $sourceVersification -File |
            Where-Object { $_.Name -like "TVTMS *.txt" }
    )

    if ($tvtmsFiles.Count -ne 1) {
        throw "Expected exactly one TVTMS text file; found $($tvtmsFiles.Count)."
    }

    $privateSourceRoot = Join-Path $RepoRoot ".private\sources\versification\stepbible-tvtms\$commit"
    $localVersificationRoot = Join-Path $privateSourceRoot "Versification"
    $localTvtmsPath = Join-Path $localVersificationRoot "TVTMS.txt"
    $sourceTvtmsPath = $tvtmsFiles[0].FullName

    if (Test-Path -LiteralPath $privateSourceRoot) {
        Remove-Item -LiteralPath $privateSourceRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $localVersificationRoot | Out-Null

    # The repository's TVTMS filename is long enough to exceed legacy Windows
    # MAX_PATH when copied under the immutable source directory. Preserve the
    # exact bytes under a short local filename and record the original path,
    # filename, size, and SHA-256 in the source manifest.
    Copy-Item `
        -LiteralPath $sourceTvtmsPath `
        -Destination $localTvtmsPath `
        -Force

    $sourceTvtmsHash = (Get-FileHash -LiteralPath $sourceTvtmsPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $localTvtmsHash = (Get-FileHash -LiteralPath $localTvtmsPath -Algorithm SHA256).Hash.ToLowerInvariant()

    if ($sourceTvtmsHash -ne $localTvtmsHash) {
        throw "TVTMS short-path copy hash mismatch."
    }

    $readmeCandidate = Join-Path $cloneRoot "README.md"

    if (Test-Path -LiteralPath $readmeCandidate -PathType Leaf) {
        Copy-Item -LiteralPath $readmeCandidate -Destination (Join-Path $privateSourceRoot "README.md") -Force
    }

    $sourceFiles = @(
        Get-ChildItem -LiteralPath $privateSourceRoot -Recurse -File |
            Sort-Object FullName |
            ForEach-Object {
                $relative = $_.FullName.Substring($privateSourceRoot.Length).TrimStart("\", "/").Replace("\", "/")
                $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()

                [pscustomobject]@{
                    path = $relative
                    bytes = $_.Length
                    sha256 = $hash
                }
            }
    )

    $canonicalLines = @(
        $sourceFiles | ForEach-Object {
            "$($_.path)`t$($_.bytes)`t$($_.sha256)"
        }
    )

    $canonicalText = $canonicalLines -join "`n"
    $canonicalBytes = [System.Text.Encoding]::UTF8.GetBytes($canonicalText)
    $sha = [System.Security.Cryptography.SHA256]::Create()

    try {
        $treeSha256 = ([System.BitConverter]::ToString($sha.ComputeHash($canonicalBytes))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }

    $sourceManifest = [ordered]@{
        milestone = "P05.12J-V4"
        purpose = "Pinned STEPBible TVTMS versification source"
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        repository = "https://github.com/STEPBible/STEPBible-Data.git"
        commit = $commit
        originalRepositoryPath = $sourceTvtmsPath.Substring($cloneRoot.Length).TrimStart("\", "/").Replace("\", "/")
        originalFilename = $tvtmsFiles[0].Name
        originalBytes = $tvtmsFiles[0].Length
        originalSha256 = $sourceTvtmsHash
        localFilename = "Versification/TVTMS.txt"
        localPath = $privateSourceRoot.Substring($RepoRoot.Length).TrimStart("\", "/").Replace("\", "/")
        treeSha256 = $treeSha256
        files = $sourceFiles.Count
        license = "CC BY 4.0, as declared by STEPBible-Data"
        role = "external-versification-authority-and-methodology"
    }

    $manifestPath = Join-Path $privateSourceRoot "source-manifest.json"
    $sourceManifest |
        ConvertTo-Json -Depth 10 |
        Set-Content -LiteralPath $manifestPath -Encoding UTF8

    # Recalculate after adding the manifest. The manifest itself is not part of
    # the pinned source fingerprint supplied to Node.
    Write-Host "Pinned STEPBible commit: $commit"
    Write-Host "Pinned source fingerprint: $treeSha256"

    Write-Step "Censusing TVTMS schema and Brenton-relevant records"

    & node --max-old-space-size=8192 `
        $nodeScript `
        --output $outputRoot `
        --source-root $privateSourceRoot `
        --source-manifest $manifestPath

    if ($LASTEXITCODE -ne 0) {
        if (Test-Path -LiteralPath $failureZip) {
            Remove-Item -LiteralPath $failureZip -Force
        }

        Compress-Archive `
            -Path (Join-Path $outputRoot "*") `
            -DestinationPath $failureZip `
            -CompressionLevel Optimal `
            -Force

        throw "P05.12J V4 failed. Upload: $failureZip"
    }

    Write-Step "Packaging P05.12J V4 report"

    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    Compress-Archive `
        -Path (Join-Path $outputRoot "*") `
        -DestinationPath $zipPath `
        -CompressionLevel Optimal

    Write-Host ""
    Write-Host "P05.12J V4 completed." -ForegroundColor Green
    Write-Host "- STEPBible TVTMS pinned: YES"
    Write-Host "- Production Brenton modified: NO"
    Write-Host "- Greek LXX canonical data modified: NO"
    Write-Host "- Alignments modified: NO"
    Write-Host "- WEB modified: NO"
    Write-Host "- KJV modified: NO"
    Write-Host "- Report ZIP: $zipPath"
    Write-Host ""
    Write-Host "Upload the ZIP before building the TVTMS parser." -ForegroundColor Cyan
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
