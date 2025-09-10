# Unregisters the Scheduled Task created by register-dev-autostart.ps1
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/unregister-dev-autostart.ps1
# Optional params:
#   -TaskName "Attendance Dev Autostart"

param(
  [string]$TaskName = "Attendance Dev Autostart"
)

$ErrorActionPreference = "Stop"

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Unregistered scheduled task: $TaskName"
} catch {
  Write-Warning "Task '$TaskName' not found."
}

