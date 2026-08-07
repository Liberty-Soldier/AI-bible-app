param(
  [Parameter(Mandatory = $false)]
  [string]$RepositoryRoot = "C:\Users\CreatorStudio\ai-bible-app"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$phaseRoot = Join-Path $repo ".private\reports\P08.5C-AUDIT"
$reportRoot = Join-Path $phaseRoot "$stamp-branding-share-install-audit"
$successZip = Join-Path $phaseRoot "EMETSEES-P08.5C-BRANDING-SHARE-INSTALL-AUDIT-$stamp.zip"
$failureZip = Join-Path $phaseRoot "EMETSEES-P08.5C-BRANDING-SHARE-INSTALL-AUDIT-FAILURE-$stamp.zip"

$textTargets = @(
  "app\layout.tsx",
  "app\manifest.ts",
  "app\read\[book]\[chapter]\page.tsx",
  "app\components\branding\EmetseesLogo.tsx",
  "app\components\branding\EmetseesWordmark.tsx",
  "public\manifest.webmanifest",
  "public\site.webmanifest",
  "public\manifest.json"
)

$assetPatterns = @(
  "public\brand\*",
  "public\icons\*",
  "public\favicon*",
  "app\icon.*",
  "app\apple-icon.*",
  "app\opengraph-image.*",
  "app\twitter-image.*"
)

function Ensure-Directory {
  param([string]$Path)
  if (-not [IO.Directory]::Exists($Path)) {
    [IO.Directory]::CreateDirectory($Path) | Out-Null
  }
}

function Write-Utf8NoBom {
  param([string]$Path,[AllowEmptyString()][string]$Text)
  Ensure-Directory (Split-Path -Parent $Path)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path,$Text,$enc)
}

function Create-Zip {
  param([string]$SourceDirectory,[string]$Destination)
  if ([IO.File]::Exists($Destination)) { [IO.File]::Delete($Destination) }
  Compress-Archive -Path (Join-Path $SourceDirectory "*") -DestinationPath $Destination -CompressionLevel Optimal
}

Ensure-Directory $phaseRoot
Ensure-Directory $reportRoot

try {
  if (-not [IO.File]::Exists((Join-Path $repo "package.json"))) {
    throw "Repository not found: $repo"
  }

  $rows = @()
  $sourceRoot = Join-Path $reportRoot "source"

  foreach ($relative in $textTargets) {
    $full = Join-Path $repo $relative
    $exists = [IO.File]::Exists($full)

    $rows += [PSCustomObject]@{
      Path = $relative.Replace("\","/")
      Exists = $exists
      Bytes = if ($exists) { (Get-Item -LiteralPath $full).Length } else { 0 }
      Sha256 = if ($exists) { (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant() } else { "" }
      Kind = "text"
    }

    if ($exists) {
      $dest = Join-Path $sourceRoot $relative
      Ensure-Directory (Split-Path -Parent $dest)
      [IO.File]::Copy($full,$dest,$true)
    }
  }

  $assetFiles = @()
  foreach ($pattern in $assetPatterns) {
    $assetFiles += @(Get-ChildItem -Path (Join-Path $repo $pattern) -File -ErrorAction SilentlyContinue)
  }

  $assetFiles = @($assetFiles | Sort-Object FullName -Unique)

  foreach ($item in $assetFiles) {
    $relative = $item.FullName.Substring($repo.Length).TrimStart("\","/")
    $rows += [PSCustomObject]@{
      Path = $relative.Replace("\","/")
      Exists = $true
      Bytes = $item.Length
      Sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      Kind = "asset"
    }

    if ($item.Length -le 5MB) {
      $dest = Join-Path $sourceRoot $relative
      Ensure-Directory (Split-Path -Parent $dest)
      [IO.File]::Copy($item.FullName,$dest,$true)
    }
  }

  $rows | Export-Csv -LiteralPath (Join-Path $reportRoot "source-and-assets.csv") -NoTypeInformation -Encoding UTF8

  $layout = Join-Path $repo "app\layout.tsx"
  $reader = Join-Path $repo "app\read\[book]\[chapter]\page.tsx"

  $layoutText = if ([IO.File]::Exists($layout)) { [IO.File]::ReadAllText($layout) } else { "" }
  $readerText = if ([IO.File]::Exists($reader)) { [IO.File]::ReadAllText($reader) } else { "" }

  $analysis = [ordered]@{
    verdict = "P08_5C_BRANDING_SHARE_INSTALL_AUDIT_COMPLETE"
    metadataBasePresent = $layoutText -match "metadataBase"
    openGraphPresent = $layoutText -match "openGraph"
    twitterPresent = $layoutText -match "twitter"
    appleWebAppPresent = $layoutText -match "appleWebApp"
    applicationNamePresent = $layoutText -match "applicationName"
    manifestReferencePresent = $layoutText -match "manifest"
    dynamicReaderMetadataPresent = $readerText -match "generateMetadata"
    rootOpenGraphImagePresent = @($assetFiles | Where-Object { $_.Name -match "^opengraph-image\." }).Count -gt 0
    rootTwitterImagePresent = @($assetFiles | Where-Object { $_.Name -match "^twitter-image\." }).Count -gt 0
    brandAssetsFound = @($assetFiles | Where-Object { $_.FullName -match "\\public\\brand\\" }).Count
    iconAssetsFound = @($assetFiles | Where-Object { $_.FullName -match "\\public\\icons\\" }).Count
    applicationSourceWrites = 0
    dependenciesChanged = $false
    productionBuildRun = $false
    gitMutationOperations = 0
    activeP07Touched = $false
    p01ToP04Touched = $false
  }

  Write-Utf8NoBom (Join-Path $reportRoot "analysis.json") ($analysis | ConvertTo-Json -Depth 6)
  Write-Utf8NoBom (Join-Path $reportRoot "REPORT.md") @"
# EMETSEES P08.5C - Branding, Share, and Install Audit

## Verdict

P08_5C_BRANDING_SHARE_INSTALL_AUDIT_COMPLETE

This audit captures only current metadata, Reader metadata ownership, web-app
manifest files, and brand/icon assets needed for P08.5C.

No application source, P07, P01-P04, dependency, build, or Git mutation occurs.
"@

  Create-Zip $reportRoot $successZip

  Write-Host ""
  Write-Host "P08.5C branding/share/install audit succeeded." -ForegroundColor Green
  Write-Host "ZIP: $successZip" -ForegroundColor Cyan
  Write-Host "SHA256: $((Get-FileHash -LiteralPath $successZip -Algorithm SHA256).Hash.ToLowerInvariant())"
} catch {
  try {
    Write-Utf8NoBom (Join-Path $reportRoot "ERROR.txt") ($_ | Out-String)
    Create-Zip $reportRoot $failureZip
    Write-Host "Failure ZIP: $failureZip" -ForegroundColor Yellow
  } catch {}
  throw
}
