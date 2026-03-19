import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  DEFAULT_PLUGIN_CONFIG,
  findConfiguredProfile,
  findProfilesByProvider,
  toPluginConfig,
} from "./config.ts"

describe("toPluginConfig", () => {
  it("normalizes generic provider profiles and cache defaults", () => {
    const config = toPluginConfig({
      pluginConfig: {
        defaultProfile: "shopify-main",
        profiles: [
          {
            id: "shopify-main",
            name: "Main Shopify",
            provider: "shopify",
            connection: {
              storeDomain: "example.myshopify.com",
              clientId: "client-id",
              clientSecretEnv: "SHOPIFY_CLIENT_SECRET",
            },
          },
        ],
      },
    })

    assert.equal(config.currency, DEFAULT_PLUGIN_CONFIG.currency)
    assert.equal(config.locale, DEFAULT_PLUGIN_CONFIG.locale)
    assert.equal(config.defaultProfile, "shopify-main")
    assert.equal(config.profiles.length, 1)
    assert.equal(config.profiles[0]?.connection.storeDomain, "example.myshopify.com")
  })

  it("resolves configured profiles by id, default, and provider", () => {
    const config = toPluginConfig({
      pluginConfig: {
        defaultProfile: "shopify-main",
        profiles: [
          {
            id: "shopify-main",
            name: "Main Shopify",
            provider: "shopify",
            connection: {
              storeDomain: "example.myshopify.com",
              clientId: "client-id",
              clientSecretEnv: "SHOPIFY_CLIENT_SECRET",
            },
          },
          {
            id: "shopify-secondary",
            name: "Backup Shopify",
            provider: "shopify",
            connection: {
              storeDomain: "backup.myshopify.com",
              clientId: "client-id-2",
              clientSecretEnv: "SHOPIFY_CLIENT_SECRET_2",
            },
          },
        ],
      },
    })

    assert.equal(findConfiguredProfile(config)?.id, "shopify-main")
    assert.equal(findConfiguredProfile(config, "shopify-secondary")?.id, "shopify-secondary")
    assert.deepEqual(
      findProfilesByProvider(config, "shopify").map(profile => profile.id),
      ["shopify-main", "shopify-secondary"],
    )
  })
})
