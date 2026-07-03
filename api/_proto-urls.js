/** Canonical Proto portal URLs — override via Vercel env if needed. */
export const PROTO_URLS = {
  admin: (process.env.ADMIN_PORTAL_URL || 'https://admin.proto.co.za').replace(/\/$/, ''),
  register: (process.env.REGISTER_PORTAL_URL || 'https://register.proto.co.za').replace(/\/$/, ''),
  site: (process.env.MAIN_PORTAL_URL || 'https://site.proto.co.za').replace(/\/$/, ''),
  website: (process.env.PROTO_WEBSITE_URL || 'https://proto.co.za').replace(/\/$/, ''),
};
