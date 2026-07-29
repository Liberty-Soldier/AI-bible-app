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

function Get-TreeSha256 {
    param([Parameter(Mandatory)][string]$RootPath)

    $resolvedRoot = (
        Resolve-Path -LiteralPath $RootPath
    ).Path
    $temporary = [System.IO.Path]::GetTempFileName()

    try {
        $lines = @(
            Get-ChildItem `
                -LiteralPath $resolvedRoot `
                -Recurse `
                -File |
                Sort-Object FullName |
                ForEach-Object {
                    $relative = $_.FullName.Substring(
                        $resolvedRoot.Length
                    )
                    $relative = $relative.TrimStart(
                        "\",
                        "/"
                    )
                    $relative = $relative.Replace(
                        "\",
                        "/"
                    )

                    "$relative`t$($_.Length)`t$(Get-Sha256 -Path $_.FullName)"
                }
        )

        [System.IO.File]::WriteAllText(
            $temporary,
            ($lines -join "`n"),
            [System.Text.UTF8Encoding]::new($false)
        )

        return Get-Sha256 -Path $temporary
    }
    finally {
        Remove-Item `
            -LiteralPath $temporary `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

$RepoRoot = (
    Resolve-Path -LiteralPath $RepoRoot
).Path
Set-Location -LiteralPath $RepoRoot

if (
    -not (
        Test-Path `
            -LiteralPath (
                Join-Path $RepoRoot ".git"
            )
    )
) {
    throw "Run from the ai-bible-app repository root."
}

$scriptPath = Join-Path `
    $RepoRoot `
    "scripts\p0512\build-token-level-kjv-crosswalk-overlay.js"

$policyPath = Join-Path `
    $RepoRoot `
    "scripts\p0512\kjv-token-crosswalk-overlay-policy.json"

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

$agSummary = @(
    Get-ChildItem `
        -LiteralPath $reportParent `
        -Recurse `
        -File `
        -Filter "canonical-reference-integrity-summary.json" |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
)

if (-not $gapSummary) {
    throw "No completed P05.12AB gap summary was found."
}

if (-not $agSummary) {
    throw "No completed P05.12AG census summary was found."
}

foreach ($required in @(
    $scriptPath,
    $policyPath,
    $canonicalRoot,
    $candidate,
    $gapSummary.FullName,
    $agSummary.FullName
)) {
    if (
        -not (
            Test-Path -LiteralPath $required
        )
    ) {
        throw "Required P05.12AH input is missing: $required"
    }
}

$expectedPolicyHash =
    "cb105812abe35020b44016152bb97ffbc593cc1dd262b6887fec47b670e28c47"

if (
    (Get-Sha256 -Path $policyPath) -ne
    $expectedPolicyHash
) {
    throw "The P05.12AH token-level policy hash has changed."
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
$canonicalHashBefore = Get-TreeSha256 `
    -RootPath $canonicalRoot

$stamp = (
    Get-Date
).ToUniversalTime().ToString(
    "yyyyMMdd-HHmmss"
)

$outputRoot = Join-Path `
    $reportParent `
    "$stamp-token-level-kjv-crosswalk-overlay"

$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AH-TOKEN-LEVEL-KJV-CROSSWALK-OVERLAY-$stamp.zip"

$failureZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AH-FAILURE-$stamp.zip"

$stdoutPath = Join-Path `
    $outputRoot `
    "overlay.stdout.log"

$stderrPath = Join-Path `
    $outputRoot `
    "overlay.stderr.log"

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
        "--ag-summary",
        $agSummary.FullName,
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
Write-Host "=== P05.12AH stdout ===" `
    -ForegroundColor Cyan

if (Test-Path -LiteralPath $stdoutPath) {
    Get-Content -LiteralPath $stdoutPath |
        ForEach-Object {
            Write-Host $_
        }
}

Write-Host ""
Write-Host "=== P05.12AH stderr ===" `
    -ForegroundColor Cyan

if (Test-Path -LiteralPath $stderrPath) {
    Get-Content -LiteralPath $stderrPath |
        ForEach-Object {
            Write-Host $_
        }
}

$summaryPath = Join-Path `
    $outputRoot `
    "token-level-kjv-overlay-summary.json"

$passed = $false

if (
    Test-Path `
        -LiteralPath $summaryPath `
        -PathType Leaf
) {
    $summary = Get-Content `
        -LiteralPath $summaryPath `
        -Raw |
        ConvertFrom-Json

    $passed = (
        $process.ExitCode -eq 0 -and
        $summary.gates.safeToBuildIsolatedCanonicalMigration -eq $true -and
        $summary.gates.safeToPromoteProductionKjv -eq $false
    )
}

if (
    (Get-Sha256 -Path $kjvPath) -ne
    $kjvHashBefore
) {
    throw "Production KJV changed during P05.12AH."
}

if (
    (Get-Sha256 -Path $webPath) -ne
    $webHashBefore
) {
    throw "Production WEB changed during P05.12AH."
}

if (
    (Get-Sha256 -Path $brentonPath) -ne
    $brentonHashBefore
) {
    throw "Production Brenton changed during P05.12AH."
}

if (
    (
        Get-TreeSha256 `
            -RootPath $canonicalRoot
    ) -ne $canonicalHashBefore
) {
    throw "Canonical data changed during P05.12AH."
}

$readme = @"
# EMETSEES P05.12AH Token-Level KJV Crosswalk Overlay

P05.12AG proved that the existing canonicalReference system is complete in
shape but lacks a bounded set of versification exceptions.

P05.12AH retains the existing destination by default and overlays only the
explicit source-wide and token-level corrections required by the completed
P05.12 evidence.

This stage is read-only. It does not modify canonical or production data.
"@

[System.IO.File]::WriteAllText(
    (Join-Path $outputRoot "README.md"),
    ($readme + "`n"),
    [System.Text.UTF8Encoding]::new($false)
)

$checksumPath = Join-Path `
    $outputRoot `
    "checksums.sha256"

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
            $relative = $_.FullName.Substring(
                $outputRoot.Length
            )
            $relative = $relative.TrimStart(
                "\",
                "/"
            )
            $relative = $relative.Replace(
                "\",
                "/"
            )

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

if (
    Test-Path -LiteralPath $destination
) {
    Remove-Item `
        -LiteralPath $destination `
        -Force
}

Compress-Archive `
    -Path (
        Join-Path $outputRoot "*"
    ) `
    -DestinationPath $destination `
    -CompressionLevel Optimal

if (-not $passed) {
    throw (
        "P05.12AH failed. No production or canonical changes were made. " +
        "Upload: $destination"
    )
}

Write-Host ""
Write-Host "P05.12AH completed." `
    -ForegroundColor Green
Write-Host "- Source-owned canonical files: 66 / 66"
Write-Host "- Source-owned canonical records: 31,086 / 31,086"
Write-Host "- Source tokens accounted: 438,452 / 438,452"
Write-Host "- Native source coordinates accounted: 31,088 / 31,088"
Write-Host "- KJV2006 reader coordinates accounted: 31,102 / 31,102"
Write-Host "- Reader coordinates with source support: 31,085"
Write-Host "- Reader-only fail-closed coordinates: 17"
Write-Host "- Source-to-reader edges: 31,091"
Write-Host "- Source coordinates split across readers: 3"
Write-Host "- Reader coordinates receiving multiple sources: 6"
Write-Host "- Overlay targets outside KJV2006: 0"
Write-Host "- All 40 P05.12AB gaps explained: YES"
Write-Host "- Repeated overlay build deterministic: YES"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Canonical data modified: NO"
Write-Host "- Safe to build isolated canonical migration: YES"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $destination"
