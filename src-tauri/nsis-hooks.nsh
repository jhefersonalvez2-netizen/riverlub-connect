!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\riverlub-connect" "" "URL:RiverLub Connect"
  WriteRegStr HKCU "Software\Classes\riverlub-connect" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\riverlub-connect\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\riverlub-connect\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\riverlub-connect"
!macroend
