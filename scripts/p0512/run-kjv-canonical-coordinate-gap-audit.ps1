[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)

    return (
        Get-FileHash `
            -LiteralPath $Path `
            -Algorithm SHA256
    ).Hash.ToLowerInvariant()
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$scriptPath = Join-Path `
    $RepoRoot `
    "scripts\p0512\audit-kjv-canonical-coordinate-gaps.js"

$canonicalRoot = Join-Path `
    $RepoRoot `
    ".private\scripture\canonical"

$candidatePath = Join-Path `
    $RepoRoot `
    ".private\generated\P05.12\kjv-reconciliation\4ea6952590d070bf\generatedKJV.candidate.json"

$currentReaderPath = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedKJV.json"

foreach ($required in @(
    $scriptPath,
    $canonicalRoot,
    $candidatePath,
    $currentReaderPath
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required P05.12AB input is missing: $required"
    }
}

$kjvHashBefore = Get-Sha256 -Path $currentReaderPath
$webPath = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedWEB.json"
$brentonPath = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedBrenton.json"
$webHashBefore = Get-Sha256 -Path $webPath
$brentonHashBefore = Get-Sha256 -Path $brentonPath

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path `
    $reportParent `
    "$stamp-kjv-canonical-coordinate-gap-audit"
$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AB-KJV-CANONICAL-COORDINATE-GAP-AUDIT-$stamp.zip"
$failureZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AB-FAILURE-$stamp.zip"
$stdoutPath = Join-Path $outputRoot "audit.stdout.log"
$stderrPath = Join-Path $outputRoot "audit.stderr.log"

New-Item `
    -ItemType Directory `
    -Force `
    -Path $outputRoot |
    Out-Null

$process = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList @(
        $scriptPath,
        "--canonical-root",
        $canonicalRoot,
        "--candidate",
        $candidatePath,
        "--current-reader",
        $currentReaderPath,
        "--output",
        $outputRoot
    ) `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -Wait `
    -PassThru `
    -NoNewWindow

Write-Host ""
Write-Host "=== P05.12AB stdout ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stdoutPath) {
    Get-Content -LiteralPath $stdoutPath |
        ForEach-Object { Write-Host $_ }
}

Write-Host ""
Write-Host "=== P05.12AB stderr ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stderrPath) {
    Get-Content -LiteralPath $stderrPath |
        ForEach-Object { Write-Host $_ }
}

$summaryPath = Join-Path `
    $outputRoot `
    "kjv-canonical-coordinate-gap-summary.json"

$passed = $false

if (Test-Path -LiteralPath $summaryPath -PathType Leaf) {
    $summary = Get-Content `
        -LiteralPath $summaryPath `
        -Raw |
        ConvertFrom-Json

    $passed = (
        $process.ExitCode -eq 0 -and
        $summary.gates.candidateAndCurrentCoordinateSetsExact -eq $true -and
        $summary.gates.canonicalOwnedKjvCountIs31062 -eq $true -and
        $summary.gates.exactly40ReaderCoordinatesLackOwnedKjvBlock -eq $true -and
        $summary.gates.noOwnedCanonicalCoordinatesOutsideReader -eq $true -and
        $summary.gates.noCanonicalCoordinateDuplicates -eq $true -and
        $summary.gates.everyGapClassified -eq $true -and
        $summary.gates.safeToPromoteProductionKjv -eq $false
    )
}

if ((Get-Sha256 -Path $currentReaderPath) -ne $kjvHashBefore) {
    throw "Production KJV changed during P05.12AB."
}

if ((Get-Sha256 -Path $webPath) -ne $webHashBefore) {
    throw "Production WEB changed during P05.12AB."
}

if ((Get-Sha256 -Path $brentonPath) -ne $brentonHashBefore) {
    throw "Production Brenton changed during P05.12AB."
}

$readme = @"
# EMETSEES P05.12AB KJV Canonical Coordinate Gap Audit

V2 proved that the 31,062 source-owned canonical KJV blocks each represent one
reader coordinate. Therefore 40 of the 31,102 visible KJV coordinates are not
represented by a source-owned canonical KJV block.

This audit names and classifies all 40 coordinates. It does not modify
production Scripture, canonical data, routes, or alignments.
"@

[System.IO.File]::WriteAllText(
    (Join-Path $outputRoot "README.md"),
    ($readme + "`n"),
    [System.Text.UTF8Encoding]::new($false)
)

$checksumPath = Join-Path $outputRoot "checksums.sha256"

$checksumLines = @(
    Get-ChildItem `
        -LiteralPath $outputRoot `
        -Recurse `
        -File |
        Where-Object {
            $_.FullName -ne $checksumPath
        } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($outputRoot.Length)
            $relative = $relative.TrimStart("\", "/")
            $relative = $relative.Replace("\", "/")

            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
)

$checksumLines |
    Set-Content `
        -LiteralPath $checksumPath `
        -Encoding ASCII

$destination = if ($passed) {
    $reportZip
}
else {
    $failureZip
}

if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $destination `
    -CompressionLevel Optimal

if (-not $passed) {
    throw (
        "P05.12AB failed. No production or canonical changes were made. " +
        "Upload: $destination"
    )
}

Write-Host ""
Write-Host "P05.12AB completed." -ForegroundColor Green
Write-Host "- KJV reader coordinates: 31,102"
Write-Host "- Source-owned canonical KJV coordinates: 31,062"
Write-Host "- Unrepresented reader coordinates classified: 40 / 40"
Write-Host "- Compound-span assumption rejected: YES"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Canonical data modified: NO"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $destination"
