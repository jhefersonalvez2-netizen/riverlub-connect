$ErrorActionPreference = "Stop"

# Prove that the exact Node runtime and dependencies bundled in the installer can
# boot the local HTTP server. Use an isolated config with NO credentials/session.
$nodeExe = (Resolve-Path "vendor/node/node.exe").Path
$agentDir = (Resolve-Path "vendor/whatsapp-agent").Path
$tempRoot = Join-Path $env:RUNNER_TEMP "riverlub-agent-smoke"
New-Item -Path $tempRoot -ItemType Directory -Force | Out-Null

$env:RIVERLUB_AGENT_CONFIG_DIR = $tempRoot
$env:RIVERLUB_AGENT_LOG_DIR = Join-Path $tempRoot "logs"
$env:RIVERLUB_AGENT_DATA_PATH = Join-Path $tempRoot "session"
$env:RIVERLUB_AGENT_TOKEN = ""

$stdout = Join-Path $tempRoot "stdout.log"
$stderr = Join-Path $tempRoot "stderr.log"
$process = Start-Process -FilePath $nodeExe -ArgumentList "src/bootstrap.cjs" -WorkingDirectory $agentDir -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

try {
  $healthy = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    $process.Refresh()
    if ($process.HasExited) { break }
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:47851/health" -Method GET -TimeoutSec 2
      if ($response.instalado -eq $true -and $response.configurado -eq $false) {
        $healthy = $true
        break
      }
    } catch {
      # The listener may still be starting.
    }
  }

  if (-not $healthy) {
    if (Test-Path $stderr) { Get-Content $stderr -Tail 20 }
    $agentLog = Join-Path $tempRoot "logs/agent.log"
    if (Test-Path $agentLog) { Get-Content $agentLog -Tail 20 }
    throw "WhatsApp agent failed to start or did not expose the expected /health response."
  }
  Write-Output "WhatsApp agent startup smoke test passed: /health returned installed=true, configured=false."
} finally {
  $process.Refresh()
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
}
