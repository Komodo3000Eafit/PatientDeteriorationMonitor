# Builds a Markdown report of agent activity for one branch (one user story),
# from logs/agent-activity/<branch>.jsonl written by log-agent-activity.ps1.
#
# Usage (from the repo root):
#   .\scripts\agent-report.ps1                      # current branch, prints to console
#   .\scripts\agent-report.ps1 -Out specs\003-x\agent-report.md
#   .\scripts\agent-report.ps1 -Branch 003-vitals-history
param(
    [string]$Branch = (git rev-parse --abbrev-ref HEAD),
    [string]$Out
)
$root = (git rev-parse --show-toplevel)
$safeBranch = ($Branch -replace '[\\/:*?"<>| ]', '_')
$logFile = Join-Path $root "logs/agent-activity/$safeBranch.jsonl"
if (-not (Test-Path $logFile)) { Write-Error "No activity log found for branch '$Branch' ($logFile)"; exit 1 }

$events = Get-Content $logFile -Encoding UTF8 | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json }

$lines = @()
$lines += "# Agent activity report: $Branch"
$lines += ""
$lines += "Generated automatically from Claude Code hooks (``logs/agent-activity/$safeBranch.jsonl``). $($events.Count) events recorded."
$lines += ""

$lines += "## Delegations"
$lines += ""
$lines += "| Time (UTC) | From | To | Task |"
$lines += "|---|---|---|---|"
foreach ($d in ($events | Where-Object { $_.action -eq 'delegate' })) {
    $t = ([datetime]$d.timestamp).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')
    $lines += "| $t | $($d.actor) | $($d.target) | $(($d.description -replace '\|','/')) |"
}
$lines += ""

$lines += "## Work per agent"
$lines += ""
$lines += "| Agent | Runs | Files changed | Commands run |"
$lines += "|---|---|---|---|"
foreach ($g in ($events | Group-Object actor)) {
    $runs  = @($g.Group | Where-Object { $_.action -eq 'start' }).Count
    $files = @($g.Group | Where-Object { $_.file -and $_.tool -ne 'Bash' -and $_.tool -ne 'PowerShell' } | Select-Object -ExpandProperty file -Unique)
    $cmds  = @($g.Group | Where-Object { $_.command }).Count
    $fileList = if ($files.Count) { ($files | ForEach-Object { "``$_``" }) -join ', ' } else { '-' }
    $lines += "| $($g.Name) | $runs | $fileList | $cmds |"
}
$lines += ""

$lines += "## Agent results"
$lines += ""
foreach ($f in ($events | Where-Object { $_.action -eq 'finish' })) {
    $t = ([datetime]$f.timestamp).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')
    $summary = (($f.result -split "`n") | Select-Object -First 3) -join ' '
    $lines += "- **$($f.actor)** ($t): $summary"
}

$report = $lines -join "`n"
if ($Out) {
    $report | Set-Content -Path $Out -Encoding UTF8
    Write-Host "Report written to $Out"
} else {
    $report
}
