; Exercise the production hook without installing the app or touching real user data.
Unicode true
Name "Questlog guide fixture"
OutFile "${TEST_OUT}\guide-test.exe"
RequestExecutionLevel user
SilentInstall silent
!include "${PROJECT_DIR}\build\installer.nsh"
Section
  !insertmacro questlogInstallGuide "$EXEDIR\profile"
SectionEnd
