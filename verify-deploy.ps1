# verify-deploy.ps1 - AAJ post-deploy regression check
#
# Run after EVERY Cloudflare deploy, before considering it done.
#   .\verify-deploy.ps1
#   .\verify-deploy.ps1 -Baseline      (re-record word counts as the new baseline)
#
# Exits 1 if any check fails. ASCII only, so it parses regardless of file encoding.

param(
    [switch]$Baseline,
    [string]$BaselinePath = '.\deploy-baseline.json'
)

$ErrorActionPreference = 'Continue'
$script:Pass = 0
$script:Fail = 0
$script:Warn = 0

function Test-Result($name, $ok, $detail) {
    if ($ok) {
        $script:Pass++
        Write-Host ("  PASS  " + $name) -ForegroundColor Green
    } else {
        $script:Fail++
        Write-Host ("  FAIL  " + $name + "  ->  " + $detail) -ForegroundColor Red
    }
}
function Warn-Result($name, $detail) {
    $script:Warn++
    Write-Host ("  WARN  " + $name + "  ->  " + $detail) -ForegroundColor Yellow
}

$script:LastError = ''
function Get-Page($url) {
    $target = $url
    if ($url -notmatch '\.(txt|xml|json)$') {
        $sep = if ($url -like '*?*') { '&' } else { '?' }
        $target = $url + $sep + "cb=" + (Get-Random)
    }
    try { return (Invoke-WebRequest $target -UseBasicParsing -TimeoutSec 30) }
    catch {
        $script:LastError = $_.Exception.Message
        try { Start-Sleep -Milliseconds 800; return (Invoke-WebRequest $target -UseBasicParsing -TimeoutSec 30) }
        catch { $script:LastError = $_.Exception.Message; return $null }
    }
}
function Get-Text($html) {
    $t = $html -replace '<script[\s\S]*?</script>', ' '
    $t = $t -replace '<style[\s\S]*?</style>', ' '
    $t = $t -replace '<[^>]+>', ' '
    return (($t -replace '\s+', ' ').Trim())
}

$apex   = 'https://aajconsult.com'
$skills = 'https://skills.aajconsult.com'

# Routes that must always render. Add new ones here as the site grows.
$routes = @('/', '/pricing', '/services', '/about', '/methodology', '/founder',
            '/case-studies', '/blog', '/playbooks', '/reports', '/tools', '/contact',
            '/tools/unit-economics-calculator', '/tools/survey-studio')

# Terms that must never appear anywhere. Extend when a tier or price is retired.
$retired = @('Strategy Sprint', '$2K-$4K', '$6K-$15K', 'first five', 'Full Diagnostic')

Write-Host ""
Write-Host "=== 0. Worker health gate ===" -ForegroundColor Cyan
# If the SEO worker is not running, Cloudflare serves the SPA shell for every
# route and every downstream check fails misleadingly. Detect that first.
$shell = Get-Page ($apex + '/no-such-route-' + (Get-Random))
$probe = Get-Page ($apex + '/pricing')
if ($null -eq $shell -or $null -eq $probe) {
    Test-Result "site reachable" $false $script:LastError
    Write-Host "  Cannot reach the site. Aborting." -ForegroundColor Red
    exit 1
}
$shellTitle = [regex]::Match($shell.Content, '<title>([^<]*)</title>').Groups[1].Value
$probeTitle = [regex]::Match($probe.Content, '<title>([^<]*)</title>').Groups[1].Value
if ($shellTitle -eq $probeTitle) {
    Test-Result "SEO worker is running" $false "every route returns the SPA shell titled '$shellTitle' - deploy may be in flight"
    Write-Host "  Worker is not injecting content. Re-run in a minute; everything below would be noise." -ForegroundColor Red
    exit 1
}
Test-Result "SEO worker is running" $true ""

Write-Host ""
Write-Host "=== 1. Routes respond and render ===" -ForegroundColor Cyan
$pages = @{}
$words = @{}
foreach ($r in $routes) {
    $p = Get-Page ($apex + $r)
    if ($null -eq $p) { Test-Result ("GET " + $r) $false "no response"; continue }
    $pages[$r] = $p.Content
    $w = ((Get-Text $p.Content) -split '\s+').Count
    $words[$r] = $w
    Test-Result ("GET " + $r + "  (" + $w + " words)") ($p.StatusCode -eq 200 -and $w -gt 300) ("status " + $p.StatusCode + ", " + $w + " words")
}

Write-Host ""
Write-Host "=== 2. Per-route titles are unique and specific ===" -ForegroundColor Cyan
# Catches ROUTE_META drift: a route falling back to the homepage title.
$titles = @{}
foreach ($r in $pages.Keys) {
    $m = [regex]::Match($pages[$r], '<title>([^<]*)</title>')
    $t = $m.Groups[1].Value
    $titles[$r] = $t
    Test-Result ("title " + $r) ($t.Length -gt 10) ("'" + $t + "'")
}
$dupes = $titles.Values | Group-Object | Where-Object { $_.Count -gt 1 }
foreach ($d in $dupes) { Test-Result "no duplicate titles" $false ($d.Name + " used " + $d.Count + " times - ROUTE_META drift") }
if ($dupes.Count -eq 0) { Test-Result "no duplicate titles" $true "" }

Write-Host ""
Write-Host "=== 3. Retired terms absent everywhere ===" -ForegroundColor Cyan
foreach ($term in $retired) {
    $hits = @()
    foreach ($r in $pages.Keys) {
        if ($pages[$r] -match [regex]::Escape($term)) { $hits += $r }
    }
    Test-Result ("no '" + $term + "'") ($hits.Count -eq 0) ("found on: " + ($hits -join ', '))
}

Write-Host ""
Write-Host "=== 4. Pricing page integrity ===" -ForegroundColor Cyan
$pr = $pages['/pricing']
if ($pr) {
    foreach ($a in 'growth-audit','ai-visibility','unit-economics-retention','positioning-message') {
        Test-Result ("anchor #" + $a) ($pr -match ('id="' + $a + '"')) "missing"
    }
    foreach ($s in 'Service','Offer','FAQPage','PriceSpecification','Organization') {
        Test-Result ("schema " + $s) ($pr -match ('"@type":"' + $s + '"')) "missing"
    }
    $anchors = ([regex]::Matches($pr, '<a ')).Count
    Test-Result ("CTA anchors present (" + $anchors + ")") ($anchors -ge 15) "expected 15+, crawlers need a path to purchase"
    Test-Result "title mentions Growth Audit" ($titles['/pricing'] -match 'Growth Audit') $titles['/pricing']
    $desc = [regex]::Match($pr, '<meta name="description" content="([^"]*)"').Groups[1].Value
    Test-Result "description has current prices" ($desc -match '1,200' -and $desc -match '3,500') $desc
} else {
    Test-Result "pricing page fetched" $false "no response"
}

Write-Host ""
Write-Host "=== 5. Soft-404 check ===" -ForegroundColor Cyan
# An unknown route must NOT return 200 with homepage content.
try {
    $bad = Invoke-WebRequest ($apex + '/this-route-does-not-exist-' + (Get-Random)) -UseBasicParsing -TimeoutSec 20
    Test-Result "unknown route returns 404" $false ("returned " + $bad.StatusCode + " - soft 404, duplicate content risk")
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Test-Result "unknown route returns 404" ($code -eq 404) ("returned " + $code)
}

Write-Host ""
Write-Host "=== 6. Cache and compression ===" -ForegroundColor Cyan
try {
    $h = Invoke-WebRequest ($apex + '/pricing') -UseBasicParsing -Method Head -TimeoutSec 20
    $cc = $h.Headers['Cache-Control']
    $cf = $h.Headers['cf-cache-status']
    if ($cc -match 'max-age=0') { Warn-Result "HTML not cached" ("Cache-Control: " + $cc) }
    else { Test-Result "HTML cache headers" $true $cc }
    if ($cf -eq 'DYNAMIC') { Warn-Result "edge cache" "cf-cache-status: DYNAMIC (worker runs on every request)" }
    else { Test-Result "edge cache" $true ("cf-cache-status: " + $cf) }
} catch { Warn-Result "cache headers" "could not read" }

$comp = (Invoke-WebRequest ($apex + '/pricing') -UseBasicParsing -Headers @{ 'Accept-Encoding' = 'br,gzip' }).RawContentLength
$raw  = (Invoke-WebRequest ($apex + '/pricing') -UseBasicParsing -Headers @{ 'Accept-Encoding' = 'identity' }).RawContentLength
Test-Result ("compression active (" + $comp + " vs " + $raw + " bytes)") ($comp -lt ($raw * 0.5)) "HTML not being compressed"

Write-Host ""
Write-Host "=== 7. llms.txt files current ===" -ForegroundColor Cyan
foreach ($f in 'llms.txt','llms-full.txt') {
    $c = Get-Page ($apex + '/' + $f)
    if ($null -eq $c) { Test-Result $f $false ("no response: " + $script:LastError); continue }
    $stale = $false
    foreach ($term in $retired) { if ($c.Content -match [regex]::Escape($term)) { $stale = $true } }
    Test-Result ($f + " has no retired terms") (-not $stale) "contains a retired tier"
    Test-Result ($f + " has current ladder") ($c.Content -match '10 business days') "missing current sprint duration"
}

Write-Host ""
Write-Host "=== 8. Skills subdomain ===" -ForegroundColor Cyan
$sk = Get-Page ($skills + '/skills/unit-economics')
if ($sk) {
    $sw = ((Get-Text $sk.Content) -split '\s+').Count
    Test-Result ("skill body server-rendered (" + $sw + " words)") ($sw -gt 700) "body not rendering - check body_md sync"
    Test-Result "skill JSON-LD" ($sk.Content -match 'TechArticle') "missing"
    Test-Result "corrected run path" ($sk.Content -match '\.agents/skills/unit-economics') "SKILL.md shows old path - re-sync"
} else {
    Test-Result "skills subdomain reachable" $false ("no response: " + $script:LastError)
}

Write-Host ""
Write-Host "=== 9. Lead capture endpoint alive ===" -ForegroundColor Cyan
# Honeypot filled: must return 200 and write nothing.
try {
    $body = @{ email = 'deploy-check@example.com'; hp = 'bot' } | ConvertTo-Json
    $res = Invoke-WebRequest ($skills + '/api/public/capture-lead') -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 20
    Test-Result "capture-lead responds" ($res.StatusCode -eq 200) ("status " + $res.StatusCode)
} catch {
    Test-Result "capture-lead responds" $false ("status " + $_.Exception.Response.StatusCode.value__)
}

Write-Host ""
Write-Host "=== 10. Content volume vs baseline ===" -ForegroundColor Cyan
if ($Baseline) {
    $words | ConvertTo-Json | Set-Content $BaselinePath -Encoding UTF8
    Write-Host ("  Baseline recorded to " + $BaselinePath) -ForegroundColor Cyan
} elseif (Test-Path $BaselinePath) {
    $base = Get-Content $BaselinePath -Raw | ConvertFrom-Json
    foreach ($r in $words.Keys) {
        $old = $base.$r
        if ($null -eq $old) { continue }
        $new = $words[$r]
        $drop = $old - $new
        if ($drop -gt ($old * 0.1)) {
            Test-Result ("word count " + $r) $false ($old + " -> " + $new + ", dropped " + $drop)
        } else {
            Test-Result ("word count " + $r + " (" + $new + ")") $true ""
        }
    }
} else {
    Warn-Result "no baseline" ("run with -Baseline once to create " + $BaselinePath)
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ("  PASS " + $script:Pass + "   FAIL " + $script:Fail + "   WARN " + $script:Warn)
Write-Host "=========================================" -ForegroundColor Cyan
if ($script:Fail -gt 0) { Write-Host "  Deploy has regressions. Do not consider it done." -ForegroundColor Red; exit 1 }
if ($script:Warn -gt 0) { Write-Host "  Deploy is functional with warnings." -ForegroundColor Yellow; exit 0 }
Write-Host "  Deploy clean." -ForegroundColor Green
exit 0
