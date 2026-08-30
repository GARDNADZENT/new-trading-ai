import { calculateLotSize, calculateRiskReward, calculateRiskAmount, calculateTradeLevels } from '../services/lotCalculator.js';

describe('Lot Calculator (Jest)', () => {
  test('basic lot calculation', () => {
    const lot = calculateLotSize({
      equity: 10000,
      riskPercent: 1,
      entryPrice: 4300,
      stopLossPrice: 4290,
      tickSize: 0.01,
      tickValue: 1,
      contractSize: 100,
      minLot: 0.01,
      maxLot: 100,
      lotStep: 0.01,
    });
    expect(lot).toBeCloseTo(0.1, 2);
  });

  test('risk reward 2:1', () => {
    const rr = calculateRiskReward(4300, 4290, 4320, 'BUY');
    expect(rr).toBe(2);
  });

  test('invalid BUY structure rejected', () => {
    const result = calculateTradeLevels({
      direction: 'BUY',
      entryPrice: 60000,
      stopLoss: 61000,
      takeProfit: 59000,
      minRiskReward: 2,
    });
    expect(result.approved).toBe(false);
  });
});
