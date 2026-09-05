import { marketService } from './services/marketService.js';
import { pairManager } from './services/pairManager.js';

console.log('Selected pairs:', pairManager.getSelectedPairs());

try {
  const us100 = await pairManager.getPairSnapshot('US100');
  console.log('US100 snapshot:', us100);
} catch (err) {
  console.log('US100 error:', err.message);
}

try {
  const us30 = await pairManager.getPairSnapshot('US30');
  console.log('US30 snapshot:', us30);
} catch (err) {
  console.log('US30 error:', err.message);
}
