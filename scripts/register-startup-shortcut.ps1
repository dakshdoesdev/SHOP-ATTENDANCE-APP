# Creates a Startup shortcut for running prod-auto.ps1 at user logon (no admin required)
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [int]$Port = 5000,
  [ValidateSet('ngrok','localtunnel','cloudflared','none')]
  [string]$Tunnel = 'ngrok',
  [string]$Subdomain = '',
  [string]$PublicUrl = '',
  [string]$ShortcutName = 'Attendance Prod Autostart.lnk'
)

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $ProjectRoot "scripts/prod-auto.ps1"
if (-not (Test-Path $scriptPath)) { throw "Could not find prod-auto.ps1 at $scriptPath" }

$startupDir = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'
if (-not (Test-Path $startupDir)) { throw "Startup folder not found: $startupDir" }

$shortcutPath = Join-Path $startupDir $ShortcutName

# Build a command line that calls PowerShell to run prod-auto.ps1 with args
$psArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectRoot `"$ProjectRoot`" -Port $Port -Tunnel $Tunnel -Subdomain `"$Subdomain`""
if ($PublicUrl) { $psArgs += " -PublicUrl `"$PublicUrl`"" }

$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath = (Get-Command powershell.exe).Source
$sc.Arguments = $psArgs
$sc.WorkingDirectory = $ProjectRoot
$sc.Description = 'Start tunnel and server for Attendance app'
$sc.WindowStyle = 7  # Minimized
$sc.Save()

Write-Host "Created Startup shortcut: $shortcutPath"

