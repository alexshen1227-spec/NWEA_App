@echo off
REM ── Math_Study (local server mode) ────────────────────────────────────
REM Alternative launcher. Use this ONLY if the plain "Start Math_Study.bat"
REM doesn't keep your progress between days in your browser.
REM Pick ONE launcher and always use the same one (each keeps its own saved
REM progress). Requires Python. Keep this window open while you study.
cd /d "%~dp0"
start "" "http://localhost:8123"
python -m http.server 8123
