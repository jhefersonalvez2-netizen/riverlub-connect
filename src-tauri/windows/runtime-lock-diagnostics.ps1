param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir
)

$ErrorActionPreference = 'SilentlyContinue'

$logRoot = Join-Path $env:APPDATA 'RiverLub'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$logPath = Join-Path $logRoot 'connect-installer.log'

function Write-InstallLog([string]$Message) {
  $line = "{0:o} {1}" -f [DateTime]::UtcNow, $Message
  Add-Content -Path $logPath -Value $line -Encoding UTF8
  Write-Output $Message
}

$legacyRuntimeFiles = @(
  (Join-Path $InstallDir 'runtime\node\node.exe'),
  (Join-Path $InstallDir 'runtime\0.4.0\node\node.exe')
)
$currentRuntimeFile = Join-Path $InstallDir 'runtime\0.4.1\node\node.exe'
$knownNodeFiles = @($legacyRuntimeFiles + $currentRuntimeFile)

Write-InstallLog "Preparando upgrade do RiverLub Connect em $InstallDir"

Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $processPath = $_.Path
    if ($processPath -and ($knownNodeFiles -contains $processPath)) {
      Write-InstallLog "Encerrando runtime RiverLub PID=$($_.Id) path=$processPath"
      & taskkill.exe /PID $_.Id /T /F | Out-Null
    }
  } catch {
    Write-InstallLog "Falha ao inspecionar Node PID=$($_.Id): $($_.Exception.Message)"
  }
}

$sessionPath = [IO.Path]::Combine($env:APPDATA, 'RiverLub\whatsapp-agent\session\session-riverlub-local-agent')
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and
  $_.CommandLine -and
  $_.CommandLine.ToLowerInvariant().Contains($sessionPath.ToLowerInvariant())
} | ForEach-Object {
  Write-InstallLog "Encerrando navegador da sessao RiverLub PID=$($_.ProcessId)"
  & taskkill.exe /PID $_.ProcessId /T /F | Out-Null
}

Start-Sleep -Milliseconds 500

$restartManagerSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class RiverLubRestartManager
{
    private const int ERROR_MORE_DATA = 234;
    private const int CCH_RM_MAX_APP_NAME = 255;
    private const int CCH_RM_MAX_SVC_NAME = 63;

    [StructLayout(LayoutKind.Sequential)]
    private struct RM_UNIQUE_PROCESS
    {
        public int dwProcessId;
        public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
    }

    private enum RM_APP_TYPE
    {
        RmUnknownApp = 0,
        RmMainWindow = 1,
        RmOtherWindow = 2,
        RmService = 3,
        RmExplorer = 4,
        RmConsole = 5,
        RmCritical = 1000
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct RM_PROCESS_INFO
    {
        public RM_UNIQUE_PROCESS Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)]
        public string strAppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)]
        public string strServiceShortName;
        public RM_APP_TYPE ApplicationType;
        public uint AppStatus;
        public uint TSSessionId;
        [MarshalAs(UnmanagedType.Bool)]
        public bool bRestartable;
    }

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, StringBuilder strSessionKey);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmRegisterResources(
        uint pSessionHandle,
        uint nFiles,
        string[] rgsFilenames,
        uint nApplications,
        RM_UNIQUE_PROCESS[] rgApplications,
        uint nServices,
        string[] rgsServiceNames);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmGetList(
        uint dwSessionHandle,
        out uint pnProcInfoNeeded,
        ref uint pnProcInfo,
        [In, Out] RM_PROCESS_INFO[] rgAffectedApps,
        ref uint lpdwRebootReasons);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmEndSession(uint pSessionHandle);

    public static string[] GetLockingProcesses(string path)
    {
        uint handle;
        var key = new StringBuilder(33);
        var startResult = RmStartSession(out handle, 0, key);
        if (startResult != 0)
            return new[] { "RestartManager/RmStartSession=" + startResult };

        try
        {
            var registerResult = RmRegisterResources(handle, 1, new[] { path }, 0, null, 0, null);
            if (registerResult != 0)
                return new[] { "RestartManager/RmRegisterResources=" + registerResult };

            uint needed = 0;
            uint count = 0;
            uint reasons = 0;
            var listResult = RmGetList(handle, out needed, ref count, null, ref reasons);
            if (listResult == 0)
                return new string[0];
            if (listResult != ERROR_MORE_DATA)
                return new[] { "RestartManager/RmGetList=" + listResult };

            var infos = new RM_PROCESS_INFO[needed];
            count = needed;
            listResult = RmGetList(handle, out needed, ref count, infos, ref reasons);
            if (listResult != 0)
                return new[] { "RestartManager/RmGetList=" + listResult };

            var result = new List<string>();
            for (var i = 0; i < count; i++)
            {
                result.Add("PID=" + infos[i].Process.dwProcessId + " APP=" + infos[i].strAppName + " TYPE=" + infos[i].ApplicationType);
            }
            return result.ToArray();
        }
        finally
        {
            RmEndSession(handle);
        }
    }
}
'@

try {
  Add-Type -TypeDefinition $restartManagerSource -Language CSharp -ErrorAction Stop
  foreach ($file in $legacyRuntimeFiles) {
    if (-not (Test-Path $file)) { continue }
    $owners = [RiverLubRestartManager]::GetLockingProcesses($file)
    if ($owners.Count -eq 0) {
      Write-InstallLog "Runtime legado livre: $file"
    } else {
      foreach ($owner in $owners) {
        Write-InstallLog "Bloqueio legado detectado: $file -> $owner"
      }
      Write-InstallLog "O bloqueio legado nao impede a 0.4.1 porque o novo runtime usa um diretorio versionado independente."
    }
  }
} catch {
  Write-InstallLog "Restart Manager indisponivel para diagnostico: $($_.Exception.Message)"
}

Write-InstallLog 'Preparacao do upgrade concluida.'
exit 0
