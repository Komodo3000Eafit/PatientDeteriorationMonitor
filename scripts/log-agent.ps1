# Appends one row to the agent activity log (CSV) — evidence of multi-agent collaboration.
#
# The log for a story lives in specs/<feature>/agent-log.csv, where <feature> is the
# current git branch (Spec Kit names branches and spec folders the same way).
# Outside a story branch, rows go to logs/agent-log.csv.
#
# Usage (agents call it like this):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/log-agent.ps1 -Agent backend-dev -Task T001 -Action done -Details "Created POST /vitals"
param(
    [Parameter(Mandatory = $true)][string]$Agent,
    [Parameter(Mandatory = $true)][string]$Task,
    [Parameter(Mandatory = $true)]
    [ValidateSet('assigned', 'started', 'done', 'failed', 'finding', 'verified', 'rework')]
    [string]$Action,
    [string]$Details = '',
    [string]$Story = ''
)

$root = (git rev-parse --show-toplevel 2>$null)
if (-not $root) { $root = (Get-Location).Path }
$branch = (git branch --show-current 2>$null)
if (-not $Story) { $Story = $branch }

$specDir = Join-Path $root "specs/$Story"
if ($Story -and (Test-Path $specDir)) {
    $logFile = Join-Path $specDir 'agent-log.csv'
} else {
    $logDir = Join-Path $root 'logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $logFile = Join-Path $logDir 'agent-log.csv'
}

$row = [pscustomobject]@{
    Timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    Story     = $Story
    Agent     = $Agent
    Task      = $Task
    Action    = $Action
    Details   = ($Details -replace '\r?\n', ' ')
}
$row | Export-Csv -Path $logFile -Append -NoTypeInformation -Encoding UTF8
Write-Output "Logged: $($row.Timestamp) | $Agent | $Task | $Action -> $logFile"
