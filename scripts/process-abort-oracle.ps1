# CI-only Windows oracle; restore the runner's WER settings after the child exits.
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $IsWindows) { throw 'Abort oracle requires isolated Windows GitHub CI' }
$abortWerPath = 'HKCU:\Software\Microsoft\Windows\Windows Error Reporting'
$abortWerExisted = Test-Path -LiteralPath $abortWerPath
$abortWerCreated = $false
$abortWerOriginal = @{}
$abortWerModified = @()
try {
    if (-not $abortWerExisted) { New-Item -Path $abortWerPath -Force | Out-Null; $abortWerCreated = $true }
    foreach ($abortWerName in @('Disabled', 'DontShowUI')) {
        $abortWerOriginal[$abortWerName] = Get-ItemPropertyValue -LiteralPath $abortWerPath -Name $abortWerName -ErrorAction SilentlyContinue
        $abortWerModified += $abortWerName
        New-ItemProperty -LiteralPath $abortWerPath -Name $abortWerName -Value 1 -PropertyType DWord -Force | Out-Null
    }
    node scripts/process-abort-oracle.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Node abort oracle failed' }
} finally {
    foreach ($abortWerName in $abortWerModified) {
        if ($null -eq $abortWerOriginal[$abortWerName]) { Remove-ItemProperty -LiteralPath $abortWerPath -Name $abortWerName -ErrorAction SilentlyContinue }
        else { New-ItemProperty -LiteralPath $abortWerPath -Name $abortWerName -Value $abortWerOriginal[$abortWerName] -PropertyType DWord -Force | Out-Null }
    }
    if ($abortWerCreated) {
        $abortWerRemaining = Get-Item -LiteralPath $abortWerPath
        if ($abortWerRemaining.ValueCount -eq 0 -and $abortWerRemaining.SubKeyCount -eq 0) { Remove-Item -LiteralPath $abortWerPath }
    }
}