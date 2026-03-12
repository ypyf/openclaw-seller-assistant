# Seller Assistant

`seller-assistant` is an OpenClaw plugin for merchant operations workflows across commerce platforms. It currently supports Shopify store connectivity, and is designed to expand to additional platforms such as Amazon over time.

It packages four seller tools:

- `seller_health_check`: diagnose traffic, conversion, revenue, and inventory signals
- `seller_quote_builder`: draft RFQ / quote responses with margin guardrails
- `seller_restock_signal`: estimate replenishment urgency
- `seller_campaign_plan`: generate a short campaign plan for a SKU or goal

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

If your config uses plugin or tool allowlists, add the plugin id under `plugins.allow` and list the tool names under `tools.allow`:

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
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "allow": [
            "seller_health_check",
            "seller_quote_builder",
            "seller_restock_signal",
            "seller_campaign_plan"
          ]
        }
      }
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
          "stores": {
            "shopify": [
              {
                "id": "shopify-us",
                "name": "US Shopify Store",
                "storeDomain": "your-store.myshopify.com",
                "clientId": "your_shopify_client_id",
                "clientSecretEnv": "SHOPIFY_CLIENT_SECRET"
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
- `defaultStoreId` should match one store `id`

## Shopify Auth Model

This plugin does not ship a shared public Shopify app or a merchant install flow.

The current Shopify integration is a `bring your own Shopify app` model:

- each merchant must create or use a Shopify app owned by that merchant's own organization
- that app must be installed on a store the merchant owns
- the merchant then configures this plugin with that store's `storeDomain`, `clientId`, and `clientSecretEnv`

This matters because the plugin currently requests Admin API access using Shopify's client credentials grant. That flow is intended for apps developed by the same organization that owns the target store. It is not the correct auth model for a shared public app distributed by this plugin.

If you need a single shared Shopify app that any merchant can install, this plugin will need a different architecture with Shopify install callbacks, token storage, and OAuth or token exchange.

## Shopify Setup

To connect a Shopify store in the current model:

1. Create a Shopify app that belongs to the same merchant organization that owns the target store.
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

To use `seller_health_check` with Shopify, grant the app at least these Admin API scopes:

- `read_orders`
- `read_products`

Current limitations of the Shopify health check:

- traffic, conversion, and ad spend are not currently sourced from Shopify
- larger stores may currently hit correctness gaps until pagination and comparison-window fixes are applied

## Usage

After the plugin is loaded and allowed, ask the agent in natural language:

- "Check store health for my default store."
- "Check store health for store shopify-us."
- "Draft a quote for Acme for 500 wireless mice. Unit cost is 8, target price is 12, competitor price is 11.5, and lead time is 10 days."
- "Check whether SKU WM-01 needs restocking. We have 320 units on hand, daily sales are 35, supplier lead time is 7 days, and safety stock is 5 days."
- "Create a campaign plan to clear inventory for SKU WM-01 on Meta ads. Current margin is 28% and inventory cover is 30 days."

## Notes

- A next phase can add optional side-effect tools for repricing, inventory sync, or auto-quote dispatch.

## License

MIT
