param(
  [string]$RepositoryRoot = (Get-Location).Path,
  [switch]$Apply
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportName = "$timestamp-reader-controls-polish"
$reportDir = Join-Path $RepositoryRoot ".private\reports\P06.6\$reportName"
$scriptPath = Join-Path $RepositoryRoot "scripts\p06\apply-reader-controls-polish.cjs"
$zipName = "EMETSEES-P066-READER-CONTROLS-POLISH-$timestamp.zip"
$zipPath = Join-Path $RepositoryRoot ".private\reports\P06.6\$zipName"

New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$stdout = Join-Path $reportDir "runner.stdout.log"
$stderr = Join-Path $reportDir "runner.stderr.log"

$args = @(
  "--max-old-space-size=8192",
  $scriptPath,
  "--repo",
  $RepositoryRoot,
  "--output",
  $reportDir
)
if ($Apply) { $args += "--apply" }

Write-Host ""
Write-Host "==> Applying reader-controls polish"
& node @args 1> $stdout 2> $stderr
$status = $LASTEXITCODE

$rootFull = [System.IO.Path]::GetFullPath($reportDir).TrimEnd('\') + '\'
$lines = @()
Get-ChildItem -LiteralPath $reportDir -Recurse -File |
  Where-Object { $_.Name -ne "checksums.sha256" } |
  Sort-Object FullName |
  ForEach-Object {
    $full = [System.IO.Path]::GetFullPath($_.FullName)
    $relative = $full.Substring($rootFull.Length).Replace('\','/')
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $full).Hash.ToLowerInvariant()
    $lines += "$hash  $relative"
  }

[System.IO.File]::WriteAllLines(
  (Join-Path $reportDir "checksums.sha256"),
  $lines,
  (New-Object System.Text.UTF8Encoding($false))
)

if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $reportDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "P06.6 report:"
Write-Host $zipPath

if ($status -ne 0) {
  Write-Host ""
  Write-Host "P06.6 failed closed. Upload the report and do not commit."
}
exit $status
