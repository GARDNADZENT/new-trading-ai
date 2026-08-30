#!/bin/bash
# Start MT5 Python Trade Server on Windows from WSL

PYTHON_EXE="C:\\Users\\gadna\\AppData\\Local\\Programs\\Python\\Python314\\python.exe"
SCRIPT_PATH="C:\\Users\\gadna\\AppData\\Local\\Programs\\Python\\Python314\\scripts\\mt5-server\\mt5_trade_server.py"
LOG_FILE="C:\\Users\\gadna\\AppData\\Local\\Programs\\Python\\Python314\\scripts\\mt5-server\\server.log"
PID_FILE="C:\\Users\\gadna\\AppData\\Local\\Programs\\Python\\Python314\\scripts\\mt5-server\\server.pid"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "MT5 Python server already running (PID: $OLD_PID)"
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

echo "Starting MT5 Python Trade Server on Windows..."

# Use PowerShell to start the process detached
powershell.exe -Command "Start-Process -FilePath '$PYTHON_EXE' -ArgumentList '$SCRIPT_PATH' -RedirectStandardOutput '$LOG_FILE' -RedirectStandardError '$LOG_FILE' -WindowStyle Hidden"

# Wait a moment for server to start
sleep 4

# Check if server is running by testing the health endpoint
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "Server started successfully"
    echo "Health check passed"
    echo "Log: $LOG_FILE"
else
    echo "Server may have failed to start. Check log: $LOG_FILE"
    echo "Trying to show last lines of log..."
    powershell.exe -Command "Get-Content '$LOG_FILE' -Tail 20" 2>/dev/null || echo "Cannot read log"
    exit 1
fi
