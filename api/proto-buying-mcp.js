import { timingSafeEqual } from 'node:crypto';
import { fetchBuyingHistory, isBuyingDataConfigured } from './_sql-buying.js';

const SERVER_NAME = 'proto-buying-data';
const SERVER_VERSION = '1.0.0';
const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function authorized(req) {
  const expected = String(process.env.PROTO_BUYING_MCP_TOKEN || '').trim();
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return Boolean(expected) && safeEqual(provided, expected);
}

function toolDescriptors() {
  return [
    {
      name: 'get_buying_history',
      title: 'Get Proto buying history',
      description: 'Read current POSWINSQL stock and up to 36 months of monthly unit sales for a bounded list of Proto SKUs. Read-only; does not create or send orders.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          skus: {
            type: 'array', minItems: 1, maxItems: 500,
            items: { type: 'string', minLength: 1, maxLength: 64 },
            description: 'Proto item/SKU codes to analyse.',
          },
          months: {
            type: 'integer', minimum: 1, maximum: 36, default: 24,
            description: 'Calendar months of unit-sales history, including the current month.',
          },
        },
        required: ['skus'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object' } },
          meta: { type: 'object' },
        },
        required: ['items', 'meta'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: 'get_buying_service_status',
      title: 'Check Proto buying data status',
      description: 'Check whether the read-only Proto buying data service is configured. Returns no stock or sales records.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          configured: { type: 'boolean' },
          readOnly: { type: 'boolean' },
          service: { type: 'string' },
        },
        required: ['configured', 'readOnly', 'service'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ];
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0', id: id ?? null,
    error: { code, message, ...(data ? { data } : {}) },
  };
}

function toolResult(structuredContent, summary) {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent,
    isError: false,
  };
}

async function callTool(name, args) {
  if (name === 'get_buying_service_status') {
    const status = {
      service: SERVER_NAME,
      configured: isBuyingDataConfigured(),
      readOnly: true,
    };
    return toolResult(status, `Proto buying data is ${status.configured ? 'configured' : 'not configured'} and read-only.`);
  }
  if (name === 'get_buying_history') {
    const result = await fetchBuyingHistory({ skus: args?.skus, months: args?.months ?? 24 });
    const summary = `Read ${result.meta?.foundSkuCount || 0} of ${result.meta?.requestedSkuCount || 0} requested SKUs from POSWINSQL (${result.meta?.months || 0} months; read-only).`;
    return toolResult(result, summary);
  }
  const error = new Error(`Unknown tool: ${name}`);
  error.code = 'METHOD_NOT_FOUND';
  throw error;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', 'https://chatgpt.com');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json(jsonRpcError(null, -32600, 'Only POST is supported'));
  }
  if (!String(process.env.PROTO_BUYING_MCP_TOKEN || '').trim()) {
    return res.status(503).json(jsonRpcError(req.body?.id, -32000, 'MCP authentication is not configured'));
  }
  if (!authorized(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="proto-buying-data"');
    return res.status(401).json(jsonRpcError(req.body?.id, -32001, 'Unauthorized'));
  }

  const request = req.body;
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return res.status(400).json(jsonRpcError(request?.id, -32600, 'Invalid JSON-RPC request'));
  }
  if (request.id == null) return res.status(202).end();

  try {
    if (request.method === 'initialize') {
      return res.status(200).json(jsonRpcResult(request.id, {
        protocolVersion: request.params?.protocolVersion || DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: 'Read-only Proto buying data. Use get_buying_history for explicit SKU lists. Never claim open purchase orders, MOQ, pack sizes, supplier lead times, or purchase history are present unless returned by a future tool. Never create or send an order.',
      }));
    }
    if (request.method === 'ping') return res.status(200).json(jsonRpcResult(request.id, {}));
    if (request.method === 'tools/list') {
      return res.status(200).json(jsonRpcResult(request.id, { tools: toolDescriptors() }));
    }
    if (request.method === 'tools/call') {
      const name = String(request.params?.name || '');
      const result = await callTool(name, request.params?.arguments || {});
      console.log(JSON.stringify({
        type: 'proto_buying_mcp_read', tool: name,
        skuCount: Array.isArray(request.params?.arguments?.skus) ? request.params.arguments.skus.length : 0,
        at: new Date().toISOString(),
      }));
      return res.status(200).json(jsonRpcResult(request.id, result));
    }
    return res.status(404).json(jsonRpcError(request.id, -32601, `Method not found: ${request.method}`));
  } catch (error) {
    const invalid = error?.code === 'INVALID_PARAMS';
    return res.status(invalid ? 400 : 503).json(jsonRpcError(
      request.id,
      invalid ? -32602 : -32002,
      error?.message || 'Proto buying data unavailable',
    ));
  }
}
