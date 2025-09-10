# Registers a Windows Scheduled Task to run prod-auto.ps1 at user logon
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/register-prod-autostart.ps1 \
#     -ProjectRoot "C:\\Users\\NAME\\Desktop\\SHOP-ATTENDANCE-APP" -Port 5000 -Tunnel ngrok -TaskName "Attendance Prod Autostart"

param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
  [int]$Port = 5000,
  [ValidateSet('ngrok','localtunnel','cloudflared','none')]
  [string]$Tunnel = 'ngrok',
  [string]$Subdomain = '',
  [string]$PublicUrl = '',
  [string]$TaskName = "Attendance Prod Autostart"
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $ProjectRoot "scripts\prod-auto.ps1"
if (-not (Test-Path $scriptPath)) { throw "Could not find prod-auto.ps1 at $scriptPath" }

$psArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectRoot `"$ProjectRoot`" -Port $Port -Tunnel $Tunnel -Subdomain `"$Subdomain`""
if ($PublicUrl) { $psArgs += " -PublicUrl `"$PublicUrl`"" }
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $psArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

try {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  Write-Host "Task '$TaskName' exists; updating..."
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
} catch {}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Start tunnel and npm start for Attendance app"

Write-Host "Registered scheduled task: $TaskName"

