!define RIVERLUB_HOOK_DIR "${__FILEDIR__}"

!macro RIVERLUB_PREPARE_RUNTIME
  DetailPrint "Encerrando RiverLub Connect e preparando runtime local..."
  nsExec::ExecToLog `taskkill.exe /F /T /IM "${MAINBINARYNAME}.exe"`
  Sleep 300

  InitPluginsDir
  File /oname=$PLUGINSDIR\riverlub-runtime-lock-diagnostics.ps1 "${RIVERLUB_HOOK_DIR}\windows\runtime-lock-diagnostics.ps1"
  nsExec::ExecToLog `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\riverlub-runtime-lock-diagnostics.ps1" -InstallDir "$INSTDIR"`

  ; A partir da 0.4.1 o runtime e versionado. Bloqueios em runtime legado sao
  ; diagnosticados e limpos quando possivel, mas nunca impedem a copia do novo runtime.
  Sleep 300
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro RIVERLUB_PREPARE_RUNTIME
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\riverlub-connect" "" "URL:RiverLub Connect"
  WriteRegStr HKCU "Software\Classes\riverlub-connect" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\riverlub-connect\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\riverlub-connect\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro RIVERLUB_PREPARE_RUNTIME
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\riverlub-connect"
  RMDir /r /REBOOTOK "$INSTDIR\runtime"
!macroend
