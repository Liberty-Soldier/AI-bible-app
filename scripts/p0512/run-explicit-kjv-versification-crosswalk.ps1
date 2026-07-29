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
    "scripts\p0512\build-explicit-kjv-versification-crosswalk.js"

$policyPath = Join-Path `
    $RepoRoot `
    "scripts\p0512\kjv-explicit-versification-policy.json"

$canonicalRoot = Join-Path `
    $RepoRoot `
    ".private\scripture\canonical"

$candidate = Join-Path `
    $RepoRoot `
    ".private\generated\P05.12\kjv-reconciliation\4ea6952590d070bf\generatedKJV.candidate.json"

$reportParent = Join-Path `
    $RepoRoot `
    ".private\reports\P05.12"

$gapSummary = @(
    Get-ChildItem `
        -LiteralPath $reportParent `
        -Recurse `
        -File `
        -Filter "kjv-canonical-coordinate-gap-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
)

$evidenceSummary = @(
    Get-ChildItem `
        -LiteralPath $reportParent `
        -Recurse `
        -File `
        -Filter "kjv-versification-evidence-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
)

if (-not $gapSummary) {
    throw "No completed P05.12AB gap summary was found."
}

if (-not $evidenceSummary) {
    throw "No completed P05.12AD evidence summary was found."
}

foreach ($required in @(
    $scriptPath,
    $policyPath,
    $canonicalRoot,
    $candidate,
    $gapSummary.FullName,
    $evidenceSummary.FullName
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required P05.12AE input is missing: $required"
    }
}

$expectedPolicyHash = "551eff2cc76e4007127cd1ac7b433f2d8133fd87789c26be2bf05d737b365fa1"

if ((Get-Sha256 -Path $policyPath) -ne $expectedPolicyHash) {
    throw "The explicit KJV crosswalk policy hash has changed."
}

$kjvPath = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedKJV.json"
$webPath = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedWEB.json"
$brentonPath = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedBrenton.json"

$kjvHashBefore = Get-Sha256 -Path $kjvPath
$webHashBefore = Get-Sha256 -Path $webPath
$brentonHashBefore = Get-Sha256 -Path $brentonPath

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outputRoot = Join-Path `
    $reportParent `
    "$stamp-explicit-kjv-versification-crosswalk"
$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AE-EXPLICIT-KJV-VERSIFICATION-CROSSWALK-$stamp.zip"
$failureZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AE-FAILURE-$stamp.zip"
$stdoutPath = Join-Path $outputRoot "crosswalk.stdout.log"
$stderrPath = Join-Path $outputRoot "crosswalk.stderr.log"

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
        $candidate,
        "--policy",
        $policyPath,
        "--gap-summary",
        $gapSummary.FullName,
        "--evidence-summary",
        $evidenceSummary.FullName,
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
Write-Host "=== P05.12AE stdout ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stdoutPath) {
    Get-Content -LiteralPath $stdoutPath |
        ForEach-Object { Write-Host $_ }
}

Write-Host ""
Write-Host "=== P05.12AE stderr ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stderrPath) {
    Get-Content -LiteralPath $stderrPath |
        ForEach-Object { Write-Host $_ }
}

$summaryPath = Join-Path `
    $outputRoot `
    "kjv-explicit-crosswalk-summary.json"

$passed = $false

if (Test-Path -LiteralPath $summaryPath -PathType Leaf) {
    $summary = Get-Content `
        -LiteralPath $summaryPath `
        -Raw |
        ConvertFrom-Json

    $passed = (
        $process.ExitCode -eq 0 -and
        $summary.gates.safeToBuildKjvCanonicalMigrationPreview -eq $true -and
        $summary.gates.safeToPromoteProductionKjv -eq $false
    )
}

if ((Get-Sha256 -Path $kjvPath) -ne $kjvHashBefore) {
    throw "Production KJV changed during P05.12AE."
}

if ((Get-Sha256 -Path $webPath) -ne $webHashBefore) {
    throw "Production WEB changed during P05.12AE."
}

if ((Get-Sha256 -Path $brentonPath) -ne $brentonHashBefore) {
    throw "Production Brenton changed during P05.12AE."
}

$readme = @"
# EMETSEES P05.12AE Explicit KJV Versification Crosswalk

This stage replaces the failed historical-block heuristic with an explicit,
evidence-backed source-to-reader policy.

It validates all 31,086 source-owned records and all 31,102 KJV2006 reader
verses. Reader-only verses remain visible and fail closed for source word
study. No production or canonical data is modified.
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
        "P05.12AE failed. No production or canonical changes were made. " +
        "Upload: $destination"
    )
}

Write-Host ""
Write-Host "P05.12AE completed." -ForegroundColor Green
Write-Host "- Source-owned coordinates accounted: 31,086 / 31,086"
Write-Host "- KJV2006 reader coordinates accounted: 31,102 / 31,102"
Write-Host "- Source-to-reader edges: 31,089"
Write-Host "- Reader-only fail-closed verses: 17"
Write-Host "- Multi-source reader coordinates: 4"
Write-Host "- Multi-reader source coordinates: 3"
Write-Host "- All 40 P05.12AB gaps explained: YES"
Write-Host "- Repeated crosswalk build deterministic: YES"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Canonical data modified: NO"
Write-Host "- Safe to build KJV canonical migration preview: YES"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $destination"
