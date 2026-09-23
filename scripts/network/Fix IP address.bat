@echo off
rem Double-click this. It asks for administrator rights, then gives this
rem machine a fixed address so the URL the lab types never changes.
cd /d "%~dp0"
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0Set-LabIp.ps1'"
