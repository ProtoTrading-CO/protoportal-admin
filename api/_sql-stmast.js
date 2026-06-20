/**
 * Read-only STMAST lookup — same query as product_image_intake.py / Bladerunner sync.
 *
 * 1. STOCK_SQL_BRIDGE_URL (recommended on Vercel) — HTTP service on BLADERUNNER-PC
 * 2. Direct mssql (SQL_SERVER / SQL_PASSWORD) when the function can reach SQL Server
 */

const FORBIDDEN_SQL_TOKENS = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'ALTER', 'DROP', 'CREATE', 'MERGE', 'TRUNCATE', 'EXEC', 'EXECUTE', 'BACKUP',
]);

const STMAST_QUERY = `
  SELECT TOP 1 CODE, DESCR, PRICE_A, ONHAND, BOOKED, DEPT
  FROM dbo.STMAST
  WHERE CODE = @code
`;

function normalizeRow(row) {
  if (!row) return null;
  return {
    CODE: row.CODE ?? row.code,
    DESCR: row.DESCR ?? row.descr,
    PRICE_A: row.PRICE_A ?? row.price_a,
    ONHAND: row.ONHAND ?? row.onhand,
    BOOKED: row.BOOKED ?? row.booked,
    DEPT: row.DEPT ?? row.dept,
  };
}

async function fetchViaBridge(sku) {
  const base = String(process.env.STOCK_SQL_BRIDGE_URL || '').trim().replace(/\/$/, '');
  if (!base) return null;

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const key = String(process.env.STOCK_SQL_BRIDGE_KEY || '').trim();
  if (key) headers['x-api-key'] = key;

  const res = await fetch(`${base}/stmast`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sku }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || json.message || `SQL bridge failed (${res.status})`);
  }
  return normalizeRow(json.row || json);
}

async function fetchViaMssql(sku) {
  const password = String(process.env.SQL_PASSWORD || '').trim();
  if (!password) {
    throw new Error('SQL_PASSWORD not configured — set STOCK_SQL_BRIDGE_URL or SQL credentials');
  }

  const sql = (await import('mssql')).default;
  const config = {
    server: process.env.SQL_SERVER || 'BLADERUNNER-PC',
    database: process.env.SQL_DATABASE || 'POSWINSQL',
    user: process.env.SQL_USER || 'ProtoSyncReadOnly',
    password,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      readOnlyIntent: true,
    },
    connectionTimeout: 20000,
    requestTimeout: 20000,
  };

  const upper = STMAST_QUERY.trim().toUpperCase();
  if (!upper.startsWith('SELECT')) throw new Error('Blocked SQL');
  for (const token of FORBIDDEN_SQL_TOKENS) {
    if (upper.includes(token)) throw new Error(`Blocked SQL token: ${token}`);
  }

  const pool = await sql.connect(config);
  try {
    const result = await pool.request()
      .input('code', sql.VarChar(64), sku)
      .query(STMAST_QUERY);
    return normalizeRow(result.recordset?.[0] || null);
  } finally {
    await pool.close();
  }
}

export async function fetchStmastRow(sku) {
  const code = String(sku || '').trim().toUpperCase();
  if (!code) return null;

  if (process.env.STOCK_SQL_BRIDGE_URL) {
    return fetchViaBridge(code);
  }
  return fetchViaMssql(code);
}

export function sqlRowToPreview(sqlRow) {
  if (!sqlRow) return null;
  const onhand = Number(sqlRow.ONHAND) || 0;
  const booked = Number(sqlRow.BOOKED) || 0;
  return {
    code: String(sqlRow.CODE || '').trim(),
    title: String(sqlRow.DESCR || '').trim(),
    price: Number(sqlRow.PRICE_A) || 0,
    onhand,
    booked,
    available: onhand - booked,
    dept: String(sqlRow.DEPT || '').trim(),
  };
}
