import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import handler from '../../api/proto-buying-mcp.js';

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

function request(method, body, token = 'test-token') {
  return {
    method,
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

describe('Proto buying MCP endpoint', () => {
  const originalToken = process.env.PROTO_BUYING_MCP_TOKEN;
  const originalBridgeUrl = process.env.STOCK_SQL_BRIDGE_URL;
  const originalSqlPassword = process.env.SQL_PASSWORD;

  beforeEach(() => { process.env.PROTO_BUYING_MCP_TOKEN = 'test-token'; });
  afterEach(() => {
    if (originalToken === undefined) delete process.env.PROTO_BUYING_MCP_TOKEN;
    else process.env.PROTO_BUYING_MCP_TOKEN = originalToken;
    if (originalBridgeUrl === undefined) delete process.env.STOCK_SQL_BRIDGE_URL;
    else process.env.STOCK_SQL_BRIDGE_URL = originalBridgeUrl;
    if (originalSqlPassword === undefined) delete process.env.SQL_PASSWORD;
    else process.env.SQL_PASSWORD = originalSqlPassword;
  });

  it('fails closed when bearer authentication is wrong', async () => {
    const res = mockResponse();
    await handler(request('POST', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'wrong'), res);
    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toMatch(/^Bearer/);
  });

  it('advertises only read-only buying tools', async () => {
    const res = mockResponse();
    await handler(request('POST', { jsonrpc: '2.0', id: 2, method: 'tools/list' }), res);
    expect(res.statusCode).toBe(200);
    const tools = res.body.result.tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      'get_buying_history', 'get_buying_service_status',
    ]);
    expect(tools.every((tool) => tool.annotations.readOnlyHint === true)).toBe(true);
    expect(tools.every((tool) => tool.annotations.destructiveHint === false)).toBe(true);
  });

  it('initializes with explicit read-only server instructions', async () => {
    const res = mockResponse();
    await handler(request('POST', {
      jsonrpc: '2.0', id: 3, method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.result.serverInfo.name).toBe('proto-buying-data');
    expect(res.body.result.instructions).toMatch(/read-only/i);
    expect(res.body.result.instructions).toMatch(/never create or send an order/i);
  });

  it('returns service status without reading stock records', async () => {
    delete process.env.STOCK_SQL_BRIDGE_URL;
    delete process.env.SQL_PASSWORD;
    const res = mockResponse();
    await handler(request('POST', {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'get_buying_service_status', arguments: {} },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.result.structuredContent).toEqual({
      service: 'proto-buying-data', configured: false, readOnly: true,
    });
  });
});
