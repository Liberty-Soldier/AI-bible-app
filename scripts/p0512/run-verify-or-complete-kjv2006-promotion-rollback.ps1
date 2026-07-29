$ErrorActionPreference = 'Stop'

$repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $repo 'package.json'))) {
  throw '[P05.12AP-R1] Run this command from C:\Users\CreatorStudio\ai-bible-app.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportDir = Join-Path $repo ".private\reports\P05.12\$timestamp-controlled-kjv2006-promotion-recovery"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$script = Join-Path $repo 'scripts\p0512\verify-or-complete-kjv2006-promotion-rollback.cjs'

Write-Host ''
Write-Host '==> P05.12AP-R1 rollback verification and build-diagnostic recovery'
Write-Host '    This first verifies whether AP already restored production.'
Write-Host '    It writes to production targets only if exact rollback completion is required.'
Write-Host ''

$nodeExit = 1
try {
  & node --max-old-space-size=8192 $script --report-dir $reportDir
  $nodeExit = $LASTEXITCODE
} catch {
  $_ | Out-String | Set-Content -Encoding UTF8 (Join-Path $reportDir 'powershell-error.log')
  $nodeExit = 1
}

# Windows PowerShell 5.1-compatible relative paths. Do not use Path.GetRelativePath.
$checksumPath = Join-Path $reportDir 'checksums.sha256'
$prefix = $reportDir.TrimEnd('\') + '\'
$lines = Get-ChildItem -Path $reportDir -Recurse -File |
  Where-Object { $_.FullName -ne $checksumPath } |
  Sort-Object FullName |
  ForEach-Object {
    if (-not $_.FullName.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "[P05.12AP-R1] Report file escaped report directory: $($_.FullName)"
    }
    $relative = $_.FullName.Substring($prefix.Length).Replace('\','/')
    $hash = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLowerInvariant()
    "$hash  $relative"
  }
$lines | Set-Content -Encoding ASCII $checksumPath

$zipPath = Join-Path (Split-Path $reportDir -Parent) ("EMETSEES-P0512AP-R1-KJV2006-PROMOTION-ROLLBACK-RECOVERY-" + $timestamp + '.zip')
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $reportDir '*') -DestinationPath $zipPath -CompressionLevel Optimal
$zipHash = (Get-FileHash -Algorithm SHA256 $zipPath).Hash.ToLowerInvariant()

Write-Host ''
Write-Host "Report ZIP: $zipPath"
Write-Host "SHA-256:   $zipHash"

if ($nodeExit -ne 0) {
  Write-Host ''
  Write-Host '[P05.12AP-R1] Rollback is NOT independently verified. Do not rerun AP. Upload the report ZIP.'
  exit $nodeExit
}

Write-Host ''
Write-Host '[P05.12AP-R1] Production is exactly restored to its pre-AP state. Upload the report ZIP so the build error can be corrected.'
exit 0
