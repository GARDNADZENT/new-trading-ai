import MetaTrader5 as mt5
import time
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os

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
            "profit": account_info.profit,
            "currency": account_info.currency,
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
            }), 400

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
            }), 400

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    print("Starting MT5 Python Trade Server...")
    app.run(host='0.0.0.0', port=8000, debug=False)
