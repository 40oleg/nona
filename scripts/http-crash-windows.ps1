param([ValidateSet('setup', 'collect', 'cleanup')][string]$Phase,
      [string]$Output = 'work/http-crash',
      [switch]$Startup602)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Crash collection is restricted to GitHub-hosted runners'
}
$root = [IO.Path]::GetFullPath($Output)
$dumpPath = Join-Path $root 'dumps'
$wer = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps'
$names = @('nona-http.exe', 'node.exe')
New-Item -ItemType Directory -Path $dumpPath -Force | Out-Null
if ($Phase -eq 'setup') {
    foreach ($name in $names) {
        if (Test-Path -LiteralPath "$wer\$name") { throw "Existing WER configuration: $name" }
    }
    $configured = @()
    foreach ($name in $names) {
        $key = "$wer\$name"
        New-Item -Path $key -Force | Out-Null
        $configured += $name
        # Persist ownership before setting values so partial setup is cleaned.
        @{ collector = 'WER LocalDumps'; type = 'full'; perImageCount = 2;
           directory = $dumpPath; names = $configured; configuredAt = [DateTime]::UtcNow } |
            ConvertTo-Json | Set-Content (Join-Path $root 'collector.json')
        New-ItemProperty -Path $key -Name DumpFolder -Value $dumpPath -PropertyType ExpandString -Force | Out-Null
        New-ItemProperty -Path $key -Name DumpType -Value 2 -PropertyType DWord -Force | Out-Null
        New-ItemProperty -Path $key -Name DumpCount -Value 2 -PropertyType DWord -Force | Out-Null
    }
} elseif ($Phase -eq 'cleanup') {
    # Remove only keys this run successfully configured.
    if (Test-Path -LiteralPath (Join-Path $root 'collector.json')) {
        $config = Get-Content -LiteralPath (Join-Path $root 'collector.json') -Raw | ConvertFrom-Json
        foreach ($name in $config.names) {
            if ($name -notin $names) { throw "Unexpected collector key: $name" }
            Remove-Item -LiteralPath "$wer\$name" -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    # A dump can finish writing shortly after the child exits. Waiting is bounded.
    Start-Sleep -Seconds 5
    $dumps = @(Get-ChildItem -LiteralPath $dumpPath -Filter '*.dmp')
    $rows = @()
    $cdb = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Debuggers\x64\cdb.exe'
    foreach ($dump in $dumps) {
        $log = $dump.FullName + '.cdb.txt'
        $row = @{ file = $dump.Name; bytes = $dump.Length;
                  sha256 = (Get-FileHash -LiteralPath $dump.FullName -Algorithm SHA256).Hash;
                  debugger = $cdb; analysis = 'unavailable' }
        if (Test-Path -LiteralPath $cdb) {
            # .exr/.ecxr/r retain the raw exception and fault PC, lm/!peb the
            # actual image load base, kv the best stack available without PDBs.
            $commands = '.exr -1; .ecxr; r; lm; !peb; .symfix; .reload; ln @rip; u @rip-20 L40; kv; !analyze -v; q'
            if ($Startup602) {
                # Startup receipts need raw exceptions/PCs/modules/stacks only.
                # Never display process parameters, environment or command line.
                $commands = '.exr -1; .ecxr; r; lm; ln @rip; u @rip-20 L40; kv; q'
            }
            $debugger = Start-Process -FilePath $cdb -WindowStyle Hidden -PassThru `
                -ArgumentList @('-z', ('"' + $dump.FullName + '"'), '-c', ('"' + $commands + '"')) `
                -RedirectStandardOutput $log -RedirectStandardError ($log + '.stderr')
            if (-not $debugger.WaitForExit(60000)) {
                Stop-Process -Id $debugger.Id -Force
                $debugger.WaitForExit()
                $row.analysis = 'timeout; partial output retained'
            } else { $row.analysis = "exit $($debugger.ExitCode)" }
            $raw = Get-Content -LiteralPath $log -Raw
            if ($raw -match 'rip=([0-9a-fA-F`]+)') { $row.faultPc = $Matches[1] }
            if ($raw -match 'ImageBaseAddress:\s*([0-9a-fA-F`]+)') { $row.loadBase = $Matches[1] }
            if ($Startup602 -and $row.faultPc) {
                $pc = [Convert]::ToUInt64(($row.faultPc -replace '`',''), 16)
                foreach ($module in [regex]::Matches($raw, '(?im)^([0-9a-f`]{8,})\s+([0-9a-f`]{8,})\s+(\S+)')) {
                    $base = [Convert]::ToUInt64(($module.Groups[1].Value -replace '`',''), 16)
                    $end = [Convert]::ToUInt64(($module.Groups[2].Value -replace '`',''), 16)
                    if ($pc -ge $base -and $pc -lt $end) { $row.loadBase = $module.Groups[1].Value; break }
                }
            }
        }
        $rows += $row
    }
    ConvertTo-Json -InputObject $rows -Depth 5 | Set-Content (Join-Path $root 'dump-index.json')
    # Preserve OS fault records even if WER could not produce a full dump.
    Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddHours(-1); Id=1000,1001} `
        -ErrorAction SilentlyContinue | Select-Object TimeCreated, Id, Message |
        ConvertTo-Json -Depth 5 | Set-Content (Join-Path $root 'windows-fault-events.json')
    $faults = @(Get-ChildItem -LiteralPath $root -Directory -Filter 'trial-*' | ForEach-Object {
        $file = Join-Path $_.FullName 'trial.json'
        if (Test-Path -LiteralPath $file) { Get-Content -LiteralPath $file -Raw | ConvertFrom-Json }
    } | Where-Object { $_.verdict -eq 'native-fault' })
    foreach ($fault in $faults) {
        $matching = @($dumps | Where-Object { $_.Name -match "\.$($fault.pid)\.dmp$" })
        if ($matching.Count -eq 0) { throw "Native fault for $($fault.id) PID $($fault.pid) has no retained dump; diagnosis incomplete" }
        if (-not (Test-Path -LiteralPath $cdb)) { throw 'Native fault has dump but no CDB analysis; diagnosis incomplete' }
        $analyses = @($rows | Where-Object { $_.file -in $matching.Name -and $_.analysis -eq 'exit 0' -and $_.faultPc })
        if ($analyses.Count -eq 0) { throw 'Native fault has no completed fault-PC analysis; diagnosis incomplete' }
    }
}
