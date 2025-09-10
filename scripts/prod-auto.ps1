# Starts a tunnel, updates env for CORS/cookies, then starts the production server
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/prod-auto.ps1 \
#     -ProjectRoot "C:\\path\\to\\SHOP-ATTENDANCE-APP" -Port 5000 -Tunnel ngrok -Subdomain ""

param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [int]$Port = 5000,
  [ValidateSet('ngrok','localtunnel','cloudflared','none')]
  [string]$Tunnel = 'ngrok',
  [string]$Subdomain = '',
  # For 'none' or fixed hostnames
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

Write-Host "[prod-auto] ProjectRoot = $ProjectRoot"
Write-Host "[prod-auto] Port        = $Port"

# 1) Sanity checks
Ensure-Tool "npm"
if ($Tunnel -eq 'ngrok') { Ensure-Tool "ngrok" }
if ($Tunnel -eq 'localtunnel') { Ensure-Tool "npx" }
if ($Tunnel -eq 'cloudflared') { Ensure-Tool "cloudflared" }

# 2) Start tunnel and discover public URL
switch ($Tunnel) {
  'ngrok' {
    Write-Host "[prod-auto] Starting ngrok http $Port ..."
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
    if (-not $publicUrl) { throw "[prod-auto] Could not retrieve ngrok public URL from http://127.0.0.1:4040/api/tunnels" }
  }
  'localtunnel' {
    Write-Host "[prod-auto] Starting localtunnel on port $Port ..."
    $ltLog = Join-Path $env:TEMP "lt-$Port.out.log"
    $ltErr = Join-Path $env:TEMP "lt-$Port.err.log"
    if (Test-Path $ltLog) { Remove-Item $ltLog -Force -ErrorAction SilentlyContinue }
    if (Test-Path $ltErr) { Remove-Item $ltErr -Force -ErrorAction SilentlyContinue }
    $ltArgs = @("localtunnel", "--port", "$Port")
    if ($Subdomain) { $ltArgs += @("--subdomain", $Subdomain) }
    $proc = Start-Process -FilePath "npx" -ArgumentList $ltArgs -RedirectStandardOutput $ltLog -RedirectStandardError $ltErr -PassThru -WindowStyle Minimized -WorkingDirectory $ProjectRoot

    $publicUrl = $null
    if ($Subdomain) { $publicUrl = "https://$Subdomain.loca.lt" }
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
    if (-not $publicUrl) { throw "[prod-auto] Could not detect localtunnel URL; check $ltLog" }
  }
  'cloudflared' {
    Write-Host "[prod-auto] Starting cloudflared quick tunnel ..."
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
    if (-not $publicUrl) { throw "[prod-auto] Could not detect cloudflared URL; check $cfOut / $cfErr" }
  }
  'none' {
    if (-not $PublicUrl) { throw "[prod-auto] -PublicUrl is required when -Tunnel none" }
    $publicUrl = $PublicUrl
    Write-Host "[prod-auto] Using provided Public URL = $publicUrl"
  }
}

$uri = [Uri]$publicUrl
$tunnelHost = $uri.Host
Write-Host "[prod-auto] Public URL = $publicUrl (via $Tunnel)"

# 3) Update root .env for CORS/cookies
$envPath = Join-Path $ProjectRoot ".env"
if (Test-Path $envPath) { $envContent = Get-Content -Raw $envPath -Encoding UTF8 } else { $envContent = "" }
$envContent = Upsert-EnvLine $envContent "CORS_ORIGIN" $publicUrl
$envContent = Upsert-EnvLine $envContent "COOKIE_SAMESITE" "none"
$envContent = Upsert-EnvLine $envContent "COOKIE_SECURE" "true"
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host "[prod-auto] Updated $envPath"

# 4) Save URL for reference
"$(Get-Date -Format o) $publicUrl" | Out-File -FilePath (Join-Path $ProjectRoot "ngrok-url.txt") -Encoding UTF8

# 4b) If Supabase env available, publish config so the UI auto-loads API URL
if ($env:SUPABASE_URL -and $env:SUPABASE_SERVICE_KEY) {
  try {
    Write-Host "[prod-auto] Publishing API config to Supabase Storage ..."
    $script = Join-Path $ProjectRoot "scripts/update-supabase-config.ps1"
    if (Test-Path $script) {
      & $script -SupabaseUrl $env:SUPABASE_URL -ServiceKey $env:SUPABASE_SERVICE_KEY -ApiBase $publicUrl -UploadBase $publicUrl | Write-Output
    } else {
      Write-Warning "[prod-auto] update-supabase-config.ps1 not found; skipping publish"
    }
  } catch {
    Write-Warning "[prod-auto] Failed to publish Supabase config: $_"
  }
}

# 5) Start production server
Write-Host "[prod-auto] Starting production server (npm start) ..."
Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"cd '$ProjectRoot'; npm start`"" -WorkingDirectory $ProjectRoot

Write-Host "[prod-auto] All set. Tunnel + server running."
