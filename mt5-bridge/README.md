# MT5 Bridge EA Setup

## What This Is
This is an Expert Advisor (EA) that runs INSIDE your MT5 terminal. It opens a local TCP server on `127.0.0.1:9090` and listens for trade commands from the Node.js bot.

```
Node.js Bot → TCP 127.0.0.1:9090 → MT5Bridge EA → OrderSend() → MT5 Demo Account
```

## Installation Steps

### 1. Open MetaEditor
- In MT5, press **F4** on your keyboard
- This opens the MetaEditor window

### 2. Find the EA
- Look at the **Navigator** panel on the left side of MetaEditor
- Click the **Experts** folder to expand it
- Look for **MT5Bridge** in the list

**If you don't see MT5Bridge:**
- Go to **File → Open** in MetaEditor
- Navigate to:
  ```
  C:\Users\gadna\AppData\Roaming\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075\MQL5\Experts\MT5Bridge.mq5
  ```
- Select the file and click **Open**

### 3. Compile the EA
- Press **F7** or click the **Compile** button (hammer icon)
- Wait for compilation to finish
- Check the **Errors** tab at the bottom
- You should see: `0 errors, 0 warnings`

**If you see errors:**
- Make sure you're using the latest EA file from the mt5-bridge folder
- The EA uses MQL5 sockets, which require MT5 build 600+

### 4. Attach EA to Chart
- Go back to the main MT5 terminal window
- In the **Navigator** panel (left side), expand **Experts**
- Find **MT5Bridge**
- Drag it onto any chart (e.g., XAUUSD, EURUSD, etc.)
- In the settings window that appears, just click **OK**

### 5. Enable AutoTrading
- Click the **AutoTrading** button in the MT5 toolbar (it should turn green)
- If a confirmation dialog pops up, click **Allow**

### 6. Verify It's Working
- Open the **Experts** tab in MT5 (bottom panel)
- You should see:
  ```
  [MT5Bridge] Listening on 127.0.0.1:9090
  ```

### 7. Test the Bridge
From WSL, run:
```bash
curl -X POST http://localhost:3000/api/mock-event -H "Content-Type: application/json" -d '{"id":"test","timestamp":9999999999,"title":"Test","currency":"USD","impact":"high","forecast":"1","previous":"1","actual":"1","released":true}'
```

Then in MT5 Experts tab, you should see:
```
[MT5Bridge] Received: BUY|XAUUSD|...
[MT5Bridge] OrderSend result: OK|123456
```

## Troubleshooting

**"SocketCreate failed" error:**
- Your MT5 build might not support sockets. Update to the latest MT5 build.

**"SocketBind failed" error:**
- Port 9090 is already in use. Change `ListenPort` in the EA settings or stop the other process.

**EA not appearing in Navigator:**
- Copy the .mq5 file to the Experts folder
- Restart MT5 completely
- Or use File → Open in MetaEditor

**AutoTrading button is disabled:**
- Go to Tools → Options → Expert Advisors
- Check "Allow automated trading"
- Check "Allow DLL imports"
- Restart MT5
