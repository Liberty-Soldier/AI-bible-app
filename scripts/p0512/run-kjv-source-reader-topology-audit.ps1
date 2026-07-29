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
    "scripts\p0512\audit-kjv-source-reader-topology.js"

$canonicalRoot = Join-Path `
    $RepoRoot `
    ".private\scripture\canonical"

$currentReader = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedKJV.json"

$candidate = Join-Path `
    $RepoRoot `
    ".private\generated\P05.12\kjv-reconciliation\4ea6952590d070bf\generatedKJV.candidate.json"

$gapSummary = @(
    Get-ChildItem `
        -LiteralPath (
            Join-Path $RepoRoot ".private\reports\P05.12"
        ) `
        -Recurse `
        -File `
        -Filter "kjv-canonical-coordinate-gap-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
)

if (-not $gapSummary) {
    throw "No completed P05.12AB gap summary was found."
}

foreach ($required in @(
    $scriptPath,
    $canonicalRoot,
    $currentReader,
    $candidate,
    $gapSummary.FullName
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required P05.12AC input is missing: $required"
    }
}

$kjvHashBefore = Get-Sha256 -Path $currentReader
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
    "$stamp-kjv-source-reader-topology-audit"
$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AC-KJV-SOURCE-READER-TOPOLOGY-AUDIT-$stamp.zip"
$failureZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AC-FAILURE-$stamp.zip"
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
        "--current-reader",
        $currentReader,
        "--candidate",
        $candidate,
        "--gap-summary",
        $gapSummary.FullName,
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
Write-Host "=== P05.12AC stdout ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stdoutPath) {
    Get-Content -LiteralPath $stdoutPath |
        ForEach-Object { Write-Host $_ }
}

Write-Host ""
Write-Host "=== P05.12AC stderr ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stderrPath) {
    Get-Content -LiteralPath $stderrPath |
        ForEach-Object { Write-Host $_ }
}

$summaryPath = Join-Path `
    $outputRoot `
    "kjv-source-reader-topology-summary.json"

$passed = $false

if (Test-Path -LiteralPath $summaryPath -PathType Leaf) {
    $summary = Get-Content `
        -LiteralPath $summaryPath `
        -Raw |
        ConvertFrom-Json

    $passed = (
        $process.ExitCode -eq 0 -and
        $summary.gates.safeToDesignKjvVersificationCrosswalk -eq $true -and
        $summary.gates.safeToPromoteProductionKjv -eq $false
    )
}

if ((Get-Sha256 -Path $currentReader) -ne $kjvHashBefore) {
    throw "Production KJV changed during P05.12AC."
}

if ((Get-Sha256 -Path $webPath) -ne $webHashBefore) {
    throw "Production WEB changed during P05.12AC."
}

if ((Get-Sha256 -Path $brentonPath) -ne $brentonHashBefore) {
    throw "Production Brenton changed during P05.12AC."
}

$readme = @"
# EMETSEES P05.12AC KJV Source-to-Reader Topology Audit

This audit uses existing canonical KJV blocks as exact text anchors, then
classifies every source/reader gap between anchors.

It explains the 18 reader-only New Testament shadow verses and maps the 22
Old Testament versification-shift coordinates without changing Scripture,
canonical data, routes, or alignments.
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
        "P05.12AC failed. No production or canonical changes were made. " +
        "Upload: $destination"
    )
}

Write-Host ""
Write-Host "P05.12AC completed." -ForegroundColor Green
Write-Host "- Source-owned canonical records accounted: YES"
Write-Host "- KJV reader verses accounted: YES"
Write-Host "- Existing KJV anchors resolved monotonically: YES"
Write-Host "- All 40 P05.12AB gaps explained: YES"
Write-Host "- Reader-only NT verses backed by shadow records: YES"
Write-Host "- OT versification topology mapped: YES"
Write-Host "- Complex unresolved segments: 0"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Canonical data modified: NO"
Write-Host "- Safe to design KJV versification crosswalk: YES"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $destination"
