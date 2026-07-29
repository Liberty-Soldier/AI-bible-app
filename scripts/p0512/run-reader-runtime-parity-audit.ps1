[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "Run from the ai-bible-app repository root."
}

$scriptPath = Join-Path $RepoRoot "scripts\p0512\audit-reader-runtime-parity.js"

if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Missing P05.12Y audit script: $scriptPath"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportParent = Join-Path $RepoRoot ".private\reports\P05.12"
$outputRoot = Join-Path $reportParent "$stamp-reader-runtime-parity-audit"
$reportZip = Join-Path $reportParent "EMETSEES-P0512Y-READER-RUNTIME-PARITY-AUDIT-$stamp.zip"
$failureZip = Join-Path $reportParent "EMETSEES-P0512Y-FAILURE-$stamp.zip"
$stdoutPath = Join-Path $outputRoot "audit.stdout.log"
$stderrPath = Join-Path $outputRoot "audit.stderr.log"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$env:P0512_BRANCH = (& git branch --show-current).Trim()
$env:P0512_COMMIT = (& git rev-parse HEAD).Trim()

$process = Start-Process `
    -FilePath "node.exe" `
    -ArgumentList @(
        $scriptPath,
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
Write-Host "=== P05.12Y stdout ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stdoutPath) {
    Get-Content -LiteralPath $stdoutPath |
        ForEach-Object { Write-Host $_ }
}

Write-Host ""
Write-Host "=== P05.12Y stderr ===" -ForegroundColor Cyan
if (Test-Path -LiteralPath $stderrPath) {
    Get-Content -LiteralPath $stderrPath |
        ForEach-Object { Write-Host $_ }
}

$summaryPath = Join-Path $outputRoot "reader-runtime-parity-summary.json"
$passed = $false

if (Test-Path -LiteralPath $summaryPath -PathType Leaf) {
    $summary = Get-Content -LiteralPath $summaryPath -Raw |
        ConvertFrom-Json

    $passed = (
        $process.ExitCode -eq 0 -and
        $summary.gates.safeToLockWebAndBrenton -eq $true -and
        $summary.gates.safeToProceedToKjvIntegrity -eq $true
    )
}

$readme = @"
# EMETSEES P05.12Y Reader Runtime Parity Audit

This audit is read-only.

It compares each generated translation against every split chapter runtime
file for WEB, KJV, and Brenton. It also verifies that the reader chapter fetch
and canonical token-availability fetch cannot use cross-deployment
`force-cache`.

Production Scripture data, canonical data, alignments, entities, and runtime
files were not modified.
"@

[System.IO.File]::WriteAllText(
    (Join-Path $outputRoot "README.md"),
    ($readme + "`n"),
    [System.Text.UTF8Encoding]::new($false)
)

$checksumPath = Join-Path $outputRoot "checksums.sha256"
$checksumLines = @(
    Get-ChildItem -LiteralPath $outputRoot -Recurse -File |
        Where-Object { $_.FullName -ne $checksumPath } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = $_.FullName.Substring($outputRoot.Length).TrimStart("\", "/").Replace("\", "/")
            "$(Get-Sha256 -Path $_.FullName)  $relative"
        }
)
$checksumLines | Set-Content -LiteralPath $checksumPath -Encoding ASCII

$destination = if ($passed) { $reportZip } else { $failureZip }

if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Force
}

Compress-Archive `
    -Path (Join-Path $outputRoot "*") `
    -DestinationPath $destination `
    -CompressionLevel Optimal

if (-not $passed) {
    throw "P05.12Y failed. No translation or alignment changes were made. Upload: $destination"
}

Write-Host ""
Write-Host "P05.12Y completed." -ForegroundColor Green
Write-Host "- WEB generated-to-runtime parity: PASSED"
Write-Host "- KJV generated-to-runtime parity: PASSED"
Write-Host "- Brenton generated-to-runtime parity: PASSED"
Write-Host "- Reader no-store policy: PASSED"
Write-Host "- Canonical availability no-store policy: PASSED"
Write-Host "- Production data modified: NO"
Write-Host "- Safe to lock WEB and Brenton: YES"
Write-Host "- Safe to proceed to KJV integrity: YES"
Write-Host "- Report ZIP: $destination"
