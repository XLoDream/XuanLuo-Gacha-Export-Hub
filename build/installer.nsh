; 保留任务栏固定：升级时旧卸载程序会删除快捷方式导致 pin 丢失
; 在卸载前备份 pin 对应的 .lnk，安装后恢复

!macro customInit
  InitPluginsDir
  ; 备份任务栏固定的快捷方式（与 shortcutName 同名）
  CopyFiles /SILENT "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk" "$PLUGINSDIR\TaskbarPinBackup.lnk"
!macroend

!macro customInstall
  ; 恢复任务栏固定
  CopyFiles /SILENT "$PLUGINSDIR\TaskbarPinBackup.lnk" "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk"
!macroend
