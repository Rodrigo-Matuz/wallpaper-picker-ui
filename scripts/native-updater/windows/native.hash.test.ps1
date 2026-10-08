param(
	[Parameter(Mandatory=$true)][string]$NativeScript,
	[Parameter(Mandatory=$true)][string]$FixtureManifest
)
$ErrorActionPreference = 'Stop'
# Parse, then execute only the real process-hash value seam and its managed helper.
# No process enumeration, driver guard/action switch, COM, registry or installer runs.
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($NativeScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "PowerShell parse failed: $($parseErrors[0])" }
$processes = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Processes' }, $false)
$hashes = @($processes.FindAll({ param($node) $node -is [Management.Automation.Language.HashtableAst] }, $true) | ForEach-Object {
	foreach ($pair in $_.KeyValuePairs) { if ($pair.Item1.Value -eq 'sha256') { $pair.Item2 } }
})
if ($hashes.Count -ne 1) { throw 'Expected one process identity hash seam' }
foreach ($command in $hashes[0].FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] }, $true)) {
	if ($command.GetCommandName() -notin @('Get-FileHash','FileSha256')) { throw "Unexpected hash command: $command" }
}
$helper = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'FileSha256' }, $false))
if ($helper.Count -gt 1) { throw 'Duplicate hash helper' }
$definitions = ''
if ($helper.Count -eq 1) {
	if ($helper[0].FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] }, $true).Count) {
		throw 'Hash helper must use managed operations only'
	}
	$definitions = $helper[0].Extent.Text
}
$fixtures = Get-Content -LiteralPath $FixtureManifest -Raw | ConvertFrom-Json
# A fresh core-only runspace with autoload disabled makes Get-FileHash truly unavailable.
$state = [Management.Automation.Runspaces.InitialSessionState]::CreateDefault2()
$state.Variables.Add([Management.Automation.Runspaces.SessionStateVariableEntry]::new('PSModuleAutoloadingPreference','None','test isolation'))
$space = [Management.Automation.Runspaces.RunspaceFactory]::CreateRunspace($state)
$space.Open()
$ps = [Management.Automation.PowerShell]::Create()
$ps.Runspace = $space
try {
	$null = $ps.AddScript('try { Get-FileHash -LiteralPath "never-opened" -Algorithm SHA256 } catch { $_ }')
	$control = $ps.Invoke()
	if ($control.Count -ne 1 -or $control[0].Exception -isnot [Management.Automation.CommandNotFoundException]) {
		throw 'Control failed: Get-FileHash must be unavailable'
	}
	Write-Output 'CONTROL Get-FileHash is unavailable: CommandNotFoundException'
	$code = 'param([string]$path); $ErrorActionPreference = "Stop"; $file = [pscustomobject]@{FullName=$path}; ' + $definitions + "`ntry { " + '$value = & { ' + $hashes[0].Extent.Text + ' }; [pscustomobject]@{hash=$value;error=$null} } catch { [pscustomobject]@{hash=$null;error=$_.Exception.GetType().FullName} }'
	foreach ($fixture in $fixtures) {
		$ps.Commands.Clear(); $ps.Streams.Error.Clear()
		$null = $ps.AddScript($code).AddArgument($fixture.path)
		$result = $ps.Invoke()
		if ($ps.HadErrors -or $result[0].error) { throw "Process hash seam failed: $($result[0].error) $($ps.Streams.Error[0])" }
		if ($result.Count -ne 1 -or [string]$result[0].hash -cne $fixture.sha256) { throw "Hash identity mismatch: $($fixture.path)" }
		# A leaked read handle would block this exclusive reopen on Windows.
		$exclusive = [IO.File]::Open($fixture.path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
		$exclusive.Dispose()
	}
	foreach ($path in @(($fixtures[0].path + '.missing'), [IO.Path]::GetDirectoryName($fixtures[0].path))) {
		$ps.Commands.Clear(); $ps.Streams.Error.Clear()
		$null = $ps.AddScript($code).AddArgument($path)
		$result = $ps.Invoke()
		if (-not $result[0].error -or $result[0].hash) { throw "Unreadable file must fail closed: $path" }
	}
	$locked = [IO.File]::Open($fixtures[0].path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
	try {
		$ps.Commands.Clear(); $ps.Streams.Error.Clear()
		$null = $ps.AddScript($code).AddArgument($fixtures[0].path)
		$result = $ps.Invoke()
		if (-not $result[0].error -or $result[0].hash) { throw 'Locked file must fail closed' }
	} finally { $locked.Dispose() }
	$ps.Commands.Clear(); $ps.Streams.Error.Clear()
	$null = $ps.AddScript($code).AddArgument($fixtures[0].path)
	$result = $ps.Invoke()
	if ($ps.HadErrors -or $result[0].error -or [string]$result[0].hash -cne $fixtures[0].sha256) { throw 'Hash must recover after read error' }
	Write-Output 'PASS cmdlet-unavailable process hash seam; exact digests; exclusive reopen; errors propagate'
} finally { $ps.Dispose(); $space.Dispose() }
