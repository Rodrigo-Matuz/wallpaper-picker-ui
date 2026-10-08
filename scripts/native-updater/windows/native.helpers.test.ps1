param(
	[Parameter(Mandatory=$true)][string]$NativeScript,
	[Parameter(Mandatory=$true)][ValidateSet('reflection','properties','nsis')][string]$Scenario
)
$ErrorActionPreference = 'Stop'
# Parse only; never dot-source the driver, its guards, registry, COM or action switch.
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($NativeScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "PowerShell parse failed: $($parseErrors[0])" }
$definitions = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)
foreach ($name in @('ComMethod','ComProperty')) {
	$definition = @($definitions | Where-Object Name -eq $name)
	if ($definition.Count -ne 1) { throw "Expected one helper: $name" }
	# These helpers must perform managed reflection only in this test process.
	$commands = $definition[0].FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] }, $true)
	if ($commands.Count) { throw "Unexpected command in reflection helper: $name" }
	. ([scriptblock]::Create($definition[0].Extent.Text))
}
function AssertEqual($actual, $expected, [string]$label) {
	if ($actual -cne $expected) { throw "$label expected <$expected>, got <$actual>" }
}
if ($Scenario -eq 'nsis') {
	# Execute only the NSIS else block, never the MSI branch or any action switch.
	$dispatch = $ast.Find({ param($node) $node -is [Management.Automation.Language.SwitchStatementAst] }, $false)
	$discover = @($dispatch.Clauses | Where-Object { $_.Item1.Value -eq 'discover' })
	if ($discover.Count -ne 1) { throw 'Expected one discover branch' }
	$choice = $discover[0].Item2.Find({ param($node) $node -is [Management.Automation.Language.IfStatementAst] }, $false)
	$body = $choice.ElseClause
	$allowedCommands = @('Registrations','Where-Object','Join-Path','Test-Path','Sort-Object','NsisRegistrationPath')
	foreach ($command in $body.FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] }, $true)) {
		if ($command.GetCommandName() -notin $allowedCommands) { throw "Unexpected discovery command: $command" }
	}
	$parser = @($definitions | Where-Object Name -eq 'NsisRegistrationPath')
	if ($parser.Count -gt 1) { throw 'Duplicate registration parser' }
	if ($parser.Count -eq 1) {
		if ($parser[0].FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] }, $true).Count) {
			throw 'Registration parser must use pure managed operations only'
		}
		. ([scriptblock]::Create($parser[0].Extent.Text))
	}
	$discovery = [scriptblock]::Create(($body.Statements | ForEach-Object { $_.Extent.Text }) -join "`n")
	# These stubs return captured data/inert path membership; no real registry or filesystem query.
	function Registrations { return $script:registration }
	function Test-Path([string]$LiteralPath, [string]$PathType) {
		AssertEqual $PathType 'Leaf' 'discovery queries files only'
		return $script:existing -icontains $LiteralPath
	}
	$fixture = Join-Path $PSScriptRoot 'fixtures\hosted-nsis-registration-37780157341.json'
	$captured = Get-Content -LiteralPath $fixture -Raw
	$script:registration = $captured | ConvertFrom-Json
	$root = 'D:\a\_temp\native-updater-acceptance\37780157341\nsis'
	$p = @{ kind='nsis' }
	$install = $root + '\install\nsis'
	$exe = $install + '\wallpaper-picker-ui.exe'
	$script:existing = @($exe)
	AssertEqual (& $discovery).path $exe 'captured quoted InstallLocation discovery'
	AssertEqual ($script:registration | ConvertTo-Json -Compress) (($captured | ConvertFrom-Json) | ConvertTo-Json -Compress) 'raw registration preserved'
	foreach ($quoted in @($false,$true)) {
		foreach ($suffix in @('', '\', '\folder with spaces')) {
			$directory = $install + $suffix
			$expected = [IO.Path]::Combine($directory, 'wallpaper-picker-ui.exe')
			$script:registration = $captured | ConvertFrom-Json
			$script:registration.installLocation = $directory
			$script:registration.displayIcon = $expected + ', -1'
			if ($quoted) {
				$script:registration.installLocation = '"' + $directory + '"'
				$script:registration.displayIcon = '"' + $expected + '", 0'
			}
			$script:existing = @($expected)
			AssertEqual (& $discovery).path $expected "quoted=$quoted suffix=$suffix"
		}
	}
	foreach ($only in @('installLocation','displayIcon')) {
		$script:registration = $captured | ConvertFrom-Json
		$script:registration.$only = ''
		$script:existing = @($exe)
		AssertEqual (& $discovery).path $exe "missing $only"
	}
	# Even with a valid other field, malformed/escaping input must not be silently blessed.
	foreach ($field in @('installLocation','displayIcon')) {
		foreach ($invalid in @(
			'install\nsis', 'D:relative', '\root-relative', '"relative"',
			('"' + $install), ($install + '"'), ('""' + $install + '""'),
			('"' + $install + '\"nested"'), ($install + '\bad*path'),
			($install + '\..\..\..\escape'), ($root + '-other\install\nsis'),
			'C:\outside\nsis', '"C:\outside\nsis"', ($install + ':stream'),
			($install + '\bad' + [char]0 + 'path')
		)) {
			$script:registration = $captured | ConvertFrom-Json
			$script:registration.$field = $invalid
			$script:existing = @($exe)
			$rejected = $false
			try { $null = & $discovery } catch { $rejected = $true }
			if (-not $rejected) { throw "Accepted malformed/escaping $field <$invalid>" }
		}
	}
	foreach ($invalidObservation in @('missing-file','duplicate-registration','ambiguous-files')) {
		$script:registration = $captured | ConvertFrom-Json
		$script:existing = @($exe)
		if ($invalidObservation -eq 'missing-file') { $script:existing = @() }
		if ($invalidObservation -eq 'duplicate-registration') { $script:registration = @($script:registration,$script:registration) }
		if ($invalidObservation -eq 'ambiguous-files') {
			$other = $install + '\other\wallpaper-picker-ui.exe'
			$script:registration.displayIcon = '"' + $other + '"'
			$script:existing = @($exe,$other)
		}
		$rejected = $false
		try { $null = & $discovery } catch { $rejected = $true }
		if (-not $rejected) { throw "Accepted $invalidObservation" }
	}
	Write-Output 'PASS NSIS captured pair-quoted registration; valid variants; malformed/outside refusal; uniqueness'
	return
}
# Real CLR InvokeMember with managed targets, not MSI/COM or installed applications.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.CompilerServices;
public class ManagedInstaller {
    public string OpenDatabase(string file, int mode) {
        if (mode != 0) throw new ArgumentException("Not read-only");
        return file;
    }
    [IndexerName("ProductInfo")]
    public string this[string productCode, string property] {
        get { return productCode + "|" + property; }
    }
}
public class ManagedView {
    public string OpenView(string query) { return query; }
    public string Execute() { return "executed"; }
    public string Fetch() { return "record"; }
    public string Close() { return "closed"; }
}
public class ManagedRecord {
    [IndexerName("StringData")]
    public string this[int field] { get { return "field:" + field; } }
}
'@
$installer = New-Object ManagedInstaller
$view = New-Object ManagedView
$record = New-Object ManagedRecord
$file = 'D:\a\_temp\native-updater-acceptance\fixture with spaces\baseline-Wallpaper.Picker.UI_3.6.0_x64_en-US.msi'
if ($Scenario -eq 'reflection') {
	# Control falsifies wrong CLR argument types/array shape before exercising real helpers.
	AssertEqual ($installer.GetType().InvokeMember('OpenDatabase', [Reflection.BindingFlags]::InvokeMethod, $null, $installer, [object[]]@($file,0))) $file 'direct reflection control'
	AssertEqual (ComMethod $installer 'OpenDatabase' @($file,0)) $file 'OpenDatabase two typed arguments'
	AssertEqual (ComMethod $view 'OpenView' @('SELECT `Value` FROM `Property`')) 'SELECT `Value` FROM `Property`' 'OpenView one argument'
	AssertEqual (ComMethod $view 'Execute' @()) 'executed' 'Execute zero arguments'
	AssertEqual (ComMethod $view 'Fetch' @()) 'record' 'Fetch zero arguments'
	AssertEqual (ComMethod $view 'Close' @()) 'closed' 'Close zero arguments'
	Write-Output 'PASS managed reflection: argument values, types and arities'
} else {
	AssertEqual ($record.GetType().InvokeMember('StringData', [Reflection.BindingFlags]::GetProperty, $null, $record, [object[]]@(1))) 'field:1' 'direct property control'
	AssertEqual (ComProperty $record 'StringData' @(1)) 'field:1' 'StringData integer index'
	AssertEqual (ComProperty $installer 'ProductInfo' @('{product}','LocalPackage')) '{product}|LocalPackage' 'ProductInfo two indices'
	Write-Output 'PASS managed properties: integer and two-string indices'
}
