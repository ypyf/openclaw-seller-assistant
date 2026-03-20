# Seller Assistant

`seller-assistant` is an OpenClaw plugin that provides a small runtime for seller-platform API work:

- `seller_profiles`: inspect configured provider profiles and their safe connection summary
- `seller_search`: search provider notes plus official platform documentation
- `seller_execute`: run JavaScript against a configured profile through provider helpers

The plugin does not call a model directly. Skills and the host agent search docs, generate scripts, execute them, then summarize the result.

## Supported Platforms

The plugin currently includes one built-in platform:

- `shopify`

The runtime is designed for additional providers later, but only Shopify is implemented today.

## Install

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

## Config

Plugin config lives under:

`plugins.entries.seller-assistant.config`

Example:

```json
{
  "plugins": {
    "entries": {
      "seller-assistant": {
        "enabled": true,
        "config": {
          "defaultProfile": "shopify-main",
          "locale": "en-US",
          "currency": "USD",
          "profiles": [
            {
              "id": "shopify-main",
              "name": "Main Shopify Store",
              "provider": "shopify",
              "connection": {
                "storeDomain": "your-store.myshopify.com",
                "clientId": "your_shopify_client_id",
                "clientSecretEnv": "SHOPIFY_CLIENT_SECRET",
                "apiVersion": "2026-01"
              },
              "policy": {
                "resources": {
                  "*": ["read"],
                  "product": ["write"]
                }
              }
            }
          ]
        }
      }
    }
  }
}
```

Most top-level config fields are optional:

- `defaultProfile` is optional. When omitted, the plugin uses the first configured profile.
- `locale` is optional. Default: `en-US`.
- `currency` is optional. Default: `USD`.
- `profiles` is the main required section because it defines the provider connections the plugin can use.

Profile selection works like this:

1. Use the explicit `profileId` from the tool call when one is provided.
2. Otherwise use `defaultProfile` when it is configured.
3. Otherwise fall back to the first item in `profiles`.

Important Shopify connection fields:

- `storeDomain`: merchant `*.myshopify.com` store domain
- `clientId`: merchant-owned Shopify app client id
- `clientSecretEnv`: environment variable containing that app client secret
- `apiVersion`: optional Admin API version override

### Environment Variable for `clientSecretEnv`

The profile's `clientSecretEnv` value should point to an environment variable on the OpenClaw host that contains the Shopify app client secret.

Example:

```bash
export SHOPIFY_CLIENT_SECRET="shpss_..."
```

Profile policy fields:

- `policy.resources`: optional local authorization rules grouped by business resource
- omit `policy` to keep the default local policy of `{"*": ["read"]}`
- use `*` as a wildcard resource or action, for example `{"*": ["read"], "inventory": ["write"]}`

### Shopify App Access Scopes

`policy.resources` is a local plugin authorization layer. It does not grant Shopify Admin API access by itself.

For Shopify requests to succeed, the Shopify app behind the profile must also have the matching Shopify Admin API access scopes. For the full auth model, Shopify setup steps, local-to-Shopify scope mapping, Shopify CLI `shopify.app.toml` configuration, and troubleshooting checklist, see [Shopify Auth, Setup, and Scopes](./docs/shopify-auth-and-scopes.md).

## Tool Model

### `seller_profiles`

Use this tool to list profiles or inspect one profile:

```json
{
  "operation": "list"
}
```

```json
{
  "operation": "get",
  "profileId": "shopify-main"
}
```

### `seller_search`

Use this tool to search provider notes and official docs:

```json
{
  "profileId": "shopify-main",
  "query": "orders graphql pagination",
  "limit": 5
}
```

Set `refresh: true` to force a doc refetch instead of using the in-memory cache.

### `seller_execute`

Use this tool to run JavaScript. Scripts should use `provider.graphql(...)` or `provider.request(...)`.

Example:

```json
{
  "profileId": "shopify-main",
  "runtime": "javascript",
  "mode": "read",
  "script": "const data = await provider.graphql(`query { shop { name } }`)\nreturn { shopName: data?.shop?.name }"
}
```

For write workflows, opt into local scopes in the profile policy and call the tool with `mode: "write"`. The provider maps concrete GraphQL or REST operations back to business scopes such as `product.write`.

In this runtime, `provider.graphql(...)` returns the GraphQL `data` object directly after response validation. Access fields like `data?.productVariants`, not `data?.data?.productVariants`.

Execution is intentionally constrained:

- JavaScript only
- no shell access
- no filesystem access
- no direct `fetch`; use provider helpers

## Skills

The plugin ships with:

- a seller API workflow skill that selects a profile, searches docs, plans a script, executes it, and summarizes the result

## Usage

Representative prompts:

- "How much did my store sell today?"
- "Show store overview for my default Shopify profile over the last 7 days."
- "Check inventory for SKU WM-01 in my default Shopify profile."
- "Which products are low on stock right now?"
- "Show the latest paid unfulfilled orders in my default Shopify profile."
- "List open draft orders for buyer@example.com."
- "Show returnable line items for order #1001."
- "List every SKU in my default Shopify profile."
- "Show active products from vendor Acme."
- "Check store health for my default Shopify profile."

The agent can also handle explicit runtime asks when needed:

- "Search Shopify docs for fulfillment order pagination."
- "Using my default Shopify profile, generate a query for the latest five orders and summarize payment status."

For more examples, see [Usage Examples](./docs/usage-examples.md).

## Notes

- `seller_profiles` does not return secret values or environment variable names.
- `seller_search` prefers provider-curated notes before official doc chunks.
- `seller_execute` returns the script, request summary, logs, structured result, and raw response excerpts for downstream analysis.
- local `policy.resources` scopes gate operations before provider requests are sent.
- Shopify order access may still require protected customer data approval in addition to `read_orders`.

## License

MIT
