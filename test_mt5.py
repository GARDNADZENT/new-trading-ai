import MetaTrader5 as mt5
import time
from dotenv import load_dotenv
import os

load_dotenv()

LOGIN = int(os.getenv("MT5_ACCOUNT"))
PASSWORD = os.getenv("MT5_PASSWORD")
SERVER = os.getenv("MT5_SERVER")

print("Connecting to MT5...")

if not mt5.initialize():
    print("MT5 initialize failed:", mt5.last_error())
    raise SystemExit(1)

if not mt5.login(LOGIN, password=PASSWORD, server=SERVER):
    print("MT5 login failed:", mt5.last_error())
    mt5.shutdown()
    raise SystemExit(1)

print("Connected successfully.")

symbol = "XAUUSD"

if not mt5.symbol_select(symbol, True):
    print("Could not select", symbol)
    mt5.shutdown()
    raise SystemExit(1)

tick = mt5.symbol_info_tick(symbol)

if tick is None:
    print("Could not get tick data")
    mt5.shutdown()
    raise SystemExit(1)

print(f"{symbol} Bid: {tick.bid}")
print(f"{symbol} Ask: {tick.ask}")

volume = 0.01

request = {
    "action": mt5.TRADE_ACTION_DEAL,
    "symbol": symbol,
    "volume": volume,
    "type": mt5.ORDER_TYPE_BUY,
    "price": tick.ask,
    "deviation": 20,
    "magic": 123456,
    "comment": "Python MT5 connection test",
    "type_time": mt5.ORDER_TIME_GTC,
    "type_filling": mt5.ORDER_FILLING_FOK,
}

print("\nSending BUY order...")

result = mt5.order_send(request)

print("\n========== ORDER RESULT ==========")
print(result)
print("==================================")

if result is None:
    print("Order failed:", mt5.last_error())
elif result.retcode == mt5.TRADE_RETCODE_DONE:
    print("\nSUCCESS: Python successfully sent an order to MT5.")
    print("Ticket:", result.order)
else:
    print("\nORDER REJECTED")
    print("Retcode:", result.retcode)
    print("Comment:", result.comment)

mt5.shutdown()