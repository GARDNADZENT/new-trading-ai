#!/bin/bash
# Stop MT5 Python Trade Server on Windows

PID_FILE="/mnt/c/Users/gadna/AppData/Local/Programs/Python/Python314/scripts/mt5-server/server.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    echo "Stopping MT5 Python server (PID: $PID)..."
    cmd.exe /c "taskkill /F /PID $PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "Server stopped."
else
    echo "No PID file found. Trying to kill any python.exe on port 8000..."
    if command -v lsof > /dev/null 2>&1; then
        PID=$(lsof -ti:8000 2>/dev/null | head -1)
        if [ -n "$PID" ]; then
            cmd.exe /c "taskkill /F /PID $PID" 2>/dev/null || true
            echo "Killed PID: $PID"
        else
            echo "No process found on port 8000"
        fi
    else
        echo "Cannot check port 8000 without lsof"
    fi
fi
