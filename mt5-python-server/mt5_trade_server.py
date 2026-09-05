# UNIQUE_MARKER_12345
import MetaTrader5 as mt5
import time
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta

load_dotenv()

LOGIN = int(os.getenv("MT5_ACCOUNT"))
PASSWORD = os.getenv("MT5_PASSWORD")
SERVER = os.getenv("MT5_SERVER")

app = Flask(__name__)

mt5_connected = False

def ensure_connected():
    global mt5_connected
    if not mt5_connected:
        if not mt5.initialize():
            raise Exception(f"MT5 initialize failed: {mt5.last_error()}")
        if not mt5.login(LOGIN, password=PASSWORD, server=SERVER):
            mt5.shutdown()
            raise Exception(f"MT5 login failed: {mt5.last_error()}")
        mt5_connected = True

@app.route('/ping', methods=['GET'])
def ping():
    return jsonify({"status": "pong", "marker": "UNIQUE_MARKER_12345"})

@app.route('/health', methods=['GET'])
def health():
    try:
        ensure_connected()
        account = mt5.account_info()
        return jsonify({
            "status": "connected",
            "login": account.login,
            "server": account.server,
            "balance": account.balance,
            "equity": account.equity,
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/trade', methods=['POST'])
def trade():
    try:
        ensure_connected()
        data = request.get_json()
        
        symbol = data.get("symbol")
        action = data.get("action", "BUY").upper()
        volume = float(data.get("volume", 0.01))
        sl = data.get("sl", 0)
        tp = data.get("tp", 0)
        magic = int(data.get("magic", 123456))
        comment = data.get("comment", "TradePulse")
        
        if not symbol:
            return jsonify({"success": False, "error": "symbol is required"}), 400
        
        if not mt5.symbol_select(symbol, True):
            return jsonify({"success": False, "error": f"Could not select symbol {symbol}"}), 400
        
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return jsonify({"success": False, "error": f"Could not get tick data for {symbol}"}), 400
        
        if action == "BUY":
            order_type = mt5.ORDER_TYPE_BUY
            price = tick.ask
        elif action == "SELL":
            order_type = mt5.ORDER_TYPE_SELL
            price = tick.bid
        else:
            return jsonify({"success": False, "error": f"Invalid action: {action}"}), 400
        
        request_data = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "deviation": 20,
            "magic": magic,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_FOK,
        }
        
        if sl and sl > 0:
            request_data["sl"] = float(sl)
        if tp and tp > 0:
            request_data["tp"] = float(tp)
        
        result = mt5.order_send(request_data)
        
        if result is None:
            error = mt5.last_error()
            return jsonify({"success": False, "error": f"Order failed: {error}"}), 500
        
        if result.retcode == mt5.TRADE_RETCODE_DONE:
            return jsonify({
                "success": True,
                "ticket": result.order,
                "retcode": result.retcode,
                "comment": result.comment,
            })
        else:
            return jsonify({
                "success": False,
                "retcode": result.retcode,
                "comment": result.comment,
            }), 400
            
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/positions', methods=['GET'])
def positions():
    try:
        ensure_connected()
        positions = mt5.positions_get()
        if positions is None:
            return jsonify({"positions": []})
        return jsonify({
            "positions": [
                {
                    "ticket": pos.ticket,
                    "symbol": pos.symbol,
                    "type": "BUY" if pos.type == mt5.POSITION_TYPE_BUY else "SELL",
                    "volume": pos.volume,
                    "price": pos.price_open,
                    "sl": pos.sl,
                    "tp": pos.tp,
                    "profit": pos.profit,
                }
                for pos in positions
            ]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/account', methods=['GET'])
def account():
    try:
        ensure_connected()
        account_info = mt5.account_info()
        if account_info is None:
            return jsonify({"error": "Could not get account info"}), 500
        return jsonify({
            "login": account_info.login,
            "server": account_info.server,
            "balance": account_info.balance,
            "equity": account_info.equity,
            "margin": account_info.margin,
            "margin_free": account_info.margin_free,
            "margin_level": account_info.margin_level,
            "profit": account_info.profit,
            "currency": account_info.currency,
            "leverage": account_info.leverage,
            "name": account_info.name,
            "company": account_info.company,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/orders', methods=['GET'])
def orders():
    try:
        ensure_connected()
        orders = mt5.orders_get()
        if orders is None:
            return jsonify({"orders": []})
        return jsonify({
            "orders": [
                {
                    "ticket": o.ticket,
                    "symbol": o.symbol,
                    "type": o.type,
                    "volume": o.volume_initial,
                    "price": o.price_open,
                    "sl": o.sl,
                    "tp": o.tp,
                    "state": o.state,
                }
                for o in orders
            ]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/pending-order', methods=['POST'])
def pending_order():
    try:
        ensure_connected()
        data = request.get_json()

        symbol = data.get("symbol")
        order_type = data.get("type", "").upper()
        volume = float(data.get("volume", 0.01))
        price = float(data.get("price", 0))
        sl = data.get("sl", 0)
        tp = data.get("tp", 0)
        magic = int(data.get("magic", 123456))
        comment = data.get("comment", "TradePulse")

        if not symbol or not order_type or price <= 0:
            return jsonify({"success": False, "error": "symbol, type, and valid price are required"}), 400

        if not mt5.symbol_select(symbol, True):
            return jsonify({"success": False, "error": f"Could not select symbol {symbol}"}), 400

        type_map = {
            "BUY_STOP": mt5.ORDER_TYPE_BUY_STOP,
            "SELL_STOP": mt5.ORDER_TYPE_SELL_STOP,
            "BUY_LIMIT": mt5.ORDER_TYPE_BUY_LIMIT,
            "SELL_LIMIT": mt5.ORDER_TYPE_SELL_LIMIT,
        }
        mt5_type = type_map.get(order_type)
        if mt5_type is None:
            return jsonify({"success": False, "error": f"Invalid pending order type: {order_type}"}), 400

        request_data = {
            "action": mt5.TRADE_ACTION_PENDING,
            "symbol": symbol,
            "volume": volume,
            "type": mt5_type,
            "price": price,
            "deviation": 20,
            "magic": magic,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_FOK,
        }

        if sl and sl > 0:
            request_data["sl"] = float(sl)
        if tp and tp > 0:
            request_data["tp"] = float(tp)

        result = mt5.order_send(request_data)

        if result is None:
            error = mt5.last_error()
            return jsonify({"success": False, "error": f"Pending order failed: {error}"}), 500

        if result.retcode == mt5.TRADE_RETCODE_DONE:
            return jsonify({
                "success": True,
                "ticket": result.order,
                "retcode": result.retcode,
                "comment": result.comment,
            })
        else:
            return jsonify({
                "success": False,
                "retcode": result.retcode,
                "comment": result.comment,
            }), 500

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/cancel-order', methods=['POST'])
def cancel_order():
    try:
        ensure_connected()
        data = request.get_json()
        order_ticket = data.get("order_ticket")
        symbol = data.get("symbol")

        if not order_ticket or not symbol:
            return jsonify({"success": False, "error": "order_ticket and symbol are required"}), 400

        request_data = {
            "action": mt5.TRADE_ACTION_REMOVE,
            "order": int(order_ticket),
            "symbol": symbol,
        }

        result = mt5.order_send(request_data)

        if result is None:
            error = mt5.last_error()
            return jsonify({"success": False, "error": f"Cancel failed: {error}"}), 500

        if result.retcode == mt5.TRADE_RETCODE_DONE:
            return jsonify({
                "success": True,
                "ticket": order_ticket,
                "retcode": result.retcode,
                "comment": result.comment,
            })
        else:
            return jsonify({
                "success": False,
                "retcode": result.retcode,
                "comment": result.comment,
            }), 500

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/modify-position', methods=['POST'])
def modify_position():
    try:
        ensure_connected()
        data = request.get_json()
        symbol = data.get("symbol")
        position_ticket = data.get("position_ticket")
        sl = data.get("sl")
        tp = data.get("tp")

        if not symbol or not position_ticket:
            return jsonify({"success": False, "error": "symbol and position_ticket are required"}), 400

        request_data = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": symbol,
            "position": int(position_ticket),
        }
        if sl is not None and sl != 0:
            request_data["sl"] = float(sl)
        if tp is not None and tp != 0:
            request_data["tp"] = float(tp)

        result = mt5.order_send(request_data)

        if result is None:
            error = mt5.last_error()
            return jsonify({"success": False, "error": f"Modify failed: {error}"}), 500

        if result.retcode == mt5.TRADE_RETCODE_DONE:
            return jsonify({
                "success": True,
                "ticket": position_ticket,
                "retcode": result.retcode,
                "comment": result.comment,
            })
        else:
            return jsonify({
                "success": False,
                "retcode": result.retcode,
                "comment": result.comment,
            }), 500

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/history', methods=['GET'])
def history():
    try:
        ensure_connected()
        symbol = request.args.get("symbol")
        days = int(request.args.get("days", 3))
        to = datetime.now()
        from_dt = to - timedelta(days=days)

        if symbol:
            history = mt5.history_orders_get(from_dt, to, group=symbol)
        else:
            history = mt5.history_orders_get(from_dt, to)

        if history is None:
            return jsonify({"history": []})

        return jsonify({
            "history": [
                {
                    "ticket": h.ticket,
                    "symbol": h.symbol,
                    "type": h.type,
                    "volume": h.volume_initial,
                    "price": h.price_open,
                    "sl": h.sl,
                    "tp": h.tp,
                    "state": h.state,
                    "time_setup": h.time_setup,
                    "time_done": h.time_done,
                }
                for h in history
            ]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/deals', methods=['GET'])
def deals():
    try:
        ensure_connected()
        symbol = request.args.get("symbol")
        days = int(request.args.get("days", 7))
        to = datetime.now()
        from_dt = to - timedelta(days=days)

        deals = mt5.history_deals_get(from_dt, to)
        if deals is None:
            return jsonify({"deals": []})

        out = []
        for d in deals:
            entry = {
                "ticket": getattr(d, 'ticket', None),
                "symbol": getattr(d, 'symbol', ''),
                "type": getattr(d, 'type', None),
                "volume": getattr(d, 'volume', 0),
                "price": getattr(d, 'price', 0),
                "profit": getattr(d, 'profit', 0),
                "time": getattr(d, 'time', 0),
            }
            if symbol and entry['symbol'] != symbol:
                continue
            out.append(entry)
        return jsonify({"deals": out})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/symbol-info', methods=['GET'])
def symbol_info():
    try:
        ensure_connected()
        symbol = request.args.get("symbol")
        if not symbol:
            return jsonify({"error": "symbol is required"}), 400

        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Could not select symbol {symbol}"}), 400

        info = mt5.symbol_info(symbol)
        if info is None:
            return jsonify({"error": f"Symbol {symbol} not found"}), 404

        tick = mt5.symbol_info_tick(symbol)

        return jsonify({
            "symbol": info.name,
            "bid": tick.bid if tick else info.bid,
            "ask": tick.ask if tick else info.ask,
            "spread": info.spread,
            "digits": info.digits,
            "point": info.point,
            "tick_size": info.trade_tick_size,
            "tick_value": info.trade_tick_value,
            "contract_size": info.trade_contract_size,
            "min_lot": info.volume_min,
            "max_lot": info.volume_max,
            "lot_step": info.volume_step,
            "stops_level": info.trade_stops_level,
            "freeze_level": info.trade_freeze_level,
            "trade_mode": info.trade_mode,
            "margin_initial": info.margin_initial,
            "margin_maintenance": info.margin_maintenance,
            "description": info.description,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/chart-history', methods=['GET'])
def chart_history():
    try:
        ensure_connected()
        symbol = request.args.get("symbol")
        timeframe = request.args.get("timeframe", "H1")
        count = int(request.args.get("count", 500))

        if not symbol:
            return jsonify({"error": "symbol is required"}), 400

        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Could not select symbol {symbol}"}), 400

        tf_map = {
            "M1": mt5.TIMEFRAME_M1,
            "M5": mt5.TIMEFRAME_M5,
            "M15": mt5.TIMEFRAME_M15,
            "M30": mt5.TIMEFRAME_M30,
            "H1": mt5.TIMEFRAME_H1,
            "H4": mt5.TIMEFRAME_H4,
            "D1": mt5.TIMEFRAME_D1,
        }
        mt5_tf = tf_map.get(timeframe.upper(), mt5.TIMEFRAME_H1)

        rates = mt5.copy_rates_from_pos(symbol, mt5_tf, 0, count)
        if rates is None or len(rates) == 0:
            return jsonify({"history": []})

        return jsonify({
            "history": [
                {
                    "time": int(r[0]),
                    "open": float(r[1]),
                    "high": float(r[2]),
                    "low": float(r[3]),
                    "close": float(r[4]),
                    "volume": int(r[5]),
                }
                for r in rates
            ]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/ticks-history', methods=['GET'])
def ticks_history():
    try:
        ensure_connected()
        symbol = request.args.get("symbol")
        count = int(request.args.get("count", 1000))

        if not symbol:
            return jsonify({"error": "symbol is required"}), 400

        if not mt5.symbol_select(symbol, True):
            return jsonify({"error": f"Could not select symbol {symbol}"}), 400

        ticks = mt5.copy_ticks_from(symbol, datetime.now() - timedelta(days=1), count, mt5.COPY_TICKS_ALL)
        if ticks is None or len(ticks) == 0:
            return jsonify({"ticks": []})

        return jsonify({
            "ticks": [
                {
                    "time": int(t[0]),
                    "bid": float(t[1]),
                    "ask": float(t[2]),
                    "volume": int(t[3]),
                }
                for t in ticks
            ]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/test', methods=['GET'])
def test():
    return jsonify({"status": "ok", "routes": [str(r) for r in app.url_map.iter_rules()]})

@app.route('/symbols', methods=['GET'])
def symbols():
    print(f"[DEBUG] /symbols endpoint called, query={request.args.get('query')}")
    try:
        ensure_connected()
        query = (request.args.get('query') or '').upper()
        group = request.args.get('group')
        path_filter = (request.args.get('path') or '').upper()
        tradeable_only = request.args.get('tradeable', 'false').lower() == 'true'
        if group:
            all_syms = mt5.symbols_get(group=group)
        elif path_filter:
            all_syms = mt5.symbols_get(path=path_filter)
        else:
            all_syms = mt5.symbols_get()
        if all_syms is None:
            return jsonify({"error": "No symbols returned by terminal", "count": 0, "symbols": []}), 200
        result = []
        for s in all_syms:
            name = s.name
            if query and query not in name.upper():
                continue
            if tradeable_only and s.trade_mode == 0:
                continue
            result.append({
                "symbol": name,
                "description": s.description,
                "path": s.path,
                "category": s.category,
                "currency_base": s.currency_base,
                "currency_profit": s.currency_profit,
                "bid": s.bid,
                "ask": s.ask,
                "visible": bool(s.visible),
                "trade_mode": s.trade_mode,
                "spread": s.spread,
            })
        return jsonify({"count": len(result), "symbols": result})
    except Exception as e:
        return jsonify({"error": str(e), "count": 0, "symbols": []}), 500

@app.route('/categories', methods=['GET'])
def categories():
    try:
        ensure_connected()
        groups = mt5.symbols_get_group_names() or []
        return jsonify({"groups": list(groups)})
    except Exception as e:
        return jsonify({"error": str(e), "groups": []}), 500

if __name__ == '__main__':
    print("Starting MT5 Python Trade Server...")
    app.run(host='0.0.0.0', port=8000, debug=False)
