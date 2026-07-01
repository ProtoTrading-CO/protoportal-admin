export async function fetchCustomersPage({ page = 1, pageSize = 50, tab = 'regular', searchQuery = '' } = {}) {
  const params = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize), search: searchQuery });
  const res = await fetch(`/api/admin-customers?${params}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to fetch customers');
  // orderCount is included server-side — no second round-trip needed
  return {
    rows: json.rows || [],
    total: json.total || 0,
    page: json.page || page,
    pageSize: json.pageSize || pageSize,
  };
}

export async function deleteCustomer(id) {
  const res = await fetch('/api/admin-customers', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to delete customer');
}

export async function approveCustomer(id, approved = true, { customerCode } = {}) {
  const body = { id, is_approved: approved };
  if (customerCode) body.customer_code = String(customerCode).trim().toUpperCase();
  const res = await fetch('/api/admin-customers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to approve customer');
}

export async function fetchProtoActiveCustomersPage({ page = 1, pageSize = 50, searchQuery = '' } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (searchQuery) params.set('search', searchQuery);
  const res = await fetch(`/api/proto-active-customers?${params}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to fetch proto active customers');
  return {
    rows: json.rows || [],
    total: json.total || 0,
    page: json.page || page,
    pageSize: json.pageSize || pageSize,
    migrationRequired: json.migrationRequired,
    message: json.message,
  };
}

export async function updateProtoActiveCustomer(id, fields) {
  const res = await fetch('/api/proto-active-customers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...fields }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update proto active customer');
  return json.row;
}

export async function deleteProtoActiveCustomer(id) {
  const res = await fetch('/api/proto-active-customers', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to delete proto active customer');
}

export async function syncBrevoContacts() {
  const res = await fetch('/api/brevo-sync', { method: 'POST' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Brevo sync failed');
  return json;
}

export async function pushPortalCustomersToBrevo() {
  const res = await fetch('/api/customer-brevo-sync-portal', { method: 'POST' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Push to Brevo failed');
  return json;
}

export async function sendCustomerEmailBroadcast({ audience, subject, htmlContent, textContent, testEmail }) {
  const res = await fetch('/api/customer-email-broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audience, subject, htmlContent, textContent, testEmail }),
  });
  const json = await res.json();
  if (!res.ok && res.status !== 207) throw new Error(json.error || 'Email send failed');
  return json;
}

export async function fetchCrmContactsPage({ page = 1, pageSize = 1 } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const res = await fetch(`/api/crm-contacts?${params}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'CRM load failed');
  return json;
}

export async function seedProtoActiveCustomers() {
  const res = await fetch('/api/seed-proto-active-customers', { method: 'POST' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Import failed');
  return json;
}

export async function updateCustomerAdmin(id, fields) {
  const res = await fetch('/api/admin-customers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...fields }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update customer');
  return json.row;
}
