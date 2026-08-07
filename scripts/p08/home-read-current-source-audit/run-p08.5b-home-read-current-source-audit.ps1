param(
  [Parameter(Mandatory = $false)]
  [string]$RepositoryRoot = "C:\Users\CreatorStudio\ai-bible-app"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repo = [IO.Path]::GetFullPath($RepositoryRoot)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$phaseRoot = Join-Path $repo ".private\reports\P08.5B-AUDIT"
$reportRoot = Join-Path $phaseRoot "$stamp-home-read-current-source"
$zipPath = Join-Path $phaseRoot "EMETSEES-P08.5B-HOME-READ-CURRENT-SOURCE-AUDIT-$stamp.zip"
$failureZip = Join-Path $phaseRoot "EMETSEES-P08.5B-HOME-READ-CURRENT-SOURCE-AUDIT-FAILURE-$stamp.zip"

$targets = @(
  "app\page.tsx",
  "app\read\page.tsx",
  "app\components\branding\EmetseesWordmark.tsx",
  "app\lib\translationPreference.ts",
  "app\lib\readerMemory.ts"
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

  foreach ($relative in $targets) {
    $full = Join-Path $repo $relative
    if (-not [IO.File]::Exists($full)) {
      throw "Required current source file missing: $relative"
    }

    $dest = Join-Path $reportRoot (Join-Path "source" $relative)
    Ensure-Directory (Split-Path -Parent $dest)
    [IO.File]::Copy($full,$dest,$true)

    $rows += [PSCustomObject]@{
      Path = $relative.Replace("\","/")
      Bytes = (Get-Item -LiteralPath $full).Length
      Sha256 = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

  $rows | Export-Csv -LiteralPath (Join-Path $reportRoot "source-hashes.csv") -NoTypeInformation -Encoding UTF8

  Write-Utf8NoBom (Join-Path $reportRoot "verdict.json") (
    [ordered]@{
      verdict = "P08_5B_HOME_READ_CURRENT_SOURCE_AUDIT_COMPLETE"
      sourceFilesCopied = $rows.Count
      applicationSourceWrites = 0
      dependenciesChanged = $false
      productionBuildRun = $false
      gitMutationOperations = 0
      activeP07Touched = $false
      p01ToP04Touched = $false
    } | ConvertTo-Json -Depth 5
  )

  Create-Zip $reportRoot $zipPath

  Write-Host ""
  Write-Host "P08.5B current-source audit succeeded." -ForegroundColor Green
  Write-Host "ZIP: $zipPath" -ForegroundColor Cyan
  Write-Host "SHA256: $((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant())"
} catch {
  try {
    Write-Utf8NoBom (Join-Path $reportRoot "ERROR.txt") ($_ | Out-String)
    Create-Zip $reportRoot $failureZip
    Write-Host "Failure ZIP: $failureZip" -ForegroundColor Yellow
  } catch {}
  throw
}
