# Shopify Auth and Setup

This document focuses on Shopify-specific setup for the `seller-assistant` Shopify provider: the auth model, the Shopify app configuration, the Admin API access scopes, and the Shopify-side troubleshooting steps.

For the plugin's own profile config and local `policy.resources` authorization model, use the main [README](../README.md).

## Shopify Auth Model

This plugin uses a bring-your-own Shopify app model tied to the same organization that owns the target store:

- the merchant creates or uses a Shopify app owned by that merchant's organization
- that app is installed on a store the merchant owns
- the plugin is configured with that store's `storeDomain`, `clientId`, and `clientSecretEnv`

The plugin then requests Shopify Admin API access using the merchant's own app credentials. In this model, the app and the target store belong to the same owner or organization.

For the current Shopify provider implementation, the plugin exchanges the configured client id and client secret for an access token through Shopify's client-credentials flow, then uses that token for Admin API requests.

Official references:

- [About client credentials](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/index)
- [Shopify Admin API](https://shopify.dev/docs/api/admin-graphql/latest)

## Shopify Setup

To connect a Shopify store in the current model:

1. Create or use a Shopify app that belongs to the same merchant organization that owns the target store.
2. Install that app on the merchant's Shopify store.
3. Configure the app's Admin API access scopes for the operations you want the plugin to perform.
4. Copy the app client id.
5. Put the app client secret into an environment variable on the OpenClaw host.
6. Reference that environment variable name in `clientSecretEnv`.
7. Add the profile under `plugins.entries.seller-assistant.config.profiles`.

For Shopify profiles:

- `clientId` is the merchant's Shopify app client identifier
- `clientSecretEnv` is the name of an environment variable on the OpenClaw host that contains the app client secret
- `storeDomain` must be the merchant's `*.myshopify.com` domain for the same store where that app is installed
- `apiVersion` optionally overrides the Shopify Admin API version used by the provider

Example environment setup:

```bash
export SHOPIFY_CLIENT_SECRET="shpss_..."
```

Example plugin profile:

```json
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
```

## Shopify Scopes vs Plugin Policy

The plugin also has its own local `policy.resources` authorization layer in profile config, documented in the main [README](../README.md).

This Shopify document is about the Shopify side only:

- what the Shopify app must request
- what Shopify must grant
- what extra Shopify-specific approvals may still be required

In practice, both layers must allow an operation:

- the plugin's local policy must allow it
- the Shopify app must have the matching Admin API access scopes

## Shopify App Access Scopes

The Shopify app behind the profile must also have matching Admin API access scopes.

Shopify documents API access scopes here:

- [Shopify API access scopes](https://shopify.dev/docs/api/usage/access-scopes)

If the Shopify app is managed with Shopify CLI, declare scopes in `shopify.app.toml` under `[access_scopes]`. Shopify's CLI configuration reference documents:

- `[access_scopes].scopes` for the scopes the app requests during authorization
- `[access_scopes].optional_scopes` for scopes requested dynamically after install
- `[access.admin].direct_api_mode` as an optional Direct API access mode setting

Reference:

- [Shopify CLI app configuration: access scopes](https://shopify.dev/docs/apps/tools/cli/configuration#access_scopes)

Example `shopify.app.toml` excerpt:

```toml
[access_scopes]
scopes = "read_products,write_products,read_inventory,write_inventory,read_orders"
```

If your app uses Shopify's Direct API access settings, Shopify also documents the optional `[access.admin]` block, including `direct_api_mode = "online"` or `direct_api_mode = "offline"`.

If you change the Shopify CLI app configuration, Shopify notes that `shopify.app.toml` changes apply automatically during `app dev`, but for production stores you need to run `deploy`.

## Current Shopify Scope Mappings

For the current Shopify provider in this plugin, the main local-to-Shopify mappings are:

- `product.read` -> Shopify `read_products`
- `product.write` -> Shopify `write_products`
- `inventory.read` -> Shopify `read_inventory`
- `inventory.write` -> Shopify `write_inventory`
- `order.read` -> Shopify `read_orders`
- `order.write` -> Shopify `write_orders`

This mapping is a provider implementation detail and may expand as the Shopify provider supports more resources.

## Additional Shopify Requirements

Some Shopify data still has extra requirements beyond basic Admin API scopes:

- Accessing orders outside Shopify's default 60-day order window requires `read_all_orders` together with `read_orders` or `write_orders`.
- Orders are part of Shopify's protected customer data model. An app can still fail to read order data if protected customer data access is not enabled or approved for that app.
- Some GraphQL failures can appear as HTTP `200` responses with GraphQL errors in the response body rather than as transport-level HTTP errors.

## Checking Granted Scopes

To inspect what Shopify has actually granted to the installed app, Shopify documents using the GraphQL Admin API `currentAppInstallation` query and reading its granted access scopes.

This is useful when:

- the local profile policy looks correct
- the requested operation still fails
- you want to verify whether the app was granted the expected Shopify scopes

## Practical Checklist

When a Shopify operation fails due to access issues, check these in order:

1. Does the profile's `policy.resources` allow the business action locally?
2. Does the Shopify app request the matching Admin API access scopes?
3. Was the app reconfigured and redeployed after scope changes when using Shopify CLI?
4. Does the installed app instance actually show the expected granted scopes?
5. Does the target data also require `read_all_orders` or protected customer data approval?
