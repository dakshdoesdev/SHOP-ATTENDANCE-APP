# Updates a public JSON config in Supabase Storage with API/Upload base URLs
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/update-supabase-config.ps1 \
#     -SupabaseUrl "https://<project-ref>.supabase.co" -ServiceKey "<service-role-key>" \
#     -Bucket "config" -Object "api.json" -ApiBase "https://xyz.ngrok-free.app" -UploadBase "https://xyz.ngrok-free.app"

param(
  [Parameter(Mandatory=$true)][string]$SupabaseUrl,
  [Parameter(Mandatory=$true)][string]$ServiceKey,
  [string]$Bucket = 'config',
  [string]$Object = 'api.json',
  [string]$ApiBase = '',
  [string]$UploadBase = ''
)

$ErrorActionPreference = "Stop"

if (-not $ApiBase) {
  throw "-ApiBase is required"
}
if (-not $UploadBase) { $UploadBase = $ApiBase }

$uri = "$SupabaseUrl/storage/v1/object/$Bucket/$Object"
$body = @{ apiBase = $ApiBase; uploadBase = $UploadBase; updatedAt = (Get-Date -Format o) } | ConvertTo-Json -Depth 3

Write-Host "[supabase] PUT $uri"

$headers = @{
  'Authorization' = "Bearer $ServiceKey"
  'Content-Type'  = 'application/json'
  'x-upsert'      = 'true'
}

$resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $body -ErrorAction Stop
Write-Host "[supabase] Uploaded config object size: $($body.Length)"

