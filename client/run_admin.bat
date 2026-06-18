@echo off
chcp 65001 >nul 2>&1
title KR Client Tool
color 0A
echo ==================================================
echo   KR Client Tool — Admin Launcher
echo ==================================================
echo.

:: ── Check admin ──────────────────────────────────────
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Yeu cau quyen Administrator...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
echo [OK] Dang chay voi quyen Administrator
echo.

:: ── Find Python ──────────────────────────────────────
set "PYTHON_EXE="

if exist "C:\msys64\ucrt64\bin\python.exe" (
    set "PYTHON_EXE=C:\msys64\ucrt64\bin\python.exe"
    goto :found
)

for %%P in (
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "C:\Program Files\Python313\python.exe"
    "C:\Program Files\Python312\python.exe"
    "C:\Program Files\Python311\python.exe"
) do (
    if exist %%P (
        set "PYTHON_EXE=%%~P"
        goto :found
    )
)

where python >nul 2>&1
if %errorLevel% equ 0 (
    for /f "delims=" %%i in ('where python') do (
        echo %%i | findstr /i "WindowsApps" >nul
        if errorlevel 1 (
            set "PYTHON_EXE=%%i"
            goto :found
        )
    )
)

echo [ERROR] Khong tim thay Python!
echo Hay cai Python tu https://python.org
pause
exit /b 1

:found
echo [OK] Python: %PYTHON_EXE%
echo.

:: ── Install / update dependencies ────────────────────
echo [*] Kiem tra va cai dat thu vien...
"%PYTHON_EXE%" -m pip install -r "%~dp0requirements.txt" -q
if %errorLevel% neq 0 (
    echo [WARN] Mot so goi cai dat that bai, thu tiep...
)
echo [OK] Thu vien da san sang
echo.

:: ── Start server in background (optional) ────────────
:: Bo comment dong duoi neu muon tu dong chay server.py
:: start "KR Server" /min "%PYTHON_EXE%" "%~dp0server.py"
:: timeout /t 2 /nobreak >nul

:: ── Run client ────────────────────────────────────────
echo [*] Khoi dong KR Client...
cd /d "%~dp0"
"%PYTHON_EXE%" main.py

echo.
echo [*] Chuong trinh da ket thuc.
pause
