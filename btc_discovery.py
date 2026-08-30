import MetaTrader5 as mt5
import os
from dotenv import load_dotenv

load_dotenv()

login = int(os.getenv("MT5_ACCOUNT"))
password = os.getenv("MT5_PASSWORD")
server = os.getenv("MT5_SERVER")

print(f"initializing MT5 (server={server}, login={login}) ...")
if not mt5.initialize():
    print("initialize failed:", mt5.last_error())
    raise SystemExit(1)

if not mt5.login(login, password=password, server=server):
    print("login failed:", mt5.last_error())
    mt5.shutdown()
    raise SystemExit(1)

print("connected. enumerating symbols (this may take a moment) ...")

all_syms = mt5.symbols_get()
print(f"total symbols available: {0 if all_syms is None else len(all_syms)}")

btc = []
if all_syms:
    for s in all_syms:
        if "BTC" in s.name.upper():
            btc.append(s)
    print(f"\nBTC-related symbols found: {len(btc)}")
    for s in btc[:50]:
        try:
            tick = mt5.symbol_info_tick(s.name)
            bid = tick.bid if tick else None
            ask = tick.ask if tick else None
        except Exception:
            bid = ask = None
        print(f"  {s.name} | {s.description} | visible={s.visible} mode={s.trade_mode} bid={bid} ask={ask}")

if not btc:
    print("\nNo BTC-related symbols found on this account/broker.")

mt5.shutdown()
