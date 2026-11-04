# One persistent hosted Windows observer. No HTTP, providers, process search,
# shell commands or PID-only termination. Process objects retain OS handles.
$ErrorActionPreference = 'Stop'
$owned = @{}
$lastSequence = 0
$frequency = [Diagnostics.Stopwatch]::Frequency
$self = [Diagnostics.Process]::GetCurrentProcess()
$selfCreation = $self.StartTime.ToUniversalTime()
$selfIdentity = ([string]$self.Id) + '/' + ([string]$selfCreation.Ticks)
$helloComplete = $false
function ObserverPoint {
    $point = [ordered]@{identity=$selfIdentity; available=$false; totalMs=$null; userMs=$null; privilegedMs=$null; error=$null}
    try {
        $self.Refresh()
        $point.totalMs = $self.TotalProcessorTime.TotalMilliseconds
        $point.userMs = $self.UserProcessorTime.TotalMilliseconds
        $point.privilegedMs = $self.PrivilegedProcessorTime.TotalMilliseconds
        $point.available = $true
    } catch { $point.error = $_.Exception.ToString() }
    return $point
}
function Point($key) {
    $entry = $owned[$key]
    if ($null -eq $entry) { return @{key=$key; available=$false; error='not registered'} }
    $point = [ordered]@{key=$key; identity=$entry.Identity; available=$false; exited=$null; totalMs=$null; userMs=$null; privilegedMs=$null; error=$null}
    try {
        $entry.Process.Refresh()
        $point.exited = $entry.Process.HasExited
        $point.available = $true # identity/exit availability, not a fabricated CPU zero
        if (-not $point.exited) {
            $point.totalMs = $entry.Process.TotalProcessorTime.TotalMilliseconds
            $point.userMs = $entry.Process.UserProcessorTime.TotalMilliseconds
            $point.privilegedMs = $entry.Process.PrivilegedProcessorTime.TotalMilliseconds
        } else { $point.error = 'process exited; terminal CPU unavailable' }
    } catch { $point.error = $_.Exception.ToString() }
    return $point
}
while ($null -ne ($line = [Console]::ReadLine())) {
    $begin = [Diagnostics.Stopwatch]::GetTimestamp()
    $reply = [ordered]@{sequence=$null; ok=$false; frequency=$frequency; ticksStart=$begin; ticksEnd=$null; points=@(); error=$null}
    $stop = $false
    try {
        if ($line.Length -gt 4096) { throw 'command byte cap' }
        $command = $line | ConvertFrom-Json
        $reply.sequence = $command.sequence
        if ($command.sequence -ne ($lastSequence + 1) -or $command.sequence -gt 1000) { throw 'sequence/cap' }
        $lastSequence = $command.sequence
        if (-not $helloComplete -and $command.op -cne 'hello') { throw 'hello required' }
        switch -Exact ($command.op) {
            'hello' {
                if ($helloComplete -or $command.sequence -ne 1) { throw 'hello already attempted' }
                $reply.hello = [ordered]@{protocol='nona-latency615-observer'; version=1; pid=$self.Id; identity=$selfIdentity; creationUtc=$selfCreation.ToString('o'); creationTicks=([string]$selfCreation.Ticks); powershellVersion=$PSVersionTable.PSVersion.ToString()}
                $helloComplete = $true
            }
            'register' {
                if ($owned.Count -ge 6 -or $owned.ContainsKey($command.key) -or $command.key -notmatch '^(nativeA|node|nativeB)\.(harness|server)$') { throw 'ownership key/count' }
                if ($command.pid -le 0 -or $command.before -gt $command.after -or ($command.after - $command.before) -gt 10000) { throw 'spawn bracket' }
                $process = [Diagnostics.Process]::GetProcessById([int]$command.pid)
                try {
                    $handle = $process.Handle # open and retain before consulting creation identity
                    $creation = $process.StartTime.ToUniversalTime()
                    $unixMs = ([DateTimeOffset]$creation).ToUnixTimeMilliseconds()
                    if ($unixMs -lt $command.before -or $unixMs -gt $command.after) { throw 'creation outside owned spawn bracket' }
                    $executable = $process.MainModule.FileName
                    if (-not [String]::Equals($executable, $command.exe, [StringComparison]::OrdinalIgnoreCase)) { throw 'executable mismatch' }
                    $identity = ([string]$command.pid) + '/' + ([string]$creation.Ticks)
                    $owned[$command.key] = @{Process=$process; Handle=$handle; Identity=$identity; Executable=$executable; CreationUtc=$creation.ToString('o')}
                    $reply.points = @((Point $command.key))
                    $reply.identity = $identity
                    $reply.creationUtc = $creation.ToString('o')
                    $reply.executable = $executable
                } catch { $process.Dispose(); throw }
            }
            'sample' {
                if ($command.keys.Count -lt 1 -or $command.keys.Count -gt 2) { throw 'sample bound' }
                $reply.points = @($command.keys | ForEach-Object { Point $_ })
            }
            'terminate' {
                $entry = $owned[$command.key]
                if ($null -eq $entry -or $entry.Identity -cne $command.identity) { throw 'no exact retained ownership' }
                if (-not $entry.Process.HasExited) {
                    $entry.Process.Kill()
                    if (-not $entry.Process.WaitForExit(2000)) { throw 'retained process termination timeout' }
                }
                $reply.points = @((Point $command.key))
            }
            'stop' {
                foreach ($key in $owned.Keys) { if (-not $owned[$key].Process.HasExited) { throw ('owned survivor: ' + $key) } }
                $stop = $true
            }
            default { throw 'unknown command' }
        }
        $reply.ok = $true
    } catch { $reply.error = $_.Exception.ToString() }
    $reply.observer = ObserverPoint
    $reply.ticksEnd = [Diagnostics.Stopwatch]::GetTimestamp()
    [Console]::WriteLine(($reply | ConvertTo-Json -Depth 8 -Compress))
    if ($stop) { foreach ($entry in $owned.Values) { $entry.Process.Dispose() }; $self.Dispose(); exit 0 }
}
# Unexpected EOF cannot assert cleanup success.
foreach ($entry in $owned.Values) { $entry.Process.Dispose() }
$self.Dispose()
exit 1
