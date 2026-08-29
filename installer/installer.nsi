; Scribe Local — Windows installer
;
; Packages a pre-staged tree (see build.sh) containing:
;   stage\app\      the application (server.js, src/, public/, node_modules/...)
;   stage\runtime\  a portable Node.js runtime (node.exe)
;   stage\service\  node-windows service registration scripts + port.txt
;   stage\*.bat, README.txt   convenience files for the install root
;
; Installs to Program Files, registers Scribe Local as a Windows Service
; (auto-starts with Windows, no terminal window needed), adds Start Menu
; shortcuts and a proper uninstaller.
;
; Build with: makensis /DSTAGE_DIR="<path to stage>" /DAPP_VERSION="1.0.0" installer.nsi

!ifndef STAGE_DIR
  !error "Pass /DSTAGE_DIR=<path to staged build> on the makensis command line"
!endif
!ifndef APP_VERSION
  !define APP_VERSION "1.0.0"
!endif

!define APP_NAME "Scribe Local"
!define APP_PUBLISHER "Scribe Local (self-hosted)"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ScribeLocal"

!include "MUI2.nsh"
!include "LogicLib.nsh"

Name "${APP_NAME}"
OutFile "ScribeLocal-Setup-${APP_VERSION}.exe"
InstallDir "$PROGRAMFILES64\Scribe Local"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallLocation"
RequestExecutionLevel admin
Unicode true
ShowInstDetails show
ShowUnInstDetails show

;--------------------------------
; UI pages

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\OpenScribeLocal.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Open Scribe Local in my browser"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

;--------------------------------
; Install

Section "Scribe Local" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  File "${STAGE_DIR}\OpenScribeLocal.bat"
  File "${STAGE_DIR}\RestartService.bat"
  File "${STAGE_DIR}\README.txt"

  SetOutPath "$INSTDIR\app"
  File /r "${STAGE_DIR}\app\*.*"

  SetOutPath "$INSTDIR\runtime"
  File /r "${STAGE_DIR}\runtime\*.*"

  SetOutPath "$INSTDIR\service"
  File /r "${STAGE_DIR}\service\*.*"

  ; Register + start the Windows Service. This can take a few seconds
  ; (WinSW install + service start). A non-zero exit code most often means
  ; the port in service\port.txt is already in use by something else, or
  ; the service already existed from a previous install.
  DetailPrint "Registering Scribe Local as a Windows Service..."
  nsExec::ExecToLog '"$INSTDIR\runtime\node.exe" "$INSTDIR\service\install-service.js"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "Scribe Local was installed, but the Windows Service could not be started automatically (exit code $0).$\r$\n$\r$\nThis is usually because the port in service\port.txt is already in use, or an old install's service is still registered.$\r$\n$\r$\nSee $INSTDIR\README.txt for how to check logs and change the port, then run 'Restart Service.bat' in the install folder."
  ${EndIf}

  ; Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\Scribe Local"
  CreateShortCut "$SMPROGRAMS\Scribe Local\Open Scribe Local.lnk" "$INSTDIR\OpenScribeLocal.bat" "" "$INSTDIR\OpenScribeLocal.bat" 0
  CreateShortCut "$SMPROGRAMS\Scribe Local\Restart Service.lnk" "$INSTDIR\RestartService.bat"
  CreateShortCut "$SMPROGRAMS\Scribe Local\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Add/Remove Programs entry
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKLM "${UNINSTALL_KEY}" "QuietUninstallString" "$\"$INSTDIR\Uninstall.exe$\" /S"
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

;--------------------------------
; Uninstall

Section "Uninstall"
  DetailPrint "Stopping and removing the Scribe Local Windows Service..."
  nsExec::ExecToLog '"$INSTDIR\runtime\node.exe" "$INSTDIR\service\uninstall-service.js"'
  Pop $0

  Delete "$SMPROGRAMS\Scribe Local\Open Scribe Local.lnk"
  Delete "$SMPROGRAMS\Scribe Local\Restart Service.lnk"
  Delete "$SMPROGRAMS\Scribe Local\Uninstall.lnk"
  RMDir "$SMPROGRAMS\Scribe Local"

  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  RMDir /r "$INSTDIR\service"
  Delete "$INSTDIR\OpenScribeLocal.bat"
  Delete "$INSTDIR\RestartService.bat"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKLM "${UNINSTALL_KEY}"
SectionEnd
