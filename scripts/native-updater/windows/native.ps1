param(
	[Parameter(Mandatory=$true)][ValidateSet('machine','registrations','msi','discover','install','launch','processes','stop')][string]$Action,
	[Parameter(Mandatory=$true)][string]$Payload
)
$ErrorActionPreference = 'Stop'
# Defense in depth: every native entry point checks the runner and explicit opt-in.
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or
	$env:RUNNER_OS -cne 'Windows' -or $env:WALLPAPER_PICKER_NATIVE_ACCEPTANCE -cne '1') {
	throw 'Native operations refused outside opted-in disposable hosted Windows'
}
function NativeDiagnosticMode($value) {
	if ($null -ne $value -and $value -cne '0' -and $value -cne '1') {
		throw "WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY must be absent, '0' or '1'"
	}
	if ($value -ceq '1') { return 'diagnostic-only' }
	return 'acceptance'
}
# Validate again before decoding paths or making any native query. The TS boundary rejects
# supplied empty values too; Windows may erase an empty environment variable before launch.
$nativeMode = NativeDiagnosticMode $env:WALLPAPER_PICKER_NATIVE_DIAGNOSTIC_ONLY
$p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
$root = [IO.Path]::GetFullPath($p.caseRoot).TrimEnd('\')
$runnerTemp = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
$allowed = [IO.Path]::Combine($runnerTemp, 'native-updater-acceptance').TrimEnd('\') + '\'
if (-not $root.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) {
	throw 'Case root must be strictly inside RUNNER_TEMP/native-updater-acceptance'
}
# Refuse reparse ancestors as well as the leaf: a normal leaf can sit beneath a junction.
$current = $root
while ($true) {
	$item = Get-Item -LiteralPath $current -Force
	if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
		throw 'Reparse/non-directory case-root ancestor refused'
	}
	if ($current.Equals($runnerTemp, [StringComparison]::OrdinalIgnoreCase)) { break }
	$current = [IO.Path]::GetDirectoryName($current)
}


function OwnedFile([string]$file) {
	$full = [IO.Path]::GetFullPath($file)
	if (-not $full.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Artifact outside case root' }
	if ((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse artifact refused' }
	return $full
}
function Registrations {
	$result = @()
	foreach ($base in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
		'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
		'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
		'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
		if (-not (Test-Path $base)) { continue }
		foreach ($key in Get-ChildItem $base) {
			$r = Get-ItemProperty $key.PSPath
			if ($r.DisplayName -match '(?i)wallpaper[ -]picker[ -]ui') {
				$result += [ordered]@{ key=$key.Name; productCode=$key.PSChildName;
					kind=$(if ($r.WindowsInstaller -eq 1) {'msi'} else {'nsis'});
					version=[string]$r.DisplayVersion; installLocation=[string]$r.InstallLocation;
					displayIcon=[string]$r.DisplayIcon; uninstallString=[string]$r.UninstallString }
			}
		}
	}
	return $result
}
# Do not name this parameter $args: PowerShell replaces it with unbound arguments.
function ComMethod($obj, [string]$name, [object[]]$arguments) {
	return $obj.GetType().InvokeMember($name, [Reflection.BindingFlags]::InvokeMethod, $null, $obj, $arguments)
}
function ComProperty($obj, [string]$name, [object[]]$arguments) {
	return $obj.GetType().InvokeMember($name, [Reflection.BindingFlags]::GetProperty, $null, $obj, $arguments)
}
function MsiProperties([string]$file) {
	$installer = New-Object -ComObject WindowsInstaller.Installer
	$db = ComMethod $installer 'OpenDatabase' @($file, 0)
	$result = [ordered]@{}
	foreach ($property in @('ProductCode','UpgradeCode','ProductVersion')) {
		$query = 'SELECT `Value` FROM `Property` WHERE `Property`=' + "'$property'"
		$view = ComMethod $db 'OpenView' @($query)
		$null = ComMethod $view 'Execute' @()
		$record = ComMethod $view 'Fetch' @()
		if (-not $record) { throw "MSI lacks $property" }
		$result[$property] = ComProperty $record 'StringData' @(1)
		$null = ComMethod $view 'Close' @()
	}
	return $result
}
# Tauri's NSIS template writes a single pair of literal quotes around these paths:
# tauri-cli 2.9.6, crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi.
# Decode only that syntax, never Trim('"') or command-line escaping. Keep raw registrations intact.
function NsisRegistrationPath([string]$value, [string]$caseRoot) {
	if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
		$value = $value.Substring(1, $value.Length - 2)
	}
	if ($value -notmatch '^[a-zA-Z]:\\' -or $value.Contains('"') -or
		$value -match '[<>|?*\x00-\x1f]' -or $value.Substring(2).Contains(':')) {
		throw 'Malformed absolute NSIS registration path'
	}
	$full = [IO.Path]::GetFullPath($value)
	$install = [IO.Path]::GetFullPath([IO.Path]::Combine($caseRoot, 'install\nsis')).TrimEnd('\')
	if (-not $full.TrimEnd('\').Equals($install, [StringComparison]::OrdinalIgnoreCase) -and
		-not $full.StartsWith($install + '\', [StringComparison]::OrdinalIgnoreCase)) {
		throw 'NSIS registration path outside owned installation'
	}
	return $full
}
# Managed streaming hash avoids depending on optional cmdlet/module availability.
# Keep identity lowercase SHA-256; unreadable files fail closed, never return a placeholder.
function FileSha256([string]$file) {
	$stream = [IO.File]::OpenRead($file)
	try {
		$hash = [Security.Cryptography.SHA256]::Create()
		try {
			return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
		} finally { $hash.Dispose() }
	} finally { $stream.Dispose() }
}
function Processes {
	$result = @()
	foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name='wallpaper-picker-ui.exe'")) {
		if (-not $process.ExecutablePath) { throw 'Cannot observe app executable path' }
		$file = Get-Item -LiteralPath $process.ExecutablePath
		$result += [ordered]@{ pid=[int]$process.ProcessId; parentPid=[int]$process.ParentProcessId;
			path=$process.ExecutablePath; startedUtc=$process.CreationDate.ToUniversalTime().ToString('o');
			peVersion=$file.VersionInfo.ProductVersion;
			sha256=(FileSha256 $file.FullName) }
	}
	return $result
}

# Keep exact compare values (including decimal ticks as strings) before refusal or termination.
# Only task-owned eligible handles reach this helper. Evidence I/O must not alter stop semantics.
function RecordStopComparison($comparison) {
	try {
		if ($p.stopInvocation -cnotmatch '^[a-f0-9]{32}$') { return }
		# Never truncate a compare operand into a misleading value: mark oversized paths unknown.
		foreach ($field in @('capturedPath','handlePath')) {
			if ($null -ne $comparison[$field] -and $comparison[$field].Length -gt 32768) {
				$comparison[$field + 'Length'] = $comparison[$field].Length
				$comparison[$field] = $null
				$comparison[$field + 'State'] = 'unknown-over-limit'
			}
		}
		if (-not $script:stopComparisons) {
			$script:stopComparisons = [ordered]@{ invocation=$p.stopInvocation; count=0; first=$comparison; latest=$comparison }
		}
		$script:stopComparisons.count = [Math]::Min(1000000, $script:stopComparisons.count + 1)
		$script:stopComparisons.latest = $comparison
		$json = $script:stopComparisons | ConvertTo-Json -Depth 6 -Compress
		if (-not $script:stopComparisonStream) {
			# Claim a new leaf exclusively; never follow/adopt an existing file or reparse target.
			# Retain the exact handle through the stop action so later samples cannot switch files.
			$script:stopComparisonStream = [IO.File]::Open([IO.Path]::Combine($root, 'stop-comparison.json'), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
		}
		$bytes = [Text.Encoding]::UTF8.GetBytes($json)
		$script:stopComparisonStream.Position = 0
		$script:stopComparisonStream.SetLength(0)
		$script:stopComparisonStream.Write($bytes, 0, $bytes.Length)
		$script:stopComparisonStream.Flush()
		if (-not $script:stopComparisonClaimSent) {
			# Out-of-band receipt is not part of the stop result; emitted only by the claimed writer.
			[Console]::Out.WriteLine('WP_STOP_CLAIM:' + $p.stopInvocation)
			$script:stopComparisonClaimSent = $true
		}
	} catch { # Missing/unwritable diagnostic evidence never authorizes termination or masks refusal.
	}
}

$result = switch ($Action) {
	'machine' {
		@{ configBase=[Environment]::GetFolderPath('ApplicationData');
			appData=([IO.Path]::Combine([Environment]::GetFolderPath('ApplicationData'), 'dev.matuz.wallpaper-picker-ui'));
			localData=([IO.Path]::Combine([Environment]::GetFolderPath('LocalApplicationData'), 'dev.matuz.wallpaper-picker-ui')) }
	}
	'registrations' { @{ registrations=@(Registrations) } }
	'msi' { MsiProperties (OwnedFile $p.artifactPath) }
	'discover' {
		if ($p.kind -eq 'msi') {
			$installer = New-Object -ComObject WindowsInstaller.Installer
			$local = ComProperty $installer 'ProductInfo' @($p.productCode, 'LocalPackage')
			$db = ComMethod $installer 'OpenDatabase' @($local, 0)
			$query = 'SELECT `File`.`FileName`, `Component`.`ComponentId` FROM `File`, `Component` WHERE `File`.`Component_` = `Component`.`Component`'
			$view = ComMethod $db 'OpenView' @($query)
			$null = ComMethod $view 'Execute' @()
			$paths = @()
			while ($record = ComMethod $view 'Fetch' @()) {
				$name = ComProperty $record 'StringData' @(1)
				if ($name -match '(^|\|)wallpaper-picker-ui\.exe$') {
					$guid = ComProperty $record 'StringData' @(2)
					$paths += ComProperty $installer 'ComponentPath' @($p.productCode, $guid)
				}
			}
			$null = ComMethod $view 'Close' @()
			if ($paths.Count -ne 1 -or -not (Test-Path -LiteralPath $paths[0] -PathType Leaf)) { throw 'MSI main executable cannot be uniquely observed' }
			@{ path=$paths[0]; installedMsi=(MsiProperties $local) }
		} else {
			$r = @(Registrations | Where-Object { $_.kind -eq 'nsis' })
			if ($r.Count -ne 1) { throw 'NSIS registration not unique' }
			$candidates = @()
			if ($r[0].installLocation) {
				$location = NsisRegistrationPath $r[0].installLocation $root
				$candidates += [IO.Path]::Combine($location, 'wallpaper-picker-ui.exe')
			}
			$icon = $r[0].displayIcon -replace ',\s*-?\d+$',''
			if ($icon) {
				$icon = NsisRegistrationPath $icon $root
				if ([IO.Path]::GetFileName($icon) -ieq 'wallpaper-picker-ui.exe') { $candidates += $icon }
			}
			$paths = @($candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Sort-Object -Unique)
			if ($paths.Count -ne 1) { throw 'NSIS main executable cannot be uniquely observed from registration' }
			@{ path=$paths[0] }
		}
	}
	'install' {
		$file = OwnedFile $p.artifactPath
		if ($p.kind -eq 'msi') {
			$log = Join-Path $root 'baseline-msi.log'
			# main.wxs tests property presence, not Boolean text: False would launch the app.
			# Omit AUTOLAUNCHAPP for baseline setup; only the later updater owns auto-relaunch.
			$child = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" -ArgumentList @('/i', ('"' + $file + '"'), '/qn', '/norestart', '/L*v', ('"' + $log + '"')) -PassThru
		} else {
			$dir = Join-Path $root 'install\nsis'
			# NSIS /D must be the final unquoted argument, per NSIS command-line contract.
			$child = Start-Process -FilePath $file -ArgumentList "/S /D=$dir" -PassThru
		}
		if (-not $child.WaitForExit(180000)) { $child.Kill(); throw 'Owned baseline installer timeout' }
		if ($child.ExitCode -ne 0) { throw "Baseline installer failed with exit $($child.ExitCode)" }
		@{ exitCode=$child.ExitCode; installerPid=$child.Id }
	}
	'launch' {
		if ([IO.Path]::GetFileName($p.exe) -ine 'wallpaper-picker-ui.exe') { throw 'Unexpected application binary' }
		$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$($p.port) --remote-debugging-address=127.0.0.1"
		$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $root 'webview2'
		# Inherited by ShellExecute/installer auto-relaunch; no manual second launch is allowed.
		$child = Start-Process -FilePath $p.exe -PassThru
		@{ pid=$child.Id; launchUtc=[DateTime]::UtcNow.ToString('o') }
	}
	'processes' { @{ processes=@(Processes) } }
	'stop' {
		$stopped = @()
		try {
			foreach ($process in @(Processes)) {
				if (@($p.paths) -icontains $process.path -and
					[DateTime]::Parse($process.startedUtc) -ge [DateTime]::Parse($p.notBeforeUtc)) {
					# Revalidate PID reuse against the process object immediately before termination.
					$handle = Get-Process -Id $process.pid -ErrorAction SilentlyContinue
					if (-not $handle) { continue }
					try {
						$handleStart = $handle.StartTime
						$handleStartedUtc = $handleStart.ToUniversalTime()
						$capturedStart = [DateTime]::Parse($process.startedUtc)
						$capturedStartedUtc = $capturedStart.ToUniversalTime()
						$comparison = [ordered]@{
							requestedPid=$process.pid; handlePid=$handle.Id;
							capturedPath=$process.path; handlePath=$null; handlePathState='unknown';
							capturedStartedUtc=$process.startedUtc; notBeforeUtc=$p.notBeforeUtc;
							handleStartText=$handleStart.ToString('o'); handleStartKind=$handleStart.Kind.ToString();
							capturedParsedText=$capturedStart.ToString('o'); capturedParsedKind=$capturedStart.Kind.ToString();
							handleUtcText=$handleStartedUtc.ToString('o'); capturedUtcText=$capturedStartedUtc.ToString('o');
							handleUtcTicks=$handleStartedUtc.Ticks.ToString([Globalization.CultureInfo]::InvariantCulture);
							capturedUtcTicks=$capturedStartedUtc.Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
						}
						$handlePath = $null
						try {
							$handlePath = $handle.MainModule.FileName
							$comparison.handlePath = $handlePath
							$comparison.handlePathState = 'observed'
						} catch {
							RecordStopComparison $comparison
							# Preserve the original short-circuit: time mismatch refuses without requiring path access.
							if ($handleStartedUtc -eq $capturedStartedUtc) { throw }
						}
						RecordStopComparison $comparison
						# Identical exact DateTime/path comparisons; no tolerance, rounding or normalization.
						if ($handleStartedUtc -ne $capturedStartedUtc -or $handlePath -ine $process.path) {
							throw 'Owned process identity changed before termination'
						}
						Stop-Process -InputObject $handle -Force
						if (-not $handle.WaitForExit(10000)) { throw 'Owned process termination timeout' }
						$stopped += $process
					} finally { $handle.Dispose() }
				}
			}
		} finally {
			if ($script:stopComparisonStream) {
				try { $script:stopComparisonStream.Dispose() } catch { # Never mask stop refusal with diagnostic I/O.
				} finally { $script:stopComparisonStream = $null }
			}
		}
		@{ stopped=$stopped }
	}
}
$result | ConvertTo-Json -Depth 12 -Compress
