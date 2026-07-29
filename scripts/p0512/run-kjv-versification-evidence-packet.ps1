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
    "scripts\p0512\build-kjv-versification-evidence-packet.js"

$canonicalRoot = Join-Path `
    $RepoRoot `
    ".private\scripture\canonical"

$currentReader = Join-Path `
    $RepoRoot `
    "app\data\scripture\generatedKJV.json"

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

$topologySummary = @(
    Get-ChildItem `
        -LiteralPath $reportParent `
        -Recurse `
        -File `
        -Filter "kjv-source-reader-topology-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
)

$tvtms = @(
    Get-ChildItem `
        -LiteralPath (
            Join-Path $RepoRoot ".private\sources\versification"
        ) `
        -Recurse `
        -File `
        -Filter "TVTMS.txt" |
        Where-Object {
            $_.Length -eq 5820824
        } |
        Select-Object -First 1
)

if (-not $gapSummary) {
    throw "No P05.12AB gap summary was found."
}

if (-not $topologySummary) {
    throw "No P05.12AC topology summary was found."
}

if (-not $tvtms) {
    throw "The pinned STEPBible TVTMS.txt source was not found."
}

foreach ($required in @(
    $scriptPath,
    $canonicalRoot,
    $currentReader,
    $candidate,
    $gapSummary.FullName,
    $topologySummary.FullName,
    $tvtms.FullName
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required P05.12AD input is missing: $required"
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
$outputRoot = Join-Path `
    $reportParent `
    "$stamp-kjv-versification-evidence-packet"
$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AD-KJV-VERSIFICATION-EVIDENCE-PACKET-$stamp.zip"
$failureZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AD-FAILURE-$stamp.zip"
$stdoutPath = Join-Path $outputRoot "packet.stdout.log"
$stderrPath = Join-Path $outputRoot "packet.stderr.log"

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
        "--topology-summary",
        $topologySummary.FullName,
        "--tvtms",
        $tvtms.FullName,
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
Write-Host "=== P05.12AD stdout ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stdoutPath) {
    Get-Content -LiteralPath $stdoutPath |
        ForEach-Object { Write-Host $_ }
}

Write-Host ""
Write-Host "=== P05.12AD stderr ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stderrPath) {
    Get-Content -LiteralPath $stderrPath |
        ForEach-Object { Write-Host $_ }
}

$summaryPath = Join-Path `
    $outputRoot `
    "kjv-versification-evidence-summary.json"

$passed = $false

if (Test-Path -LiteralPath $summaryPath -PathType Leaf) {
    $summary = Get-Content `
        -LiteralPath $summaryPath `
        -Raw |
        ConvertFrom-Json

    $passed = (
        $process.ExitCode -eq 0 -and
        $summary.gates.candidateHashLocked -eq $true -and
        $summary.gates.tvtmsHashLocked -eq $true -and
        $summary.gates.approvedGapReportLoaded -eq $true -and
        $summary.gates.completedTopologyReportLoaded -eq $true -and
        $summary.gates.affectedCanonicalEvidenceExtracted -eq $true -and
        $summary.gates.affectedReaderEvidenceExtracted -eq $true -and
        $summary.gates.tvtmsEvidenceExtracted -eq $true -and
        $summary.gates.safeToBuildExplicitKjvCrosswalk -eq $true -and
        $summary.gates.safeToPromoteProductionKjv -eq $false
    )
}

if ((Get-Sha256 -Path $currentReader) -ne $kjvHashBefore) {
    throw "Production KJV changed during P05.12AD."
}

if ((Get-Sha256 -Path $webPath) -ne $webHashBefore) {
    throw "Production WEB changed during P05.12AD."
}

if ((Get-Sha256 -Path $brentonPath) -ne $brentonHashBefore) {
    throw "Production Brenton changed during P05.12AD."
}

$readme = @"
# EMETSEES P05.12AD KJV Versification Evidence Packet

P05.12AC proved that existing KJV blocks cannot be treated as authoritative
source-to-reader anchors in the affected passages.

This stage extracts the exact canonical source records, source tokens, current
KJV reader verses, locked KJV2006 verses, P05.12AB/P05.12AC findings, and
pinned STEPBible TVTMS lines needed to build an explicit crosswalk.

No production Scripture, canonical data, routes, or alignments were modified.
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
        "P05.12AD failed. No production or canonical changes were made. " +
        "Upload: $destination"
    )
}

Write-Host ""
Write-Host "P05.12AD completed." -ForegroundColor Green
Write-Host "- P05.12AB 40-coordinate report loaded: YES"
Write-Host "- P05.12AC completed topology loaded: YES"
Write-Host "- Affected canonical records and source tokens extracted: YES"
Write-Host "- Current and KJV2006 reader evidence extracted: YES"
Write-Host "- Pinned STEPBible TVTMS evidence extracted: YES"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Canonical data modified: NO"
Write-Host "- Safe to build explicit KJV crosswalk: YES"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $destination"
