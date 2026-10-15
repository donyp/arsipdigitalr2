@echo off
REM Setup Backup Tables Script for Windows
REM This script initializes backup tables in Supabase

echo ======================================================
echo   Arsip Digital - Backup System Setup
echo ======================================================
echo.

REM Check if .env exists
if not exist ".env" (
    echo ERROR: .env file not found in backend/
    echo Please create .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
    pause
    exit /b 1
)

echo OK: Found .env file
echo.
echo Running backup table initialization...
echo.

REM Run the initialization script
node init-backup-tables.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ======================================================
    echo OK: Setup Complete!
    echo ======================================================
    echo.
    echo Next steps:
    echo 1. Start the backend server: npm start
    echo 2. Test backup via: curl -X POST http://localhost:3000/api/backups/manual -H "Content-Type: application/json" -H "Authorization: Bearer YOUR_TOKEN" -d "{\"type\":\"database\"}"
    echo.
    pause
) else (
    echo.
    echo ======================================================
    echo ERROR: Setup Failed
    echo ======================================================
    echo.
    echo Please run manually:
    echo 1. Open Supabase Dashboard
    echo 2. Go to SQL Editor - New Query
    echo 3. Copy contents of CREATE_BACKUP_TABLES.sql
    echo 4. Click Run
    echo.
    pause
    exit /b 1
)
