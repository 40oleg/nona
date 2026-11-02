# Best effort cleanup after cancellation as well as ordinary driver finally.
# No process discovery by broad name; only exact recorded PIDs/parent/time.
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
    $env:RUNNER_OS -ne 'Windows' -or $env:STARTUP_MODE -ne 'startup-602') { throw 'Hosted startup cleanup only' }
$root=Join-Path $env:GITHUB_WORKSPACE 'work/http-startup'
if (-not (Test-Path -LiteralPath $root)) { return }
$rows=@()
$owned=@()
$ledger=Join-Path $root 'children.json'
if (Test-Path -LiteralPath $ledger) { $owned+=@(Get-Content -LiteralPath $ledger -Raw | ConvertFrom-Json) }
$provenance=Join-Path $root 'provenance.json'
if (Test-Path -LiteralPath $provenance) {
    $p=Get-Content -LiteralPath $provenance -Raw | ConvertFrom-Json
    foreach ($dir in @(Get-ChildItem -LiteralPath $root -Directory -Filter 'trial-*')) {
        $file=Join-Path $dir.FullName 'trial.json'
        if (Test-Path -LiteralPath $file) {
            $trial=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
            if ($trial.pid -and $trial.startedAt) {
                $owned+=@{pid=$trial.pid;parentPid=$p.driverPid;startedAt=$trial.startedAt;command='nona-http.exe'}
            }
        }
    }
}
foreach ($child in $owned) {
    if (-not $child.pid) { continue }
    $live=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$child.pid)" -ErrorAction SilentlyContinue
    $row=@{pid=$child.pid;status='already absent'}
    if ($live) {
        $start=[DateTime]::Parse($child.startedAt).ToUniversalTime()
        $created=$live.CreationDate.ToUniversalTime()
        $name=[IO.Path]::GetFileNameWithoutExtension($child.command)
        if ($live.ParentProcessId -eq $child.parentPid -and $created -ge $start.AddSeconds(-10) -and
            $created -le $start.AddSeconds(10) -and [IO.Path]::GetFileNameWithoutExtension($live.Name) -ieq $name) {
            Stop-Process -Id $child.pid -Force -ErrorAction SilentlyContinue
            $row.status='stopped owned child'
        } else { $row.status='identity mismatch; untouched' }
    }
    $rows+=$row
}
ConvertTo-Json -InputObject $rows -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'cleanup.json')
