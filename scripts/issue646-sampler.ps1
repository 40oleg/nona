param([Parameter(Mandatory = $true)][string]$Output)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
    $env:GITHUB_REPOSITORY -ne '40oleg/nona' -or
    [Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString() -ne 'X64' -or
    -not [OperatingSystem]::IsWindows()) { throw 'Sampler requires GitHub-hosted Windows AMD64' }
$Output = [IO.Path]::GetFullPath($Output)
$report = [ordered]@{
    complete = $false; cleanup = $false; errors = @(); rows = 0; samples = 0
    started = [DateTime]::UtcNow.ToString('o'); pid = $null; creation = $null
    imageSha256 = $null; base = $null; imageSize = $null; targetSha256 = $null
    launchSha256 = $null; samplesSha256 = $null
    method = 'owned-thread AMD64 CONTEXT_CONTROL RIP snapshots; no stacks'
    intervalMs = 100; maxTicks = 1800; maxThreads = 32; maxBytes = 33554432
}
$writer = $null
$ownedProcess = $null
$samplePath = Join-Path $Output 'samples.jsonl'
function Save-Json($Name, $Value) {
    [IO.File]::WriteAllText((Join-Path $Output $Name), ($Value | ConvertTo-Json -Depth 20) + "`n", [Text.UTF8Encoding]::new($false))
}
try {
    # Windows already provides Kernel32. No SDK, debugger, driver or ETW session
    # is installed. Managed allocations/serialization happen outside suspension.
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class Issue646Context {
    // winnt.h AMD64 CONTEXT: 1232 bytes, 16-byte address alignment. Only
    // CONTEXT_CONTROL is requested; the whole backing store is still reserved.
    [StructLayout(LayoutKind.Explicit, Size = 1232)]
    public struct Context {
        [FieldOffset(48)] public uint ContextFlags;
        [FieldOffset(152)] public ulong Rsp;
        [FieldOffset(248)] public ulong Rip;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct FileTime { public uint Low; public uint High; }
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenThread(uint access, bool inherit, uint tid);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint GetProcessIdOfThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint SuspendThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetThreadContext(IntPtr thread, IntPtr context);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetThreadTimes(IntPtr thread, out FileTime creation, out FileTime exit, out FileTime kernel, out FileTime user);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetProcessTimes(IntPtr process, out FileTime creation, out FileTime exit, out FileTime kernel, out FileTime user);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint GetProcessId(IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr handle);
    static Exception Fail(string api) { return new Win32Exception(Marshal.GetLastWin32Error(), api); }
    static ulong Time(FileTime t) { return ((ulong)t.High << 32) | t.Low; }
    public static string Creation(IntPtr process, uint pid) {
        if (GetProcessId(process) != pid) throw new Exception("process handle PID mismatch");
        FileTime c,e,k,u;
        if (!GetProcessTimes(process,out c,out e,out k,out u)) throw Fail("GetProcessTimes");
        return Time(c).ToString();
    }
    public static bool Alive(IntPtr process, uint pid, string creation) {
        if (Creation(process,pid) != creation) throw new Exception("process creation identity mismatch");
        uint wait = WaitForSingleObject(process,0);
        if (wait == 0) return false;
        if (wait != 258) throw Fail("WaitForSingleObject");
        return true;
    }
    public static string[] Capture(IntPtr process, uint pid, string creation, uint tid) {
        if (IntPtr.Size != 8 || Marshal.SizeOf<Context>() != 1232 ||
            Marshal.OffsetOf<Context>("ContextFlags").ToInt32() != 48 ||
            Marshal.OffsetOf<Context>("Rip").ToInt32() != 248)
            throw new Exception("invalid AMD64 CONTEXT layout");
        if (!Alive(process,pid,creation)) throw new Exception("target exited before capture");
        // SUSPEND_RESUME | GET_CONTEXT | QUERY_INFORMATION |
        // QUERY_LIMITED_INFORMATION; no process-wide or foreign suspension.
        IntPtr thread = OpenThread(0x84a,false,tid);
        if (thread == IntPtr.Zero) throw Fail("OpenThread");
        IntPtr allocation = IntPtr.Zero;
        bool suspended = false;
        ulong rip=0; string threadCreation=null;
        Exception failure=null;
        try {
            if (GetProcessIdOfThread(thread) != pid) throw new Exception("foreign/reused thread ID");
            FileTime c,e,k,u;
            if (!GetThreadTimes(thread,out c,out e,out k,out u)) throw Fail("GetThreadTimes");
            threadCreation=Time(c).ToString();
            allocation=Marshal.AllocHGlobal(1232+15);
            IntPtr aligned = new IntPtr((allocation.ToInt64()+15L)&~15L);
            if ((aligned.ToInt64()&15L) != 0) throw new Exception("unaligned CONTEXT");
            Marshal.StructureToPtr(new Context {ContextFlags=0x100001},aligned,false);
            if (!Alive(process,pid,creation)) throw new Exception("target exited before suspension");
            uint previous=SuspendThread(thread);
            if (previous == uint.MaxValue) throw Fail("SuspendThread");
            suspended=true;
            try {
                // Exactly one resume for our successful suspend, including all
                // context errors. Do not drain somebody else's suspend count.
                if (!GetThreadContext(thread,aligned)) throw Fail("GetThreadContext");
                rip=unchecked((ulong)Marshal.ReadInt64(aligned,248));
            } finally {
                uint resumed=ResumeThread(thread);
                suspended=false;
                if (resumed == uint.MaxValue || resumed != previous+1)
                    throw new Exception("ResumeThread failed or unexpected suspend count: " + resumed);
            }
        } catch (Exception e) { failure=e; }
        finally {
            // Fallback only if an exception occurred between successful suspend
            // and its inner finally. Never leave an owned thread suspended.
            if (suspended && ResumeThread(thread) == uint.MaxValue)
                failure=new Exception("cleanup ResumeThread failed",failure);
            if (allocation != IntPtr.Zero) Marshal.FreeHGlobal(allocation);
            if (!CloseHandle(thread)) failure=new Exception("CloseHandle(thread) failed",failure);
        }
        if (failure != null) throw failure;
        return new [] { "0x"+rip.ToString("x"), threadCreation };
    }
}
'@
    Save-Json 'sampler-ready.json' @{ at = [DateTime]::UtcNow.ToString('o'); samplerPid = $PID }
    $targetPath = Join-Path $Output 'target.json'
    $wait = [Diagnostics.Stopwatch]::StartNew()
    while (-not (Test-Path -LiteralPath $targetPath)) {
        if ((Test-Path -LiteralPath (Join-Path $Output 'stop.json')) -or $wait.ElapsedMilliseconds -gt 30000) { throw 'No owned target supplied within 30 seconds' }
        Start-Sleep -Milliseconds 20
    }
    $target = Get-Content -LiteralPath $targetPath -Raw | ConvertFrom-Json
    $report.targetSha256 = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $report.launchSha256 = $target.launchSha256
    if ($target.timeoutMs -ne 180000 -or $target.args.Count -ne 0 -or -not $target.windowsHide) { throw 'Unexpected launch scope' }
    if ($target.imageSha256 -ne '8157abc9333625725348fda654d2e5997693ee6779ae9b5d9ac33f61c3ac5451') { throw 'Unexpected target digest' }
    # spawnSync exposes its child's PID only on return. Discover just this
    # worker's one child, then bind the open process handle and creation time.
    # The final verifier compares the discovered PID to the raw spawnSync PID.
    $discovery = [Diagnostics.Stopwatch]::StartNew()
    $info = $null
    while ($null -eq $info) {
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($target.parentPid)")
        if ($children.Count -gt 1) { throw 'More than one child of native worker' }
        if ($children.Count -eq 1) { $info = $children[0]; break }
        if ($discovery.ElapsedMilliseconds -gt 5000) { throw 'No owned native child found within 5 seconds' }
        Start-Sleep -Milliseconds 50
    }
    $ownedProcess = [Diagnostics.Process]::GetProcessById([int]$info.ProcessId)
    $handle = $ownedProcess.Handle # Keep a handle to this process object, across PID reuse.
    $report.pid = $ownedProcess.Id
    $report.creation = [Issue646Context]::Creation($handle, $report.pid)
    $started = $ownedProcess.StartTime.ToUniversalTime()
    if ([Math]::Abs(($started - [DateTime]::Parse($target.started).ToUniversalTime()).TotalSeconds) -gt 2) { throw 'Process creation outside owned launch window' }
    if ($null -eq $info -or $info.ParentProcessId -ne $target.parentPid) { throw 'Process parent identity mismatch' }
    $module = $ownedProcess.MainModule
    if (-not [string]::Equals([IO.Path]::GetFullPath($module.FileName), [IO.Path]::GetFullPath($target.image), [StringComparison]::OrdinalIgnoreCase)) { throw 'Process executable path mismatch' }
    $report.imageSha256 = (Get-FileHash -LiteralPath $module.FileName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($report.imageSha256 -ne $target.imageSha256) { throw 'Loaded image file digest mismatch' }
    $report.base = '0x' + $module.BaseAddress.ToInt64().ToString('x')
    $report.imageSize = $module.ModuleMemorySize
    Save-Json 'identity.json' @{
        pid = $report.pid; creation = $report.creation; parentPid = $info.ParentProcessId
        image = $module.FileName; base = $report.base; imageSize = $report.imageSize
        commandLine = $info.CommandLine; started = $started.ToString('o'); imageSha256 = $report.imageSha256
        targetSha256 = $report.targetSha256; launchSha256 = $report.launchSha256
    }
    $writer = [IO.StreamWriter]::new($samplePath, $false, [Text.UTF8Encoding]::new($false))
    $writer.NewLine = "`n"
    $writer.AutoFlush = $true
    [long]$bytes = 0
    for ($tick = 0; $tick -lt 1800; $tick++) {
        if (-not [Issue646Context]::Alive($handle, $report.pid, $report.creation)) { break }
        $ownedProcess.Refresh()
        $threads = @($ownedProcess.Threads)
        if ($threads.Count -eq 0 -or $threads.Count -gt 32) { throw 'Owned thread count outside declared bound' }
        $row = [ordered]@{
            at = [DateTime]::UtcNow.ToString('o'); pid = $report.pid; creation = $report.creation
            cpuMs = $ownedProcess.TotalProcessorTime.TotalMilliseconds; rss = $ownedProcess.WorkingSet64
            threads = @()
        }
        foreach ($thread in $threads) {
            $captured = [Issue646Context]::Capture($handle, $report.pid, $report.creation, $thread.Id)
            $row.threads += @{ tid = $thread.Id; creation = $captured[1]; rip = $captured[0] }
        }
        $line = $row | ConvertTo-Json -Depth 8 -Compress
        $bytes += [Text.Encoding]::UTF8.GetByteCount($line) + 1
        if ($bytes -gt 33554432) { throw 'Sample byte bound reached' }
        $writer.WriteLine($line)
        $report.rows++
        $report.samples += $row.threads.Count
        Start-Sleep -Milliseconds 100
    }
    if ([Issue646Context]::Alive($handle, $report.pid, $report.creation)) { throw 'Sampling tick bound reached before native completion' }
    if ($report.samples -eq 0) { throw 'No instruction samples collected' }
    $report.complete = $true
} catch {
    $report.errors += @{ at = [DateTime]::UtcNow.ToString('o'); message = $_.Exception.ToString(); record = ($_ | Out-String) }
} finally {
    try {
        if ($null -ne $writer) { $writer.Dispose() }
        if ($null -ne $ownedProcess) { $ownedProcess.Dispose() }
        if (Test-Path -LiteralPath $samplePath) { $report.samplesSha256 = (Get-FileHash -LiteralPath $samplePath -Algorithm SHA256).Hash.ToLowerInvariant() }
        $report.cleanup = -not ($report.errors | Where-Object { $_.message -match 'ResumeThread|CloseHandle|cleanup' })
    } catch { $report.cleanup = $false; $report.errors += @{ message = $_.Exception.ToString() } }
    $report.finished = [DateTime]::UtcNow.ToString('o')
    Save-Json 'sampler-result.json' $report
}
if (-not $report.complete -or -not $report.cleanup -or $report.errors.Count -gt 0) { exit 1 }
