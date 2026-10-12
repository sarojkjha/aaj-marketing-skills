# log-traffic.ps1 - AAJ Skills weekly GitHub traffic baseline
#
# Usage:
#   $env:GH_TOKEN = "github_pat_..."     (once per terminal session)
#   .\log-traffic.ps1
#
# Appends one row per run to github-traffic-log.csv. Writes nothing if the
# API call fails, so a bad token can't leave a phantom zero in the baseline.
#
# GitHub retains only 14 days of traffic data. Run this at least weekly -
# a gap longer than 14 days is permanently unrecoverable.

param(
    [string]$Repo    = 'sarojkjha/aaj-marketing-skills',
    [string]$LogPath = '.\github-traffic-log.csv'
)

if (-not $env:GH_TOKEN) {
    Write-Host "GH_TOKEN is not set. Run:" -ForegroundColor Red
    Write-Host '  $env:GH_TOKEN = "github_pat_..."' -ForegroundColor Yellow
    exit 1
}

if ($env:GH_TOKEN -match '^<|token>$') {
    Write-Host "GH_TOKEN still looks like a placeholder. Paste the real value." -ForegroundColor Red
    exit 1
}

$headers = @{
    Authorization          = "Bearer $env:GH_TOKEN"
    'X-GitHub-Api-Version' = '2022-11-28'
    Accept                 = 'application/vnd.github+json'
}

$script:LastCall = ''
function Get-Traffic($path) {
    # No trailing slash: https://api.github.com/repos/owner/name/ returns 404,
    # while the same URL without the slash returns 200.
    $uri = if ($path) { "https://api.github.com/repos/$Repo/$path" }
           else       { "https://api.github.com/repos/$Repo" }
    $script:LastCall = $uri
    Invoke-RestMethod -Uri $uri -Headers $headers -ErrorAction Stop
}

try {
    $views  = Get-Traffic 'traffic/views'
    $clones = Get-Traffic 'traffic/clones'
    $refs   = Get-Traffic 'traffic/popular/referrers'
    $paths  = Get-Traffic 'traffic/popular/paths'
    $repoInfo = Get-Traffic ''
}
catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "FAILED (HTTP $code) - nothing logged." -ForegroundColor Red
    switch ($code) {
        401 { Write-Host "  Token is invalid, expired, or revoked. Generate a new one." -ForegroundColor Yellow }
        403 { Write-Host "  Token is valid but lacks 'Administration: Read-only' on this repo." -ForegroundColor Yellow
              Write-Host "  Traffic endpoints sit under Administration, not Contents or Metadata." -ForegroundColor Yellow }
        404 { Write-Host "  Repo path wrong, or the token has no access to it." -ForegroundColor Yellow }
        default { Write-Host "  $($_.Exception.Message)" -ForegroundColor Yellow }
    }
    # GitHub tells you exactly what permission the endpoint wanted:
    $needed = $_.Exception.Response.Headers['X-Accepted-GitHub-Permissions']
    if ($needed) { Write-Host "  X-Accepted-GitHub-Permissions: $needed" -ForegroundColor Yellow }
    exit 1
}

$row = [pscustomobject]@{
    date            = Get-Date -Format 'yyyy-MM-dd'
    views_14d       = $views.count
    view_uniques    = $views.uniques
    clones_14d      = $clones.count
    clone_uniques   = $clones.uniques
    stars           = $repoInfo.stargazers_count
    forks           = $repoInfo.forks_count
    top_referrer    = ($refs  | Select-Object -First 1).referrer
    top_ref_uniques = ($refs  | Select-Object -First 1).uniques
    top_path        = ($paths | Select-Object -First 1).path
    top_path_views  = ($paths | Select-Object -First 1).count
}

$row | Format-List

$row | Export-Csv -Path $LogPath -NoTypeInformation -Append
Write-Host "Logged to $LogPath" -ForegroundColor Green

if ($refs) {
    Write-Host "`nAll referrers (last 14 days):" -ForegroundColor Cyan
    $refs | Select-Object referrer, count, uniques | Format-Table -AutoSize
}
