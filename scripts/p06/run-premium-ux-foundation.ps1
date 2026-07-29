param(
  [string]$RepositoryRoot = (Get-Location).Path,
  [switch]$Apply
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportName = "$timestamp-premium-ux-foundation"
$reportDir = Join-Path $RepositoryRoot ".private\reports\P06.2\$reportName"
$scriptPath = Join-Path $RepositoryRoot "scripts\p06\apply-premium-ux-foundation.cjs"
$zipName = "EMETSEES-P062-PREMIUM-UX-FOUNDATION-$timestamp.zip"
$zipPath = Join-Path $RepositoryRoot ".private\reports\P06.2\$zipName"

New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$stdout = Join-Path $reportDir "runner.stdout.log"
$stderr = Join-Path $reportDir "runner.stderr.log"

$arguments = @(
  "--max-old-space-size=8192",
  $scriptPath,
  "--repo",
  $RepositoryRoot,
  "--output",
  $reportDir
)

if ($Apply) {
  $arguments += "--apply"
}

Write-Host ""
Write-Host "==> Applying the EMETSEES premium UX foundation"
& node @arguments 1> $stdout 2> $stderr
$nodeStatus = $LASTEXITCODE

$rootFull = [System.IO.Path]::GetFullPath($reportDir).TrimEnd('\') + '\'
$checksumLines = @()

Get-ChildItem -LiteralPath $reportDir -Recurse -File |
  Where-Object { $_.Name -ne "checksums.sha256" } |
  Sort-Object FullName |
  ForEach-Object {
    $full = [System.IO.Path]::GetFullPath($_.FullName)
    $relative = $full.Substring($rootFull.Length).Replace('\','/')
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $full).Hash.ToLowerInvariant()
    $checksumLines += "$hash  $relative"
  }

[System.IO.File]::WriteAllLines(
  (Join-Path $reportDir "checksums.sha256"),
  $checksumLines,
  (New-Object System.Text.UTF8Encoding($false))
)

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
  -Path (Join-Path $reportDir "*") `
  -DestinationPath $zipPath `
  -CompressionLevel Optimal

Write-Host ""
Write-Host "P06.2 report:"
Write-Host $zipPath

if ($nodeStatus -ne 0) {
  Write-Host ""
  Write-Host "The premium UX package failed closed. Upload the report ZIP and do not commit the failed changes."
}

exit $nodeStatus
