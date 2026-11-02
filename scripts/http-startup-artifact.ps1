param([ValidateSet('inventory','extract')][string]$Phase,
      [string]$Output = 'work/http-startup')
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
    $env:RUNNER_OS -ne 'Windows' -or $env:GITHUB_REPOSITORY -ne '40oleg/nona' -or
    $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or $env:STARTUP_MODE -ne 'startup-602' -or
    $env:GITHUB_SHA -ne $env:STARTUP_EXPECTED_SHA -or $env:GITHUB_REF -notmatch '^refs/heads/issue-602-startup-[a-zA-Z0-9._-]+$') {
    throw 'Hosted startup artifact access only'
}
$root = [IO.Path]::GetFullPath($Output)
$workspace = [IO.Path]::GetFullPath($env:GITHUB_WORKSPACE).TrimEnd('\') + '\'
if (-not $root.StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output outside workspace' }
$zipPath = Join-Path $root 'retained.zip'
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($Phase -eq 'inventory') {
        @($zip.Entries | ForEach-Object {
            @{ path=$_.FullName; bytes=$_.Length; attributes=$_.ExternalAttributes }
        }) | ConvertTo-Json -Depth 4 -Compress
    } else {
        # The Node caller has validated EVERY inventory path, size and mode,
        # including case-insensitive collisions and Unix symlinks. ZIP hash is
        # rechecked here to prevent extracting a different archive.
        if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne
            '2e60c99f112f3140b9da9ae91e48add5b948b178f0fb82be88a9eeadc423327e') { throw 'ZIP changed' }
        $allowed = @(Get-Content -LiteralPath (Join-Path $root 'zip-inventory.json') -Raw | ConvertFrom-Json)
        if ($allowed.Count -ne $zip.Entries.Count) { throw 'ZIP inventory changed' }
        $destination = (Join-Path $root 'retained') + '\'
        if (Test-Path -LiteralPath $destination) { throw 'Refuse to overwrite retained evidence' }
        New-Item -ItemType Directory -Path $destination | Out-Null
        for ($i=0; $i -lt $zip.Entries.Count; $i++) {
            $entry=$zip.Entries[$i]
            if ($entry.FullName -cne $allowed[$i].path -or $entry.Length -ne $allowed[$i].bytes -or
                $entry.ExternalAttributes -ne $allowed[$i].attributes) { throw 'ZIP entry changed' }
            $target=[IO.Path]::GetFullPath((Join-Path $destination $entry.FullName))
            if (-not $target.StartsWith($destination,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe ZIP target' }
            if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            $inputStream=$entry.Open()
            $outputStream=[IO.File]::Open($target,[IO.FileMode]::CreateNew)
            try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }
        }
    }
} finally { $zip.Dispose() }
