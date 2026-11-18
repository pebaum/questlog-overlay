!macro questlogInstallGuide profileDir
  SetOutPath "${profileDir}"
  ; Discovery for local tools; never replace the user's own scoped instructions.
  SetOverwrite off
  File "/oname=AGENTS.md" "${PROJECT_DIR}\docs\QUESTS-AI.md"
  SetOverwrite lastused
!macroend

!macro customInstall
  !insertmacro questlogInstallGuide "$APPDATA\Questlog"
  SetOutPath "$INSTDIR"
!macroend
