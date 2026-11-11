# Records agent activity as evidence of multi-agent collaboration.
# Called automatically by Claude Code hooks (see .claude/settings.json).
# Writes one JSON line per event to logs/agent-activity/<branch>.jsonl
# It must never block Claude Code: all errors are swallowed and it always exits 0.
$ErrorActionPreference = 'SilentlyContinue'
try {
    $raw = [Console]::In.ReadToEnd()
    $e = $raw | ConvertFrom-Json

    $root = $env:CLAUDE_PROJECT_DIR
    if (-not $root) { $root = $e.cwd }

    $branch = (git -C $root rev-parse --abbrev-ref HEAD 2>$null)
    if (-not $branch) { $branch = 'no-branch' }
    $safeBranch = ($branch -replace '[\\/:*?"<>| ]', '_')

    $logDir = Join-Path $root 'logs\agent-activity'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $logFile = Join-Path $logDir "$safeBranch.jsonl"

    function Limit([object]$text, [int]$max) {
        if ($null -eq $text) { return $null }
        $s = [string]$text
        if ($s.Length -gt $max) { return $s.Substring(0, $max) + '...' }
        return $s
    }

    $actor = if ($e.agent_type) { [string]$e.agent_type } else { 'main-session' }

    $entry = [ordered]@{
        timestamp  = (Get-Date).ToUniversalTime().ToString('o')
        branch     = $branch
        event      = $e.hook_event_name
        actor      = $actor
        agent_id   = $e.agent_id
        session_id = $e.session_id
    }

    switch ($e.hook_event_name) {
        'PreToolUse' {
            # Fires only for the Agent tool (see matcher): one agent delegating to another
            $entry.action      = 'delegate'
            $entry.target      = $e.tool_input.subagent_type
            $entry.description = $e.tool_input.description
            $entry.prompt      = Limit $e.tool_input.prompt 500
        }
        'SubagentStart' { $entry.action = 'start' }
        'SubagentStop' {
            $entry.action = 'finish'
            $result = $e.last_assistant_message
            $tp = [string]$e.agent_transcript_path
            if ($tp) {
                if ($tp.StartsWith('~')) { $tp = Join-Path $HOME $tp.Substring(1).TrimStart('\', '/') }
                $entry.transcript = $tp
            }
            # Some Claude Code versions don't send last_assistant_message:
            # fall back to the last assistant text in the subagent's transcript.
            if (-not $result -and $tp) {
                for ($i = 0; $i -lt 5 -and -not $result; $i++) {
                    if (Test-Path $tp) {
                        $lines = @(Get-Content -Path $tp -Encoding UTF8)
                        for ($j = $lines.Count - 1; $j -ge 0 -and -not $result; $j--) {
                            try { $msg = $lines[$j] | ConvertFrom-Json } catch { continue }
                            if ($msg.type -ne 'assistant') { continue }
                            $texts = @($msg.message.content | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text })
                            if ($texts.Count -gt 0) { $result = ($texts -join "`n") }
                        }
                    }
                    if (-not $result) { Start-Sleep -Milliseconds 400 }
                }
            }
            $entry.result = Limit $result 800
        }
        'PostToolUse' {
            $entry.action = 'tool'
            $entry.tool   = $e.tool_name
            if ($e.tool_input.file_path) {
                $path = [string]$e.tool_input.file_path
                if ($root -and $path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $path = $path.Substring($root.Length).TrimStart('\', '/')
                }
                $entry.file = $path -replace '\\', '/'
            }
            if ($e.tool_input.command) { $entry.command = Limit $e.tool_input.command 200 }
        }
    }

    ($entry | ConvertTo-Json -Compress -Depth 5) | Add-Content -Path $logFile -Encoding UTF8
} catch { }
exit 0
