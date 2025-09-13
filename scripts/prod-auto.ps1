<#!
One‑shot Windows PowerShell entrypoint to:
  1) Start an HTTPS tunnel (ngrok) on a local port
  2) Capture its public URL and patch .env and client env files
  3) Start the backend in dev mode (npm run dev)

Usage examples:
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prod-auto.ps1 -ProjectRoot "C:\path\to\SHOP-ATTENDANCE-APP"
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\prod-auto.ps1 -ProjectRoot "C:\path\to\SHOP-ATTENDANCE-APP" -Port 5000 -RebuildClient

Notes:
  - Order matters: we start ngrok first, patch env with the fresh domain, then start the dev server so Vite HMR can bind correctly.
  - Requires ngrok in PATH. Get it from https://ngrok.com/download and run 'ngrok config add-authtoken <token>'.
  - Logs written to logs\prod-auto-YYYYMMDD.log
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ProjectRoot,

  [int]$Port = 5000,

  [ValidateSet('ngrok')]
  [string]$Tunnel = 'ngrok',

  [switch]$RebuildClient,

  [ValidateSet('prod','dev')]
  [string]$EnvMode = 'prod'
)

set-strictmode -version latest
$ErrorActionPreference = 'Stop'

function New-DirIfMissing([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Write-Log([string]$Message) {
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "[$ts] $Message"
  $line | Tee-Object -FilePath $Global:LogFile -Append
}

function Test-Cmd([string]$Name) {
  try { $null = Get-Command $Name -ErrorAction Stop; return $true } catch { return $false }
}

function Update-EnvFile {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][hashtable]$Pairs
  )
  if (-not (Test-Path -LiteralPath $Path)) { New-Item -ItemType File -Path $Path -Force | Out-Null }
  $lines = Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue
  if (-not $lines) { $lines = @() }

  foreach ($key in $Pairs.Keys) {
    $value = [string]$Pairs[$key]
    $regex = "^\s*" + [regex]::Escape($key) + "\s*="
    $found = $false
    $newLines = @()
    foreach ($ln in $lines) {
      if ($ln -match $regex) {
        if (-not $found) {
          $newLines += "$key=$value"
          $found = $true
        } else {
          # drop duplicates
        }
      } else {
        $newLines += $ln
      }
    }
    if (-not $found) { $newLines += "$key=$value" }
    $lines = $newLines
  }
  Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Wait-NgrokUrl {
  param(
    [int]$TimeoutSeconds = 60
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -Method GET -TimeoutSec 2 -ErrorAction Stop
      if ($resp -and $resp.tunnels) {
        $https = $resp.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1
        if ($https -and $https.public_url) { return $https.public_url }
      }
    } catch {}
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for ngrok public URL (4040 API)."
}

function Ensure-NodeAndNpm {
  if (-not (Test-Cmd node)) { throw "Node.js not found in PATH. Install from https://nodejs.org and reopen PowerShell." }
  if (-not (Test-Cmd npm)) { throw "npm not found in PATH. Ensure Node.js installs npm and reopen PowerShell." }
}

function Ensure-Ngrok {
  if (-not (Test-Cmd ngrok)) {
    throw "ngrok not found in PATH. Download from https://ngrok.com/download and run 'ngrok config add-authtoken <token>'."
  }
}

# Begin
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
Set-Location -LiteralPath $ProjectRoot

New-DirIfMissing "$ProjectRoot\logs"
New-DirIfMissing "$ProjectRoot\tmp"

$Global:LogFile = Join-Path $ProjectRoot ("logs/prod-auto-" + (Get-Date).ToString('yyyyMMdd') + ".log")
"# prod-auto session $((Get-Date -Format o))" | Out-File -FilePath $Global:LogFile -Encoding UTF8 -Append

try {
  Write-Log "ProjectRoot: $ProjectRoot"
  Write-Log "Port: $Port | Tunnel: $Tunnel | RebuildClient: $RebuildClient | EnvMode: $EnvMode"

  Ensure-NodeAndNpm
  Ensure-Ngrok

  # 1) Start tunnel first (so we can configure PUBLIC_URL before dev server boots)
  $ngrokArgs = @('http')
  if ($Env:NGROK_DOMAIN) { $ngrokArgs += @('--domain', $Env:NGROK_DOMAIN) }
  $ngrokArgs += @($Port)
  Write-Log "Starting ngrok: ngrok $($ngrokArgs -join ' ')"

  $ngrokStamp = (Get-Date -Format 'yyyyMMdd-HHmmss')
  $ngrokOut = Join-Path $ProjectRoot ("logs/ngrok-" + $ngrokStamp + ".log")
  $ngrokErr = Join-Path $ProjectRoot ("logs/ngrok-" + $ngrokStamp + ".err.log")
  if ($ngrokOut -ieq $ngrokErr) { $ngrokErr = $ngrokOut -replace '\.log$', '.err.log' }

  Write-Log "ngrok logs: out=$ngrokOut err=$ngrokErr"
  $ngrokCmd = "ngrok " + ($ngrokArgs -join ' ') + " --log stdout > `"$ngrokOut`" 2> `"$ngrokErr`""
  $ngrokProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $ngrokCmd -WindowStyle Minimized -PassThru
  $ngrokPidPath = Join-Path $ProjectRoot 'tmp/ngrok.pid'
  Set-Content -LiteralPath $ngrokPidPath -Value $ngrokProc.Id
  Write-Log "ngrok PID: $($ngrokProc.Id), waiting for public URL via 127.0.0.1:4040 ..."

  $publicUrl = Wait-NgrokUrl -TimeoutSeconds 60
  Write-Log "ngrok public URL: $publicUrl"
  $urlObj = [Uri]$publicUrl
  $publicBase = "https://{0}" -f $urlObj.Authority
  $hmrHost = $urlObj.Host

  $ngrokUrlFile = Join-Path $ProjectRoot 'tmp/ngrok-url.txt'
  Set-Content -LiteralPath $ngrokUrlFile -Value $publicBase

  # 2) Patch server .env with latest origin/cookie/HMR hints
  $envPath = Join-Path $ProjectRoot '.env'
  $serverPairs = @{
    'PUBLIC_URL'   = $publicBase
    'CORS_ORIGIN'  = $publicBase
    'HMR_HOST'     = $hmrHost
    'COOKIE_SAMESITE' = 'none'
    'COOKIE_SECURE'   = 'true'
  }
  Update-EnvFile -Path $envPath -Pairs $serverPairs
  Write-Log "Patched .env with PUBLIC_URL=$publicBase and CORS/HMR/cookies"

  # 3) Patch client envs (even if not rebuilding) for completeness/tools
  $clientLocal = Join-Path $ProjectRoot 'client\.env.local'
  $clientProd  = Join-Path $ProjectRoot 'client\.env.production'
  $clientPairs = @{
    'VITE_API_BASE'   = $publicBase
    'VITE_UPLOAD_BASE'= $publicBase
  }
  Update-EnvFile -Path $clientLocal -Pairs $clientPairs
  Update-EnvFile -Path $clientProd  -Pairs $clientPairs
  Write-Log "Patched client env files with VITE_* bases"

  # 4) Optional: Rebuild client (not required for dev server)
  if ($RebuildClient) {
    Write-Log "RebuildClient requested: ensuring node_modules and running npm run build:client"
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'node_modules'))) {
      Write-Log "node_modules missing; running npm ci"
      npm ci 2>&1 | Tee-Object -FilePath $Global:LogFile -Append | Out-Null
    }
    Write-Log "Running npm run build:client"
    npm run build:client 2>&1 | Tee-Object -FilePath $Global:LogFile -Append | Out-Null
  } else {
    Write-Log "Skipping client rebuild (fast path)"
  }

  # 5) Start backend in dev mode
  Write-Log "Starting backend: npm run dev"
  $backendStamp = (Get-Date -Format 'yyyyMMdd-HHmmss')
  $backendOut = Join-Path $ProjectRoot ("logs/dev-" + $backendStamp + ".log")
  $backendErr = Join-Path $ProjectRoot ("logs/dev-" + $backendStamp + ".err.log")
  if ($backendOut -ieq $backendErr) { $backendErr = $backendOut -replace '\.log$', '.err.log' }

  $backendCmd = "npm run dev > `"$backendOut`" 2> `"$backendErr`""
  $backendProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $backendCmd -WorkingDirectory $ProjectRoot -WindowStyle Normal -PassThru
  $backendPidPath = Join-Path $ProjectRoot 'tmp/backend.pid'
  Set-Content -LiteralPath $backendPidPath -Value $backendProc.Id
  Write-Log "Backend PID: $($backendProc.Id). Logs: $backendOut"

  # 6) Final output
  Write-Host ""; Write-Host "Public URL: $publicBase" -ForegroundColor Cyan
  Write-Host "Health check: $publicBase/api/health" -ForegroundColor Yellow
  Write-Host "WS endpoint:   $publicBase/ws" -ForegroundColor Yellow
  Write-Host "ngrok PID file: $ngrokPidPath | backend PID file: $backendPidPath" -ForegroundColor DarkGray
  Write-Log  "Ready. Public URL: $publicBase"
}
catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  Write-Error $_ 
  exit 1
}