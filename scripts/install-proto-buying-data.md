# Proto Buying Data deployment

This service is read-only. Do not add SQL write operations or arbitrary SQL execution.

## 1. Required secrets

Use three separate values:

- `SQL_PASSWORD`: existing `ProtoSyncReadOnly` SQL login password, stored only on Bladerunner.
- `STOCK_SQL_BRIDGE_KEY`: existing bridge key, stored on Bladerunner and Vercel.
- `PROTO_BUYING_MCP_TOKEN`: a new long random bearer token, stored on Vercel and the connector host. Do not reuse the bridge key.

Never place real values in committed files.

## 2. Deploy the Bladerunner bridge

From a Windows machine with PowerShell remoting access to `BLADERUNNER-PC`:

```powershell
.\scripts\deploy_bridge.ps1
```

The deployment script restarts only the existing bridge process and verifies:

- `/version`
- `/health`
- `/stmast`
- `/top-sellers`
- `/buying-history`

The final check requires `readOnly=true`.

## 3. Configure the admin deployment

Set these production environment variables without exposing their values:

- `STOCK_SQL_BRIDGE_URL=https://sql-bridge.proto.co.za`
- `STOCK_SQL_BRIDGE_KEY`
- `PROTO_BUYING_MCP_TOKEN`

Deploy the `protoportal-admin` branch containing the service.

The authenticated admin REST endpoint is:

`https://admin.proto.co.za/api/buying-data`

The bearer-authenticated Streamable HTTP MCP endpoint is:

`https://admin.proto.co.za/api/proto-buying-mcp`

## 4. Verify the live data path

Run from an environment containing the bridge URL and key:

```bash
npm run test:bridge-buying -- 8626100145
```

Then connect the MCP endpoint with `PROTO_BUYING_MCP_TOKEN` and verify:

1. `initialize`
2. `tools/list`
3. `get_buying_service_status`
4. `get_buying_history` for a known SKU

Confirm requested/found counts, the data timestamp, `readOnly=true`, on-hand stock and monthly unit sales against POSWINSQL.

## 5. Current data contract

Available:

- current `ONHAND`
- customer-reserved `BOOKED`
- calculated available stock
- department
- `PRICE_A` as a labelled ERP field, not assumed cost
- monthly unit sales, value and invoice count for up to 36 months

Not yet available:

- open supplier purchase orders / confirmed incoming stock
- supplier purchase history
- lead time
- MOQ
- pack or carton size

Do not map `BOOKED` to stock on order. Use order/container files for unavailable fields until the ERP schema is verified.

## 6. Inspect the remaining ERP schema

On Bladerunner, run:

```powershell
python scripts\inspect-buying-schema.py > buying-schema.json
```

This makes a read-only `INFORMATION_SCHEMA.COLUMNS` query for an allowlist of known tables. Review the output before implementing purchase-history or open-order queries; never guess column names or relationships.
