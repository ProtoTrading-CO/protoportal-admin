import { getPortalAdminClient } from '../../../_site-config.js';

export async function run(def, params, ctx) {
  const client = getPortalAdminClient();
  return def.run(client, params, ctx);
}
