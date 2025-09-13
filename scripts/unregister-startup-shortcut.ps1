param(
  [string]$ShortcutName = 'Attendance Prod Autostart.lnk'
)

$startupDir = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Startup'
$shortcutPath = Join-Path $startupDir $ShortcutName

if (Test-Path $shortcutPath) {
  Remove-Item $shortcutPath -Force
  Write-Host "Removed Startup shortcut: $shortcutPath"
} else {
  Write-Host "Shortcut not found: $shortcutPath"
}

