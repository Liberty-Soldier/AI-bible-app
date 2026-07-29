param(
  [string]$RepositoryRoot = (Get-Location).Path
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportName = "$timestamp-isolated-brenton-serialization-restore-candidate"
$reportDir = Join-Path $RepositoryRoot ".private\reports\P05.12\$reportName"
$scriptPath = Join-Path $RepositoryRoot "scripts\p0512\build-isolated-brenton-serialization-restore-candidate.cjs"
$zipName = "EMETSEES-P0512AP-B3-ISOLATED-BRENTON-SERIALIZATION-RESTORE-CANDIDATE-$timestamp.zip"
$zipPath = Join-Path $RepositoryRoot ".private\reports\P05.12\$zipName"

New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
$stdout = Join-Path $reportDir "builder.stdout.log"
$stderr = Join-Path $reportDir "builder.stderr.log"

Write-Host ""
Write-Host "==> Building two isolated Brenton serialization-restore candidates"
& node --max-old-space-size=8192 $scriptPath --repo $RepositoryRoot --output $reportDir 1> $stdout 2> $stderr
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
Compress-Archive -Path (Join-Path $reportDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "Candidate report:"
Write-Host $zipPath
Write-Host ""
Write-Host "This stage did not modify Brenton, KJV, WEB, canonical data, alignments, or production runtime."
exit $nodeStatus
