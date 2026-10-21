$ErrorActionPreference = "Stop"

# End-to-end smoke test for the real Rust Supervisor + managed Node agent.
# Uses temporary config, an empty token, and no WhatsApp session.
$exe = (Resolve-Path "src-tauri/target/release/riverlub-connect.exe").Path
$node = (Resolve-Path "vendor/node/node.exe").Path
$agent = (Resolve-Path "vendor/whatsapp-agent").Path
$root = Join-Path $env:RUNNER_TEMP "riverlub-supervisor-smoke"
New-Item -Path $root -ItemType Directory -Force | Out-Null

$env:RIVERLUB_SUPERVISOR_NODE = $node
$env:RIVERLUB_SUPERVISOR_AGENT_DIR = $agent
$env:RIVERLUB_SUPERVISOR_RUNTIME_ORIGIN = "ci-smoke"
$env:RIVERLUB_AGENT_CONFIG_DIR = Join-Path $root "config"
$env:RIVERLUB_AGENT_DATA_PATH = Join-Path $root "session"
$env:RIVERLUB_AGENT_LOG_DIR = Join-Path $root "logs"
$env:RIVERLUB_AGENT_TOKEN = ""
$env:RIVERLUB_AGENT_LOCAL_PORT = "47851"

$proc = Start-Process -FilePath $exe -ArgumentList "--riverlub-supervisor" -PassThru
try {
  $healthy = $false
  $supervisorStatus = $null
  for ($attempt = 0; $attempt -lt 70; $attempt++) {
    Start-Sleep -Milliseconds 250
    $proc.Refresh()
    if ($proc.HasExited) { break }
    try {
      $supervisorStatus = Invoke-RestMethod -Uri "http://127.0.0.1:47850/status" -TimeoutSec 2
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:47851/health" -TimeoutSec 2
      if ($health.instalado -eq $true -and $health.configurado -eq $false -and $supervisorStatus.managedRunning -eq $true) {
        $healthy = $true
        break
      }
    } catch {
      # One or both listeners may still be starting.
    }
  }

  if (-not $healthy) {
    Write-Output ("Supervisor status: " + ($supervisorStatus | ConvertTo-Json -Compress))
    Write-Output ("Supervisor process exited: " + $proc.HasExited)
    if ($proc.HasExited) { Write-Output ("Supervisor exit code: " + $proc.ExitCode) }
    $log = Join-Path $env:RIVERLUB_AGENT_LOG_DIR "agent.log"
    if (Test-Path $log) { Get-Content $log -Tail 15 }
    throw "Supervisor failed to launch managed WhatsApp agent and expose /health."
  }

  Write-Output "Supervisor smoke test passed: managedRunning=true and agent /health installed=true (unconfigured)."
} finally {
  try {
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:47850/shutdown" -TimeoutSec 3 | Out-Null
  } catch {}
  Start-Sleep -Milliseconds 400
  $proc.Refresh()
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}
