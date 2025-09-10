param(
  [int]$Port = 5000,
  [string]$EnvFile = ".env",
  [string]$EnvKey = "PUBLIC_URL",
  [string]$Callback = ""
)

function Set-EnvLine {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  if (-not (Test-Path $Path)) {
    "$Key=$Value" | Out-File -FilePath $Path -Encoding UTF8
    return
  }

  $content = Get-Content -Path $Path -Raw -ErrorAction SilentlyContinue
  if ($null -eq $content) { $content = "" }

  if ($content -match "(?m)^\s*$Key\s*=") {
    $updated = [System.Text.RegularExpressions.Regex]::Replace($content, "(?m)^\s*$Key\s*=.*$", "$Key=$Value")
    Set-Content -Path $Path -Value $updated -Encoding UTF8
  } else {
    if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
      Add-Content -Path $Path -Value ""
    }
    Add-Content -Path $Path -Value "$Key=$Value"
  }
}

Write-Host "Starting ngrok on http://localhost:$Port ..."

# Start ngrok detached so the script can continue
$ngrok = Start-Process -FilePath "ngrok" -ArgumentList @("http", "$Port") -WindowStyle Hidden -PassThru -ErrorAction Stop

# Try to stop ngrok when PowerShell exits
$script:ngrokPid = $ngrok.Id
Register-EngineEvent PowerShell.Exiting -Action {
  try { if ($script:ngrokPid) { Stop-Process -Id $script:ngrokPid -Force -ErrorAction SilentlyContinue } } catch {}
} | Out-Null

# Poll ngrok local API to get the public URL
$api = "http://127.0.0.1:4040/api/tunnels"
$publicUrl = $null
for ($i = 0; $i -lt 60; $i++) {
  try {
    $resp = Invoke-RestMethod -Method Get -Uri $api -TimeoutSec 2
    if ($resp -and $resp.tunnels) {
      $httpsTunnel = $resp.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
      if (-not $httpsTunnel) {
        $httpsTunnel = $resp.tunnels | Select-Object -First 1
      }
      if ($httpsTunnel) {
        $publicUrl = $httpsTunnel.public_url
        break
      }
    }
  } catch { }
  Start-Sleep -Milliseconds 500
}

if (-not $publicUrl) {
  Write-Warning "Could not retrieve ngrok public URL. Check http://127.0.0.1:4040"
  exit 1
}

Write-Host "ngrok public URL: $publicUrl"

# Update .env (or target file) with the latest URL
Set-EnvLine -Path $EnvFile -Key $EnvKey -Value $publicUrl
Write-Host "Updated $EnvFile -> $EnvKey=$publicUrl"

# Save a simple text file with the URL and timestamp
"$(Get-Date -Format o) $publicUrl" | Out-File -FilePath "ngrok-url.txt" -Encoding UTF8

# Optional: run a callback script/program with the URL as the first arg
if ($Callback -and (Test-Path $Callback)) {
  Write-Host "Running callback: $Callback $publicUrl"
  & $Callback $publicUrl
}

Write-Host "Open ngrok dashboard: http://127.0.0.1:4040"
Write-Host "Press Ctrl+C in this window to stop ngrok when done."

try {
  Wait-Process -Id $ngrok.Id
} catch {}

