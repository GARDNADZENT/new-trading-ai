import { tradeService } from './tradeService.js';

class AccountService {
  async getAccountInfo() {
    try {
      const result = await tradeService.getAccountInfo();
      return result;
    } catch (err) {
      console.error('[AccountService] getAccountInfo failed:', err.message);
      throw err;
    }
  }
}

export const accountService = new AccountService();
export default AccountService;
