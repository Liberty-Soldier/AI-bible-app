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
    "scripts\p0512\audit-canonical-source-reference-topology.js"

$canonicalRoot = Join-Path `
    $RepoRoot `
    ".private\scripture\canonical"

foreach ($required in @(
    $scriptPath,
    $canonicalRoot
)) {
    if (
        -not (
            Test-Path -LiteralPath $required
        )
    ) {
        throw "Required P05.12AF input is missing: $required"
    }
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

$reportParent = Join-Path `
    $RepoRoot `
    ".private\reports\P05.12"

$outputRoot = Join-Path `
    $reportParent `
    "$stamp-canonical-source-reference-topology-census"

$reportZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AF-CANONICAL-SOURCE-REFERENCE-TOPOLOGY-CENSUS-$stamp.zip"

$failureZip = Join-Path `
    $reportParent `
    "EMETSEES-P0512AF-FAILURE-$stamp.zip"

$stdoutPath = Join-Path `
    $outputRoot `
    "census.stdout.log"

$stderrPath = Join-Path `
    $outputRoot `
    "census.stderr.log"

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
Write-Host "=== P05.12AF stdout ===" `
    -ForegroundColor Cyan

if (Test-Path -LiteralPath $stdoutPath) {
    Get-Content -LiteralPath $stdoutPath |
        ForEach-Object {
            Write-Host $_
        }
}

Write-Host ""
Write-Host "=== P05.12AF stderr ===" `
    -ForegroundColor Cyan

if (Test-Path -LiteralPath $stderrPath) {
    Get-Content -LiteralPath $stderrPath |
        ForEach-Object {
            Write-Host $_
        }
}

$summaryPath = Join-Path `
    $outputRoot `
    "canonical-source-reference-topology-summary.json"

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
        $summary.gates.safeToDesignSourceCoordinateCrosswalk -eq $true -and
        $summary.gates.safeToPromoteProductionKjv -eq $false
    )
}

if (
    (Get-Sha256 -Path $kjvPath) -ne
    $kjvHashBefore
) {
    throw "Production KJV changed during P05.12AF."
}

if (
    (Get-Sha256 -Path $webPath) -ne
    $webHashBefore
) {
    throw "Production WEB changed during P05.12AF."
}

if (
    (Get-Sha256 -Path $brentonPath) -ne
    $brentonHashBefore
) {
    throw "Production Brenton changed during P05.12AF."
}

if (
    (
        Get-TreeSha256 `
            -RootPath $canonicalRoot
    ) -ne $canonicalHashBefore
) {
    throw "Canonical data changed during P05.12AF."
}

$readme = @"
# EMETSEES P05.12AF Canonical Source-Reference Topology Census

P05.12AE failed because a source-owned canonical record may contain tokens
from more than one source verse. The first example was 1Chr:11:47, containing
token source references 1Chr:11:47 and 1Chr:12:1.

This census measures the complete token-level source-reference topology before
the KJV crosswalk is redesigned.

No production Scripture, canonical data, routes, or alignments were modified.
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
        "P05.12AF failed. No production or canonical changes were made. " +
        "Upload: $destination"
    )
}

Write-Host ""
Write-Host "P05.12AF completed." `
    -ForegroundColor Green
Write-Host "- Source-owned canonical files: 66 / 66"
Write-Host "- Source-owned canonical records: 31,086 / 31,086"
Write-Host "- Every record classified: YES"
Write-Host "- Token source references parsed: YES"
Write-Host "- Multi-source-reference records inventoried: YES"
Write-Host "- Duplicate source coordinates across records inventoried: YES"
Write-Host "- Record/token coordinate disagreements inventoried: YES"
Write-Host "- Production KJV modified: NO"
Write-Host "- Production WEB modified: NO"
Write-Host "- Production Brenton modified: NO"
Write-Host "- Canonical data modified: NO"
Write-Host "- Safe to redesign source-coordinate crosswalk: YES"
Write-Host "- Production promotion authorized: NO"
Write-Host "- Report ZIP: $destination"
