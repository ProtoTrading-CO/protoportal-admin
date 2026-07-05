/** Fixed outgoing transactional email slugs — defaults + metadata. */

export const OUTGOING_SLUGS = [
  'trade_application_received',
  'trade_application_approved',
  'customer_password_reset',
  'admin_password_reset',
  'order_confirmation_customer',
];

export const ORDER_CONFIRMATION_SYSTEM_NOTE =
  'Line items, customer details, notes, and PDF attachments are added automatically on live send.';

export const OUTGOING_EMAIL_REGISTRY = {
  trade_application_received: {
    label: 'Trade application received',
    trigger: 'Sent when someone submits a trade signup (register/site portal → /api/trade-application-received).',
    mergeTags: ['name', 'business_name', 'email'],
    previewVars: {
      name: 'Jane Smith',
      business_name: 'ABC Stationers',
      email: 'jane@abcstationers.co.za',
    },
    defaults: {
      subject: 'We received your trade application — Proto Trading',
      introText: [
        'Hi {{name}},',
        '',
        'Thank you for applying for trade access with Proto Trading.',
        '',
        'We have received your application and will be in touch within 24 hours.',
        '',
        'If you have any questions in the meantime, reply to this email or contact us at online@proto.co.za.',
      ].join('\n'),
      htmlBlock: '',
    },
  },
  trade_application_approved: {
    label: 'Trade application approved',
    trigger: 'Sent when you approve a trade request in Customer Management (6-character code assigned).',
    mergeTags: ['name', 'business_name', 'email', 'customer_code'],
    previewVars: {
      name: 'Jane Smith',
      business_name: 'ABC Stationers',
      email: 'jane@abcstationers.co.za',
      customer_code: 'ABC123',
    },
    defaults: {
      subject: 'Your trade account is approved — Proto Trading',
      introText: [
        'Hi {{name}},',
        '',
        'Great news — your trade application for {{business_name}} has been approved.',
        '',
        'Your customer code is {{customer_code}}. You can now sign in to the trade portal and place orders.',
        '',
        'If you have any questions, reply to this email or contact us at online@proto.co.za.',
      ].join('\n'),
      htmlBlock: '',
    },
  },
  customer_password_reset: {
    label: 'Customer password reset',
    trigger: 'Sent when a trade customer requests a password reset (main/register portal → /api/customer-password-reset-email).',
    mergeTags: ['name', 'email', 'reset_link'],
    previewVars: {
      name: 'Jane Smith',
      email: 'jane@abcstationers.co.za',
      reset_link: 'https://register.proto.co.za/reset-password?token=example',
    },
    defaults: {
      subject: 'Reset your Proto Trading password',
      introText: [
        'Hi {{name}},',
        '',
        'Click the button below to set a new password for your trade portal account.',
        'This link expires in 1 hour.',
        '',
        'If you did not request this, ignore this email.',
      ].join('\n'),
      htmlBlock: '<p style="margin:0 0 24px;text-align:center;"><a href="{{reset_link}}" style="display:inline-block;background:#c40000;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:8px;">Reset password</a></p>',
    },
  },
  admin_password_reset: {
    label: 'Admin password reset',
    trigger: 'Sent when an authorized admin requests a password reset from the admin login page.',
    mergeTags: ['reset_link'],
    previewVars: {
      reset_link: 'https://admin.proto.co.za/reset-password?token=example',
    },
    defaults: {
      subject: 'Reset your Proto Admin password',
      introText: [
        'Click the button below to set a new password for your admin dashboard account.',
        'This link expires in 1 hour.',
        '',
        'If you did not request this, ignore this email.',
      ].join('\n'),
      htmlBlock: '<p style="margin:0 0 24px;text-align:center;"><a href="{{reset_link}}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:8px;">Set new password</a></p>',
    },
  },
  order_confirmation_customer: {
    label: 'Order confirmation (customer)',
    trigger: 'Sent from Fulfillment when order confirmation is emailed with PDF attached.',
    mergeTags: ['name', 'order_number'],
    previewLayout: 'order',
    systemNote: ORDER_CONFIRMATION_SYSTEM_NOTE,
    previewVars: {
      name: 'Jane Smith',
      order_number: 'ORD-1042',
    },
    defaults: {
      subject: 'Your Order Confirmation {{order_number}} — Proto Trading',
      introText: [
        'Hi {{name}},',
        '',
        'Thank you for your order. Your confirmed summary is below and your order confirmation PDF is attached.',
      ].join('\n'),
      htmlBlock: '',
    },
  },
};

export function isOutgoingSlug(slug) {
  return OUTGOING_SLUGS.includes(String(slug || '').trim());
}

export function getOutgoingMeta(slug) {
  return OUTGOING_EMAIL_REGISTRY[String(slug || '').trim()] || null;
}

export function getOutgoingDefaults(slug) {
  return getOutgoingMeta(slug)?.defaults || null;
}

export function greetingName({ name, businessName, email } = {}) {
  const contact = String(name || '').trim();
  if (contact) return contact;
  const business = String(businessName || '').trim();
  if (business) return business;
  const local = String(email || '').split('@')[0]?.trim();
  return local || 'there';
}

export function buildTradeApplicationVars({ email, name, businessName } = {}) {
  const greeting = greetingName({ name, businessName, email });
  return {
    name: greeting,
    business_name: String(businessName || '').trim(),
    email: String(email || '').trim().toLowerCase(),
  };
}

export function buildCustomerPasswordResetVars({ email, name, resetLink } = {}) {
  const greeting = greetingName({ name, email });
  return {
    name: greeting,
    email: String(email || '').trim().toLowerCase(),
    reset_link: String(resetLink || '').trim(),
  };
}

/** @deprecated use buildTradeApplicationVars + outgoing registry */
export function tradeApplicationGreetingName(opts) {
  return greetingName(opts);
}

/** @deprecated use outgoing registry defaults */
export function buildTradeApplicationEmailBodies(opts) {
  const defaults = getOutgoingDefaults('trade_application_received');
  const vars = buildTradeApplicationVars(opts);
  return {
    subject: defaults.subject,
    introText: defaults.introText.replace(/\{\{\s*name\s*\}\}/gi, vars.name),
  };
}

export const TRADE_APPLICATION_EMAIL_SUBJECT = OUTGOING_EMAIL_REGISTRY.trade_application_received.defaults.subject;
