param(
  [switch]$Promote
)

$ErrorActionPreference = 'Stop'
if (-not $Promote) {
  throw '[P05.12AP] This stage changes production Scripture. Re-run with the explicit -Promote switch.'
}

$repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $repo 'package.json'))) {
  throw '[P05.12AP] Run this command from C:\Users\CreatorStudio\ai-bible-app.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportDir = Join-Path $repo ".private\reports\P05.12\$timestamp-controlled-kjv2006-production-promotion"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$script = Join-Path $repo 'scripts\p0512\controlled-kjv2006-production-promotion.cjs'

Write-Host ''
Write-Host '==> P05.12AP V3 controlled KJV2006 production promotion'
Write-Host '    This stage WILL replace the five AO-approved KJV production targets.'
Write-Host '    Any failed post-promotion gate triggers automatic rollback.'
Write-Host ''

$nodeExit = 1
try {
  & node --max-old-space-size=8192 $script --report-dir $reportDir
  $nodeExit = $LASTEXITCODE
} catch {
  $_ | Out-String | Set-Content -Encoding UTF8 (Join-Path $reportDir 'powershell-error.log')
  $nodeExit = 1
}

# Seal the report after the Node process finishes, whether it passed or rolled back.
$checksumPath = Join-Path $reportDir 'checksums.sha256'
function Get-RelativePathCompat {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$FullPath
  )

  $baseFull = [System.IO.Path]::GetFullPath($BasePath).TrimEnd([char[]]"\/")
  $fileFull = [System.IO.Path]::GetFullPath($FullPath)
  $prefix = $baseFull + [System.IO.Path]::DirectorySeparatorChar
  if (-not $fileFull.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "[P05.12AP] Report file is outside the report directory: $fileFull"
  }
  return $fileFull.Substring($prefix.Length).Replace('\','/')
}

$lines = Get-ChildItem -Path $reportDir -Recurse -File |
  Where-Object { $_.FullName -ne $checksumPath } |
  Sort-Object FullName |
  ForEach-Object {
    $relative = Get-RelativePathCompat -BasePath $reportDir -FullPath $_.FullName
    $hash = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLowerInvariant()
    "$hash  $relative"
  }
$lines | Set-Content -Encoding ASCII $checksumPath

$zipPath = Join-Path (Split-Path $reportDir -Parent) ("EMETSEES-P0512AP-CONTROLLED-KJV2006-PRODUCTION-PROMOTION-" + $timestamp + '.zip')
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $reportDir '*') -DestinationPath $zipPath -CompressionLevel Optimal
$zipHash = (Get-FileHash -Algorithm SHA256 $zipPath).Hash.ToLowerInvariant()

Write-Host ''
Write-Host "Report ZIP: $zipPath"
Write-Host "SHA-256:   $zipHash"

if ($nodeExit -ne 0) {
  Write-Host ''
  Write-Host '[P05.12AP] Promotion did not pass. Inspect/upload the report ZIP. If production writes began, the script attempted and verified rollback.'
  exit $nodeExit
}

Write-Host ''
Write-Host '[P05.12AP] Promotion passed. Upload the report ZIP for independent closure verification.'
exit 0
