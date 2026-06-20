@echo off
REM Run on BLADERUNNER-PC — exposes read-only STMAST lookup for Vercel admin.
REM Requires .env with SQL_PASSWORD and optional STOCK_SQL_BRIDGE_KEY / STOCK_SQL_BRIDGE_PORT=8765
cd /d "%~dp0.."
python scripts\sql-stmast-bridge.py
pause
