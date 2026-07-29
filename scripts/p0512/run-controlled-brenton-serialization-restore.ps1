param(
  [string]$RepositoryRoot = (Get-Location).Path,
  [switch]$Promote
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportName = "$timestamp-controlled-brenton-serialization-restore"
$reportDir = Join-Path $RepositoryRoot ".private\reports\P05.12\$reportName"
$scriptPath = Join-Path $RepositoryRoot "scripts\p0512\controlled-brenton-serialization-restore.cjs"
$zipName = "EMETSEES-P0512AP-B4-CONTROLLED-BRENTON-SERIALIZATION-RESTORE-$timestamp.zip"
$zipPath = Join-Path $RepositoryRoot ".private\reports\P05.12\$zipName"

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

if ($Promote) {
  $arguments += "--promote"
}

Write-Host ""
Write-Host "==> Running controlled Brenton exact-serialization restore"
& node @arguments 1> $stdout 2> $stderr
$nodeStatus = $LASTEXITCODE

# Windows PowerShell 5.1-compatible checksum manifest.
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
Write-Host "B4 report:"
Write-Host $zipPath

if ($nodeStatus -ne 0) {
  Write-Host ""
  Write-Host "The repair failed closed. Review and upload the report ZIP; do not rerun KJV promotion."
}

exit $nodeStatus
