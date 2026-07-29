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

function Get-TreeSha256 {
    param([Parameter(Mandatory)][string]$Directory)

    $root = (Resolve-Path -LiteralPath $Directory).Path
    $lines = @(
        Get-ChildItem -LiteralPath $root -Recurse -File |
            Sort-Object FullName |
            ForEach-Object {
                $relative = Get-RelativePathCompat -BasePath $root -TargetPath $_.FullName
                $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                "$relative`t$($_.Length)`t$hash"
            }
    )

    $text = $lines -join "`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $sha = [System.Security.Cryptography.SHA256]::Create()

    try {
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$nodeScript = Join-Path $RepoRoot "scripts\p0512\audit-lxx-english-versification-crosswalk.js"
if (-not (Test-Path -LiteralPath $nodeScript -PathType Leaf)) {
    throw "Missing P05.12J Node script: $nodeScript"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-lxx-english-versification-crosswalk"
$zipPath = Join-Path $reportParent "EMETSEES-P0512J-LXX-ENGLISH-VERSIFICATION-CROSSWALK-V2-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512J-FAILURE-V2-$stamp.zip"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

Write-Step "Acquiring and pinning the generated versification standards witness"

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("emet-p0512j-" + [guid]::NewGuid().ToString("N"))
$cloneRoot = Join-Path $tempRoot "bsb-data-output"

try {
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

    & git clone --depth 1 https://github.com/BSB-publishing/bsb-data-output.git $cloneRoot

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to clone BSB-publishing/bsb-data-output."
    }

    $commit = (& git -C $cloneRoot rev-parse HEAD).Trim()
    if (-not $commit) {
        throw "Unable to resolve the versification witness commit."
    }

    $sourceVersification = Join-Path $cloneRoot "base\versification"

    if (-not (Test-Path -LiteralPath $sourceVersification -PathType Container)) {
        $discovered = @(
            Get-ChildItem -LiteralPath $cloneRoot -Recurse -File -Filter "lxx.json" |
                Where-Object {
                    $_.DirectoryName -and
                    (Test-Path -LiteralPath (Join-Path $_.DirectoryName "eng.json") -PathType Leaf) -and
                    (Test-Path -LiteralPath (Join-Path $_.DirectoryName "max_verses.json") -PathType Leaf)
                }
        )

        if ($discovered.Count -ne 1) {
            throw "Unable to identify one authoritative versification directory in the pinned output repository. Found $($discovered.Count) lxx.json candidate(s)."
        }

        $sourceVersification = $discovered[0].DirectoryName
    }

    $requiredMappingFiles = @(
        "lxx.json",
        "eng.json",
        "max_verses.json",
        "stats.json"
    )

    foreach ($requiredName in $requiredMappingFiles) {
        $requiredPath = Join-Path $sourceVersification $requiredName
        if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
            throw "Pinned versification source is missing required file: $requiredName"
        }
    }

    $privateSourceRoot = Join-Path $RepoRoot ".private\sources\versification\ubs-paratext-witness\$commit"
    $versificationRoot = Join-Path $privateSourceRoot "versification"

    if (Test-Path -LiteralPath $versificationRoot) {
        Remove-Item -LiteralPath $versificationRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $privateSourceRoot | Out-Null
    Copy-Item -LiteralPath $sourceVersification -Destination $versificationRoot -Recurse -Force

    foreach ($name in @("ATTRIBUTION.md", "LICENSE-CC-BY.md", "README.md")) {
        $candidate = Join-Path $cloneRoot $name
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            Copy-Item -LiteralPath $candidate -Destination (Join-Path $privateSourceRoot $name) -Force
        }
    }

    $treeSha256 = Get-TreeSha256 -Directory $versificationRoot

    $sourceManifest = [ordered]@{
        milestone = "P05.12J"
        purpose = "Pinned standards witness for LXX-to-English verse mapping"
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        repository = "https://github.com/BSB-publishing/bsb-data-output.git"
        commit = $commit
        copiedFrom = Get-RelativePathCompat -BasePath $cloneRoot -TargetPath $sourceVersification
        localPath = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $versificationRoot
        treeSha256 = $treeSha256
        license = "CC-BY-SA 4.0 for UBS Paratext-derived versification data, as declared by the pinned repository"
        role = "generated-standards-crosswalk-witness-not-translation-text"
    }

    $sourceManifestPath = Join-Path $privateSourceRoot "source-manifest.json"
    $sourceManifest |
        ConvertTo-Json -Depth 10 |
        Set-Content -LiteralPath $sourceManifestPath -Encoding UTF8

    Write-Host "Pinned commit: $commit"
    Write-Host "Versification tree SHA-256: $treeSha256"

    Write-Step "Comparing Brenton/LXX coordinates with English reader versification"

    & node --max-old-space-size=8192 `
        $nodeScript `
        --output $outputRoot `
        --versification-dir $versificationRoot `
        --source-manifest $sourceManifestPath

    if ($LASTEXITCODE -ne 0) {
        if (Test-Path -LiteralPath $failureZip) {
            Remove-Item -LiteralPath $failureZip -Force
        }

        Compress-Archive `
            -Path (Join-Path $outputRoot "*") `
            -DestinationPath $failureZip `
            -CompressionLevel Optimal `
            -Force

        throw "P05.12J failed. Upload: $failureZip"
    }

    Write-Step "Packaging P05.12J report"

    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    Compress-Archive `
        -Path (Join-Path $outputRoot "*") `
        -DestinationPath $zipPath `
        -CompressionLevel Optimal

    Write-Host ""
    Write-Host "P05.12J V2 completed." -ForegroundColor Green
    Write-Host "- Production Brenton modified: NO"
    Write-Host "- Greek LXX canonical data modified: NO"
    Write-Host "- Alignments modified: NO"
    Write-Host "- WEB modified: NO"
    Write-Host "- KJV modified: NO"
    Write-Host "- Report ZIP: $zipPath"
    Write-Host ""
    Write-Host "Upload the ZIP before creating a Brenton production candidate." -ForegroundColor Cyan
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
