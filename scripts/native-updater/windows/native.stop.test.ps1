param([Parameter(Mandatory=$true)][string]$NativeScript, [string]$EvidenceRoot, [string]$StopInvocation, [string]$ExportScenario)
$ErrorActionPreference = 'Stop'
# Static parse plus actual extracted stop body: every process command is intercepted by a fake.
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($NativeScript,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Native source parse failed' }
$modeHelpers=@($ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'NativeDiagnosticMode' },$false))
if ($modeHelpers.Count -ne 1) { throw 'Explicit native diagnostic mode validator missing' }
if ($modeHelpers[0].FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] },$true).Count) { throw 'Mode validator must be pure' }
. ([scriptblock]::Create($modeHelpers[0].Extent.Text))
foreach ($value in @($null,'0','1','','true','false','01',' 1','1 ','2')) {
	$rejected=$false; $mode=$null
	try { $mode=NativeDiagnosticMode $value } catch { $rejected=$true }
	$invalid=($null -ne $value -and $value -cne '0' -and $value -cne '1')
	if ($rejected -ne $invalid) { throw 'Native mode literal contract changed' }
	if (-not $invalid -and $mode -cne $(if ($value -ceq '1') {'diagnostic-only'} else {'acceptance'})) { throw 'Native mode classification changed' }
}
$dispatch=$ast.Find({ param($n) $n -is [Management.Automation.Language.SwitchStatementAst] },$false)
$branch=@($dispatch.Clauses | Where-Object { $_.Item1.Value -eq 'stop' })
if ($branch.Count -ne 1) { throw 'Expected one stop branch' }
$body=$branch[0].Item2
foreach ($command in $body.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] },$true)) {
	if ($command.GetCommandName() -notin @('Processes','Get-Process','Stop-Process','RecordStopComparison')) { throw "Unsafe stop command: $command" }
}
$helper=@($ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'RecordStopComparison' },$false))
if ($helper.Count -gt 1) { throw 'Duplicate diagnostic helper' }
if ($helper.Count -eq 1) {
	foreach ($command in $helper[0].FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] },$true)) {
		if ($command.GetCommandName() -ne 'ConvertTo-Json') { throw "Unsafe diagnostic command: $command" }
	}
	. ([scriptblock]::Create($helper[0].Extent.Text))
}
$stop=[scriptblock]::Create(($body.Statements | ForEach-Object { $_.Extent.Text }) -join "`n")
function AssertEqual($actual,$expected,[string]$label) {
	if ($actual -cne $expected) { throw "$label expected <$expected>, got <$actual>" }
}
function Processes { return @($script:observed) }
function Get-Process([int]$Id,[string]$ErrorAction) {
	AssertEqual $Id $script:observed.pid 'requested fake PID'
	$script:gets++
	return $script:handle
}
function Stop-Process($InputObject,[switch]$Force) {
	if (-not $Force -or -not [Object]::ReferenceEquals($InputObject,$script:handle)) { throw 'Unowned fake handle' }
	$script:stops++
}
Add-Type -TypeDefinition 'public class ThrowingStopModule { public string FileName { get { throw new System.InvalidOperationException("Synthetic module read refusal"); } } }'
$base=$env:TMPDIR
if (-not $base -or -not [IO.Directory]::Exists($base)) { throw 'Task scratch TMPDIR required' }
$fixture=[IO.Path]::Combine($base,('native-stop-' + [Guid]::NewGuid().ToString('N')))
if ($EvidenceRoot) {
	$owned=[IO.Path]::GetFullPath($EvidenceRoot)
	if (-not $owned.StartsWith([IO.Path]::GetFullPath($base).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
		-not [IO.Directory]::Exists($owned) -or $StopInvocation -cnotmatch '^[a-f0-9]{32}$' -or
		$ExportScenario -notin @('equal','plus-one-tick','existing-diagnostic','existing-diagnostic-mismatch')) { throw 'Owned export fixture required' }
	$fixture=[IO.Path]::Combine($owned,'managed-stop')
	if ([IO.Directory]::Exists($fixture)) { throw 'Existing managed fixture refused' }
}
[IO.Directory]::CreateDirectory($fixture) | Out-Null
try {
	$cases=0
	foreach ($scenario in @('equal','plus-one-tick','minus-one-tick','plus-nine-ticks','path-mismatch','before-bound','foreign-path','missing-pid','write-failure','path-read-failure','existing-diagnostic','existing-diagnostic-mismatch','dispose-failure','dispose-failure-mismatch')) {
		$root=[IO.Path]::Combine($fixture,$scenario)
		[IO.Directory]::CreateDirectory($root) | Out-Null
		$script:stopComparisons=$null
		$script:stopComparisonStream=$null
		$script:stopComparisonClaimSent=$false
		$script:observed=[pscustomobject]@{ pid=123; path='C:\owned\wallpaper-picker-ui.exe'; startedUtc='2026-10-07T20:06:45.1619670Z' }
		$time=[DateTime]::Parse($script:observed.startedUtc).ToUniversalTime()
		$script:handle=[pscustomobject]@{ Id=123; StartTime=$time; MainModule=[pscustomobject]@{ FileName=$script:observed.path }; disposed=$false; waited=0 }
		$script:handle | Add-Member ScriptMethod Dispose { $this.disposed=$true }
		$script:handle | Add-Member ScriptMethod WaitForExit { param($ms) $this.waited=$ms; return $true }
		$p=@{ paths=@($script:observed.path); notBeforeUtc='2026-10-07T20:06:00.0000000Z'; stopInvocation=[Guid]::NewGuid().ToString('N') }
		if ($EvidenceRoot) { $p.stopInvocation=$StopInvocation }
		$script:stops=0; $script:gets=0
		if ($scenario -eq 'plus-one-tick') { $script:handle.StartTime=$time.AddTicks(1) }
		if ($scenario -eq 'minus-one-tick') { $script:handle.StartTime=$time.AddTicks(-1) }
		if ($scenario -eq 'plus-nine-ticks') { $script:handle.StartTime=$time.AddTicks(9) }
		if ($scenario -eq 'path-mismatch') { $script:handle.MainModule.FileName='C:\other\wallpaper-picker-ui.exe' }
		if ($scenario -eq 'before-bound') { $p.notBeforeUtc=$time.AddSeconds(1).ToString('o') }
		if ($scenario -eq 'foreign-path') { $p.paths=@('C:\foreign\wallpaper-picker-ui.exe') }
		if ($scenario -eq 'missing-pid') { $script:handle=$null }
		if ($scenario -eq 'write-failure') { $root=[IO.Path]::Combine($root,'missing-directory') }
		if ($scenario -in @('existing-diagnostic','existing-diagnostic-mismatch')) {
			[IO.File]::WriteAllText([IO.Path]::Combine($root,'stop-comparison.json'),$validStale)
			$script:observed.pid=456; $script:handle.Id=456
			if ($scenario -eq 'existing-diagnostic-mismatch') { $script:handle.StartTime=$time.AddTicks(1) }
		}
		$fakeStream=$null
		if ($scenario -in @('dispose-failure','dispose-failure-mismatch')) {
			$fakeStream=[pscustomobject]@{ Position=0; disposed=$false }
			$fakeStream | Add-Member ScriptMethod SetLength { param($length) throw 'Synthetic diagnostic write refusal' }
			$fakeStream | Add-Member ScriptMethod Dispose { $this.disposed=$true; throw 'Synthetic diagnostic dispose refusal' }
			$script:stopComparisonStream=$fakeStream
			if ($scenario -eq 'dispose-failure-mismatch') { $script:handle.StartTime=$time.AddTicks(1) }
		}
		if ($scenario -eq 'path-read-failure') {
			$script:handle.MainModule = New-Object ThrowingStopModule
		}
		$baselineMessage=$null
		# Differential control: the unchanged original expression also receives only the fake handle.
		if ($script:handle) {
			try {
				if ($script:handle.StartTime.ToUniversalTime() -ne [DateTime]::Parse($script:observed.startedUtc).ToUniversalTime() -or
					$script:handle.MainModule.FileName -ine $script:observed.path) {
					throw 'Owned process identity changed before termination'
				}
			} catch { $baselineMessage=$_.Exception.Message }
		}
		$message=$null; $result=$null
		$output=[IO.StringWriter]::new()
		$originalOut=[Console]::Out
		try {
			[Console]::SetOut($output)
			try { $result=& $stop } catch { $message=$_.Exception.Message }
		} finally { [Console]::SetOut($originalOut) }
		$receipt=$output.ToString().Trim(); $output.Dispose()
		if ($EvidenceRoot -and $scenario -eq $ExportScenario) { $exportReceipt=$receipt; $exportError=$message; $exportResult=$result }
		$reject=$scenario -in @('plus-one-tick','minus-one-tick','plus-nine-ticks','path-mismatch','dispose-failure-mismatch','existing-diagnostic-mismatch')
		if ($reject) { AssertEqual $message 'Owned process identity changed before termination' 'exact refusal'; AssertEqual $script:stops 0 'no mismatched termination' }
		elseif ($scenario -in @('equal','write-failure','existing-diagnostic','dispose-failure')) { AssertEqual $message $null 'no diagnostic-induced failure'; AssertEqual $script:stops 1 'equal fake termination'; AssertEqual $script:handle.waited 10000 'unchanged exit bound' }
		elseif ($scenario -eq 'path-read-failure') { AssertEqual $message $baselineMessage 'original module getter refusal'; AssertEqual $script:stops 0 'no unreadable termination' }
		else { AssertEqual $message $null 'ownership skip'; AssertEqual $script:stops 0 'no unowned termination' }
		if ($script:handle -and $script:gets) { AssertEqual $script:handle.disposed $true 'fake handle disposal' }
		if ($fakeStream) { AssertEqual $fakeStream.disposed $true 'diagnostic stream disposal attempted' }
		if ($scenario -in @('existing-diagnostic','existing-diagnostic-mismatch')) {
			AssertEqual ([IO.File]::ReadAllText([IO.Path]::Combine($root,'stop-comparison.json'))) $validStale 'never overwrite/adopt schema-valid unowned diagnostic file'
			AssertEqual $script:stopComparisonStream $null 'no claimed writer handle'
			AssertEqual $receipt '' 'no current claim receipt for stale PID 123 despite attempted PID 456'
		}
		if ($scenario -in @('equal','plus-one-tick','minus-one-tick','plus-nine-ticks','path-mismatch')) {
			$file=[IO.Path]::Combine($root,'stop-comparison.json')
			if (-not [IO.File]::Exists($file)) { throw 'Exact cleanup comparison evidence missing before failure' }
			$evidence=[IO.File]::ReadAllText($file) | ConvertFrom-Json
			AssertEqual $receipt ('WP_STOP_CLAIM:' + $p.stopInvocation) 'current writer receipt before stop return/refusal'
			AssertEqual $evidence.invocation $p.stopInvocation 'exact current invocation binding'
			if ($scenario -eq 'equal') { $validStale=[IO.File]::ReadAllText($file) }
			AssertEqual $evidence.count 1 'bounded sample count'
			foreach ($sample in @($evidence.first,$evidence.latest)) {
				AssertEqual $sample.requestedPid 123 'exact PID operand'
				AssertEqual $sample.handlePid 123 'observed fake handle PID'
				AssertEqual $sample.capturedPath $script:observed.path 'exact captured path operand'
				AssertEqual $sample.handlePath $script:handle.MainModule.FileName 'exact handle path operand'
				AssertEqual $sample.capturedStartedUtc $script:observed.startedUtc 'exact captured UTC text'
				AssertEqual $sample.notBeforeUtc $p.notBeforeUtc 'exact lower time bound'
				AssertEqual $sample.capturedUtcTicks ($time.Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)) 'lossless captured ticks'
				AssertEqual $sample.handleUtcTicks ($script:handle.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)) 'lossless handle ticks'
			}
		}
		$cases++
	}
	if ($EvidenceRoot) {
		if ($exportReceipt) { [Console]::Out.WriteLine($exportReceipt) }
		if ($exportError) { throw $exportError }
		$exportResult | ConvertTo-Json -Depth 12 -Compress
	} else {
		Write-Output "PASS $cases managed stop cases; exact operands; mismatch denies termination; diagnostic write failure preserves semantics"
	}
} finally { if (-not $EvidenceRoot) { [IO.Directory]::Delete($fixture,$true) } }
