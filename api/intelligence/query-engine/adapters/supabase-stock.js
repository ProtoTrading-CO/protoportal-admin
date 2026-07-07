import { getStockClient } from '../../../_stock-client.js';

export async function run(def, params, ctx) {
  const client = getStockClient();
  return def.run(client, params, ctx);
}
