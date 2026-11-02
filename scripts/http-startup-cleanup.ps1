# Best effort cleanup after cancellation as well as ordinary driver finally.
# No process discovery by broad name; only exact recorded PIDs/parent/time.
param([ValidateSet('cleanup','register')][string]$Phase = 'cleanup')
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
    $env:RUNNER_OS -ne 'Windows' -or $env:STARTUP_MODE -ne 'startup-602') {
    if ($env:STARTUP_MODE -ne 'env-602') { throw 'Hosted startup cleanup only' }
    & node scripts/http-startup-env-boundary.mjs --admit-helper
    if ($LASTEXITCODE -ne 0) { throw 'Rejected env-602 cleanup provenance' }
}
# BEGIN ENV602 PURE
function ConvertTo-Env602Command($command, $arguments) {
    $parts = foreach ($value in @($command) + @($arguments)) {
        $value = [string]$value
        if ($value.Length -gt 0 -and $value -notmatch '[\s"]') { $value; continue }
        # Same Windows argv quoting as Node/libuv; no shell evaluation.
        '"' + [regex]::Replace([regex]::Replace($value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
    }
    $parts -join ' '
}
function Test-Env602Identity($child, $live) {
    return $null -ne $live -and $live.ProcessId -eq $child.pid -and
        $live.ParentProcessId -eq $child.parentPid -and
        $live.CreationDate.ToUniversalTime().Ticks.ToString() -ceq $child.creationTicks -and
        $live.Name -ieq [IO.Path]::GetFileName($child.executable) -and
        $live.ExecutablePath -ieq $child.executable -and
        $live.CommandLine -ceq (ConvertTo-Env602Command $child.command $child.args)
}
# END ENV602 PURE
if ($env:STARTUP_MODE -eq 'env-602') {
    $root=Join-Path $env:GITHUB_WORKSPACE 'work/http-startup'
    $p=Get-Content -LiteralPath (Join-Path $root 'env-boundary-provenance.json') -Raw | ConvertFrom-Json
    $owner=Get-Content -LiteralPath (Join-Path $root 'env-owner.json') -Raw | ConvertFrom-Json
    if ($owner.head -cne $p.driver.head -or $owner.tree -cne $p.driver.tree -or
        $owner.run -cne $p.workflow.runId -or $owner.attempt -cne $p.workflow.runAttempt -or
        $owner.driverPid -le 0) { throw 'Foreign env-602 owner' }
    $ledger=Join-Path $root 'env-children.json'
    $owned=@()
    $rows=@()
    if(Test-Path -LiteralPath $ledger) {
        try {$owned=@(Get-Content -LiteralPath $ledger -Raw | ConvertFrom-Json)}
        catch {$rows+=@(@{pid=$null;status='invalid ownership receipt; untouched'})}
    }
    $native=Join-Path $root 'retained/reference-stress/nona-http.exe'
    $source=Join-Path $root 'retained/reference.mjs'
    $pwsh=(Get-Command pwsh -CommandType Application -ErrorAction Stop).Source
    function Register-Env602Child($child) {
        if ($child.pid -le 0 -or $child.parentPid -ne $owner.driverPid) { throw 'Foreign child owner' }
        $exe=$null
        if ($child.command -ieq $p.nodeExecutable -and $child.args.Count -eq 2 -and
            $child.args[0] -ieq $source -and $child.args[1] -match '^\d+$') { $exe=$p.nodeExecutable }
        elseif ($child.command -ieq $native -and $child.args.Count -eq 1 -and $child.args[0] -match '^\d+$') { $exe=$native }
        elseif ($child.command -ceq 'pwsh' -and $child.args.Count -eq 6 -and
            $child.args[0] -ceq '-NoProfile' -and $child.args[1] -ceq '-File' -and
            $child.args[2] -ceq 'scripts/http-startup-artifact.ps1' -and $child.args[3] -cin @('inventory','extract') -and
            $child.args[4] -ceq '-Output' -and [IO.Path]::GetFullPath($child.args[5]) -ieq $root) { $exe=$pwsh }
        if (-not $exe) { throw 'Child command is not an env-602 allowlisted operation' }
        $live=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$child.pid)" -ErrorAction SilentlyContinue
        if(-not $live) { return } # Already exited: no process to clean.
        $start=[DateTime]::Parse($child.startedAt).ToUniversalTime()
        if($live.CreationDate.ToUniversalTime() -lt $start.AddSeconds(-1) -or
            $live.CreationDate.ToUniversalTime() -gt $start.AddSeconds(10)) { throw 'Child creation outside spawn window' }
        $record=@{pid=$child.pid;parentPid=$child.parentPid;command=$child.command;args=@($child.args);
            executable=$exe;creationTicks=$live.CreationDate.ToUniversalTime().Ticks.ToString()}
        if(-not (Test-Env602Identity $record $live)) { throw 'Foreign/reused env-602 child; untouched' }
        return $record
    }
    if($Phase -eq 'register') {
        $request=Get-Content -LiteralPath (Join-Path $root 'env-ownership-request.json') -Raw | ConvertFrom-Json
        $record=Register-Env602Child $request
        if($record) { $owned+=@($record) }
        ConvertTo-Json -InputObject @($owned) -Depth 8 | Set-Content -LiteralPath $ledger
        return
    }
    # Cancellation fallback: only exact recorded workload PIDs, never name sweeps.
    # Register the actual birth identity, then query it again before stopping.
    foreach($dir in @(Get-ChildItem -LiteralPath $root -Directory -Filter 'trial-*')) {
        $file=Join-Path $dir.FullName 'trial.json'
        if(-not (Test-Path -LiteralPath $file)) { continue }
        try {$trial=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json}
        catch {$rows+=@(@{pid=$null;status='invalid trial receipt; untouched'});continue}
        if($trial.id -cnotmatch '^(base|many|few)-(node|nona)$' -or -not $trial.pid) { continue }
        $command=$native; $arguments=@([string]$trial.port)
        if($trial.runtime -ceq 'node') { $command=$p.nodeExecutable; $arguments=@($source,[string]$trial.port) }
        if(-not ($owned | Where-Object { $_.pid -eq $trial.pid })) {
            try {
                $record=Register-Env602Child @{pid=$trial.pid;parentPid=$owner.driverPid;startedAt=$trial.startedAt;command=$command;args=$arguments}
                if($record) {$owned+=@($record)}
            } catch { $rows+=@(@{pid=$trial.pid;status='registration failed; untouched'}) }
        }
    }
    # Also cover a restore helper interrupted between spawn and registration.
    $requestFile=Join-Path $root 'env-ownership-request.json'
    if(Test-Path -LiteralPath $requestFile) {
        try {
            $request=Get-Content -LiteralPath $requestFile -Raw | ConvertFrom-Json
            if(-not ($owned | Where-Object {$_.pid -eq $request.pid})) {
                $record=Register-Env602Child $request
                if($record) {$owned+=@($record)}
            }
        } catch { $rows+=@(@{pid=$null;status='restore/trial registration failed; untouched'}) }
    }
    foreach($child in $owned) {
        $row=@{pid=$child.pid;status='already absent'}
        try {
            $live=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$child.pid)" -ErrorAction SilentlyContinue
            if($live) {
                if(Test-Env602Identity $child $live) {
                    Stop-Process -Id $child.pid -Force -ErrorAction Stop
                    $row.status='stopped owned child'
                } else {$row.status='identity mismatch; untouched'}
            }
        } catch {$row.status='cleanup failed; untouched'}
        $rows+=@($row)
    }
    ConvertTo-Json -InputObject @($owned) -Depth 8 | Set-Content -LiteralPath $ledger
    ConvertTo-Json -InputObject @($rows) -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'cleanup.json')
    if($rows | Where-Object {$_.status -notin @('already absent','stopped owned child')}) {throw 'Owned cleanup incomplete; foreign identities untouched'}
    return
}
if($Phase -ne 'cleanup') { throw 'Registration is exclusive to env-602' }
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
