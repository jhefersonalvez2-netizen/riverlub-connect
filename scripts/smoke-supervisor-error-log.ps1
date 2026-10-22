$ErrorActionPreference = "Stop"

# Check that a Node failure before bootstrap can write an actionable, limited
# error to supervisor.log without any WhatsApp credentials or session.
$exe = (Resolve-Path "src-tauri/target/release/riverlub-connect.exe").Path
$node = (Resolve-Path "vendor/node/node.exe").Path
$testDir = Join-Path $env:RUNNER_TEMP "riverlub-supervisor-failure-smoke"
$fakeAgent = Join-Path $testDir "whatsapp-agent"
$fakeSrc = Join-Path $fakeAgent "src"
New-Item -Path $fakeSrc -ItemType Directory -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fakeSrc "bootstrap.cjs") -Value 'throw new Error("RIVERLUB_SIMULATED_BOOT_FAILURE");' -Encoding Ascii

$env:APPDATA = Join-Path $testDir "roaming"
$env:RIVERLUB_SUPERVISOR_NODE = $node
$env:RIVERLUB_SUPERVISOR_AGENT_DIR = $fakeAgent
$env:RIVERLUB_SUPERVISOR_RUNTIME_ORIGIN = "failure-smoke"
$log = Join-Path $env:APPDATA "RiverLub/whatsapp-agent/logs/supervisor.log"
$proc = Start-Process -FilePath $exe -ArgumentList "--riverlub-supervisor" -PassThru

try {
  $found = $false
  for ($i = 0; $i -lt 48; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Path $log) {
      $contents = Get-Content -LiteralPath $log -Raw
      if ($contents.Contains("RIVERLUB_SIMULATED_BOOT_FAILURE")) {
        $found = $true
        break
      }
    }
    $proc.Refresh()
    if ($proc.HasExited) { break }
  }
  if (-not $found) {
    if (Test-Path $log) { Get-Content -LiteralPath $log -Tail 20 }
    throw "Supervisor did not capture simulated Node startup error."
  }
  $record = Get-Content -LiteralPath $log -Raw
  if (-not $record.Contains("Node runtime=")) {
    throw "Supervisor did not log the runtime path."
  }
  Write-Output "Failure smoke test passed: supervisor.log records spawn and simulated Node stderr."
} finally {
  try { Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:47850/shutdown" -TimeoutSec 3 | Out-Null } catch {}
  $proc.Refresh()
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  }
}
