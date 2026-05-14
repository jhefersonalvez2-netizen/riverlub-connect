!macro RIVERLUB_KILL_RUNTIME
  DetailPrint "Encerrando RiverLub Connect e runtime local..."
  nsExec::ExecToLog `taskkill.exe /F /T /IM "${MAINBINARYNAME}.exe"`
  nsExec::ExecToLog `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$$nodePath = '$INSTDIR\runtime\node\node.exe'; Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { try { if ($$_.Path -eq $$nodePath) { & taskkill.exe /PID $$_.Id /T /F | Out-Null; Stop-Process -Id $$_.Id -Force -ErrorAction SilentlyContinue } } catch {} }"`
  Sleep 1200
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
