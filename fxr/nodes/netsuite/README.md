# n8n-nodes-fxr-netsuite

FXR's n8n nodes for **NetSuite**. Ships inside the FXR n8n image (see `scripts/fxr/README.md`).
No runtime dependencies.

## Nodes

### NetSuite

| Resource | Operations |
|----------|-----------|
| **Record** | Create, Get, Get Many (REST `q` filters, pagination), Update, Delete. Sales Order, Customer, Item Fulfillment and Inventory Adjustment have a typed **Fields** form (with line items); every record type also accepts a raw **JSON** body. Custom record types supported. |
| **Saved Search** | Run any saved search by script/internal ID, with optional extra filters, via the bundled RESTlet. |
| **SuiteQL** | Execute SuiteQL with automatic pagination. |
| **Raw Request** | Signed request to any `/services/rest/...` endpoint. |

Flagged `usableAsTool`, so AI Agent nodes can call it.

### NetSuite Trigger

Polling trigger. Watches a SuiteQL table (`transaction` with a type filter, `customer`, `vendor`,
`contact`, `item`, or a custom record table) for **created** or **created/updated** rows using
`datecreated` / `lastmodifieddate`. Re-queries with a configurable overlap and de-duplicates by
id + timestamp, so NetSuite's commit lag doesn't drop or double-fire records. Manual runs return the
last 24 hours (max 10 rows) so you can see the shape of the data.

## Authentication

Both nodes offer two credential types.

**Token-Based Authentication (OAuth 1.0a, HMAC-SHA256)**
1. Setup → Company → Enable Features → SuiteCloud: *REST Web Services*, *Token-Based Authentication*.
2. Setup → Integration → Manage Integrations → New: check *Token-Based Authentication*. Copy the
   consumer key and secret.
3. Setup → Users/Roles → Access Tokens → New: pick the integration, a user and a role with *REST Web
   Services* and *Log in using Access Tokens*. Copy the token ID and secret.
4. Account ID from Setup → Company → Company Information (sandboxes look like `1234567_SB1`).

**OAuth 2.0 Machine-to-Machine (client credentials, JWT bearer, PS256)**
1. Generate a key pair:
   `openssl req -x509 -newkey rsa:4096 -sha256 -keyout key.pem -out cert.pem -nodes -days 730`
2. Setup → Integration → Manage Integrations → New: check *OAuth 2.0* → *Client Credentials
   (Machine to Machine) Grant*, scope *REST Web Services* (and *RESTlets* for saved searches). Copy
   the client ID.
3. Setup → Integration → OAuth 2.0 Client Credentials Setup → Create New: pick the integration,
   a user and role, upload `cert.pem`. Copy the Certificate ID.
4. In n8n, paste `key.pem` into the credential's Private Key field.

Tokens are cached in memory and refreshed 30 seconds before expiry.

## Saved Search RESTlet (one-time setup)

Saved searches aren't exposed through SuiteTalk REST, so the node calls a small RESTlet:

1. Customization → Scripting → Scripts → New → upload `suitescript/savedSearchRestlet.js`.
2. Create Script Record (RESTlet), then Deploy. Set status *Released*, audience = the role used by
   your token or certificate.
3. Copy the **Script ID** (e.g. `customscript_fxr_saved_search`) and **Deployment ID** into the
   NetSuite credential.

Results come back one row per result: `{ id, recordType, <column>: value | { value, text } }`.

## Notes

- **Record IDs**: internal ID, or `eid:MY-EXT-ID` to address by external ID. The same prefix works in
  typed reference fields (e.g. Location `eid:WH-EAST`).
- **Get Many filters** use the REST query syntax, e.g.
  `email IS "jane@example.com" AND dateCreated AFTER "2026-01-01"`.
- **SuiteQL** is the fastest way to read (joins, aggregates); the Record resource is for writes.
- Create returns `{ success, id, recordType }`, extracting the new ID from the `Location` header.
- Transaction type codes for the trigger: `SalesOrd`, `CustInvc`, `ItemShip`, `CashSale`,
  `CustPymt`, `CustCred`, `RtnAuth`, `PurchOrd`, `ItemRcpt`, `VendBill`, `InvAdjst`, `TrnfrOrd`.

## Development

```bash
pnpm install --ignore-workspace
pnpm build        # tsc + copy icons to dist
pnpm test         # jest
pnpm typecheck
```

Local n8n: symlink `dist` into `~/.n8n/custom` or set `N8N_CUSTOM_EXTENSIONS` to the parent of
`dist`. In CI the package is compiled from the repo root with `tsc -p tsconfig.ci.json`, which uses
the monorepo's TypeScript and `n8n-workflow` build (no package install), and `dist` is copied to
`/usr/local/lib/node_modules/n8n/fxr-nodes/netsuite` inside the image.
