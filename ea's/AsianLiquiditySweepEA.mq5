//+------------------------------------------------------------------+
//|                                                    AsianLiqSweep.mq5 |
//|                        Asian Liquidity Sweep EA (M15/M5/M1)        |
//|                            Strategy: OB + 50% Mitigation          |
//+------------------------------------------------------------------+
#property copyright "AsianLiqSweep EA"
#property version   "1.00"
#property strict

//+------------------------------------------------------------------+
//| Input Parameters                                                 |
//+------------------------------------------------------------------+
input group "=== Asian Session ==="
input int      AsianSessionStartHour   = 0;      // Asian Session Start (Broker Hour, 0-23)
input int      AsianSessionEndHour     = 8;      // Asian Session End (Broker Hour)
input bool     UseSessionEndForRange   = true;   // Freeze Asian Range at Session End

input group "=== Risk Management ==="
input double   RiskPercent             = 0.5;    // Risk Per Trade (%)
input int      StopLossPoints          = 0;      // SL Points (0 = Auto)
input int      TakeProfitPoints        = 0;      // TP Points (0 = Opposite Asian Liquidity)
input bool     UseOppositeAsianTP      = true;   // TP = Opposite Asian Liquidity
input int      SLBufferPoints          = 10;     // SL Buffer Points (Beyond OB + Buffer)
input int      SLOffsetPoints          = 20;     // SL Offset Points (Beyond Sweep/OB)
input int      SLMode                  = 3;      // SL Mode: 1=Beyond OB, 2=Beyond Sweep, 3=Beyond OB+Buff

input group "=== Order Block Settings ==="
input double   OB_Mitigation_Percent   = 50.0;   // Preferred OB Mitigation %
input double   OB_Mitigation_Min       = 40.0;   // Minimum OB Mitigation %
input double   OB_Mitigation_Max       = 75.0;   // Maximum OB Mitigation %
input int      OB_LookbackBars         = 10;     // OB Lookback Bars (M5)
input int      SwingLookback           = 3;      // Swing Lookback for BOS
input int      DisplacementBodyPct     = 60;     // Displacement Body % Min
input double   DisplacementATRMult     = 1.2;    // Displacement ATR Multiplier

input group "=== Trade Filters ==="
input int      MaxTradesPerDay         = 3;      // Max Trades Per Day
input int      MaxSpreadPoints         = 30;     // Max Spread Points
input bool     AllowMultipleEntriesPerSweep = false; // Multiple Entries Per OB
input bool     OneTradePerSession      = true;   // One Trade Per Asian Session
input int      MagicNumber             = 123456; // EA Magic Number
input string   TradeComment            = "AsianLiqSweep";

input group "=== Timeframes ==="
input ENUM_TIMEFRAMES M15_ContextTF   = PERIOD_M15; // Context Timeframe
input ENUM_TIMEFRAMES M5_OBTF         = PERIOD_M5;   // Order Block TF
input ENUM_TIMEFRAMES M1_ExecTF       = PERIOD_M1;   // Execution TF

input group "=== EA Controls ==="
input bool     TradingEnabled          = true;   // Enable Trading
input bool     DebugLog               = true;   // Debug Logging

input group "=== Dashboard ==="
input bool     ShowDashboard           = true;   // Show Dashboard
input int      DashboardX              = 10;     // Dashboard X Position
input int      DashboardY              = 20;     // Dashboard Y Position
input color    DashboardBgColor        = clrBlack; // Background Color
input color    DashboardTextColor      = clrWhite; // Text Color
input color    DashboardLabelColor     = clrGray;  // Label Color
input color    DashboardValueColor     = clrLime;  // Value Color
input color    DashboardAlertColor     = clrRed;   // Alert Color
input int      DashboardFontSize       = 9;      // Font Size

//+------------------------------------------------------------------+
//| Global Variables                                                  |
//+------------------------------------------------------------------+
enum ENUM_STATE { STATE_IDLE, STATE_WAITING_SWEEP, STATE_SWEEP_HIGH, STATE_SWEEP_LOW, STATE_OB_FOUND, STATE_WAITING_MITIGATION, STATE_IN_TRADE, STATE_WAITING_REVERSAL, STATE_SECOND_CHANCE };
enum ENUM_SWEEP { SWEEP_NONE, SWEEP_HIGH, SWEEP_LOW };
enum ENUM_SIDE { SIDE_NONE, SIDE_BUY, SIDE_SELL };

ENUM_STATE    eaState                = STATE_IDLE;
ENUM_SWEEP    sweepType              = SWEEP_NONE;
ENUM_SIDE     tradeDirection         = SIDE_NONE;
bool          sweepHighTraded        = false;
bool          sweepLowTraded         = false;
datetime      asianHighTime          = 0;
datetime      asianLowTime           = 0;
datetime      currentAsianDate       = 0;
double        asianHigh              = 0.0;
double        asianLow               = 0.0;
double        asianMid               = 0.0;
double        obHigh                 = 0.0;
double        obLow                  = 0.0;
datetime      obTime                 = 0;
double        sweepHigh              = 0.0;
double        sweepLow               = 0.0;
datetime      sweepTime              = 0;
int           tradesToday            = 0;
datetime      lastTradeDate          = 0;
double        pointSize              = 0.0;
int           digits                 = 0;
double        lastM1Close            = 0.0;
double        lastM1High             = 0.0;
double        lastM1Low              = 0.0;
double        mitigationLevel        = 0.0;

//+------------------------------------------------------------------+
//| Helper: Get Symbol Point Size                                     |
//+------------------------------------------------------------------+
void GetPointInfo()
{
   pointSize = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   digits    = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
}

//+------------------------------------------------------------------+
//| Helper: Points to Price                                           |
//+------------------------------------------------------------------+
double PointsToPrice(int points)
{
   return points * pointSize * 10.0;
}

//+------------------------------------------------------------------+
//| Helper: Normalize Price                                           |
//+------------------------------------------------------------------+
double NormalizePrice(double price)
{
   return NormalizeDouble(price, digits);
}

//+------------------------------------------------------------------+
//| Helper: Get Current Broker Hour                                   |
//+------------------------------------------------------------------+
int GetCurrentHour()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   return dt.hour;
}

//+------------------------------------------------------------------+
//| Helper: Get Current Date (Day Only)                               |
//+------------------------------------------------------------------+
datetime GetCurrentDate()
{
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0;
   dt.min  = 0;
   dt.sec  = 0;
   return StructToTime(dt);
}

//+------------------------------------------------------------------+
//| Helper: Count Trades Today                                        |
//+------------------------------------------------------------------+
int CountTradesToday()
{
   if(GetCurrentDate() != lastTradeDate)
   {
      tradesToday = 0;
      lastTradeDate = GetCurrentDate();
   }
   return tradesToday;
}

//+------------------------------------------------------------------+
//| Helper: Check Open Position                                       |
//+------------------------------------------------------------------+
bool HasOpenPosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(PositionSelectByTicket(ticket))
      {
         if(PositionGetInteger(POSITION_MAGIC) == MagicNumber && PositionGetString(POSITION_SYMBOL) == _Symbol)
         {
            return true;
         }
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Helper: Get Position Direction                                    |
//+------------------------------------------------------------------+
ENUM_SIDE GetPositionDirection()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(PositionSelectByTicket(ticket))
      {
         if(PositionGetInteger(POSITION_MAGIC) == MagicNumber && PositionGetString(POSITION_SYMBOL) == _Symbol)
         {
            if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
               return SIDE_BUY;
            else
               return SIDE_SELL;
         }
      }
   }
   return SIDE_NONE;
}

//+------------------------------------------------------------------+
//| Helper: Calculate Lot Size Based on Risk                          |
//+------------------------------------------------------------------+
double CalculateLotSize(double slPrice)
{
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskAmount = equity * (RiskPercent / 100.0);
   
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   
   if(tickSize == 0 || tickValue == 0)
   {
      Print("Invalid tick size/value, using default lot 0.01");
      return 0.01;
   }
   
   double slPoints = MathAbs(slPrice - SymbolInfoDouble(_Symbol, SYMBOL_BID));
   slPoints = NormalizeDouble(slPoints / pointSize, 0);
   
   if(slPoints <= 0) return 0.01;
   
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   
   double riskPerLot = (slPoints / tickSize) * tickValue;
   double lots = riskAmount / riskPerLot;
   
   lots = MathFloor(lots / lotStep) * lotStep;
   lots = NormalizeDouble(lots, 2);
   
   if(lots < minLot) lots = minLot;
   if(lots > maxLot) lots = maxLot;
   
   return lots;
}

//+------------------------------------------------------------------+
//| Helper: Check If Price is in OB Zone                             |
//+------------------------------------------------------------------+
bool IsPriceInOB(double price, double obH, double obL)
{
   return (price >= MathMin(obH, obL) && price <= MathMax(obH, obL));
}

//+------------------------------------------------------------------+
//| Helper: Get OB Mitigation Level                                   |
//+------------------------------------------------------------------+
double GetOBMitigationLevel(double obH, double obL, double percent, bool forBuy)
{
   double obRange = MathAbs(obH - obL);
   double mitigation = (percent / 100.0) * obRange;
   
   if(forBuy)
      return obL + mitigation;
   else
      return obH - mitigation;
}

//+------------------------------------------------------------------+
//| Helper: Find Swing High (M5)                                      |
//+------------------------------------------------------------------+
double FindSwingHigh(int startBar, int lookback)
{
   double swingHigh = 0.0;
   MqlRates rates[];
   if(CopyRates(_Symbol, M5_OBTF, startBar, lookback * 2 + 1, rates) < lookback * 2 + 1) return 0.0;
   ArraySetAsSeries(rates, true);
   
   for(int i = lookback; i < ArraySize(rates) - lookback; i++)
   {
      bool isHigh = true;
      for(int j = 1; j <= lookback; j++)
      {
         if(rates[i].high <= rates[i-j].high || rates[i].high <= rates[i+j].high)
         {
            isHigh = false;
            break;
         }
      }
      if(isHigh && rates[i].high > swingHigh)
      {
         swingHigh = rates[i].high;
      }
   }
   return swingHigh;
}

//+------------------------------------------------------------------+
//| Helper: Find Swing Low (M5)                                       |
//+------------------------------------------------------------------+
double FindSwingLow(int startBar, int lookback)
{
   double swingLow = 999999.0;
   MqlRates rates[];
   if(CopyRates(_Symbol, M5_OBTF, startBar, lookback * 2 + 1, rates) < lookback * 2 + 1) return 0.0;
   ArraySetAsSeries(rates, true);
   
   for(int i = lookback; i < ArraySize(rates) - lookback; i++)
   {
      bool isLow = true;
      for(int j = 1; j <= lookback; j++)
      {
         if(rates[i].low >= rates[i-j].low || rates[i].low >= rates[i+j].low)
         {
            isLow = false;
            break;
         }
      }
      if(isLow && rates[i].low < swingLow)
      {
         swingLow = rates[i].low;
      }
   }
   return swingLow == 999999.0 ? 0.0 : swingLow;
}

//+------------------------------------------------------------------+
//| Helper: Calculate M5 ATR                                         |
//+------------------------------------------------------------------+
double CalculateM5ATR(int period)
{
   MqlRates rates[];
   if(CopyRates(_Symbol, M5_OBTF, 0, period + 1, rates) < period + 1) return 0.0;
   ArraySetAsSeries(rates, true);
   
   double atr = 0.0;
   for(int i = 1; i < period; i++)
   {
      double tr = MathMax(rates[i].high, rates[i-1].close) - MathMin(rates[i].low, rates[i-1].close);
      atr += tr;
   }
   return atr / (period - 1);
}

//+------------------------------------------------------------------+
//| Helper: Log Debug Message                                        |
//+------------------------------------------------------------------+
void LogDebug(string msg)
{
   if(DebugLog)
   {
      Print("[AsianLiqSweep] ", TimeCurrent(), " ", msg);
   }
}

//+------------------------------------------------------------------+
//| Reset Daily Counters                                              |
//+------------------------------------------------------------------+
void ResetDaily()
{
   datetime today = GetCurrentDate();
   if(today != lastTradeDate)
   {
      tradesToday = 0;
      lastTradeDate = today;
   }
}

//+------------------------------------------------------------------+
//| Reset State                                                      |
//+------------------------------------------------------------------+
void ResetState()
{
   eaState       = STATE_IDLE;
   sweepType     = SWEEP_NONE;
   tradeDirection = SIDE_NONE;
   obTime        = 0;
   asianHighTime = 0;
   asianLowTime  = 0;
   sweepHighTraded = false;
   sweepLowTraded  = false;
   mitigationLevel = 0.0;
}

//+------------------------------------------------------------------+
//| Calculate Asian Session Range                                    |
//+------------------------------------------------------------------+
bool CalculateAsianRange()
{
   if(AsianSessionStartHour == AsianSessionEndHour)
   {
      LogDebug("Invalid Asian session hours");
      return false;
   }
   
   int currentHour = GetCurrentHour();
   bool sessionEnded = false;
   
   if(AsianSessionStartHour < AsianSessionEndHour)
   {
      sessionEnded = (currentHour >= AsianSessionEndHour);
   }
   else
   {
      sessionEnded = (currentHour >= AsianSessionEndHour && currentHour < AsianSessionStartHour);
   }
   
   if(!UseSessionEndForRange && !sessionEnded)
   {
      if(asianHigh > 0.0 && asianLow > 0.0)
         return true;
      return false;
   }
   
   datetime today = GetCurrentDate();
   if(today == currentAsianDate && asianHigh > 0.0 && asianLow > 0.0)
      return true;
   
   MqlRates m15Rates[];
   datetime sessionStart = today + AsianSessionStartHour * 3600;
   datetime sessionEnd   = today + AsianSessionEndHour * 3600;
   
   if(AsianSessionStartHour > AsianSessionEndHour && currentHour >= AsianSessionEndHour)
   {
      sessionStart = today - (24 - AsianSessionStartHour) * 3600;
      sessionEnd   = today + AsianSessionEndHour * 3600;
   }
   
   int startBar = iBarShift(_Symbol, M15_ContextTF, sessionStart);
   int endBar   = iBarShift(_Symbol, M15_ContextTF, sessionEnd);
   
   if(startBar < 0 || endBar < 0 || startBar <= endBar)
   {
      LogDebug("Invalid bar shift for Asian range");
      return false;
   }
   
   int barsToCopy = startBar - endBar + 1;
   if(CopyRates(_Symbol, M15_ContextTF, endBar, barsToCopy, m15Rates) < barsToCopy)
   {
      LogDebug("Failed to copy M15 rates for Asian range");
      return false;
   }
   
   ArraySetAsSeries(m15Rates, false);
   
   asianHigh = m15Rates[0].high;
   asianLow  = m15Rates[0].low;
   asianMid  = (asianHigh + asianLow) / 2.0;
   currentAsianDate = today;
   
   LogDebug("Asian Range Calculated: High=" + DoubleToString(asianHigh, digits) + " Low=" + DoubleToString(asianLow, digits) + " Mid=" + DoubleToString(asianMid, digits));
   return true;
}

//+------------------------------------------------------------------+
//| Detect Asian Liquidity Sweep                                      |
//+------------------------------------------------------------------+
ENUM_SWEEP DetectSweep()
{
   if(asianHigh <= 0.0 || asianLow <= 0.0)
      return SWEEP_NONE;
   
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   
   bool highSwept = (ask > asianHigh || bid > asianHigh);
   bool lowSwept = (ask < asianLow || bid < asianLow);
   
   if(sweepType == SWEEP_NONE)
   {
      if(highSwept && !sweepHighTraded)
      {
         sweepHigh = MathMax(ask, bid);
         sweepTime = TimeCurrent();
         sweepType = SWEEP_HIGH;
         LogDebug("Asian HIGH Sweep detected at " + DoubleToString(sweepHigh, digits));
         return SWEEP_HIGH;
      }
      else if(lowSwept && !sweepLowTraded)
      {
         sweepLow = MathMin(ask, bid);
         sweepTime = TimeCurrent();
         sweepType = SWEEP_LOW;
         LogDebug("Asian LOW Sweep detected at " + DoubleToString(sweepLow, digits));
         return SWEEP_LOW;
      }
   }
   else if(sweepType == SWEEP_HIGH && !sweepHighTraded)
   {
      if(!highSwept)
      {
         sweepType = SWEEP_NONE;
      }
   }
   else if(sweepType == SWEEP_LOW && !sweepLowTraded)
   {
      if(!lowSwept)
      {
         sweepType = SWEEP_NONE;
      }
   }
   
   return sweepType;
}

//+------------------------------------------------------------------+
//| Detect M5 Order Block (Bearish/Supply)                            |
//+------------------------------------------------------------------+
bool DetectBearishOrderBlock()
{
   MqlRates rates[];
   int barsToCopy = OB_LookbackBars + SwingLookback * 2 + 10;
   if(CopyRates(_Symbol, M5_OBTF, 0, barsToCopy, rates) < barsToCopy)
   {
      LogDebug("Failed to copy M5 rates for bearish OB");
      return false;
   }
   ArraySetAsSeries(rates, true);
    
   double m5ATR = CalculateM5ATR(14);
   if(m5ATR <= 0) return false;
    
   double avgRange = m5ATR * 1.0;
    
   for(int i = 2; i < ArraySize(rates) - SwingLookback - 2; i++)
   {
      MqlRates obCandle  = rates[i];
      MqlRates dispCandle = rates[i-1];
        
      double bodySize = MathAbs(dispCandle.close - dispCandle.open);
      double totalRange = dispCandle.high - dispCandle.low;
        
      if(totalRange <= 0) continue;
        
      double bodyPct = (bodySize / totalRange) * 100.0;
      if(bodyPct < 40.0) continue;
        
      if(dispCandle.close >= dispCandle.open) continue;
      if(totalRange < avgRange * 1.0) continue;
        
      if(!(obCandle.close > obCandle.open)) continue;
        
      obHigh = obCandle.high;
      obLow  = obCandle.low;
      obTime = obCandle.time;
        
      LogDebug("Bearish Supply OB found: High=" + DoubleToString(obHigh, digits) + " Low=" + DoubleToString(obLow, digits) + " Time=" + TimeToString(obTime));
      return true;
   }
    
   return false;
}

//+------------------------------------------------------------------+
//| Detect M5 Order Block (Bullish/Demand)                            |
//+------------------------------------------------------------------+
bool DetectBullishOrderBlock()
{
   MqlRates rates[];
   int barsToCopy = OB_LookbackBars + SwingLookback * 2 + 10;
   if(CopyRates(_Symbol, M5_OBTF, 0, barsToCopy, rates) < barsToCopy)
   {
      LogDebug("Failed to copy M5 rates for bullish OB");
      return false;
   }
   ArraySetAsSeries(rates, true);
    
   double m5ATR = CalculateM5ATR(14);
   if(m5ATR <= 0) return false;
    
   double avgRange = m5ATR * 1.0;
    
   for(int i = 2; i < ArraySize(rates) - SwingLookback - 2; i++)
   {
      MqlRates obCandle   = rates[i];
      MqlRates dispCandle = rates[i-1];
        
      double bodySize = MathAbs(dispCandle.close - dispCandle.open);
      double totalRange = dispCandle.high - dispCandle.low;
        
      if(totalRange <= 0) continue;
        
      double bodyPct = (bodySize / totalRange) * 100.0;
      if(bodyPct < 40.0) continue;
        
      if(dispCandle.close <= dispCandle.open) continue;
      if(totalRange < avgRange * 1.0) continue;
        
      if(!(obCandle.close < obCandle.open)) continue;
        
      obHigh = obCandle.high;
      obLow  = obCandle.low;
      obTime = obCandle.time;
        
      LogDebug("Bullish Demand OB found: High=" + DoubleToString(obHigh, digits) + " Low=" + DoubleToString(obLow, digits));
      return true;
   }
    
   return false;
}

//+------------------------------------------------------------------+
//| Check BOS on M5                                                   |
//+------------------------------------------------------------------+
bool CheckBearishBOS()
{
   MqlRates rates[];
   int barsToCopy = SwingLookback * 2 + 10;
   if(CopyRates(_Symbol, M5_OBTF, 0, barsToCopy, rates) < barsToCopy) return false;
   ArraySetAsSeries(rates, true);
    
   double recentHigh = 0.0;
   for(int i = 0; i < SwingLookback + 2; i++)
   {
      if(rates[i].high > recentHigh)
         recentHigh = rates[i].high;
   }
    
   for(int i = 0; i < 8; i++)
   {
      if(rates[i].close < rates[i].open)
      {
         if(rates[i].high - rates[i].low > CalculateM5ATR(14) * 0.8)
            return true;
      }
   }
   return false;
}

bool CheckBullishBOS()
{
   MqlRates rates[];
   int barsToCopy = SwingLookback * 2 + 10;
   if(CopyRates(_Symbol, M5_OBTF, 0, barsToCopy, rates) < barsToCopy) return false;
   ArraySetAsSeries(rates, true);
    
   double recentLow = 999999.0;
   for(int i = 0; i < SwingLookback + 2; i++)
   {
      if(rates[i].low < recentLow)
         recentLow = rates[i].low;
   }
    
   for(int i = 0; i < 8; i++)
   {
      if(rates[i].close > rates[i].open)
      {
         if(rates[i].high - rates[i].low > CalculateM5ATR(14) * 0.8)
            return true;
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Check M1 Mitigation                                               |
//+------------------------------------------------------------------+
bool CheckMitigationOnM1()
{
   if(obTime == 0 || obHigh <= 0.0 || obLow <= 0.0)
      return false;
    
   MqlRates m1Rates[];
   int barsToCopy = 50;
   if(CopyRates(_Symbol, M1_ExecTF, 0, barsToCopy, m1Rates) < barsToCopy)
      return false;
   ArraySetAsSeries(m1Rates, true);
    
   lastM1Close = m1Rates[0].close;
   lastM1High  = m1Rates[0].high;
   lastM1Low   = m1Rates[0].low;
    
   double obRange = obHigh - obLow;
   double minMitigation = obLow + (OB_Mitigation_Min / 100.0) * obRange;
   double prefMitigation = obLow + (OB_Mitigation_Percent / 100.0) * obRange;
   double maxMitigation = obLow + (OB_Mitigation_Max / 100.0) * obRange;
    
   if(tradeDirection == SIDE_SELL)
   {
      if(lastM1High >= minMitigation)
      {
         mitigationLevel = MathMax(lastM1High, prefMitigation);
         
         if(m1Rates[0].close < m1Rates[0].open)
         {
            LogDebug("SELL mitigation + rejection on M1: High=" + DoubleToString(lastM1High, digits) + " Close=" + DoubleToString(m1Rates[0].close, digits));
            return true;
         }
         if(m1Rates[0].close < mitigationLevel)
         {
            LogDebug("SELL mitigation + close below level on M1: High=" + DoubleToString(lastM1High, digits) + " Close=" + DoubleToString(m1Rates[0].close, digits));
            return true;
         }
      }
   }
   else if(tradeDirection == SIDE_BUY)
   {
      double maxMitBuy = obHigh - (OB_Mitigation_Min / 100.0) * obRange;
      double prefMitBuy = obHigh - (OB_Mitigation_Percent / 100.0) * obRange;
      
      if(lastM1Low <= maxMitBuy)
      {
         mitigationLevel = MathMin(lastM1Low, prefMitBuy);
         
         if(m1Rates[0].close > m1Rates[0].open)
         {
            LogDebug("BUY mitigation + rejection on M1: Low=" + DoubleToString(lastM1Low, digits) + " Close=" + DoubleToString(m1Rates[0].close, digits));
            return true;
         }
         if(m1Rates[0].close > mitigationLevel)
         {
            LogDebug("BUY mitigation + close above level on M1: Low=" + DoubleToString(lastM1Low, digits) + " Close=" + DoubleToString(m1Rates[0].close, digits));
            return true;
         }
      }
   }
    
   return false;
}

//+------------------------------------------------------------------+
//| Check Spread                                                     |
//+------------------------------------------------------------------+
bool CheckSpread()
{
   long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(spread > MaxSpreadPoints)
   {
      LogDebug("Spread too high: " + IntegerToString(spread) + " > " + IntegerToString(MaxSpreadPoints));
      return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| Calculate Stop Loss Price                                        |
//+------------------------------------------------------------------+
double CalculateSL(ENUM_SIDE side)
{
   if(SLMode == 1)
   {
      if(side == SIDE_SELL)
         return NormalizePrice(obHigh + PointsToPrice(SLBufferPoints));
      else
         return NormalizePrice(obLow - PointsToPrice(SLBufferPoints));
   }
   else if(SLMode == 2)
   {
      if(side == SIDE_SELL)
         return NormalizePrice(sweepHigh + PointsToPrice(SLOffsetPoints));
      else
         return NormalizePrice(sweepLow - PointsToPrice(SLOffsetPoints));
   }
   else
   {
      if(side == SIDE_SELL)
         return NormalizePrice(obHigh + PointsToPrice(SLBufferPoints));
      else
         return NormalizePrice(obLow - PointsToPrice(SLBufferPoints));
   }
}

//+------------------------------------------------------------------+
//| Calculate Take Profit Price                                      |
//+------------------------------------------------------------------+
double CalculateTP(ENUM_SIDE side)
{
   if(UseOppositeAsianTP)
   {
      if(side == SIDE_SELL)
         return NormalizePrice(asianLow);
      else
         return NormalizePrice(asianHigh);
   }
   else if(TakeProfitPoints > 0)
   {
      double sl = CalculateSL(side);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      
      if(side == SIDE_SELL)
         return NormalizePrice(sl - PointsToPrice(TakeProfitPoints));
      else
         return NormalizePrice(sl + PointsToPrice(TakeProfitPoints));
   }
   return 0.0;
}

//+------------------------------------------------------------------+
//| Execute Trade                                                     |
//+------------------------------------------------------------------+
bool ExecuteTrade(ENUM_SIDE side)
{
   if(!CheckSpread())
      return false;
   
   if(CountTradesToday() >= MaxTradesPerDay)
   {
      LogDebug("Max daily trades reached");
      return false;
   }
   
   if(HasOpenPosition())
   {
      LogDebug("Position already open");
      return false;
   }
   
   double sl = CalculateSL(side);
   double tp = CalculateTP(side);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   
   double lot = CalculateLotSize(sl);
   if(lot <= 0) return false;
   
   MqlTradeRequest request = {};
   MqlTradeResult  result  = {};
   
   request.action       = TRADE_ACTION_DEAL;
   request.symbol       = _Symbol;
   request.volume       = lot;
   request.magic        = MagicNumber;
   request.deviation    = 10;
   request.type_filling = ORDER_FILLING_FOK;
   
   if(side == SIDE_BUY)
   {
      request.type = ORDER_TYPE_BUY;
      request.price = ask;
      request.sl = sl;
      request.tp = tp;
   }
   else
   {
      request.type = ORDER_TYPE_SELL;
      request.price = bid;
      request.sl = sl;
      request.tp = tp;
   }
   
   request.comment = TradeComment;
   
   if(!OrderSend(request, result))
   {
      LogDebug("OrderSend failed: " + IntegerToString(result.retcode) + " " + result.comment);
      return false;
   }
   
   tradesToday++;
   lastTradeDate = GetCurrentDate();
   LogDebug("Trade executed: " + EnumToString(side) + " Lot=" + DoubleToString(lot, 2) + " SL=" + DoubleToString(sl, digits) + " TP=" + DoubleToString(tp, digits) + " Result=" + IntegerToString(result.retcode));
   return true;
}

//+------------------------------------------------------------------+
//| Dashboard Functions                                               |
//+------------------------------------------------------------------+
void DeleteDashboard()
{
   ObjectsDeleteAll(0, "Dash_");
}

void CreateDashboardObject(string name, int x, int y, string text, color clr, bool bold = false)
{
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, DashboardFontSize);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
}

void UpdateDashboard()
{
   if(!ShowDashboard) return;
    
   DeleteDashboard();
    
   int x = DashboardX;
   int y = DashboardY;
   int rowHeight = DashboardFontSize + 4;
    
   string stateStr = "IDLE";
   color stateClr = clrGray;
   if(eaState == STATE_WAITING_SWEEP) { stateStr = "WAITING SWEEP"; stateClr = clrYellow; }
   else if(eaState == STATE_SWEEP_HIGH) { stateStr = "SWEEP HIGH"; stateClr = clrOrange; }
   else if(eaState == STATE_SWEEP_LOW) { stateStr = "SWEEP LOW"; stateClr = clrOrange; }
   else if(eaState == STATE_OB_FOUND) { stateStr = "OB FOUND"; stateClr = clrSkyBlue; }
   else if(eaState == STATE_WAITING_MITIGATION) { stateStr = "WAITING MITIGATION"; stateClr = clrYellow; }
   else if(eaState == STATE_IN_TRADE) { stateStr = "IN TRADE"; stateClr = clrLime; }
    
   string sweepStr = "NONE";
   if(sweepType == SWEEP_HIGH) sweepStr = "HIGH";
   else if(sweepType == SWEEP_LOW) sweepStr = "LOW";
    
   string directionStr = "-";
   if(tradeDirection == SIDE_BUY) directionStr = "BUY";
   else if(tradeDirection == SIDE_SELL) directionStr = "SELL";
    
   long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   string spreadStr = IntegerToString((int)spread);
    
   CreateDashboardObject("Dash_Title", x, y, "=== AsianLiqSweep EA ===", DashboardValueColor, true);
   y += rowHeight;
    
   CreateDashboardObject("Dash_State", x, y, "State: " + stateStr, stateClr);
   y += rowHeight;
    
   CreateDashboardObject("Dash_Sweep", x, y, "Sweep: " + sweepStr, DashboardValueColor);
   y += rowHeight;
    
   CreateDashboardObject("Dash_HighStatus", x, y, "High Sweep: " + (sweepHighTraded ? "TRADED" : "AVAILABLE"), sweepHighTraded ? clrGray : clrLime);
   y += rowHeight;
    
   CreateDashboardObject("Dash_LowStatus", x, y, "Low Sweep: " + (sweepLowTraded ? "TRADED" : "AVAILABLE"), sweepLowTraded ? clrGray : clrLime);
   y += rowHeight;
    
   CreateDashboardObject("Dash_Direction", x, y, "Direction: " + directionStr, DashboardValueColor);
   y += rowHeight;
    
   CreateDashboardObject("Dash_Spread", x, y, "Spread: " + spreadStr + " pts", DashboardTextColor);
   y += rowHeight;
    
   CreateDashboardObject("Dash_Trades", x, y, "Trades Today: " + IntegerToString(tradesToday) + "/" + IntegerToString(MaxTradesPerDay), DashboardTextColor);
   y += rowHeight;
    
   if(asianHigh > 0.0 && asianLow > 0.0)
   {
      CreateDashboardObject("Dash_AH", x, y, "Asian High: " + DoubleToString(asianHigh, digits), DashboardValueColor);
      y += rowHeight;
      
      CreateDashboardObject("Dash_AM", x, y, "Asian Mid:  " + DoubleToString(asianMid, digits), DashboardTextColor);
      y += rowHeight;
      
      CreateDashboardObject("Dash_AL", x, y, "Asian Low:  " + DoubleToString(asianLow, digits), DashboardValueColor);
      y += rowHeight;
   }
   else
   {
      CreateDashboardObject("Dash_AR", x, y, "Asian Range: Calculating...", DashboardTextColor);
      y += rowHeight;
   }
    
   if(obHigh > 0.0 && obLow > 0.0)
   {
      CreateDashboardObject("Dash_OB", x, y, "OB: " + DoubleToString(obLow, digits) + " - " + DoubleToString(obHigh, digits), DashboardAlertColor);
      y += rowHeight;
      
      double obRange = obHigh - obLow;
      double mitLevel = obLow + (OB_Mitigation_Percent / 100.0) * obRange;
      
      if(tradeDirection == SIDE_SELL)
      {
         CreateDashboardObject("Dash_Mit", x, y, "Mitigation (SELL >=): " + DoubleToString(mitLevel, digits), DashboardValueColor);
      }
      else if(tradeDirection == SIDE_BUY)
      {
         mitLevel = obHigh - (OB_Mitigation_Percent / 100.0) * obRange;
         CreateDashboardObject("Dash_Mit", x, y, "Mitigation (BUY <=): " + DoubleToString(mitLevel, digits), DashboardValueColor);
      }
      else
      {
         CreateDashboardObject("Dash_Mit", x, y, "Mitigation: " + DoubleToString(mitLevel, digits), DashboardTextColor);
      }
      y += rowHeight;
      
      if(obTime > 0)
      {
         CreateDashboardObject("Dash_OBTime", x, y, "OB Time: " + TimeToString(obTime), DashboardTextColor);
      }
   }
}

//+------------------------------------------------------------------+
//| Expert initialization function                                    |
//+------------------------------------------------------------------+
int OnInit()
{
   GetPointInfo();
   ResetDaily();
   ResetState();
   
   if(ShowDashboard)
   {
      UpdateDashboard();
   }
   
   LogDebug("EA Initialized. Asian Session: " + IntegerToString(AsianSessionStartHour) + ":00 - " + IntegerToString(AsianSessionEndHour) + ":00");
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert tick function                                              |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!TradingEnabled)
      return;
    
   ResetDaily();
    
   if(HasOpenPosition())
   {
      if(eaState != STATE_IN_TRADE)
      {
         tradeDirection = GetPositionDirection();
         eaState = STATE_IN_TRADE;
         LogDebug("Position already open: " + EnumToString(tradeDirection));
      }
      if(ShowDashboard)
      {
         UpdateDashboard();
      }
      return;
   }
    
   if(eaState == STATE_IN_TRADE)
   {
      eaState = STATE_IDLE;
      tradeDirection = SIDE_NONE;
      LogDebug("Position closed, resetting to IDLE");
   }
    
   if(!CalculateAsianRange())
   {
      if(ShowDashboard)
      {
         UpdateDashboard();
      }
      return;
   }
    
   if(CountTradesToday() >= MaxTradesPerDay)
   {
      if(ShowDashboard)
      {
         UpdateDashboard();
      }
      return;
   }
    
   if(sweepHighTraded && sweepLowTraded)
   {
      if(ShowDashboard)
      {
         UpdateDashboard();
      }
      return;
   }
    
   switch(eaState)
   {
      case STATE_IDLE:
      case STATE_WAITING_SWEEP:
         eaState = STATE_WAITING_SWEEP;
         DetectSweep();
         
         if(sweepType == SWEEP_HIGH && !sweepHighTraded)
         {
            eaState = STATE_SWEEP_HIGH;
            LogDebug("State changed: STATE_SWEEP_HIGH");
         }
         else if(sweepType == SWEEP_LOW && !sweepLowTraded)
         {
            eaState = STATE_SWEEP_LOW;
            LogDebug("State changed: STATE_SWEEP_LOW");
         }
         else if(sweepType == SWEEP_NONE)
         {
            if(!sweepHighTraded)
            {
               eaState = STATE_WAITING_SWEEP;
            }
            else if(!sweepLowTraded)
            {
               eaState = STATE_WAITING_SWEEP;
            }
         }
         break;
         
      case STATE_SWEEP_HIGH:
         if(CheckBearishBOS() && DetectBearishOrderBlock())
         {
            eaState = STATE_OB_FOUND;
            tradeDirection = SIDE_SELL;
            LogDebug("Bearish OB found, waiting for M1 mitigation");
         }
         break;
         
      case STATE_SWEEP_LOW:
         if(CheckBullishBOS() && DetectBullishOrderBlock())
         {
            eaState = STATE_OB_FOUND;
            tradeDirection = SIDE_BUY;
            LogDebug("Bullish OB found, waiting for M1 mitigation");
         }
         break;
         
      case STATE_OB_FOUND:
      case STATE_WAITING_MITIGATION:
         eaState = STATE_WAITING_MITIGATION;
         
         if(CheckMitigationOnM1())
         {
            LogDebug("Mitigation confirmed, executing " + EnumToString(tradeDirection));
            if(ExecuteTrade(tradeDirection))
            {
               if(sweepType == SWEEP_HIGH)
                  sweepHighTraded = true;
               else if(sweepType == SWEEP_LOW)
                  sweepLowTraded = true;
               
               eaState = STATE_IN_TRADE;
            }
            else
            {
               eaState = STATE_IDLE;
               tradeDirection = SIDE_NONE;
               sweepType = SWEEP_NONE;
            }
         }
         break;
         
      default:
         break;
   }
    
   if(ShowDashboard)
   {
      UpdateDashboard();
   }
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(ShowDashboard)
   {
      DeleteDashboard();
   }
   LogDebug("EA Deinitialized. Reason: " + IntegerToString(reason));
}
//+------------------------------------------------------------------+
