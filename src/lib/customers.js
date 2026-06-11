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

export async function approveCustomer(id, approved = true) {
  const res = await fetch('/api/admin-customers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, is_approved: approved }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to approve customer');
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
