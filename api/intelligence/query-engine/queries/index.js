import { registerQuery } from '../registry.js';
import portalCustomerById from './portal.customer_by_id.js';
import stockWebsiteStockBySku from './stock.website_stock_by_sku.js';
import erpProductByCode from './erp.product_by_code.js';

const PHASE1_QUERIES = [
  portalCustomerById,
  stockWebsiteStockBySku,
  erpProductByCode,
];

let bootstrapped = false;

export function bootstrapQueries() {
  if (bootstrapped) return listRegistered();
  for (const def of PHASE1_QUERIES) {
    registerQuery(def);
  }
  bootstrapped = true;
  return listRegistered();
}

export function listRegistered() {
  return PHASE1_QUERIES.map((q) => q.id);
}

export { portalCustomerById, stockWebsiteStockBySku, erpProductByCode };
