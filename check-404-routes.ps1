# check-404-routes.ps1
# Verifies that every sitemap route returns 200 and that unknown routes return 404.
# Run BEFORE the worker change to capture a baseline, then AFTER to compare.
#
# Usage:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   Unblock-File .\check-404-routes.ps1
#   .\check-404-routes.ps1 -BaseUrl "https://aajconsult.com"
#   .\check-404-routes.ps1 -BaseUrl "https://aajconsult.com" -OutFile "after.csv"
#
# ASCII only. No em dashes. PowerShell 5.1 compatible.

param(
    [string]$BaseUrl = "https://aajconsult.com",
    [string]$OutFile = "route-status.csv",
    [int]$DelayMs = 150
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-Status {
    param([string]$Url, [string]$Accept = "text/html")
    try {
        $req = [System.Net.HttpWebRequest]::Create($Url)
        $req.Method = "GET"
        $req.Accept = $Accept
        $req.UserAgent = "AAJ-RouteCheck/1.0"
        $req.AllowAutoRedirect = $false
        $req.Timeout = 25000
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        return $code
    } catch [System.Net.WebException] {
        if ($_.Exception.Response -ne $null) {
            return [int]$_.Exception.Response.StatusCode
        }
        return -1
    } catch {
        return -1
    }
}

Write-Host ""
Write-Host "Route check against $BaseUrl" -ForegroundColor Cyan
Write-Host ""

# --- 1. Pull the sitemap ---------------------------------------------------
Write-Host "Fetching sitemap..." -NoNewline
try {
    $sitemap = Invoke-WebRequest -Uri "$BaseUrl/sitemap.xml" -UseBasicParsing -TimeoutSec 30
    [xml]$xml = $sitemap.Content
    $locs = @($xml.urlset.url | ForEach-Object { $_.loc })
} catch {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "Could not read sitemap.xml. Stopping."
    exit 1
}
Write-Host " $($locs.Count) URLs" -ForegroundColor Green

# --- 2. Paths that must keep returning 200 --------------------------------
$mustLive = @(
    "$BaseUrl/robots.txt",
    "$BaseUrl/sitemap.xml",
    "$BaseUrl/llms.txt",
    "$BaseUrl/llms-full.txt",
    "$BaseUrl/favicon.ico"
)

# --- 3. Paths that must return 404 ----------------------------------------
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$mustFail = @(
    "$BaseUrl/_probe_nonsense_$stamp",
    "$BaseUrl/pricing/_probe_deeper_$stamp",
    "$BaseUrl/blog/_probe_missing_post_$stamp",
    "$BaseUrl/tools/_probe_missing_tool_$stamp",
    "$BaseUrl/about/extra/segment/$stamp"
)

$results = New-Object System.Collections.ArrayList
$fails = 0

function Test-Url {
    param([string]$Url, [int]$Expected, [string]$Group)
    $code = Get-Status -Url $Url
    $ok = ($code -eq $Expected)
    if (-not $ok) { $script:fails++ }
    $null = $script:results.Add([PSCustomObject]@{
        Group    = $Group
        Url      = $Url
        Expected = $Expected
        Actual   = $code
        Result   = $(if ($ok) { "PASS" } else { "FAIL" })
    })
    if (-not $ok) {
        Write-Host "  FAIL  $Url  expected $Expected got $code" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds $DelayMs
}

# --- 4. Run ----------------------------------------------------------------
Write-Host ""
Write-Host "Checking $($locs.Count) sitemap routes (expect 200)..." -ForegroundColor Cyan
foreach ($u in $locs) { Test-Url -Url $u -Expected 200 -Group "sitemap" }

Write-Host "Checking well-known files (expect 200)..." -ForegroundColor Cyan
foreach ($u in $mustLive) { Test-Url -Url $u -Expected 200 -Group "wellknown" }

Write-Host "Checking nonsense paths (expect 404)..." -ForegroundColor Cyan
foreach ($u in $mustFail) { Test-Url -Url $u -Expected 404 -Group "nonsense" }

# --- 5. Markdown negotiation must survive ---------------------------------
Write-Host "Checking markdown negotiation still works..." -ForegroundColor Cyan
$mdCode = Get-Status -Url "$BaseUrl/" -Accept "text/markdown"
$mdOk = ($mdCode -eq 200)
if (-not $mdOk) { $fails++ }
$null = $results.Add([PSCustomObject]@{
    Group = "markdown"; Url = "$BaseUrl/ (Accept: text/markdown)"
    Expected = 200; Actual = $mdCode
    Result = $(if ($mdOk) { "PASS" } else { "FAIL" })
})
if (-not $mdOk) {
    Write-Host "  FAIL  markdown negotiation returned $mdCode" -ForegroundColor Red
}

# --- 6. Report -------------------------------------------------------------
$results | Export-Csv -Path $OutFile -NoTypeInformation -Encoding ASCII

$total = $results.Count
$passed = $total - $fails

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "Total checks : $total"
Write-Host "Passed       : $passed"
if ($fails -gt 0) {
    Write-Host "Failed       : $fails" -ForegroundColor Red
} else {
    Write-Host "Failed       : 0" -ForegroundColor Green
}
Write-Host "Saved to     : $OutFile"
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host ""

if ($fails -gt 0) {
    Write-Host "Do not ship. Compare against your baseline CSV to see what changed." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "All routes behaving correctly." -ForegroundColor Green
    exit 0
}
