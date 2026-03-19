import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { executeReadOnlyScript } from "./execute.ts"
import type { Provider } from "./providers/types.ts"

const testProvider: Provider = {
  name: "shopify",
  label: "Shopify",
  defaultDocs: [],
  curatedNotes: [],
  validateProfile: () => ({ ok: true }),
  summarizeProfile: () => ({
    connection: {
      storeDomain: "example.myshopify.com",
    },
    capabilities: {
      search: true,
      execute: ["read"],
    },
  }),
  async createExecutorContext() {
    const requestSummary = []
    const rawResponses = []
    return {
      profile: {
        id: "shopify-main",
        name: "Main Shopify",
        provider: "shopify",
      },
      connection: {
        storeDomain: "example.myshopify.com",
      },
      async graphql() {
        requestSummary.push({
          method: "POST",
          url: "https://example.myshopify.com/admin/api/2026-01/graphql.json",
          status: 200,
          durationMs: 12,
          description: "POST /graphql.json",
        })
        rawResponses.push({
          ok: true,
          status: 200,
          url: "https://example.myshopify.com/admin/api/2026-01/graphql.json",
          headers: {
            "content-type": "application/json",
          },
          body: {
            shop: {
              name: "Example",
            },
          },
          bodyText: '{"shop":{"name":"Example"}}',
        })
        return {
          shop: {
            name: "Example",
          },
        }
      },
      async request() {
        return {
          ok: true,
        }
      },
      requestSummary,
      rawResponses,
    }
  },
}

describe("executeReadOnlyScript", () => {
  it("runs a read-only script with provider helpers", async () => {
    const result = await executeReadOnlyScript({
      provider: testProvider,
      profile: {
        id: "shopify-main",
        name: "Main Shopify",
        provider: "shopify",
        connection: {
          storeDomain: "example.myshopify.com",
          clientId: "client-id",
          clientSecretEnv: "SHOPIFY_CLIENT_SECRET",
        },
      },
      timeoutMs: 1000,
      script: `
        const shop = await provider.graphql("query { shop { name } }")
        console.log("shop", shop.shop.name)
        return { profileId: profile.id, shopName: shop.shop.name, storeDomain: connection.storeDomain }
      `,
    })

    assert.equal(result.status, "ok")
  })

  it("rejects forbidden globals and modules", async () => {
    const result = await executeReadOnlyScript({
      provider: testProvider,
      profile: {
        id: "shopify-main",
        name: "Main Shopify",
        provider: "shopify",
        connection: {
          storeDomain: "example.myshopify.com",
          clientId: "client-id",
          clientSecretEnv: "SHOPIFY_CLIENT_SECRET",
        },
      },
      timeoutMs: 1000,
      script: `
        return process.env
      `,
    })

    assert.equal(result.status, "error")
  })
})
