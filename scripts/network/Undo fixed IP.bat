@echo off
rem Double-click this to put the address back to automatic.
cd /d "%~dp0"
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0Set-LabIp.ps1','-Revert'"
