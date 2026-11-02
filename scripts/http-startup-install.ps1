# This child does not inherit the Actions pwsh runscript's error preference.
$ErrorActionPreference = 'Stop'
$cdb = "${env:ProgramFiles(x86)}\Windows Kits\10\Debuggers\x64\cdb.exe"
if (-not (Test-Path -LiteralPath $cdb)) {
    Invoke-WebRequest 'https://go.microsoft.com/fwlink/?linkid=2196241' -OutFile work/http-startup/winsdksetup.exe
    $installer = Start-Process -FilePath work/http-startup/winsdksetup.exe -WindowStyle Hidden -ArgumentList '/features OptionId.WindowsDesktopDebuggers /quiet /norestart' -PassThru
    try {
        if (-not $installer.WaitForExit(420000)) { throw 'SDK installation timed out' }
        if ($installer.ExitCode -notin @(0,3010)) { throw "SDK installation failed: $($installer.ExitCode)" }
    } finally { if (-not $installer.HasExited) { Stop-Process -Id $installer.Id -Force } }
}
# Missing debugger is recorded by the bounded inspector; it is
# incomplete evidence and never a sampled-stack claim.
