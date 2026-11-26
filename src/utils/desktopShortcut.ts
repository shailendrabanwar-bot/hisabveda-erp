import JSZip from 'jszip';

const DEFAULT_FALLBACK_URL = 'https://ais-pre-ofrn2pcdvmb7hlhweuh5vm-721298446841.asia-east1.run.app';

export function normalizeToCRLF(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

export function resolvePublicAppUrl(customUrl?: string): string {
  let raw = customUrl?.trim() || '';
  if (!raw && typeof window !== 'undefined') {
    try {
      raw = window.localStorage.getItem('sna_custom_app_url')?.trim() || '';
    } catch {
      // Ignore storage errors in restricted contexts
    }
    if (!raw) {
      raw = window.location.href.split('?')[0].split('#')[0];
    }
  }
  if (!raw) {
    raw = DEFAULT_FALLBACK_URL;
  }
  if (raw.includes('ais-dev-')) {
    raw = raw.replace('ais-dev-', 'ais-pre-');
  }
  return raw.replace(/\/+$/, '');
}

export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function buildWindowsDesktopShortcutBat(appUrl: string): string {
  const safeUrl = appUrl.replace(/"/g, '');
  return normalizeToCRLF(`@echo off
TITLE HisabVeda ERP - Desktop Shortcut Installer (with Official Logo)
color 0A
cd /d "%~dp0"

echo =========================================================================
echo        HISABVEDA ERP - 1-CLICK WINDOWS DESKTOP APP SHORTCUT SETUP
echo =========================================================================
echo.

set "ICON_DIR=%LOCALAPPDATA%\\HisabVedaERP"
set "ICON_PATH=%ICON_DIR%\\HisabVeda.ico"

if not exist "%ICON_DIR%" mkdir "%ICON_DIR%"
if exist "HisabVeda.ico" (
    copy /Y "HisabVeda.ico" "%ICON_PATH%" >nul
    echo  [+] Installed official HisabVeda logo icon to: %ICON_PATH%
) else (
    echo  [!] HisabVeda.ico not found beside this script; shortcut will use default browser icon.
)

set "BROWSER_EXE="
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "BROWSER_EXE=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER_EXE=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if not defined BROWSER_EXE if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"
if not defined BROWSER_EXE if exist "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe" set "BROWSER_EXE=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"

set "APP_URL=${safeUrl}"
set "DESKTOP_LNK=%USERPROFILE%\\Desktop\\HisabVeda ERP.lnk"
set "STARTMENU_LNK=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\HisabVeda ERP.lnk"

if defined BROWSER_EXE (
    echo  [+] Creating Desktop & Start Menu shortcuts using: %BROWSER_EXE%
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; foreach ($p in @('%DESKTOP_LNK%', '%STARTMENU_LNK%')) { $sc = $ws.CreateShortcut($p); $sc.TargetPath = '%BROWSER_EXE%'; $sc.Arguments = '--app=\"%APP_URL%\" --window-size=1366,800'; $sc.WorkingDirectory = '%ICON_DIR%'; $sc.Description = 'HisabVeda ERP Accounting & GST Software'; if (Test-Path '%ICON_PATH%') { $sc.IconLocation = '%ICON_PATH%, 0' }; $sc.Save() }"
    echo.
    echo  [SUCCESS] 'HisabVeda ERP' shortcut with official logo added to your Desktop!
    echo  Launching HisabVeda ERP Desktop App now...
    start "" "%BROWSER_EXE%" --app="%APP_URL%" --window-size=1366,800
) else (
    echo  [!] Edge/Chrome not detected in standard folders; creating URL shortcut on Desktop...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%USERPROFILE%\\Desktop\\HisabVeda ERP.url'); $sc.TargetPath = '%APP_URL%'; $sc.Save()"
    if exist "%ICON_PATH%" (
        >>"%USERPROFILE%\\Desktop\\HisabVeda ERP.url" echo IconIndex=0
        >>"%USERPROFILE%\\Desktop\\HisabVeda ERP.url" echo IconFile=%ICON_PATH%
    )
    start "" "%APP_URL%"
)

echo.
echo  You can close this window or press any key to exit.
pause >nul
`);
}

export function buildDesktopLauncherBat(appUrl: string): string {
  const safeUrl = appUrl.replace(/"/g, '');
  return normalizeToCRLF(`@echo off
TITLE Launch HisabVeda ERP Desktop
color 0B
echo Launching HisabVeda ERP Desktop App Window...
start msedge --app="${safeUrl}" --window-size=1366,800
if %errorlevel% neq 0 (
    start chrome --app="${safeUrl}" --window-size=1366,800
)
if %errorlevel% neq 0 (
    start "" "${safeUrl}"
)
`);
}

export function buildWindowsExeBuilderBat(): string {
  return normalizeToCRLF(`@echo off
TITLE HisabVeda ERP Software - Windows EXE Build Package
color 0A
cd /d "%~dp0"
if exist "..\\package.json" cd ..

echo =========================================================================
echo               HISABVEDA ERP SOFTWARE v2.0 - WINDOWS EXE SETUP
echo =========================================================================
echo.

if not exist "package.json" (
    echo [ERROR] package.json was not found in: %CD%
    echo.
    echo IMPORTANT:
    echo  1. To build an offline .EXE installer, download the FULL Project Source Code ZIP
    echo     ^(via AI Studio Export / Download ZIP^), extract it, copy these files inside
    echo     that root project folder, and run this script there.
    echo  2. If you simply want a Desktop App icon with the HisabVeda logo right away,
    echo     use "Install Desktop App Shortcut (with Logo)" instead - it works instantly!
    echo.
    pause
    exit /b 1
)

echo  [1/3] Checking Node.js Environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this Windows PC.
    echo Please download and install Node.js LTS (v20+) from https://nodejs.org/
    pause
    exit /b 1
)
echo  [+] Node.js detected:
node -v

echo.
echo  [2/3] Installing Dependencies & Electron Builder...
call npm install
call npm install --save-dev electron electron-builder

echo.
echo  [3/3] Compiling HisabVeda ERP Software Windows EXE Installer...
call npm run build
if not exist "electron_main.cjs" if exist "%~dp0electron_main.cjs" copy /Y "%~dp0electron_main.cjs" "electron_main.cjs" >nul
if not exist "public\\hv-icon.ico" if exist "%~dp0HisabVeda.ico" copy /Y "%~dp0HisabVeda.ico" "public\\hv-icon.ico" >nul
call npx electron-builder --win nsis

echo.
echo =========================================================================
echo   SUCCESS! HisabVeda ERP Windows EXE installer created in dist-electron/
echo =========================================================================
if exist "dist-electron" explorer dist-electron
pause
`);
}

export function buildElectronMainCjs(appUrl: string): string {
  const safeUrl = appUrl.replace(/'/g, '');
  return normalizeToCRLF(`const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const iconCandidate = path.join(__dirname, 'public', 'hv-icon.ico');
  const win = new BrowserWindow({
    width: 1366,
    height: 800,
    title: 'HisabVeda ERP v2.0',
    icon: fs.existsSync(iconCandidate) ? iconCandidate : undefined,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    win.loadFile(distIndex);
  } else {
    win.loadURL('${safeUrl}');
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`);
}

export function buildAndroidApkBuilderBat(): string {
  return normalizeToCRLF(`@echo off
TITLE HisabVeda ERP - Android APK Builder (Capacitor / TWA)
color 0A
cd /d "%~dp0"
if exist "..\\package.json" cd ..

echo =========================================================================
echo              HISABVEDA ERP - ANDROID APK GENERATION SCRIPT
echo =========================================================================
echo.

if not exist "package.json" (
    echo [ERROR] package.json was not found in: %CD%
    echo Place this script inside your extracted full project source folder ^(with package.json^).
    pause
    exit /b 1
)

echo [1/4] Checking Node.js Environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is required. Please install from https://nodejs.org/
    pause
    exit /b 1
)
echo [+] Node.js detected.

echo [2/4] Installing Capacitor Android Dependencies...
call npm install --save @capacitor/core @capacitor/cli @capacitor/android

echo [3/4] Initializing Capacitor Project...
call npx cap init "Hisabveda ERP" "com.hisabveda.erp" --web-dir="dist"
call npm run build
call npx cap add android

echo [4/4] Syncing Assets to Android Studio Project...
call npx cap sync android
echo =========================================================================
echo   SUCCESS! Android Project created in /android directory.
echo   Run: npx cap open android
echo   Then click: Build ^> Build Bundle(s) / APK(s) ^> Build APK(s)
echo =========================================================================
pause
`);
}

async function fetchIconBytes(): Promise<Uint8Array | null> {
  if (typeof fetch === 'undefined') return null;
  for (const candidate of ['/hv-icon.ico', '/icon.ico', '/favicon.ico']) {
    try {
      const resp = await fetch(candidate, { cache: 'no-store' });
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > 0) {
          return new Uint8Array(buf);
        }
      }
    } catch {
      // Try next icon URL
    }
  }
  return null;
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

export interface DownloadPackageResult {
  success: boolean;
  fileName: string;
  targetUrl: string;
  hasIcon: boolean;
}

export async function downloadWindowsDesktopShortcutZip(customUrl?: string): Promise<DownloadPackageResult> {
  const targetUrl = resolvePublicAppUrl(customUrl);
  const zip = new JSZip();
  const folder = zip.folder('HisabVeda_Desktop_App_Shortcut');
  const iconBytes = await fetchIconBytes();

  if (iconBytes) {
    folder?.file('HisabVeda.ico', iconBytes);
  }
  folder?.file('Install_HisabVeda_Desktop_Shortcut.bat', buildWindowsDesktopShortcutBat(targetUrl));
  folder?.file('Launch_HisabVeda_Desktop_App.bat', buildDesktopLauncherBat(targetUrl));
  folder?.file(
    'README_DESKTOP_ICON.txt',
    normalizeToCRLF(`HISABVEDA ERP - DESKTOP SHORTCUT WITH OFFICIAL LOGO
===================================================

How to get the HisabVeda Logo App Shortcut directly on your Windows Desktop:

1. Extract this downloaded ZIP folder (Right-click > Extract All).
2. Open the extracted folder and double-click:
      Install_HisabVeda_Desktop_Shortcut.bat
   (If Windows Defender SmartScreen asks, click "More info" > "Run anyway".)

3. Done! A native 'HisabVeda ERP' shortcut with the official HisabVeda logo
   is automatically placed on your Desktop & Start Menu, and the software
   opens in a clean standalone Desktop App window.

App URL: ${targetUrl}
`)
  );

  const content = await zip.generateAsync({ type: 'blob' });
  const fileName = 'HisabVeda_Desktop_App_Shortcut.zip';
  triggerBlobDownload(content, fileName);
  return { success: true, fileName, targetUrl, hasIcon: Boolean(iconBytes) };
}

export async function downloadWindowsExeBuilderZip(customUrl?: string): Promise<DownloadPackageResult> {
  const targetUrl = resolvePublicAppUrl(customUrl);
  const zip = new JSZip();
  const folder = zip.folder('HisabVeda_Windows_EXE_Builder');
  const iconBytes = await fetchIconBytes();

  if (iconBytes) {
    folder?.file('HisabVeda.ico', iconBytes);
  }
  folder?.file('Build_Hisabveda_Windows_EXE.bat', buildWindowsExeBuilderBat());
  folder?.file('electron_main.cjs', buildElectronMainCjs(targetUrl));
  folder?.file(
    'README_WINDOWS_EXE_BUILD.txt',
    normalizeToCRLF(`HISABVEDA ERP - OFFLINE WINDOWS .EXE INSTALLER BUILDER
======================================================

IMPORTANT:
1. To compile a full offline Windows .EXE installer, you need the FULL project
   source folder (containing package.json) and Node.js LTS (v20+) on Windows.
2. Export/Download the full project ZIP from AI Studio Settings > Download ZIP,
   extract it, copy these files into that root folder (next to package.json),
   and double-click Build_Hisabveda_Windows_EXE.bat.

WANT THE DESKTOP ICON IMMEDIATELY WITHOUT COMPILING?
Use "Install Desktop Shortcut (with Logo)" inside the app — it creates the
native Desktop app icon with the official HisabVeda logo in 5 seconds with
no Node.js required!
`)
  );

  const content = await zip.generateAsync({ type: 'blob' });
  const fileName = 'HisabVeda_Windows_EXE_Builder.zip';
  triggerBlobDownload(content, fileName);
  return { success: true, fileName, targetUrl, hasIcon: Boolean(iconBytes) };
}

export async function downloadAndroidApkBuilderZip(): Promise<DownloadPackageResult> {
  const targetUrl = resolvePublicAppUrl();
  const zip = new JSZip();
  const folder = zip.folder('HisabVeda_Android_APK_Builder');

  folder?.file('Build_Hisabveda_Android_APK.bat', buildAndroidApkBuilderBat());
  folder?.file(
    'README_ANDROID_APK.txt',
    normalizeToCRLF(`HISABVEDA ERP - ANDROID APK BUILDER (CAPACITOR)
==============================================

1. Extract the full project source ZIP (containing package.json).
2. Place Build_Hisabveda_Android_APK.bat inside the root project folder.
3. Ensure Node.js LTS & Android Studio are installed, then run the script.

For instant installation on Android or iPhone WITHOUT Android Studio:
Open the app in Chrome (Android) or Safari (iPhone) and tap "Install App" / "Add to Home Screen".
`)
  );

  const content = await zip.generateAsync({ type: 'blob' });
  const fileName = 'HisabVeda_Android_APK_Builder.zip';
  triggerBlobDownload(content, fileName);
  return { success: true, fileName, targetUrl, hasIcon: false };
}
