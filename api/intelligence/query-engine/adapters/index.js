import * as supabasePortal from './supabase-portal.js';
import * as supabaseStock from './supabase-stock.js';
import * as sql from './sql.js';

export const adapters = {
  supabase_portal: supabasePortal,
  supabase_stock: supabaseStock,
  sql,
};
