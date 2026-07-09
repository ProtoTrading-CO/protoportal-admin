import { registerQuery } from '../registry.js';
import portalCustomerById from './portal.customer_by_id.js';
import portalCustomersPending from './portal.customers_pending.js';
import portalCustomersSearch from './portal.customers_search.js';
import portalOrdersByCustomer from './portal.orders_by_customer.js';
import portalOrdersRecent from './portal.orders_recent.js';
import portalTopLineItems from './portal.top_line_items.js';
import stockWebsiteStockBySku from './stock.website_stock_by_sku.js';
import stockListingsSince from './stock.listings_since.js';
import stockNegativeStockList from './stock.negative_stock_list.js';
import stockLowStockList from './stock.low_stock_list.js';
import stockZeroStockList from './stock.zero_stock_list.js';
import stockHighStockList from './stock.high_stock_list.js';
import stockStmastCacheByCode from './stock.stmast_cache_by_code.js';
import stockProductsSohBySkus from './stock.products_soh_by_skus.js';
import erpProductByCode from './erp.product_by_code.js';

const REGISTERED_QUERIES = [
  portalCustomerById,
  portalCustomersPending,
  portalCustomersSearch,
  portalOrdersByCustomer,
  portalOrdersRecent,
  portalTopLineItems,
  stockWebsiteStockBySku,
  stockListingsSince,
  stockNegativeStockList,
  stockLowStockList,
  stockZeroStockList,
  stockHighStockList,
  stockStmastCacheByCode,
  stockProductsSohBySkus,
  erpProductByCode,
];

let bootstrapped = false;

export function bootstrapQueries() {
  if (bootstrapped) return listRegistered();
  for (const def of REGISTERED_QUERIES) {
    registerQuery(def);
  }
  bootstrapped = true;
  return listRegistered();
}

export function listRegistered() {
  return REGISTERED_QUERIES.map((q) => q.id);
}
