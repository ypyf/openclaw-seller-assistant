# Seller Assistant

`seller-assistant` is an OpenClaw plugin for merchant operations workflows across commerce platforms. It currently supports Shopify store connectivity, and is designed to expand to additional platforms such as Amazon over time.

> [!WARNING]
> This project is evolving quickly. Many features are still incomplete, and tool behavior, configuration, and public interfaces may change without preserving backward compatibility between releases.

It packages seven seller tools:

- `seller_store_overview`: the single store-level sales tool for either one-window store facts or fixed multi-window store sales summaries
- `seller_inventory_query`: look up current on-hand inventory for an exact SKU, full product title, or title keywords
- `seller_sales_query`: query recent sales for an exact SKU, full product title, or title keywords
- `seller_quote_builder`: draft RFQ / quote responses with margin guardrails
- `seller_replenishment_decision`: decide whether to restock or reorder a product using Shopify inventory and recent sales
- `seller_discount_decision`: decide whether a product is a candidate for markdown or discount testing
- `seller_clearance_decision`: decide whether a product is a candidate for clearance

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
    "allow": [
      "seller_store_overview",
      "seller_inventory_query",
      "seller_sales_query",
      "seller_quote_builder",
      "seller_replenishment_decision",
      "seller_discount_decision",
      "seller_clearance_decision"
    ]
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

Use platform names as keys under `stores`.

The example below only shows Shopify because Shopify is the only store platform currently implemented.

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
          "decisionPolicy": {
            "insufficientDataMinUnitsSold": 3,
            "insufficientDataMinLookbackDays": 14,
            "weakDemandDailySalesThreshold": 0.3,
            "healthyDemandDailySalesThreshold": 1,
            "discountMinInventoryDays": 60,
            "clearanceMinInventoryDays": 120,
            "clearanceStrongSignalInventoryDays": 180,
            "veryLowLookbackUnitsFactor": 0.1
          },
          "stores": {
            "shopify": [
              {
                "id": "shopify-us",
                "name": "US Shopify Store",
                "storeDomain": "your-store.myshopify.com",
                "clientId": "your_shopify_client_id",
                "clientSecretEnv": "SHOPIFY_CLIENT_SECRET",
                "operations": {
                  "supplierLeadDays": 10,
                  "safetyStockDays": 7,
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
- `stores.shopify[].operations` is the store-level operational config for replenishment and sales lookback behavior
- `stores.shopify[].operations.supplierLeadDays` and `stores.shopify[].operations.safetyStockDays` are used by replenishment decisions when the user does not provide those inputs
- `stores.shopify[].operations.salesLookbackDays` overrides the built-in 30-day lookback for Shopify-backed sales and product decision tools
- there is no built-in default for `supplierLeadDays` or `safetyStockDays`; if both are missing and the user does not provide them, replenishment asks for input
- legacy top-level or flat store-level `supplierLeadDays`, `safetyStockDays`, and `salesLookbackDays` fields are no longer supported
- `decisionPolicy` is the shared policy object for replenishment / discount / clearance thresholds. Omit it to use built-in defaults, or override only the fields you want to tune.

Built-in defaults when a config value is omitted:

- `currency`: `USD`
- `locale`: `en-US`
- `lowInventoryDays`: `14`
- `responseTone`: `consultative`
- `stores.shopify[].operations.salesLookbackDays`: `30`
- `decisionPolicy.weakDemandDailySalesThreshold`: `0.3`
- `decisionPolicy.healthyDemandDailySalesThreshold`: `1`
- `decisionPolicy.insufficientDataMinLookbackDays`: `14`
- `decisionPolicy.insufficientDataMinUnitsSold`: `3`
- `decisionPolicy.discountMinInventoryDays`: `60`
- `decisionPolicy.clearanceMinInventoryDays`: `120`
- `decisionPolicy.clearanceStrongSignalInventoryDays`: `180`
- `decisionPolicy.veryLowLookbackUnitsFactor`: `0.1`

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

To use `seller_store_overview` with Shopify, grant the app at least these Admin API scopes:

- `read_orders`
- `read_products`

Other Shopify tools follow these same permission rules:

- `seller_inventory_query` only needs `read_products`.
- `seller_sales_query` and `seller_replenishment_decision` use the same order and product data as `seller_store_overview`, so they also need both `read_orders` and `read_products`.
- `seller_discount_decision` and `seller_clearance_decision` also need both `read_orders` and `read_products`.

Shopify also classifies `Orders` as protected customer data. If order queries fail even though `read_orders` is configured, check whether the app still needs protected customer data access enabled or approved in Shopify's app configuration flow for its app type. Shopify notes that GraphQL requests to unapproved protected types can return HTTP `200` with an error in the `errors` hash instead of normal order data.

By default, Shopify order APIs expose only the last 60 days of orders. This plugin supports longer windows such as `last_90_days`, `last_180_days`, `last_365_days`, and custom date ranges, so apps that need older orders should also request and add `read_all_orders` together with `read_orders`.

For `seller_discount_decision` and `seller_clearance_decision`, `read_products` is required to access `InventoryItem.unitCost` for cost-aware pricing guidance.

Current limitations of the Shopify store overview:

- traffic, conversion, and ad spend are not currently sourced from Shopify
- inventory cover is only available when inventory totals are included and the selected window spans multiple days
- standard store overview presets include `today`, `yesterday`, `last_7_days`, `last_30_days`, `last_60_days`, `last_90_days`, `last_180_days`, and `last_365_days`
- `seller_store_overview` uses `timeBasis` to decide whether a calendar window should be interpreted in the caller timezone or the store timezone

## Usage

After the plugin is loaded, ask the agent in natural language:

- "How much did my store sell today?"
- "Show store overview for my default store over the last 7 days."
- "Show a store sales summary for my default store."
- "Check store health for my default store."
- "Check inventory for short sleeve in my default store."
- "Draft a quote for Acme for 500 wireless mice. Unit cost is 8, target price is 12, competitor price is 11.5, and lead time is 10 days."
- "Should I restock, discount, or clear SKU WM-01 in my default store?"
- "Should I restock SKU WM-01 in my default store?"
- "Is this SKU worth replenishing or clearing?"
- "Should I try discounting Wireless Mouse in store shopify-us?"

More examples are available in [Usage Examples](./docs/usage-examples.md).

## Notes

- Product title resolution supports full titles and title keywords.
- Ambiguous title-keyword searches return candidate choices instead of auto-selecting a product.
- SKU matching is exact. SKU prefixes or partial SKU fragments are not supported.
- `seller_store_overview` is the only store-level sales tool. Use single-window mode for one store window and analysis input, or pass `windows` for fixed plain-text multi-window summaries.
- For `seller_store_overview`, always set `timeBasis`. Use `timeBasis: "caller"` with `callerTimeZone` for user-local windows, and `timeBasis: "store"` only when the user explicitly wants the store-local calendar.
- Store-level sales routing is skill-led: `store-sales-summary` handles factual store sales requests and `store-analysis` handles diagnosis or next-step advice, both using `seller_store_overview`.
- `seller_sales_query` is a product-level recent-sales capability only. Use it when the user asks how much a specific product sold recently, not for store totals.
- Product decisions are skill-led: the `product-decision` skill should call `seller_replenishment_decision`, `seller_discount_decision`, and/or `seller_clearance_decision` depending on the user's ask, and aggregate outputs for multi-part questions.
- `seller_replenishment_decision`, `seller_discount_decision`, and `seller_clearance_decision` support inventory-and-pricing decisions only. They do not answer paid-promotion or ad-investment questions.
- Discount and clearance pricing guidance require Shopify cost access. If Shopify product cost permission is missing, those tools should ask the user to enable it rather than invent alternate data sources or silently downgrade the pricing result.
- Campaign planning remains skill-led and should stay focused on promotion strategy, not replenishment / discount / clearance ownership.

## License

MIT
