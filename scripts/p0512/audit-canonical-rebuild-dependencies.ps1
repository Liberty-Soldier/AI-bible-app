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
        throw "Target is outside the repository: $TargetPath"
    }

    return $targetFull.Substring($baseFull.Length).TrimStart("\", "/").Replace("\", "/")
}

function Copy-IfSmall {
    param(
        [Parameter(Mandatory)][string]$RelativePath,
        [Parameter(Mandatory)][string]$DestinationRoot,
        [int64]$MaxBytes = 10485760
    )

    $source = Join-Path $RepoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        return $false
    }

    $item = Get-Item -LiteralPath $source
    if ($item.Length -gt $MaxBytes) {
        return $false
    }

    $destination = Join-Path $DestinationRoot ("files\" + $RelativePath)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
    return $true
}

function Get-FileRecord {
    param([Parameter(Mandatory)][string]$Path)

    $item = Get-Item -LiteralPath $Path
    return [ordered]@{
        path = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $Path
        bytes = $item.Length
        sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$required = @(
    "package.json",
    "scripts\export-bibleiq-canonical-runtime.js",
    "scripts\split-scripture-runtime.js",
    "app\data\scripture\generatedWEB.json"
)

foreach ($relative in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $relative) -PathType Leaf)) {
        throw "Missing required repository file: $relative"
    }
}

$rollbackPath = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json.p0512.rollback"
$candidatePath = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json.p0512.candidate"

if (Test-Path -LiteralPath $rollbackPath) {
    throw "Rollback residue still exists: $rollbackPath"
}
if (Test-Path -LiteralPath $candidatePath) {
    throw "Candidate residue still exists: $candidatePath"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$reportRoot = Join-Path $reportParent "$stamp-canonical-rebuild-dependency-audit"
$filesRoot = Join-Path $reportRoot "files"
$zipPath = Join-Path $reportParent "EMETSEES-P0512G-CANONICAL-REBUILD-DEPENDENCY-AUDIT-V3-$stamp.zip"

New-Item -ItemType Directory -Force -Path $reportRoot, $filesRoot | Out-Null

Write-Step "Auditing rollback and approved WEB hashes"

$webPath = Join-Path $RepoRoot "app\data\scripture\generatedWEB.json"
$webHash = (Get-FileHash -LiteralPath $webPath -Algorithm SHA256).Hash.ToLowerInvariant()

$previewManifests = @(
    Get-ChildItem -LiteralPath $reportParent -Recurse -File -Filter "staging-manifest.json" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending
)

$approvedManifestPath = $null
$approvedManifest = $null

foreach ($manifestFile in $previewManifests) {
    try {
        $value = Get-Content -LiteralPath $manifestFile.FullName -Raw | ConvertFrom-Json
        if (
            $value.milestone -eq "P05.12E" -and
            $value.schemaVersion -eq "web-translation-ingestion@1.1"
        ) {
            $approvedManifestPath = $manifestFile.FullName
            $approvedManifest = $value
            break
        }
    }
    catch {
        continue
    }
}

if (-not $approvedManifestPath) {
    throw "Could not locate the approved P05.12E V2 staging manifest."
}

$approvedOldHash = [string]$approvedManifest.inputs.currentReaderSha256
$approvedCandidateHash = [string]$approvedManifest.output.files.readerCandidate.sha256

$webState =
    if ($webHash -eq $approvedOldHash) { "approved-pre-rebuild-web-restored" }
    elseif ($webHash -eq $approvedCandidateHash) { "approved-candidate-currently-installed" }
    else { "unexpected-web-hash" }

if ($webState -eq "unexpected-web-hash") {
    throw "generatedWEB.json does not match the approved old or candidate hash. Current: $webHash"
}

Write-Host "WEB state: $webState"
Write-Host "WEB SHA-256: $webHash"

Write-Step "Collecting canonical rebuild code and configuration"

$explicitFiles = @(
    "package.json",
    "package-lock.json",
    ".gitignore",
    "scripts\export-bibleiq-canonical-runtime.js",
    "scripts\split-scripture-runtime.js",
    "scripts\build-word-study-runtime.js",
    "scripts\build-word-study-entity-runtime.js",
    "scripts\shared\corpus-ownership.cjs",
    "app\data\scripture\CanonicalVerseStore.ts",
    "scripts\p0512\apply-web-translation-integrity-rebuild.ps1",
    "scripts\translations\rebuild-web-from-usfm.js"
)

$copied = @()
$missing = @()

foreach ($relative in $explicitFiles) {
    if (Copy-IfSmall -RelativePath $relative -DestinationRoot $reportRoot) {
        $copied += $relative.Replace("\", "/")
    }
    else {
        $missing += $relative.Replace("\", "/")
    }
}

$allowedExtensions = @(".js", ".cjs", ".mjs", ".ps1", ".json", ".md", ".ts", ".tsx")
$pathPattern = '(?i)(p05\.?10|p0510|canonical|alignment|align-|align_|translation-token|display-token|word-study|corpus|runtime)'
$searchRoots = @(
    (Join-Path $RepoRoot "scripts"),
    (Join-Path $RepoRoot "reports")
)

foreach ($searchRoot in $searchRoots) {
    if (-not (Test-Path -LiteralPath $searchRoot -PathType Container)) {
        continue
    }

    Get-ChildItem -LiteralPath $searchRoot -Recurse -File |
        Where-Object {
            $_.Length -le 10MB -and
            ($allowedExtensions -contains $_.Extension.ToLowerInvariant()) -and
            (
                (Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $_.FullName) -match $pathPattern -or
                $_.Name -match $pathPattern
            )
        } |
        ForEach-Object {
            $relative = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $_.FullName
            if (Copy-IfSmall -RelativePath $relative -DestinationRoot $reportRoot) {
                if (-not $copied.Contains($relative)) {
                    $copied += $relative
                }
            }
        }
}

Write-Step "Inventorying local canonical and alignment state"

$inventoryRoots = @(
    ".private\scripture\canonical",
    ".private\alignment",
    "app\data\bibleiq\canonical",
    "public\data\bibleiq\word-study"
)

$inventory = @()

foreach ($relativeRoot in $inventoryRoots) {
    $fullRoot = Join-Path $RepoRoot $relativeRoot
    if (-not (Test-Path -LiteralPath $fullRoot -PathType Container)) {
        $inventory += [pscustomobject][ordered]@{
            root = $relativeRoot.Replace("\", "/")
            missing = $true
        }
        continue
    }

    $files = @(
        Get-ChildItem -LiteralPath $fullRoot -Recurse -File |
            Sort-Object FullName
    )

    $totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $totalBytes) { $totalBytes = 0 }

    $hashLines = @(
        $files | ForEach-Object {
            $relative = Get-RelativePathCompat -BasePath $fullRoot -TargetPath $_.FullName
            $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            "$relative`t$($_.Length)`t$hash"
        }
    )

    $treeText = $hashLines -join "`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($treeText)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $treeHash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }

    $inventory += [pscustomobject][ordered]@{
        root = $relativeRoot.Replace("\", "/")
        files = $files.Count
        bytes = [int64]$totalBytes
        treeSha256 = $treeHash
    }

    $csvRows = $files | ForEach-Object {
        [pscustomobject]@{
            root = $relativeRoot.Replace("\", "/")
            path = Get-RelativePathCompat -BasePath $fullRoot -TargetPath $_.FullName
            bytes = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }

    $safeName = ($relativeRoot -replace '[^a-zA-Z0-9]+', '-').Trim("-").ToLowerInvariant()
    $csvRows | Export-Csv `
        -LiteralPath (Join-Path $reportRoot "inventory-$safeName.csv") `
        -NoTypeInformation `
        -Encoding UTF8
}

Write-Step "Finding P05.10 repair entry points and mismatch guards"

$codeMatchRows = @()
$patterns = @(
    "P05.10",
    "P0510",
    "canonical source repair",
    "Clean WEB text mismatches",
    "WEB token mismatches",
    "Refusing canonical export",
    "generatedWEB.json",
    "build-greek-nt-canonical",
    "align-greek-nt-translations",
    "build-hebrew",
    "align-hebrew"
)

$codeFiles = @(
    Get-ChildItem -LiteralPath (Join-Path $RepoRoot "scripts") -Recurse -File |
        Where-Object {
            $_.Length -le 10MB -and
            @(".js", ".cjs", ".mjs", ".ps1", ".json", ".md") -contains $_.Extension.ToLowerInvariant()
        }
)

foreach ($file in $codeFiles) {
    $content = $null
    try {
        $content = [System.IO.File]::ReadAllText($file.FullName)
    }
    catch {
        continue
    }

    foreach ($pattern in $patterns) {
        $regex = [regex]::Escape($pattern)
        if ([regex]::IsMatch($content, $regex)) {
            $relative = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $file.FullName
            $lineNumber = 1
            $matchedLine = ""

            $lines = $content -split "`r?`n"
            for ($i = 0; $i -lt $lines.Length; $i++) {
                if ([regex]::IsMatch($lines[$i], $regex)) {
                    $lineNumber = $i + 1
                    $matchedLine = $lines[$i].Trim()
                    break
                }
            }

            $codeMatchRows += [pscustomobject][ordered]@{
                file = $relative
                pattern = $pattern
                line = $lineNumber
                excerpt = $matchedLine
            }
        }
    }
}

$codeMatchRows |
    Sort-Object file, line, pattern -Unique |
    Export-Csv `
        -LiteralPath (Join-Path $reportRoot "canonical-rebuild-code-matches.csv") `
        -NoTypeInformation `
        -Encoding UTF8

Write-Step "Capturing package scripts and Git state"

$package = Get-Content -LiteralPath (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
$packageScripts = [ordered]@{}
foreach ($property in $package.scripts.PSObject.Properties) {
    $packageScripts[$property.Name] = $property.Value
}

$gitStatus = @(
    git status --short 2>$null |
        ForEach-Object { "$_" }
)

$summary = [ordered]@{
    milestone = "P05.12G"
    purpose = "Read-only canonical rebuild dependency audit after WEB transaction rollback"
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    repository = [ordered]@{
        root = $RepoRoot
        branch = (git branch --show-current 2>$null | Out-String).Trim()
        commit = (git rev-parse HEAD 2>$null | Out-String).Trim()
        status = $gitStatus
    }
    rollback = [ordered]@{
        rollbackResidueExists = (Test-Path -LiteralPath $rollbackPath)
        candidateResidueExists = (Test-Path -LiteralPath $candidatePath)
        generatedWebState = $webState
        generatedWebSha256 = $webHash
        approvedOldSha256 = $approvedOldHash
        approvedCandidateSha256 = $approvedCandidateHash
        approvedManifest = Get-RelativePathCompat -BasePath $RepoRoot -TargetPath $approvedManifestPath
    }
    observedBuildFailure = [ordered]@{
        cleanWebTextMismatches = 13012
        webTokenMismatches = 9265
        interpretation = "Expected downstream mismatch: local canonical translation text and display tokens still correspond to the pre-P05.12 WEB reader."
    }
    packageScripts = $packageScripts
    copiedFiles = @($copied | Sort-Object -Unique)
    requestedButMissingOrLarge = @($missing | Sort-Object -Unique)
    canonicalAndRuntimeInventories = @($inventory)
    codeMatchCount = @($codeMatchRows).Count
    safety = [ordered]@{
        bibleDataModified = $false
        canonicalDataModified = $false
        alignmentsModified = $false
        runtimeModified = $false
        buildExecuted = $false
    }
}

if (
    (Test-Path -LiteralPath $rollbackPath) -or
    (Test-Path -LiteralPath $candidatePath) -or
    $webState -eq "unexpected-web-hash"
) {
    throw "Final rollback safety verification failed before report packaging."
}

$summary |
    ConvertTo-Json -Depth 20 |
    Set-Content -LiteralPath (Join-Path $reportRoot "audit-summary.json") -Encoding UTF8

$readme = @"
# EMETSEES P05.12G Canonical Rebuild Dependency Audit

This report was created after the P05.12F transaction correctly rolled back
because the P05.10 local canonical source still contained translation text and
display tokens derived from the old shortened WEB.

Observed downstream mismatch:

- Clean WEB text mismatches: 13,012
- WEB token mismatches: 9,265
- Approved block mismatches: 0
- Approved route mismatches: 0

This report is read-only. It did not rebuild canonical corpora, translation
tokens, alignments, runtime files, or production Bible data.

The next repair must be a coordinated transaction:

1. install the approved WEB reader candidate;
2. rebuild only WEB-dependent canonical translation/display-token layers for
   Hebrew OT and Greek NT from the corrected reader;
3. preserve source-language tokens, entity IDs, SEE packets, cached EMET
   explanations, KJV, Brenton, and LXX;
4. export runtime;
5. rebuild word-study assets;
6. audit restored text and tappability;
7. run the full build;
8. roll everything back together if any gate fails.
"@

$readme | Set-Content -LiteralPath (Join-Path $reportRoot "README.md") -Encoding UTF8

$checksumsPath = Join-Path $reportRoot "checksums.sha256"
$checksumLines = @(
    Get-ChildItem -LiteralPath $reportRoot -Recurse -File |
        Where-Object { $_.FullName -ne $checksumsPath } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = Get-RelativePathCompat -BasePath $reportRoot -TargetPath $_.FullName
            $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            "$hash  $relative"
        }
)

$checksumLines | Set-Content -LiteralPath $checksumsPath -Encoding ASCII

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
    -Path (Join-Path $reportRoot "*") `
    -DestinationPath $zipPath `
    -CompressionLevel Optimal

Write-Host ""
Write-Host "P05.12G V3 dependency audit completed." -ForegroundColor Green
Write-Host "- WEB transaction rollback verified: YES"
Write-Host "- Bible data modified: NO"
Write-Host "- Canonical data modified: NO"
Write-Host "- Alignments modified: NO"
Write-Host "- Report ZIP: $zipPath"
Write-Host ""
Write-Host "Upload this ZIP before attempting another WEB apply." -ForegroundColor Cyan
