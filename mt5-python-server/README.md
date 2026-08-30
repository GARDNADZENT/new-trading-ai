# MT5 Python Trade Server Setup

## What This Is
A Python Flask server that runs on your **Windows PC** and uses the MetaTrader5 Python SDK to execute trades directly in MT5.

```
Node.js Bot (WSL) → HTTP → Python Server (Windows) → MetaTrader5 SDK → MT5 Demo Account
```

## Prerequisites on Windows

1. **MT5 must be running** and logged into your Deriv-Demo account
2. **Python installed** on Windows (download from python.org)
3. **MetaTrader5 package installed:**
   ```cmd
   pip install MetaTrader5 flask python-dotenv
   ```

## Setup Steps

### 1. Edit `.env` on Windows
Copy the `.env` file to your Windows machine or create one in the same folder as `mt5_trade_server.py`:

```env
MT5_ACCOUNT=your_account_number
MT5_PASSWORD=your_password
MT5_SERVER=your_broker_server
```

### 2. Start the Python Server on Windows
Open Command Prompt or PowerShell on Windows and run:

```cmd
python mt5_trade_server.py
```

You should see:
```
Starting MT5 Python Trade Server...
 * Running on http://0.0.0.0:8000
```

### 3. Find Windows IP from WSL
In your WSL terminal, run:
```bash
export WINDOWS_IP=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}')
echo "Windows IP: $WINDOWS_IP"
```

### 4. Update Node.js `.env`
In WSL, edit `.env` and set:
```env
MT5_PYTHON_SERVER_URL=http://$WINDOWS_IP:8000
```

Or hardcode your Windows IP if static:
```env
MT5_PYTHON_SERVER_URL=http://192.168.x.x:8000
```

### 5. Test Connection
From WSL, test the Python server:
```bash
curl http://$WINDOWS_IP:8000/health
```

You should see:
```json
{
  "status": "connected",
  "login": 12345678,
  "server": "YourBroker-Demo",
  "balance": 10000.00,
  "equity": 10000.00
}
```

### 6. Run the Node.js Bot
```bash
npm start
```

## How It Works

1. **Mock event** is injected with 2-minute countdown
2. **NewsWatcher** detects release window and generates signal
3. **TradingLoop** calls `tradeService.sendMarketOrder()`
4. **tradeService** makes HTTP POST to `http://<windows-ip>:8000/trade`
5. **Python server** receives request, executes `mt5.order_send()`
6. **Result** returned to Node.js bot

## Test Trade
```bash
curl -X POST http://$WINDOWS_IP:8000/trade \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "XAUUSD",
    "action": "BUY",
    "volume": 0.02,
    "sl": 4610,
    "tp": 4630,
    "comment": "test"
  }'
```

## Troubleshooting

**"Connection refused" from WSL:**
- Make sure Windows Firewall allows port 8000
- Or run: `New-NetFirewallRule -DisplayName "MT5 Python Server" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow` in PowerShell as Admin

**"MT5 initialize failed":**
- Make sure MT5 is running on Windows
- Make sure you're logged into your account

**"MT5 login failed":**
- Check account number, password, and server in `.env`
