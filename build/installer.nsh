!include "WinVer.nsh"
!macro customInit
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "DevContainer Builder requires Windows 10 22H2 (build 19045) or later. / Requer Windows 10 22H2 (build 19045) ou posterior."
    Abort
  ${EndIf}
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  IntCmp $0 19045 dcb_supported dcb_unsupported dcb_supported
  dcb_unsupported:
    MessageBox MB_ICONSTOP "Upgrade Windows to build 19045 or later before installing DevContainer Builder. / Atualize o Windows para o build 19045 ou posterior."
    Abort
  dcb_supported:
!macroend
