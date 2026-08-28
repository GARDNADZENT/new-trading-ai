import axios from 'axios';
import config from '../config.js';

class Mt5MCP {
  constructor() {
    this.url = config.mt5MCP?.url || process.env.MT5_MCP_URL || 'http://127.0.0.1:22346/mcp';
    this.apiKey = config.mt5MCP?.apiKey || process.env.MT5_MCP_KEY || '';
    this.sessionId = null;
    this.initialized = false;
    this.initializing = false;
    this.requestId = 0;
    this.availableTools = [];
    this.lastError = null;
    this.requestCount = 0;
    this.errorCount = 0;
  }

  _nextId() {
    this.requestId += 1;
    return this.requestId;
  }

  _headers(extra = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
      ...extra,
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }
    return headers;
  }

  async _post(payload) {
    this.requestCount += 1;
    const resp = await axios.post(this.url, payload, {
      headers: this._headers(),
      timeout: 30000,
      validateStatus: () => true,
    });
    return resp;
  }

  async initialize() {
    if (this.initialized) {
      try {
        const testResult = await this.call('tools/list', {}, 0);
        if (testResult && !this.lastError) {
          return true;
        }
      } catch {
        this.reset();
      }
    }
    if (this.initializing) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.initialized) { clearInterval(check); resolve(true); }
          else if (!this.initializing) { clearInterval(check); resolve(false); }
        }, 50);
      });
    }
    this.initializing = true;
    try {
      const payload = {
        jsonrpc: '2.0',
        id: this._nextId(),
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'news-trader-ai', version: '1.0' },
        },
      };
      const resp = await this._post(payload);
      if (resp.status === 401) {
        this.lastError = 'MT5 MCP authentication failed: invalid or missing API key.';
        this.errorCount += 1;
        return false;
      }
      if (resp.status !== 200) {
        this.lastError = `MT5 MCP initialize failed: HTTP ${resp.status}`;
        this.errorCount += 1;
        return false;
      }
      const data = resp.data;
      this.sessionId = resp.headers['mcp-session-id'] || resp.headers['Mcp-Session-Id'] || null;
      if (data?.result?.serverInfo?.name || data?.result) {
        this.initialized = true;
        try {
          await this._sendInitialized();
        } catch (err) {
          console.warn('[MT5 MCP] Initialized notification failed:', err.message);
        }
        try {
          await this._loadTools();
        } catch (err) {
          console.warn('[MT5 MCP] Tool listing failed after init:', err.message);
        }
        return true;
      }
      this.lastError = 'MT5 MCP initialize returned unexpected response.';
      this.errorCount += 1;
      return false;
    } catch (err) {
      this.lastError = `MT5 MCP connection error: ${err.message}`;
      this.errorCount += 1;
      return false;
    } finally {
      this.initializing = false;
    }
  }

  async _sendInitialized() {
    const payload = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    };
    await this._post(payload);
  }

  async _loadTools() {
    try {
      const payload = {
        jsonrpc: '2.0',
        id: this._nextId(),
        method: 'tools/list',
        params: {},
      };
      const resp = await this._post(payload);
      if (resp.status === 200) {
        const data = resp.data;
        if (data?.result?.tools) {
          this.availableTools = data.result.tools;
          console.log(`[MT5 MCP] Tools loaded: ${this.availableTools.length}`);
          return;
        }
      }
      this.availableTools = [];
      console.warn('[MT5 MCP] No tools returned from tools/list');
    } catch (err) {
      this.availableTools = [];
      console.warn('[MT5 MCP] Tool listing failed:', err.message);
    }
  }

  async call(method, params = {}, retries = 2) {
    if (!this.initialized) {
      const ok = await this.initialize();
      if (!ok) throw new Error(this.lastError || 'MT5 MCP not initialized');
    }

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const payload = {
          jsonrpc: '2.0',
          id: this._nextId(),
          method,
          params,
        };
        const resp = await this._post(payload);
        if (resp.status === 401) {
          this.reset();
          this.lastError = 'MT5 MCP authentication failed.';
          this.errorCount += 1;
          throw new Error(this.lastError);
        }
        if (resp.status === 404) {
          this.errorCount += 1;
          const err = new Error('MT5 MCP session not found, resetting...');
          lastError = err;
          if (attempt < retries) {
            this.reset();
            const ok = await this.initialize();
            if (!ok) throw err;
            continue;
          }
          throw err;
        }
        if (resp.status !== 200) {
          this.errorCount += 1;
          throw new Error(`MT5 MCP error: HTTP ${resp.status}`);
        }
        const data = resp.data;
        if (data?.error) {
          this.errorCount += 1;
          const msg = data.error.message || JSON.stringify(data.error);
          const err = new Error(`MT5 MCP tool error: ${msg}`);
          lastError = err;
          if (attempt < retries && (msg.includes('session') || msg.includes('initialized'))) {
            this.reset();
            const ok = await this.initialize();
            if (!ok) throw err;
            continue;
          }
          throw err;
        }
        if (data?.result?.serverInfo?.name && method === 'initialize') {
          this.sessionId = resp.headers['mcp-session-id'] || resp.headers['Mcp-Session-Id'] || this.sessionId;
          this.initialized = true;
          await this._loadTools();
          return data.result;
        }
        return data?.result;
      } catch (err) {
        lastError = err;
        if (attempt < retries && (err.message.includes('session') || err.message.includes('initialized') || err.message.includes('404'))) {
          this.reset();
          const ok = await this.initialize();
          if (!ok) throw err;
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async callTool(name, args = {}) {
    return this.call('tools/call', { name, arguments: args });
  }

  isConnected() {
    return this.initialized && this.sessionId !== null;
  }

  getStatus() {
    if (!this.initialized) return 'DISCONNECTED';
    if (this.lastError) return 'ERROR';
    return 'CONNECTED';
  }

  getToolNames() {
    return this.availableTools.map(t => t.function?.name || t.name).filter(Boolean);
  }

  hasTool(name) {
    return this.getToolNames().includes(name);
  }

  reset() {
    this.initialized = false;
    this.sessionId = null;
    this.availableTools = [];
    this.lastError = null;
    this.requestId = 0;
  }

  getStats() {
    return {
      url: this.url,
      status: this.getStatus(),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      toolCount: this.availableTools.length,
      sessionId: this.sessionId ? 'active' : 'none',
      lastError: this.lastError || null,
    };
  }
}

export const mt5MCP = new Mt5MCP();
export default mt5MCP;
