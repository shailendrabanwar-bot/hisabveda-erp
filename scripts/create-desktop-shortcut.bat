@echo off
TITLE HisabVeda ERP - Desktop Shortcut Installer (with Official Logo)
color 0A
cd /d "%~dp0"
if exist "..\public\hv-icon.ico" cd ..

echo =========================================================================
echo        HISABVEDA ERP - 1-CLICK WINDOWS DESKTOP APP SHORTCUT SETUP
echo =========================================================================
echo.

set "ICON_DIR=%LOCALAPPDATA%\HisabVedaERP"
set "ICON_PATH=%ICON_DIR%\HisabVeda.ico"

if not exist "%ICON_DIR%" mkdir "%ICON_DIR%"
if exist "public\hv-icon.ico" (
    copy /Y "public\hv-icon.ico" "%ICON_PATH%" >nul
    echo  [+] Installed official HisabVeda logo icon to: %ICON_PATH%
) else if exist "public\icon.ico" (
    copy /Y "public\icon.ico" "%ICON_PATH%" >nul
    echo  [+] Installed official HisabVeda logo icon to: %ICON_PATH%
)

set "BROWSER_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

set "APP_URL=https://ais-pre-ofrn2pcdvmb7hlhweuh5vm-721298446841.asia-east1.run.app"
set "DESKTOP_LNK=%USERPROFILE%\Desktop\HisabVeda ERP.lnk"
set "STARTMENU_LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\HisabVeda ERP.lnk"

if defined BROWSER_EXE (
    echo  [+] Creating Desktop & Start Menu shortcuts using: %BROWSER_EXE%
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; foreach ($p in @('%DESKTOP_LNK%', '%STARTMENU_LNK%')) { $sc = $ws.CreateShortcut($p); $sc.TargetPath = '%BROWSER_EXE%'; $sc.Arguments = '--app=\"%APP_URL%\" --window-size=1366,800'; $sc.WorkingDirectory = '%ICON_DIR%'; $sc.Description = 'HisabVeda ERP Accounting & GST Software'; if (Test-Path '%ICON_PATH%') { $sc.IconLocation = '%ICON_PATH%, 0' }; $sc.Save() }"
    echo.
    echo  [SUCCESS] 'HisabVeda ERP' shortcut with official logo added to your Desktop!
    start "" "%BROWSER_EXE%" --app="%APP_URL%" --window-size=1366,800
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%USERPROFILE%\Desktop\HisabVeda ERP.url'); $sc.TargetPath = '%APP_URL%'; $sc.Save()"
    if exist "%ICON_PATH%" (
        >>"%USERPROFILE%\Desktop\HisabVeda ERP.url" echo IconIndex=0
        >>"%USERPROFILE%\Desktop\HisabVeda ERP.url" echo IconFile=%ICON_PATH%
    )
    start "" "%APP_URL%"
)
pause
