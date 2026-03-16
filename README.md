# Seller Assistant

`seller-assistant` is an OpenClaw plugin for merchant operations workflows across commerce platforms. It currently supports Shopify store connectivity, and is designed to expand to additional platforms such as Amazon over time.

> [!WARNING]
> This project is evolving quickly. Many features are still incomplete, and tool behavior, configuration, and public interfaces may change without preserving backward compatibility between releases.

It packages eight seller tools:

- `seller_store_overview`: look up store-level revenue, order volume, units sold, and optional inventory totals for a time window
- `seller_store_sales_summary`: return a fixed plain-text multi-window store sales summary
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
      "seller_store_sales_summary",
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
          "supplierLeadDays": 7,
          "safetyStockDays": 5,
          "salesLookbackDays": 30,
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
                "supplierLeadDays": 10,
                "safetyStockDays": 7,
                "salesLookbackDays": 21
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
- store-level `supplierLeadDays`, `safetyStockDays`, and `salesLookbackDays` override the plugin-level defaults for that store
- plugin-level `supplierLeadDays` and `safetyStockDays` remain shared fallbacks for replenishment decisions
- plugin-level `salesLookbackDays` remains the shared fallback sales window for Shopify-backed sales and product decision tools
- `decisionPolicy` is the shared policy object for replenishment / discount / clearance thresholds. Omit it to use built-in defaults, or override only the fields you want to tune.

Built-in defaults when a config value is omitted:

- `currency`: `USD`
- `locale`: `en-US`
- `lowInventoryDays`: `14`
- `salesLookbackDays`: `30`
- `responseTone`: `consultative`
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

`seller_inventory_query` only needs `read_products`.

`seller_store_overview`, `seller_store_sales_summary`, `seller_sales_query`, `seller_replenishment_decision`, `seller_discount_decision`, and `seller_clearance_decision` use Shopify order data, so they need both `read_products` and `read_orders`.

Current limitations of the Shopify store overview:

- traffic, conversion, and ad spend are not currently sourced from Shopify
- inventory cover is only available when inventory totals are included and the selected window spans multiple days
- standard store overview presets include `today`, `yesterday`, `last_7_days`, `last_30_days`, `last_60_days`, `last_90_days`, `last_180_days`, and `last_365_days`

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
- `seller_store_overview` is the store-level factual tool for store revenue, order count, units sold, and optional inventory coverage.
- `seller_store_sales_summary` is the canonical tool for fixed plain-text multi-window store sales summaries.
- Store sales summary routing is skill-led: the `store-sales-summary` skill should call `seller_store_sales_summary` and keep the tool output as the final answer shape.
- Sales query is a product-level factual capability: use `seller_sales_query` when the user asks how much a product sold recently.
- Product decisions are skill-led: the `product-decision` skill should call `seller_replenishment_decision`, `seller_discount_decision`, and/or `seller_clearance_decision` depending on the user's ask, and aggregate outputs for multi-part questions.
- `seller_replenishment_decision`, `seller_discount_decision`, and `seller_clearance_decision` support inventory-and-pricing decisions only. They do not answer paid-promotion or ad-investment questions.
- Discount and clearance pricing guidance require margin data. When cost access is unavailable, those tools should degrade to unavailable margin guidance rather than fail.
- Store analysis is skill-led: the `store-analysis` skill should use `seller_store_overview` facts before giving any diagnosis or next-step advice.
- Campaign planning remains skill-led and should stay focused on promotion strategy, not replenishment / discount / clearance ownership.

## License

MIT
