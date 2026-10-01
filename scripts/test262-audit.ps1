# Full pinned-Test262 audit on Windows x64 (native PE executables).
#
#   powershell -ExecutionPolicy Bypass -File scripts\test262-audit.ps1 [-Out work\test262-audit] [-Jobs 8] [-Unit]
#   powershell -ExecutionPolicy Bypass -File scripts\test262-audit.ps1 -Dirs 'built-ins/Proxy,language/types' -Tag r1
#
# Builds, optionally runs the unit suite, then runs every applicable Test262
# directory (post-ES2020 features excluded) one directory per report so an
# interrupted run resumes where it stopped. -Dirs reruns selected directories
# into <Out>\<Tag>; scripts/test262-summary.mjs lets those reruns override the
# full run. Summarize with:  node scripts\test262-summary.mjs work\test262-audit
param([string]$Out = 'work\test262-audit', [string]$Dirs = '', [string]$Tag = '', [int]$Jobs = 8, [switch]$Unit)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$base = Join-Path (Get-Location) $Out
$outDir = if ($Tag) { Join-Path $base $Tag } else { $base }
New-Item -ItemType Directory -Force $outDir | Out-Null
$status = Join-Path $outDir 'status.txt'
function Log($m) { Add-Content -Encoding utf8 $status "$(Get-Date -Format s) $m" }
Set-Content -Encoding utf8 $status "node $(node --version); $(git log --oneline -1)"
if (-not (Test-Path node_modules)) { npm ci *> (Join-Path $outDir 'npm-ci.txt') }
npm run build *> (Join-Path $outDir 'build.txt')
if ($LASTEXITCODE -ne 0) { Log 'BUILD FAILED'; exit 1 }
if ($Unit) {
  $unit = Join-Path $outDir 'unit.txt'
  $files = (Get-ChildItem dist\tests\*.test.js | Sort-Object Name).FullName
  node --test --test-reporter=tap --test-concurrency=$Jobs @files *> $unit
  Log ('unit ' + ((Select-String -Path $unit -Pattern '^# (pass|fail) ' | ForEach-Object { $_.Line }) -join ' '))
}
$env:TEST262_EXCLUDE_FEATURES = 'post-es2020'; $env:TEST262_RUN_ASYNC = '1'; $env:TEST262_DELETE_BINARIES = '1'
$env:TEST262_JOBS = "$Jobs"; $env:TEST262_RUNTIME_TIMEOUT_MS = '60000'
if ($Dirs) { $list = @($Dirs -split ',' | Where-Object { $_ }) }
else {
  $sub = { param($p) Get-ChildItem "work\test262\test\$p" -Directory | ForEach-Object { "$p/" + $_.Name } }
  $list = @(& $sub 'language') + @(& $sub 'annexB') + @(& $sub 'built-ins')
}
foreach ($d in $list) {
  $name = $d -replace '/', '_'
  $report = Join-Path $outDir "t262-$name.json"
  if (Test-Path $report) { continue }
  $env:TEST262_REPORT = $report
  $env:TEST262_PROGRESS_LOG = Join-Path $outDir "t262-$name.progress"
  node scripts/test262-smoke.mjs $d *> (Join-Path $outDir "t262-$name.txt")
  Log ("$d " + (Get-Content (Join-Path $outDir "t262-$name.txt") -TotalCount 1))
}
Log 'ALL DONE'
