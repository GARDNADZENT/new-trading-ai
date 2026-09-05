//+------------------------------------------------------------------+
//|                                                SimpleTrend_EA.mq5 |
//|                                    Copyright 2025, Your Name        |
//|                                             https://www.yoursite.com |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, Your Name"
#property link      "https://www.yoursite.com"
#property version   "1.14"

#include <Trade/Trade.mqh>

//+------------------------------------------------------------------+
//| Input parameters                                                 |
//+------------------------------------------------------------------+
input int      TargetHour      = 16;           // Hour (Kenya time) to enter
input int      TargetMinute    = 30;           // Minute (Kenya time) to enter
input int      WaitSeconds     = 60;           // Wait this many seconds after target time
input double   RiskUSD         = 10.0;         // Stop loss in USD (loss amount)
input double   RewardUSD       = 3.0;          // Take profit in USD (profit amount)
input double   SL_Points       = 500;          // Stop loss distance in points (larger = smaller lot)
input int      MagicNumber     = 202504;       // EA magic number
input int      TimeOffset      = 3;            // Time zone offset (UTC+3 for Kenya)
input double   LotSizeFixed    = 0.01;         // Fallback lot size (if calculation fails)

//+------------------------------------------------------------------+
//| Global variables                                                 |
//+------------------------------------------------------------------+
CTrade trade;
datetime g_dayStart = 0;
bool     g_tradeDone = false;
bool     g_waitingForDelay = false;
datetime g_targetTime = 0;
bool     g_bullish = false;
ulong    g_ticket = ULONG_MAX;
double   g_entryPrice = 0, g_slPrice = 0, g_tpPrice = 0;
double   g_lot = 0;
string   g_statusMessage = "Waiting for target time";

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(20); // allow 20 points slippage
   // Set fill mode (CTrade will handle it automatically)
   long fillingModes = SymbolInfoInteger(_Symbol, SYMBOL_FILLING_MODE);
   ENUM_ORDER_TYPE_FILLING fillMode = SYMBOL_FILLING_IOC;
   if((fillingModes & SYMBOL_FILLING_FOK) == SYMBOL_FILLING_FOK)
      fillMode = SYMBOL_FILLING_FOK;
   trade.SetTypeFilling(fillMode);
   Print("EA initialized. Target: ", TargetHour, ":", TargetMinute, " Kenya time");
   Print("SL = $", RiskUSD, ", TP = $", RewardUSD, ", SL points = ", SL_Points);
   g_dayStart = 0;
   g_tradeDone = false;
   g_waitingForDelay = false;
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Comment("");
}

//+------------------------------------------------------------------+
//| Helper: Get Kenya time                                           |
//+------------------------------------------------------------------+
datetime GetKenyaTime()
{
   return TimeCurrent() + TimeOffset * 3600;
}

//+------------------------------------------------------------------+
//| Helper: Get current Kenya H:M:S                                  |
//+------------------------------------------------------------------+
void GetKenyaHMS(int &hour, int &minute, int &second)
{
   datetime kenya = GetKenyaTime();
   MqlDateTime dt;
   TimeToStruct(kenya, dt);
   hour = dt.hour;
   minute = dt.min;
   second = dt.sec;
}

//+------------------------------------------------------------------+
//| Check if current time is at the target minute                    |
//+------------------------------------------------------------------+
bool IsTargetTime()
{
   int h, m, s;
   GetKenyaHMS(h, m, s);
   if(h == TargetHour && m == TargetMinute)
      return true;
   if(h == TargetHour && m == TargetMinute + 1 && s < 5)
      return true;
   return false;
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime now = TimeCurrent();

   //---- Daily reset ----
   MqlDateTime dt;
   TimeToStruct(now, dt);
   MqlDateTime dtMidnightUTC;
   TimeToStruct(now, dtMidnightUTC);
   dtMidnightUTC.hour = 0; dtMidnightUTC.min = 0; dtMidnightUTC.sec = 0;
   datetime serverMidnight = StructToTime(dtMidnightUTC);
   datetime kenyaMidnight = serverMidnight - TimeOffset * 3600;

   if(g_dayStart == 0 || (now - g_dayStart) >= 24*3600)
   {
      g_dayStart = kenyaMidnight;
      g_tradeDone = false;
      g_waitingForDelay = false;
      g_ticket = ULONG_MAX;
      g_statusMessage = "Day reset - waiting for target time";
      Print("Day reset at Kenya 00:00");
   }

   if(g_tradeDone || g_ticket != ULONG_MAX)
   {
      UpdateDashboard();
      return;
   }

   //---- Start process at target time ----
   if(!g_waitingForDelay && IsTargetTime())
   {
      g_waitingForDelay = true;
      g_targetTime = now + WaitSeconds;
      g_statusMessage = "Target time reached. Waiting " + IntegerToString(WaitSeconds) + "s for candle to close";
      Print(g_statusMessage);
   }

   //---- After delay, check candle direction ----
   if(g_waitingForDelay && !g_tradeDone)
   {
      if(now >= g_targetTime)
      {
         double open[], close[];
         ArraySetAsSeries(open, true);
         ArraySetAsSeries(close, true);
         if(CopyOpen(_Symbol, PERIOD_M1, 1, 1, open) != 1 || CopyClose(_Symbol, PERIOD_M1, 1, 1, close) != 1)
         {
            g_statusMessage = "Cannot get candle data - skipping trade";
            Print(g_statusMessage);
            g_waitingForDelay = false;
            UpdateDashboard();
            return;
         }

         g_bullish = (close[0] > open[0]);
         g_statusMessage = "Candle " + (g_bullish ? "BULLISH" : "BEARISH") + " (O: " + DoubleToString(open[0], _Digits) + " C: " + DoubleToString(close[0], _Digits) + ")";
         Print(g_statusMessage);

         ExecuteTrade();
         g_tradeDone = true;
         g_waitingForDelay = false;
      }
   }

   //---- If missed window ----
   if(!g_waitingForDelay && !g_tradeDone && g_ticket == ULONG_MAX)
   {
      int h, m, s;
      GetKenyaHMS(h, m, s);
      int minutesSinceTarget = (h - TargetHour) * 60 + (m - TargetMinute);
      if(minutesSinceTarget > 5)
         g_statusMessage = "Missed target time - no trade today";
      else
         g_statusMessage = "Waiting for " + IntegerToString(TargetHour) + ":" + IntegerToString(TargetMinute);
   }

   UpdateDashboard();
}

//+------------------------------------------------------------------+
//| Execute trade using CTrade (handles fill mode automatically)    |
//+------------------------------------------------------------------+
void ExecuteTrade()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
   {
      g_statusMessage = "Cannot get tick";
      Print(g_statusMessage);
      return;
   }

   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);

   // Calculate lot based on SL distance and RiskUSD
   if(tickValue == 0)
   {
      g_statusMessage = "Tick value not available, using fixed lot " + DoubleToString(LotSizeFixed, 2);
      Print(g_statusMessage);
      g_lot = LotSizeFixed;
   }
   else
   {
      // loss = lot * SL_points * tickValue  =>  lot = RiskUSD / (SL_points * tickValue)
      g_lot = RiskUSD / (SL_Points * tickValue);
      // Normalize
      double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
      double stepLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
      g_lot = MathMax(minLot, MathMin(g_lot, maxLot));
      g_lot = MathRound(g_lot / stepLot) * stepLot;
      if(g_lot <= 0) g_lot = LotSizeFixed;
      Print("Calculated lot: ", g_lot, " for SL=", SL_Points, " points (Risk $", RiskUSD, ")");
   }

   // Determine direction
   int direction = g_bullish ? 1 : -1;
   double entry, sl, tp;
   double slDistance = SL_Points * point;

   // Compute TP distance to achieve RewardUSD
   double tpPoints = 0;
   if(tickValue > 0 && g_lot > 0)
      tpPoints = RewardUSD / (g_lot * tickValue);
   else
      tpPoints = SL_Points * 0.2; // fallback: 20% of SL
   if(tpPoints < 1) tpPoints = 1;
   double tpDistance = tpPoints * point;

   if(direction == 1) // Buy
   {
      entry = tick.ask;
      sl = entry - slDistance;
      tp = entry + tpDistance;
   }
   else // Sell
   {
      entry = tick.bid;
      sl = entry + slDistance;
      tp = entry - tpDistance;
   }

   if(sl == entry || tp == entry)
   {
      g_statusMessage = "SL or TP too close – aborted";
      Print(g_statusMessage);
      return;
   }

   // Use CTrade (previously worked)
   bool res = false;
   if(direction == 1)
      res = trade.Buy(g_lot, _Symbol, entry, sl, tp, "SimpleTrend");
   else
      res = trade.Sell(g_lot, _Symbol, entry, sl, tp, "SimpleTrend");

   if(res)
   {
      g_ticket = trade.ResultDeal();
      g_entryPrice = entry;
      g_slPrice = sl;
      g_tpPrice = tp;
      g_statusMessage = "Trade ACTIVE: " + (direction==1?"BUY":"SELL") + " at " + DoubleToString(entry, _Digits);
      Print("Trade executed: ", (direction==1?"BUY":"SELL"), " at ", entry,
            " SL: ", sl, " TP: ", tp, " lot: ", g_lot);
   }
   else
   {
      g_statusMessage = "Trade failed, error: " + IntegerToString(trade.ResultRetcode());
      Print(g_statusMessage);
   }
}

//+------------------------------------------------------------------+
//| Dashboard                                                        |
//+------------------------------------------------------------------+
void UpdateDashboard()
{
   string comment = "=========================================\n";
   comment += "SIMPLE TREND STRATEGY EA\n";
   datetime kenyaTime = GetKenyaTime();
   MqlDateTime kt;
   TimeToStruct(kenyaTime, kt);
   comment += "\nKenya Time: " + IntegerToString(kt.hour) + ":" +
              IntegerToString(kt.min) + ":" + IntegerToString(kt.sec);
   comment += "\nSymbol: " + _Symbol;

   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   comment += "\nCurrent Price: " + DoubleToString(price, _Digits);

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   comment += "\nAccount Balance: $" + DoubleToString(balance, 2);

   comment += "\n\nStatus: " + g_statusMessage;

   if(g_ticket != ULONG_MAX)
   {
      comment += "\nEntry: " + DoubleToString(g_entryPrice, _Digits);
      comment += "\nSL: " + DoubleToString(g_slPrice, _Digits);
      comment += "\nTP: " + DoubleToString(g_tpPrice, _Digits);
      comment += "\nLot: " + DoubleToString(g_lot, 2);
   }

   comment += "\n\nRisk: SL=$" + DoubleToString(RiskUSD,1) + ", TP=$" + DoubleToString(RewardUSD,1);
   comment += "\nTarget: " + IntegerToString(TargetHour) + ":" + IntegerToString(TargetMinute) + " Kenya time";
   comment += "\nSL points: " + DoubleToString(SL_Points,0);
   comment += "\n=========================================";
   Comment(comment);
}
//+------------------------------------------------------------------+