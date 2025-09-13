# Starts a tunnel, updates root .env and client env files (.env.local, .env.production)
# with the current public URL, then starts dev or prod server.
#
# Usage examples:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/auto-ngrok-update-envs.ps1 -Mode prod -ProjectRoot "$PWD" -Port 5000 -Tunnel ngrok
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/auto-ngrok-update-envs.ps1 -Mode dev  -ProjectRoot "$PWD" -Port 5000 -Tunnel ngrok

param(
  [ValidateSet('prod','dev')]
  [string]$Mode = 'prod',
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [int]$Port = 5000,
  [ValidateSet('ngrok','localtunnel','cloudflared','none')]
  [string]$Tunnel = 'ngrok',
  [string]$Subdomain = '',
  [string]$PublicUrl = '',
  [bool]$RebuildClient = $false,
  [bool]$ForceWebRecorder = $false,
  [switch]$NgrokVisible
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

Write-Host "[auto-env] Mode        = $Mode"
Write-Host "[auto-env] ProjectRoot = $ProjectRoot"
Write-Host "[auto-env] Port        = $Port"

# Sanity checks
Ensure-Tool "npm"
if ($Tunnel -eq 'ngrok') { Ensure-Tool "ngrok" }
if ($Tunnel -eq 'localtunnel') { Ensure-Tool "npx" }
if ($Tunnel -eq 'cloudflared') { Ensure-Tool "cloudflared" }

# Start tunnel and get public URL
switch ($Tunnel) {
  'ngrok' {
    Write-Host "[auto-env] Starting ngrok http $Port ..."
    $args = @("http", "$Port")
    if ($Subdomain) { $args += @("--domain", $Subdomain) }
    $windowStyle = if ($NgrokVisible) { 'Normal' } else { 'Minimized' }
    $null = Start-Process -FilePath "ngrok" -ArgumentList $args -PassThru -WindowStyle $windowStyle -WorkingDirectory $ProjectRoot

    $publicUrl = $null
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 1
      try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
        $https = $resp.tunnels | Where-Object { $_.public_url -like "https*" } | Select-Object -First 1
        if ($https) { $publicUrl = $https.public_url; break }
      } catch {}
    }
    if (-not $publicUrl) { throw "[auto-env] Could not retrieve ngrok public URL from http://127.0.0.1:4040/api/tunnels" }
  }
  'localtunnel' {
    Write-Host "[auto-env] Starting localtunnel on port $Port ..."
    $ltLog = Join-Path $env:TEMP "lt-$Port.out.log"
    $ltErr = Join-Path $env:TEMP "lt-$Port.err.log"
    if (Test-Path $ltLog) { Remove-Item $ltLog -Force -ErrorAction SilentlyContinue }
    if (Test-Path $ltErr) { Remove-Item $ltErr -Force -ErrorAction SilentlyContinue }
    $ltArgs = @("localtunnel", "--port", "$Port")
    if ($Subdomain) { $ltArgs += @("--subdomain", $Subdomain) }
    $windowStyle = if ($NgrokVisible) { 'Normal' } else { 'Minimized' }
    $proc = Start-Process -FilePath "npx" -ArgumentList $ltArgs -RedirectStandardOutput $ltLog -RedirectStandardError $ltErr -PassThru -WindowStyle $windowStyle -WorkingDirectory $ProjectRoot

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
    if (-not $publicUrl) { throw "[auto-env] Could not detect localtunnel URL; check $ltLog" }
  }
  'cloudflared' {
    Write-Host "[auto-env] Starting cloudflared quick tunnel ..."
    $cfOut = Join-Path $env:TEMP "cf-$Port.out.log"
    $cfErr = Join-Path $env:TEMP "cf-$Port.err.log"
    if (Test-Path $cfOut) { Remove-Item $cfOut -Force -ErrorAction SilentlyContinue }
    if (Test-Path $cfErr) { Remove-Item $cfErr -Force -ErrorAction SilentlyContinue }
    $windowStyle = if ($NgrokVisible) { 'Normal' } else { 'Minimized' }
    $proc = Start-Process -FilePath "cloudflared" -ArgumentList @("tunnel","--url","http://localhost:$Port") -RedirectStandardOutput $cfOut -RedirectStandardError $cfErr -PassThru -WindowStyle $windowStyle -WorkingDirectory $ProjectRoot
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
    if (-not $publicUrl) { throw "[auto-env] Could not detect cloudflared URL; check $cfOut / $cfErr" }
  }
  'none' {
    if (-not $PublicUrl) { throw "[auto-env] -PublicUrl is required when -Tunnel none" }
    $publicUrl = $PublicUrl
    Write-Host "[auto-env] Using provided Public URL = $publicUrl"
  }
}

$uri = [Uri]$publicUrl
$hostName = $uri.Host
Write-Host "[auto-env] Public URL = $publicUrl (via $Tunnel)"

# Update root .env
$envPath = Join-Path $ProjectRoot ".env"
if (Test-Path $envPath) { $envContent = Get-Content -Raw $envPath -Encoding UTF8 } else { $envContent = "" }
$envContent = Upsert-EnvLine $envContent "PUBLIC_URL" $publicUrl
$envContent = Upsert-EnvLine $envContent "CORS_ORIGIN" $publicUrl
$envContent = Upsert-EnvLine $envContent "COOKIE_SAMESITE" "none"
$envContent = Upsert-EnvLine $envContent "COOKIE_SECURE" "true"
if ($Mode -eq 'dev') { $envContent = Upsert-EnvLine $envContent "HMR_HOST" $hostName }
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host "[auto-env] Updated $envPath"
Write-Host ("[auto-env]  - PUBLIC_URL={0}" -f $publicUrl)
Write-Host ("[auto-env]  - CORS_ORIGIN={0}" -f $publicUrl)
Write-Host ("[auto-env]  - COOKIE_SAMESITE=none, COOKIE_SECURE=true")

# Update client env files using existing helper
Push-Location $ProjectRoot
try {
  $forceArg = if ($ForceWebRecorder) { 'true' } else { 'false' }
  Write-Host "[auto-env] npm run set:api -- $publicUrl $forceArg"
  npm run set:api -- $publicUrl $forceArg | Write-Output
} finally {
  Pop-Location
}

# Optionally rebuild client for prod (so .env.production changes are reflected in dist)
if ($Mode -eq 'prod' -and $RebuildClient) {
  Write-Host "[auto-env] Rebuilding client (vite build) ..."
  Push-Location $ProjectRoot
  try { npm run build:client | Write-Output } finally { Pop-Location }
}

# Optional publish config to Supabase if service envs available
if ($env:SUPABASE_URL -and $env:SUPABASE_SERVICE_KEY) {
  try {
    Write-Host "[auto-env] Publishing API config to Supabase Storage ..."
    $script = Join-Path $ProjectRoot "scripts/update-supabase-config.ps1"
    if (Test-Path $script) {
      & $script -SupabaseUrl $env:SUPABASE_URL -ServiceKey $env:SUPABASE_SERVICE_KEY -ApiBase $publicUrl -UploadBase $publicUrl | Write-Output
    } else {
      Write-Warning "[auto-env] update-supabase-config.ps1 not found; skipping publish"
    }
  } catch {
    Write-Warning "[auto-env] Failed to publish Supabase config: $_"
  }
}

# Start server
if ($Mode -eq 'prod') {
  Write-Host "[auto-env] Starting production server (npm start) ..."
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"cd '$ProjectRoot'; npm start`"" -WorkingDirectory $ProjectRoot
} else {
  Write-Host "[auto-env] Starting dev server (npm run dev) ..."
  Start-Process -FilePath "powershell" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"cd '$ProjectRoot'; npm run dev`"" -WorkingDirectory $ProjectRoot
}

Write-Host "[auto-env] All set. Tunnel + env updated + server running."
