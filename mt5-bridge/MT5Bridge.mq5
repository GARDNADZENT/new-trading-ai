#property copyright "TradePulse Bridge"
#property version   "1.00"
#property strict

input int MagicNumber = 123456;
input int Slippage = 10;

string QueueFile = "trade_queue.txt";
string ResultFile = "trade_results.txt";

void OnInit() {
   Print("[MT5Bridge] OnInit called");
   EventSetTimer(1);
   Print("[MT5Bridge] Running in file-poll mode");
}

void OnTimer() {
   string queuePath = "Files/" + QueueFile;
   int handle = FileOpen(queuePath, FILE_READ | FILE_ANSI);
   if (handle == INVALID_HANDLE) {
      Print("[MT5Bridge] Queue file not found: ", queuePath);
      return;
   }

   Print("[MT5Bridge] Queue file opened");
   int processed = 0;
   while (FileIsEnding(handle) == false) {
      string line = FileReadString(handle);
      line = StringTrimLeft(line);
      line = StringTrimRight(line);
      if (StringLen(line) == 0) continue;

      Print("[MT5Bridge] Processing: ", line);
      string result = ProcessRequest(line);
      Print("[MT5Bridge] Result: ", result);
      WriteResult(result);
      processed++;
   }

   FileClose(handle);
   if (processed > 0) {
      Print("[MT5Bridge] Processed ", processed, " request(s)");
   }
}

string ProcessRequest(string request) {
   string parts[];
   int count = StringSplit(request, '|', parts);

   if (count < 6) {
      return "ERROR|Invalid request format";
   }

   string action = parts[0];
   string symbol = parts[1];
   double volume = StringToDouble(parts[2]);
   double sl = StringToDouble(parts[3]);
   double tp = StringToDouble(parts[4]);
   int magic = (int)StringToInteger(parts[5]);
   string comment = "";
   if (count > 6) comment = parts[6];

   Print("[MT5Bridge] Action: ", action, " Symbol: ", symbol, " Volume: ", volume);

   if (!SymbolSelect(symbol, true)) {
      return "ERROR|Symbol not found: " + symbol;
   }

   double price = 0.0;
   if (action == "BUY") {
      price = SymbolInfoDouble(symbol, SYMBOL_ASK);
   } else if (action == "SELL") {
      price = SymbolInfoDouble(symbol, SYMBOL_BID);
   } else {
      return "ERROR|Invalid action: " + action;
   }

   if (price <= 0) {
      return "ERROR|Invalid price for: " + symbol;
   }

   MqlTradeRequest tradeRequest;
   MqlTradeResult tradeResult;
   ZeroMemory(tradeRequest);
   ZeroMemory(tradeResult);

   tradeRequest.action = TRADE_ACTION_DEAL;
   tradeRequest.symbol = symbol;
   tradeRequest.volume = volume;
   tradeRequest.magic = magic;
   tradeRequest.comment = comment;
   tradeRequest.deviation = Slippage;

   if (action == "BUY") {
      tradeRequest.type = ORDER_TYPE_BUY;
      tradeRequest.price = SymbolInfoDouble(symbol, SYMBOL_ASK);
   } else if (action == "SELL") {
      tradeRequest.type = ORDER_TYPE_SELL;
      tradeRequest.price = SymbolInfoDouble(symbol, SYMBOL_BID);
   } else {
      return "ERROR|Invalid action: " + action;
   }

   if (sl > 0) tradeRequest.sl = sl;
   if (tp > 0) tradeRequest.tp = tp;

   if (!OrderSend(tradeRequest, tradeResult)) {
      int err = GetLastError();
      Print("[MT5Bridge] OrderSend failed, error: ", err);
      return "ERROR|code=" + IntegerToString(err);
   }

   Print("[MT5Bridge] OrderSend success, retcode: ", tradeResult.retcode, " order: ", tradeResult.order);
   if (tradeResult.retcode == TRADE_RETCODE_DONE || tradeResult.retcode == TRADE_RETCODE_PLACED) {
      return "OK|" + IntegerToString(tradeResult.order);
   } else {
      return "ERROR|code=" + IntegerToString(tradeResult.retcode);
   }
}

void WriteResult(string result) {
   string resultPath = "Files/" + ResultFile;
   int handle = FileOpen(resultPath, FILE_WRITE | FILE_ANSI);
   if (handle != INVALID_HANDLE) {
      FileWrite(handle, result);
      FileClose(handle);
      Print("[MT5Bridge] Result written: ", result);
   } else {
      Print("[MT5Bridge] Failed to open result file: ", resultPath);
   }
}

void OnDeinit(const int reason) {
   EventKillTimer();
   Print("[MT5Bridge] EA stopped. Reason: ", reason);
}
