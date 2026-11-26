@echo off
TITLE Launch HisabVeda ERP Desktop
color 0B
echo Launching HisabVeda ERP Desktop App...
start msedge --app="https://ais-pre-ofrn2pcdvmb7hlhweuh5vm-721298446841.asia-east1.run.app" --window-size=1366,768
if %errorlevel% neq 0 (
    start chrome --app="https://ais-pre-ofrn2pcdvmb7hlhweuh5vm-721298446841.asia-east1.run.app" --window-size=1366,768
)
