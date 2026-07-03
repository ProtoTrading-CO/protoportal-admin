/** Trade application acknowledgment — shared by API + smoke tests. */

export const TRADE_APPLICATION_EMAIL_SUBJECT = 'We received your trade application — Proto Trading';

export function tradeApplicationGreetingName({ name, businessName, email } = {}) {
  const contact = String(name || '').trim();
  if (contact) return contact;
  const business = String(businessName || '').trim();
  if (business) return business;
  const local = String(email || '').split('@')[0]?.trim();
  return local || 'there';
}

export function buildTradeApplicationEmailBodies({ name, businessName, email } = {}) {
  const greeting = tradeApplicationGreetingName({ name, businessName, email });
  const introText = [
    `Hi ${greeting},`,
    '',
    'Thank you for applying for trade access with Proto Trading.',
    '',
    'We have received your application and will be in touch within 24 hours.',
    '',
    'If you have any questions in the meantime, reply to this email or contact us at online@proto.co.za.',
  ].join('\n');
  return { subject: TRADE_APPLICATION_EMAIL_SUBJECT, introText };
}
