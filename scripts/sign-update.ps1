# Run after the final NSIS build, as the Windows user who owns this release key.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Version, [switch]$CheckKeyOnly)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($Version -cnotmatch '\A(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\z') { throw 'Expected X.Y.Z.' }
$root = Split-Path $PSScriptRoot -Parent
if ((Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json).version -cne $Version) { throw 'Package version mismatch.' }
$name = "Questlog-Setup-$Version.exe"
$exe = Join-Path (Join-Path $root 'release') $name
$pin = Get-Content -Raw -LiteralPath (Join-Path $root 'desktop\update-key.json') | ConvertFrom-Json
# Never enumerate the key store, generate a replacement, import a key, or export private parameters.
$keyName = 'Questlog.Release.c6e952b6-919c-4c66-968a-5a246b40462f'
$key = [Security.Cryptography.CngKey]::Open($keyName, [Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider,
    [Security.Cryptography.CngKeyOpenOptions]::Silent)
try {
    if ($key.IsMachineKey -or $key.ExportPolicy -ne 'None' -or $key.KeyUsage -ne 'Signing') { throw 'Release key has unexpected custody settings.' }
    $rsa = [Security.Cryptography.RSACng]::new($key)
    try {
        function ToBase64Url([byte[]]$bytes) { [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_') }
        $pub = $rsa.ExportParameters($false)
        if ($rsa.KeySize -ne 3072 -or $pin.kty -cne 'RSA' -or $pin.n -cne (ToBase64Url $pub.Modulus) -or $pin.e -cne (ToBase64Url $pub.Exponent)) {
            throw 'The dedicated signing key does not match the application pin.'
        }
        if ($CheckKeyOnly) { Write-Output 'Dedicated current-user signing key matches the application pin.'; return }
        $inputFile = [IO.File]::Open($exe, 'Open', 'Read', 'Read')
        try {
            $info = [Diagnostics.FileVersionInfo]::GetVersionInfo($exe)
            if ($info.ProductName -cne 'Questlog' -or $info.ProductVersion -cne $Version -or $info.FileVersion -cne $Version) { throw 'Installer product/version mismatch.' }
            if ($inputFile.Length -le 0 -or $inputFile.Length -gt 512MB) { throw 'Installer size outside updater limits.' }
            $hash = [Security.Cryptography.SHA256]::Create()
            try { $hex = [BitConverter]::ToString($hash.ComputeHash($inputFile)).Replace('-','').ToLowerInvariant() } finally { $hash.Dispose() }
            $message = [Text.Encoding]::ASCII.GetBytes("Questlog Windows update v1`n$Version`n$name`n$hex`n")
            $alg = [Security.Cryptography.HashAlgorithmName]::SHA256
            $padding = [Security.Cryptography.RSASignaturePadding]::Pkcs1
            $sig = $rsa.SignData($message, $alg, $padding)
            if (!$rsa.VerifyData($message, $sig, $alg, $padding)) { throw 'Could not verify the new signature.' }
            [IO.File]::WriteAllBytes("$exe.sig", $sig)
            Write-Output "Signed $name (SHA256 $hex). Upload both $name and $name.sig."
        } finally { $inputFile.Dispose() }
    } finally { $rsa.Dispose() }
} finally { $key.Dispose() }
