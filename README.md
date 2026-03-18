# Seller Assistant

`seller-assistant` is an OpenClaw plugin for Shopify merchant operations workflows.

> [!WARNING]
> This project is evolving quickly. Many features are still incomplete, and tool behavior, configuration, and public interfaces may change without preserving backward compatibility between releases.

It packages four grouped seller tools:

- `seller_analytics`: store-level sales facts for one window or fixed multi-window summaries
- `seller_inventory`: product-level inventory lookup
- `seller_orders`: product-level recent sales facts plus draft-order query/create/update/invoice_send/complete, fulfillment-order query/hold/release_hold/move, order query/get/update/cancel/capture, order-edit session begin, fulfillment creation, return query/create, and refund creation
- `seller_catalog`: paginated product and variant browse/list queries plus product fact bundles with inventory, recent sales, price, cost, and margin facts when available

For the broader Shopify Admin API sales/ops coverage plan and the mechanism-only tool direction, see [Shopify Admin Sales/Ops Capability Map](./docs/shopify-admin-sales-ops-capability-map.md).

## Install

Install from npm:

```bash
openclaw plugins install @planetbee/seller-assistant
```

Or from a local checkout:

```bash
openclaw plugins install -l /path/to/openclaw-seller-assistant
```

Restart the gateway if it is already running, then verify the plugin:

```bash
openclaw plugins info seller-assistant
openclaw plugins doctor
```

Plugin skills are loaded with the plugin, so restart the gateway after changes to the plugin or its `skills/` directory.

By default, these registered tools do not need to be added to a manual allowlist. Only add explicit plugin or tool allowlist entries if your OpenClaw config already uses restrictive `plugins.allow` or `tools.allow` policies.

For restricted configs, add the plugin id under `plugins.allow` and list the tool names under `tools.allow`:

```json
{
  "plugins": {
    "allow": ["seller-assistant"],
    "entries": {
      "seller-assistant": {
        "enabled": true
      }
    }
  },
  "tools": {
    "allow": ["seller_analytics", "seller_inventory", "seller_orders", "seller_catalog"]
  }
}
```

Validate the config:

```bash
openclaw config validate
```

## Store config

Store config lives under:

`plugins.entries.seller-assistant.config`

Use `stores.shopify` to configure one or more Shopify stores.

Example:

```json
{
  "plugins": {
    "entries": {
      "seller-assistant": {
        "enabled": true,
        "config": {
          "defaultStoreId": "shopify-us",
          "currency": "USD",
          "stores": {
            "shopify": [
              {
                "id": "shopify-us",
                "name": "US Shopify Store",
                "storeDomain": "your-store.myshopify.com",
                "clientId": "your_shopify_client_id",
                "clientSecretEnv": "SHOPIFY_CLIENT_SECRET",
                "operations": {
                  "salesLookbackDays": 21
                }
              }
            ]
          }
        }
      }
    }
  }
}
```

In that structure:

- `stores.shopify` is a list of Shopify stores
- `defaultStoreId` is optional when only one store is configured. If set, it should match one store `id` and is used when the user does not specify a store.
- `currency` is a fallback display currency for outputs that do not have an explicit business currency from source data. It does not override Shopify's actual store or order currency.
- `locale` controls date, number, and currency formatting for tool output
- `stores.shopify[].operations.salesLookbackDays` overrides the built-in 30-day lookback for Shopify-backed orders and product fact queries

Built-in defaults when a config value is omitted:

- `currency`: `USD`
- `locale`: `en-US`
- `stores.shopify[].operations.salesLookbackDays`: `30`

## Shopify Auth Model

This plugin uses a `bring your own Shopify app` model tied to the same organization that owns the target store:

- the merchant creates or uses a Shopify app owned by that merchant's own organization
- that app is installed on a store the merchant owns
- the merchant then configures this plugin with that store's `storeDomain`, `clientId`, and `clientSecretEnv`

The plugin requests Admin API access using the merchant's own app credentials. This is a same-organization app model. It does not require a legacy store-admin custom app, but it does require that the app and the target store belong to the same owner or organization.

## Shopify Setup

To connect a Shopify store in the current model:

1. Create or use a Shopify app that belongs to the same merchant organization that owns the target store.
2. Install that app on the merchant's own Shopify store.
3. Grant the app at least the Admin API scopes listed below.
4. Copy the app client id.
5. Put the app client secret into an environment variable on the OpenClaw host.
6. Reference that environment variable name in `clientSecretEnv`.
7. Add the store entry under `plugins.entries.seller-assistant.config.stores.shopify`.

For Shopify:

- `clientId` is the merchant's own Shopify app client identifier
- `clientSecretEnv` is the name of an environment variable on the OpenClaw host that contains that merchant app's client secret
- `storeDomain` must be the merchant's `*.myshopify.com` domain for the same store where that app is installed

Example environment setup:

```bash
export SHOPIFY_CLIENT_SECRET="shpss_..."
```

Admin API scopes are configured on the Shopify app itself, not in this plugin config.

To use `seller_analytics` with Shopify, grant the app at least these Admin API scopes:

- `read_orders`
- `read_products`

Other Shopify tools follow these same permission rules:

- `seller_inventory` only needs `read_products`.
- `seller_orders` product sales facts need `read_orders` and `read_products`; order query/get need `read_orders`; order update needs `write_orders`; order-edit session begin needs the relevant order-edit scopes such as `write_order_edits`; draft orders need the relevant draft-order scopes; fulfillment-order query and hold/release/move need the relevant fulfillment-order scopes; cancel/capture/fulfillment/return/refund actions also need the relevant write-order, write-returns, and fulfillment scopes.
- `seller_catalog` needs both `read_orders` and `read_products`.

Shopify also classifies `Orders` as protected customer data. If order queries fail even though `read_orders` is configured, check whether the app still needs protected customer data access enabled or approved in Shopify's app configuration flow for its app type. Shopify notes that GraphQL requests to unapproved protected types can return HTTP `200` with an error in the `errors` hash instead of normal order data.

By default, Shopify order APIs expose only the last 60 days of orders. This plugin supports longer windows such as `last_90_days`, `last_180_days`, `last_365_days`, and custom date ranges, so apps that need older orders should also request and add `read_all_orders` together with `read_orders`.

For `seller_catalog`, `read_products` is required to access `InventoryItem.unitCost` for cost-aware product facts when Shopify exposes that cost data.

Current limitations of the Shopify analytics coverage:

- traffic, conversion, and ad spend are not currently sourced from Shopify
- inventory cover is only available when inventory totals are included and the selected window spans multiple days
- standard store overview presets include `today`, `yesterday`, `last_7_days`, `last_30_days`, `last_60_days`, `last_90_days`, `last_180_days`, and `last_365_days`
- `seller_analytics` uses `timeBasis` to decide whether a calendar window should be interpreted in the caller timezone or the store timezone

## Usage

After the plugin is loaded, ask the agent in natural language:

- "How much did my store sell today?"
- "Show store overview for my default store over the last 7 days."
- "Show a store sales summary for my default store."
- "Check store health for my default store."
- "Check inventory for short sleeve in my default store."
- "Show the latest paid unfulfilled orders in my default store."
- "List open draft orders in my default store."
- "Create a draft order for 2 units of SKU WM-01 in my default store."
- "Email the invoice for draft order gid://shopify/DraftOrder/1 in my default store."
- "Complete draft order gid://shopify/DraftOrder/1 in my default store."
- "List open fulfillment orders in my default store."
- "Place fulfillment order gid://shopify/FulfillmentOrder/1 on hold for awaiting payment."
- "Release the hold on fulfillment order gid://shopify/FulfillmentOrder/1."
- "Move fulfillment order gid://shopify/FulfillmentOrder/1 to location gid://shopify/Location/2."
- "Get order gid://shopify/Order/1001 in my default store."
- "Update order gid://shopify/Order/1001 and add note gift wrap plus tag vip."
- "Begin an order edit for gid://shopify/Order/1001 in my default store."
- "Cancel order gid://shopify/Order/1001 without refunding the original payment methods and restock the items."
- "Capture 25 USD on order gid://shopify/Order/1001 using authorized transaction gid://shopify/OrderTransaction/1."
- "Create a fulfillment for fulfillment order gid://shopify/FulfillmentOrder/1 with tracking number 1Z999."
- "Show returnable line items for order gid://shopify/Order/1001."
- "Create a return for fulfillment line item gid://shopify/FulfillmentLineItem/1 on order gid://shopify/Order/1001."
- "Refund one unit on order gid://shopify/Order/1001 and note customer appeasement."
- "List active products in my default store."
- "Show variants matching SKU WM-01 in my default store."
- "List every SKU in my default store."
- "Should I restock, discount, or clear SKU WM-01 in my default store?"
- "Should I restock SKU WM-01 in my default store?"
- "Is this SKU worth replenishing or clearing?"
- "Should I try discounting Wireless Mouse in store shopify-us?"

More examples are available in [Usage Examples](./docs/usage-examples.md).

## Notes

- Product title resolution supports full titles and title keywords.
- Ambiguous title-keyword searches return candidate choices instead of auto-selecting a product.
- SKU matching is exact. SKU prefixes or partial SKU fragments are not supported.
- The current public tool surface is domain-grouped: `seller_analytics`, `seller_inventory`, `seller_orders`, and `seller_catalog`.
- The grouped interface is still ahead of the domain depth: `seller_inventory` is currently inventory-query only, `seller_catalog` now covers product facts plus lightweight product and variant browse/list queries, and `seller_orders` now covers product sales facts, draft orders, fulfillment-order query/hold/release_hold/move, order query/get/update/cancel/capture, order-edit session begin, fulfillment creation, return query/create, and refund creation but still lacks follow-on order-edit mutations and richer fulfillment/return lifecycle actions.
- For store-level sales, use `seller_analytics` with `resource: "store_sales"`. Use `operation: "overview"` for one window and `operation: "summary"` for fixed multi-window summaries.
- For `seller_analytics`, always set `timeBasis`. Use `timeBasis: "caller"` with `callerTimeZone` for user-local windows, and `timeBasis: "store"` only when the user explicitly wants the store-local calendar.
- Store-level sales routing is skill-led: `store-sales-summary` handles factual store sales requests and `store-analysis` handles diagnosis or next-step advice, both using `seller_analytics`.
- `seller_orders` should still not be used for store totals. Its sales-reporting capability is product-level; use `seller_analytics` for store-level numbers.
- `seller_orders` and `seller_catalog` use explicit `resource`, `operation`, and `input` dispatch for domain actions.
- For `seller_catalog`, use `resource: "product_facts"` to load one product fact bundle, `resource: "product"` to query product summaries, and `resource: "variant"` to query variant summaries. Complete SKU lists use variant queries with `query: "sku:*"` and `input.allPages: true`.
- Product decisions are skill-led: the `product-decision` skill should call `seller_catalog` for facts, then reason about replenishment, markdown, or clearance in the agent/skill layer.
- Campaign and operational strategy should use grouped fact tools rather than adding new decision-only tools.

## License

MIT
