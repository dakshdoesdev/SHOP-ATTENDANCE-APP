# Runs ngrok, updates env files with the public URL, then starts the dev server
# Usage (PowerShell):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-auto.ps1
# Optional params:
#   -ProjectRoot "C:\Users\1071h\Desktop\WORK\SHOP-ATTENDANCE-APP" -Port 5000

param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [int]$Port = 5000,
  [ValidateSet('ngrok','localtunnel','cloudflared','none')]
  [string]$Tunnel = 'ngrok',
  [string]$Subdomain = '',
  # For 'none' or named Cloudflare tunnel setups where you already know the hostname
  [string]$PublicUrl = ''
)

$ErrorActionPreference = "Stop"

function Ensure-Tool($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Required tool not found in PATH: $name"
  }
}

function Upsert-EnvLine([string]$content, [string]$key, [string]$value) {
  $escapedKey = [Regex]::Escape($key)
  if ($content -match "^(?m)$escapedKey=.*$") {
    return ($content -replace "^(?m)$escapedKey=.*$", "$key=$value")
  } else {
    if ($content -and -not $content.EndsWith("`n")) { $content += "`n" }
    return $content + "$key=$value`n"
  }
}

Write-Host "[dev-auto] ProjectRoot = $ProjectRoot"
Write-Host "[dev-auto] Port        = $Port"

# 1) Sanity checks
Ensure-Tool "npm"
if ($Tunnel -eq 'ngrok') { Ensure-Tool "ngrok" }
if ($Tunnel -eq 'localtunnel') { Ensure-Tool "npx" }
if ($Tunnel -eq 'cloudflared') { Ensure-Tool "cloudflared" }

# 2) Start ngrok (minimized) and wait for the API to expose a public https URL
switch ($Tunnel) {
  'ngrok' {
    Write-Host "[dev-auto] Starting ngrok http $Port ..."
    $args = @("http", "$Port")
    if ($Subdomain) { $args += @("--domain", $Subdomain) }
    $null = Start-Process -FilePath "ngrok" -ArgumentList $args -PassThru -WindowStyle Minimized -WorkingDirectory $ProjectRoot

    $publicUrl = $null
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 1
      try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
        $https = $resp.tunnels | Where-Object { $_.public_url -like "https*" } | Select-Object -First 1
        if ($https) { $publicUrl = $https.public_url; break }
      } catch {}
    }
    if (-not $publicUrl) { throw "[dev-auto] Could not retrieve ngrok public URL from http://127.0.0.1:4040/api/tunnels" }
  }
  'localtunnel' {
    Write-Host "[dev-auto] Starting localtunnel on port $Port ..."
    $ltLog = Join-Path $env:TEMP "lt-$Port.out.log"
    $ltErr = Join-Path $env:TEMP "lt-$Port.err.log"
    if (Test-Path $ltLog) { Remove-Item $ltLog -Force -ErrorAction SilentlyContinue }
    if (Test-Path $ltErr) { Remove-Item $ltErr -Force -ErrorAction SilentlyContinue }
    $ltArgs = @("localtunnel", "--port", "$Port")
    if ($Subdomain) { $ltArgs += @("--subdomain", $Subdomain) }
    $proc = Start-Process -FilePath "npx" -ArgumentList $ltArgs -RedirectStandardOutput $ltLog -RedirectStandardError $ltErr -PassThru -WindowStyle Minimized -WorkingDirectory $ProjectRoot

    $publicUrl = $null
    # If a subdomain is provided, we can infer the URL directly
    if ($Subdomain) { $publicUrl = "https://$Subdomain.loca.lt" }
    # Otherwise, tail the log for the printed URL
    for ($i = 0; (-not $publicUrl) -and $i -lt 60; $i++) {
      Start-Sleep -Seconds 1
      try {
        $texts = @()
        if (Test-Path $ltLog) { $texts += (Get-Content -Raw $ltLog -ErrorAction SilentlyContinue) }
        if (Test-Path $ltErr) { $texts += (Get-Content -Raw $ltErr -ErrorAction SilentlyContinue) }
        foreach ($t in $texts) {
          if ($t -match "https?://[a-zA-Z0-9\-\.]+\.[a-z]{2,}[^\s]*") {
            $publicUrl = $Matches[0]
            break
          }
        }
      } catch {}
    }
    if (-not $publicUrl) { throw "[dev-auto] Could not detect localtunnel URL; check $ltLog" }
  }
  'cloudflared' {
    Write-Host "[dev-auto] Starting cloudflared quick tunnel ..."
    $cfOut = Join-Path $env:TEMP "cf-$Port.out.log"
    $cfErr = Join-Path $env:TEMP "cf-$Port.err.log"
    if (Test-Path $cfOut) { Remove-Item $cfOut -Force -ErrorAction SilentlyContinue }
    if (Test-Path $cfErr) { Remove-Item $cfErr -Force -ErrorAction SilentlyContinue }
    $proc = Start-Process -FilePath "cloudflared" -ArgumentList @("tunnel","--url","http://localhost:$Port") -RedirectStandardOutput $cfOut -RedirectStandardError $cfErr -PassThru -WindowStyle Minimized -WorkingDirectory $ProjectRoot
    $publicUrl = $null
    for ($i = 0; (-not $publicUrl) -and $i -lt 60; $i++) {
      Start-Sleep -Seconds 1
      try {
        $texts = @()
        if (Test-Path $cfOut) { $texts += (Get-Content -Raw $cfOut -ErrorAction SilentlyContinue) }
        if (Test-Path $cfErr) { $texts += (Get-Content -Raw $cfErr -ErrorAction SilentlyContinue) }
        foreach ($t in $texts) {
          if ($t -match "https?://[a-z0-9\-]+\.trycloudflare\.com") {
            $publicUrl = $Matches[0]
            break
          }
        }
      } catch {}
    }
    if (-not $publicUrl) { throw "[dev-auto] Could not detect cloudflared URL; check $cfOut / $cfErr" }
  }
  'none' {
    if (-not $PublicUrl) {
      throw "[dev-auto] -PublicUrl is required when -Tunnel none"
    }
    $publicUrl = $PublicUrl
    Write-Host "[dev-auto] Using provided Public URL = $publicUrl"
  }
}

$uri = [Uri]$publicUrl
$ngrokHost = $uri.Host
Write-Host "[dev-auto] Public URL = $publicUrl (via $Tunnel)"

# 3) Update root .env with HMR + CORS + PUBLIC_URL so Vite HMR points at ngrok
$envPath = Join-Path $ProjectRoot ".env"
if (Test-Path $envPath) {
  $envContent = Get-Content -Raw $envPath -Encoding UTF8
} else {
  $envContent = ""
}

$envContent = Upsert-EnvLine $envContent "HMR_HOST" $ngrokHost
$envContent = Upsert-EnvLine $envContent "PUBLIC_URL" $publicUrl
$envContent = Upsert-EnvLine $envContent "CORS_ORIGIN" $publicUrl
$envContent = Upsert-EnvLine $envContent "COOKIE_SAMESITE" "none"
$envContent = Upsert-EnvLine $envContent "COOKIE_SECURE" "true"

Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host "[dev-auto] Updated $envPath"

# 4) Update client API base via existing helper (writes client/.env.local and .env.production)
Push-Location $ProjectRoot
try {
  Write-Host "[dev-auto] npm run set:api -- $publicUrl"
  npm run set:api -- $publicUrl | Write-Output
} finally {
  Pop-Location
}

# 5) Start npm dev in a new window after env is set
Write-Host "[dev-auto] Starting dev server (npm run dev) ..."
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"cd '$ProjectRoot'; npm run dev`"" -WorkingDirectory $ProjectRoot

Write-Host "[dev-auto] All set. ngrok + dev running."
