param(
  [string]$RepositoryRoot = (Get-Location).Path,
  [int]$Port = 4173
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportName = "$timestamp-premium-ux-readiness-audit"
$reportDir = Join-Path $RepositoryRoot ".private\reports\P06.1\$reportName"
$runtimeDir = Join-Path $reportDir "runtime"
$domDir = Join-Path $runtimeDir "dom"
$screenshotDir = Join-Path $runtimeDir "screenshots"
$scriptPath = Join-Path $RepositoryRoot "scripts\p06\premium-ux-readiness-audit.cjs"
$zipName = "EMETSEES-P061-PREMIUM-UX-READINESS-AUDIT-$timestamp.zip"
$zipPath = Join-Path $RepositoryRoot ".private\reports\P06.1\$zipName"

New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
New-Item -ItemType Directory -Path $domDir -Force | Out-Null
New-Item -ItemType Directory -Path $screenshotDir -Force | Out-Null

function Write-JsonUtf8NoBom {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] $Value
  )

  $json = $Value | ConvertTo-Json -Depth 20
  [System.IO.File]::WriteAllText(
    $Path,
    $json + [Environment]::NewLine,
    (New-Object System.Text.UTF8Encoding($false))
  )
}


function Get-TrimmedFileContent {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $content = Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
  if ($null -eq $content) {
    return ""
  }

  return $content.Trim()
}

function Find-FreePort {
  param(
    [int]$PreferredPort,
    [int]$Attempts = 25
  )

  for ($candidate = $PreferredPort; $candidate -lt ($PreferredPort + $Attempts); $candidate++) {
    $listener = $null
    try {
      $listener = New-Object System.Net.Sockets.TcpListener(
        [System.Net.IPAddress]::Loopback,
        $candidate
      )
      $listener.Start()
      $listener.Stop()
      return $candidate
    }
    catch {
      if ($listener) {
        try { $listener.Stop() } catch {}
      }
    }
  }

  throw "No free local audit port was found starting at $PreferredPort."
}

function Stop-ProcessTreeAndReleaseLogs {
  param([System.Diagnostics.Process]$Process)

  if ($null -eq $Process) {
    return
  }

  $processIdToStop = $Process.Id

  try {
    if (-not $Process.HasExited) {
      & taskkill.exe /PID $processIdToStop /T /F 1> $null 2> $null
    }
  }
  catch {}

  try {
    $Process.WaitForExit(15000) | Out-Null
  }
  catch {}

  try {
    $Process.Dispose()
  }
  catch {}

  # Give Windows time to release redirected stdout/stderr handles.
  Start-Sleep -Milliseconds 1500
}

function Copy-FileWithRetry {
  param(
    [string]$Source,
    [string]$Destination,
    [int]$Attempts = 20
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      $parent = Split-Path -Parent $Destination
      if ($parent) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
      }

      [System.IO.File]::Copy($Source, $Destination, $true)
      return $true
    }
    catch {
      if ($attempt -eq $Attempts) {
        return $false
      }
      Start-Sleep -Milliseconds 500
    }
  }

  return $false
}

function Find-Browser {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Invoke-PageRequest {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest `
      -Uri $Url `
      -UseBasicParsing `
      -TimeoutSec 20 `
      -MaximumRedirection 5

    return @{
      reached = $true
      statusCode = [int]$response.StatusCode
      finalUrl = $response.BaseResponse.ResponseUri.AbsoluteUri
      bytes = $response.RawContentLength
      error = $null
    }
  }
  catch {
    return @{
      reached = $false
      statusCode = $null
      finalUrl = $Url
      bytes = $null
      error = $_.Exception.Message
    }
  }
}

function Resolve-FirstRoute {
  param(
    [string]$BaseUrl,
    [string[]]$Candidates
  )

  foreach ($candidate in $Candidates) {
    $url = $BaseUrl.TrimEnd('/') + $candidate
    $result = Invoke-PageRequest -Url $url
    if ($result.reached -and $result.statusCode -ge 200 -and $result.statusCode -lt 400) {
      return @{
        path = $candidate
        url = $url
        request = $result
      }
    }
  }

  $fallback = $Candidates[0]
  return @{
    path = $fallback
    url = $BaseUrl.TrimEnd('/') + $fallback
    request = Invoke-PageRequest -Url ($BaseUrl.TrimEnd('/') + $fallback)
  }
}

function Capture-Page {
  param(
    [string]$Browser,
    [string]$Name,
    [string]$Url,
    [string]$ReportRoot,
    [string]$DomRoot,
    [string]$ScreenshotRoot
  )

  $safeName = ($Name -replace '[^a-zA-Z0-9-_]', '-').ToLowerInvariant()
  $desktopPath = Join-Path $ScreenshotRoot "$safeName-desktop.png"
  $mobilePath = Join-Path $ScreenshotRoot "$safeName-mobile.png"
  $domPath = Join-Path $DomRoot "$safeName.html"
  $browserLogPath = Join-Path $DomRoot "$safeName-browser.log"

  $common = @(
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--virtual-time-budget=5000"
  )

  $desktopArgs = $common + @(
    "--window-size=1440,1600",
    "--screenshot=$desktopPath",
    $Url
  )
  & $Browser @desktopArgs 1> $browserLogPath 2>&1
  $desktopCaptured = Test-Path -LiteralPath $desktopPath

  $mobileArgs = $common + @(
    "--window-size=430,1500",
    "--user-agent=Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
    "--screenshot=$mobilePath",
    $Url
  )
  & $Browser @mobileArgs 1>> $browserLogPath 2>&1
  $mobileCaptured = Test-Path -LiteralPath $mobilePath

  $domArgs = $common + @(
    "--dump-dom",
    $Url
  )
  & $Browser @domArgs 1> $domPath 2>> $browserLogPath
  $domCaptured = Test-Path -LiteralPath $domPath

  return @{
    name = $Name
    url = $Url
    status = if ($desktopCaptured -or $mobileCaptured -or $domCaptured) { "captured" } else { "failed" }
    desktopScreenshot = if ($desktopCaptured) {
      $desktopPath.Substring($ReportRoot.TrimEnd('\').Length + 1).Replace('\','/')
    } else { $null }
    mobileScreenshot = if ($mobileCaptured) {
      $mobilePath.Substring($ReportRoot.TrimEnd('\').Length + 1).Replace('\','/')
    } else { $null }
    domFile = if ($domCaptured) {
      $domPath.Substring($ReportRoot.TrimEnd('\').Length + 1).Replace('\','/')
    } else { $null }
    browserLog = $browserLogPath.Substring($ReportRoot.TrimEnd('\').Length + 1).Replace('\','/')
  }
}

$gitStatusPath = Join-Path $runtimeDir "git-status.txt"
$gitBranchPath = Join-Path $runtimeDir "git-branch.txt"
$gitHeadPath = Join-Path $runtimeDir "git-head.txt"

& git status --short 1> $gitStatusPath 2>&1
& git branch --show-current 1> $gitBranchPath 2>&1
& git rev-parse HEAD 1> $gitHeadPath 2>&1

$npmPreflight = @{
  command = "npm --version"
  status = $null
  stdout = $null
  stderr = $null
}

$npmStdout = Join-Path $runtimeDir "npm-version.stdout.log"
$npmStderr = Join-Path $runtimeDir "npm-version.stderr.log"
& cmd.exe /d /s /c "npm --version" 1> $npmStdout 2> $npmStderr
$npmPreflight.status = $LASTEXITCODE
$npmPreflight.stdout = Get-TrimmedFileContent -Path $npmStdout
$npmPreflight.stderr = Get-TrimmedFileContent -Path $npmStderr
Write-JsonUtf8NoBom -Path (Join-Path $runtimeDir "npm-preflight.json") -Value $npmPreflight

$buildStdout = Join-Path $runtimeDir "production-build.stdout.log"
$buildStderr = Join-Path $runtimeDir "production-build.stderr.log"

Write-Host ""
Write-Host "==> Running the production build"
& cmd.exe /d /s /c "npm run build" 1> $buildStdout 2> $buildStderr
$buildStatus = $LASTEXITCODE

$buildResult = @{
  command = "npm run build"
  status = $buildStatus
  passed = ($buildStatus -eq 0)
}
Write-JsonUtf8NoBom -Path (Join-Path $runtimeDir "build-result.json") -Value $buildResult

$serverProcess = $null
$serverReached = $false
$resolvedPort = Find-FreePort -PreferredPort $Port
$baseUrl = "http://127.0.0.1:$resolvedPort"
$serverStdout = Join-Path $runtimeDir "production-server.stdout.log"
$serverStderr = Join-Path $runtimeDir "production-server.stderr.log"

if ($buildStatus -eq 0) {
  Write-Host ""
  Write-Host "==> Starting the local production app"

  $serverProcess = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList @("/d", "/s", "/c", "npm run start -- -p $resolvedPort") `
    -WorkingDirectory $RepositoryRoot `
    -RedirectStandardOutput $serverStdout `
    -RedirectStandardError $serverStderr `
    -PassThru `
    -WindowStyle Hidden

  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    Start-Sleep -Seconds 1
    $probe = Invoke-PageRequest -Url $baseUrl
    if ($probe.reached) {
      $serverReached = $true
      break
    }

    if ($serverProcess.HasExited) {
      break
    }
  }
}

$serverResult = @{
  reached = $serverReached
  requestedPort = $Port
  resolvedPort = $resolvedPort
  baseUrl = $baseUrl
  processId = if ($serverProcess) { $serverProcess.Id } else { $null }
  exited = if ($serverProcess) { $serverProcess.HasExited } else { $null }
  exitCode = if ($serverProcess -and $serverProcess.HasExited) { $serverProcess.ExitCode } else { $null }
}
Write-JsonUtf8NoBom -Path (Join-Path $runtimeDir "server-result.json") -Value $serverResult

$captures = @()
$browser = Find-Browser

try {
  if ($serverReached -and $browser) {
    Write-Host ""
    Write-Host "==> Capturing desktop and mobile visual evidence"

    $routeDefinitions = @(
      @{
        name = "home"
        candidates = @("/")
      },
      @{
        name = "reader-genesis-1"
        candidates = @(
          "/read/Genesis/1",
          "/read/genesis/1",
          "/read/GEN/1"
        )
      },
      @{
        name = "reader-john-1"
        candidates = @(
          "/read/John/1",
          "/read/john/1",
          "/read/JHN/1"
        )
      },
      @{
        name = "library"
        candidates = @("/library")
      },
      @{
        name = "settings"
        candidates = @("/settings")
      }
    )

    foreach ($definition in $routeDefinitions) {
      $resolved = Resolve-FirstRoute `
        -BaseUrl $baseUrl `
        -Candidates $definition.candidates

      $capture = Capture-Page `
        -Browser $browser `
        -Name $definition.name `
        -Url $resolved.url `
        -ReportRoot $reportDir `
        -DomRoot $domDir `
        -ScreenshotRoot $screenshotDir

      $capture.request = $resolved.request
      $capture.routePath = $resolved.path
      $captures += $capture
    }
  }
}
finally {
  if ($serverProcess) {
    Write-Host ""
    Write-Host "==> Stopping the local production app"
    Stop-ProcessTreeAndReleaseLogs -Process $serverProcess
    $serverProcess = $null
  }
}

$captureManifest = @{
  browser = if ($browser) { $browser } else { $null }
  captures = $captures
}
Write-JsonUtf8NoBom `
  -Path (Join-Path $runtimeDir "capture-manifest.json") `
  -Value $captureManifest

$auditStdout = Join-Path $reportDir "audit.stdout.log"
$auditStderr = Join-Path $reportDir "audit.stderr.log"

Write-Host ""
Write-Host "==> Analyzing the component, route, state, and style architecture"
& node --max-old-space-size=8192 `
  $scriptPath `
  --repo $RepositoryRoot `
  --output $reportDir `
  1> $auditStdout `
  2> $auditStderr

$auditStatus = $LASTEXITCODE

# Create a handle-safe sealed copy before hashing and zipping.
$sealedDir = Join-Path $RepositoryRoot ".private\reports\P06.1\$reportName-sealed"
if (Test-Path -LiteralPath $sealedDir) {
  Remove-Item -LiteralPath $sealedDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $sealedDir -Force | Out-Null

$sourceRootFull = [System.IO.Path]::GetFullPath($reportDir).TrimEnd('\') + '\'
$sealingWarnings = @()

Get-ChildItem -LiteralPath $reportDir -Recurse -File |
  Sort-Object FullName |
  ForEach-Object {
    $sourceFull = [System.IO.Path]::GetFullPath($_.FullName)
    $relative = $sourceFull.Substring($sourceRootFull.Length)
    $destination = Join-Path $sealedDir $relative

    $copied = Copy-FileWithRetry `
      -Source $sourceFull `
      -Destination $destination

    if (-not $copied) {
      $sealingWarnings += @{
        path = $relative.Replace('\','/')
        reason = "File remained locked after the production server was stopped."
      }
    }
  }

if ($sealingWarnings.Count -gt 0) {
  Write-JsonUtf8NoBom `
    -Path (Join-Path $sealedDir "SEALING-WARNINGS.json") `
    -Value @{
      generatedAt = (Get-Date).ToString("o")
      omittedFiles = $sealingWarnings
    }
}

# Seal the copied report with a Windows PowerShell 5.1-compatible checksum manifest.
$sealedRootFull = [System.IO.Path]::GetFullPath($sealedDir).TrimEnd('\') + '\'
$checksumLines = @()

Get-ChildItem -LiteralPath $sealedDir -Recurse -File |
  Where-Object { $_.Name -ne "checksums.sha256" } |
  Sort-Object FullName |
  ForEach-Object {
    $full = [System.IO.Path]::GetFullPath($_.FullName)
    $relative = $full.Substring($sealedRootFull.Length).Replace('\','/')
    $hashObject = Get-FileHash -Algorithm SHA256 -LiteralPath $full -ErrorAction Stop
    $checksumLines += "$($hashObject.Hash.ToLowerInvariant())  $relative"
  }

[System.IO.File]::WriteAllLines(
  (Join-Path $sealedDir "checksums.sha256"),
  $checksumLines,
  (New-Object System.Text.UTF8Encoding($false))
)

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive `
  -Path (Join-Path $sealedDir "*") `
  -DestinationPath $zipPath `
  -CompressionLevel Optimal `
  -ErrorAction Stop

Write-Host ""
Write-Host "Premium UX audit report:"
Write-Host $zipPath

if (-not $browser) {
  Write-Host ""
  Write-Host "No supported Edge or Chrome executable was found, so screenshots were skipped."
}

if ($buildStatus -ne 0) {
  Write-Host ""
  Write-Host "The production build failed. The audit still packaged the build logs and source analysis."
}

exit $auditStatus
