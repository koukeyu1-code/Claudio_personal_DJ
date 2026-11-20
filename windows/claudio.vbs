' Claudio silent launcher - runs the PowerShell launcher with no visible window.
' Resolves paths relative to THIS .vbs file, so it works on any machine
' regardless of username or install location.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = """" & scriptDir & "\claudio_launch.ps1"""
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & ps1, 0, False
