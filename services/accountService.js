import mt5MCP from './mt5MCP.js';

class AccountService {
  async getAccountInfo() {
    try {
      const result = await mt5MCP.callTool('get_trading_account_info', {});
      if (result?.content?.[0]?.type === 'text') {
        const text = result.content[0].text;
        try {
          const parsed = JSON.parse(text);
          return parsed.account || parsed;
        } catch {
          return { raw: text };
        }
      }
      if (result?.account) return result.account;
      return result;
    } catch (err) {
      console.error('[AccountService] getAccountInfo failed:', err.message);
      throw err;
    }
  }
}

export const accountService = new AccountService();
export default AccountService;
