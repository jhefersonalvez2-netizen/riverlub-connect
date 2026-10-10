!macro RIVERLUB_KILL_RUNTIME
  DetailPrint "Encerrando RiverLub Connect e runtime legado..."
  nsExec::ExecToLog `taskkill.exe /F /T /IM "${MAINBINARYNAME}.exe"`
  nsExec::ExecToStack `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$$nodePath = '$INSTDIR\runtime\node\node.exe'; $$deadline = (Get-Date).AddSeconds(12); do { Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { try { if ($$_.Path -eq $$nodePath) { & taskkill.exe /PID $$_.Id /T /F | Out-Null } } catch {} }; Start-Sleep -Milliseconds 300; $$remaining = @(Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { try { $$_.Path -eq $$nodePath } catch { $$false } }); } while ($$remaining.Count -gt 0 -and (Get-Date) -lt $$deadline); if ($$remaining.Count -gt 0) { exit 42 }; exit 0"`
  Pop $0
  Pop $1
  StrCmp $0 "0" +3
  MessageBox MB_ICONSTOP|MB_OK "O RiverLub Connect ainda possui um runtime legado em uso. A instalacao foi interrompida para evitar arquivos misturados entre versoes. Feche o aplicativo e tente novamente."
  Abort
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
