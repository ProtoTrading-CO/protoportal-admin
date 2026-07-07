/** SQL / ERP adapter — queries call _sql-provider helpers; no dynamic SQL here. */

export async function run(def, params, ctx) {
  return def.run(null, params, ctx);
}
