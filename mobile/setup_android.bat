@echo off
setlocal
cd /d "%~dp0"

flutter create --platforms=android --org id.ac.unira --project-name ruangku .
if errorlevel 1 exit /b %errorlevel%

dart run tool/patch_manifest.dart
if errorlevel 1 exit /b %errorlevel%

flutter pub get
if errorlevel 1 exit /b %errorlevel%

endlocal
