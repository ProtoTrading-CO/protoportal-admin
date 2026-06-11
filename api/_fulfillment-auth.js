/** Only Victor may send confirmed orders back to customers. */
export function isVictorSender({ userId, name } = {}) {
  const id = String(userId || '').trim().toLowerCase();
  const n = String(name || '').trim().toLowerCase();
  return id === 'victor' || n === 'victor';
}

export const CUSTOMER_SEND_FORBIDDEN = 'Only Victor can send orders to customers.';
export const PAYMENT_RECEIVED_FORBIDDEN = 'Only Victor can mark payment received.';
