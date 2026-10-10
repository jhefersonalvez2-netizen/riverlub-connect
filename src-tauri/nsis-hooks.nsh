!macro RIVERLUB_KILL_RUNTIME
  DetailPrint "Encerrando RiverLub Connect, supervisor e runtime local..."
  nsExec::ExecToLog `taskkill.exe /F /T /IM "${MAINBINARYNAME}.exe"`
  Sleep 800

  nsExec::ExecToStack `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$$nodePath = '$INSTDIR\runtime\node\node.exe'; $$sessionPath = [IO.Path]::Combine($$env:APPDATA, 'RiverLub\whatsapp-agent\session\session-riverlub-local-agent'); Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { try { if ($$_.Path -eq $$nodePath) { & taskkill.exe /PID $$_.Id /T /F | Out-Null } } catch {} }; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ($$_.Name -eq 'chrome.exe' -or $$_.Name -eq 'msedge.exe') -and $$_.CommandLine -and $$_.CommandLine.ToLowerInvariant().Contains($$sessionPath.ToLowerInvariant()) } | ForEach-Object { & taskkill.exe /PID $$_.ProcessId /T /F | Out-Null }; $$deadline = [DateTime]::UtcNow.AddSeconds(15); while ([DateTime]::UtcNow -lt $$deadline) { if (-not (Test-Path $$nodePath)) { exit 0 }; try { $$fs = [IO.File]::Open($$nodePath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None); $$fs.Close(); exit 0 } catch { Start-Sleep -Milliseconds 250 } }; exit 42"`
  Pop $0
  Pop $1
  IntCmp $0 0 riverlub_runtime_ready riverlub_runtime_blocked riverlub_runtime_blocked

  riverlub_runtime_blocked:
    MessageBox MB_ICONSTOP|MB_OK "O RiverLub Connect ainda possui um processo local em uso. A instalacao foi interrompida para evitar arquivos de versoes diferentes. Feche o aplicativo pelo Gerenciador de Tarefas ou reinicie o Windows e tente novamente."
    Abort

  riverlub_runtime_ready:
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro RIVERLUB_KILL_RUNTIME
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\riverlub-connect" "" "URL:RiverLub Connect"
  WriteRegStr HKCU "Software\Classes\riverlub-connect" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\riverlub-connect\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\riverlub-connect\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro RIVERLUB_KILL_RUNTIME
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\riverlub-connect"
!macroend
