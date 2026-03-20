import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PluginConfig } from "./config.ts"
import { registerSellerTools, type SellerToolApi, type SellerToolDependencies } from "./tools.ts"
import { toProfilePolicy } from "./policy.ts"

const createPluginConfig = (): PluginConfig => ({
  currency: "USD",
  locale: "en-US",
  timeZone: "UTC",
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
      policy: toProfilePolicy({
        "*": ["read"],
        product: ["write"],
      }),
    },
  ],
})

const createDependencies = (): SellerToolDependencies => {
  const provider = {
    name: "shopify",
    label: "Shopify",
    defaultDocs: [{ url: "https://shopify.dev/docs/api/admin-graphql" }],
    curatedNotes: [
      {
        title: "Shopify rules",
        url: "provider://shopify/rules",
        content: "Use Admin GraphQL first.",
      },
    ],
    validateProfile: () => ({ ok: true as const }),
    summarizeProfile: () => ({
      connection: {
        storeDomain: "example.myshopify.com",
        apiVersion: "2026-01",
      },
      capabilities: {
        search: true,
        execute: ["read" as const, "write" as const],
      },
    }),
    async createExecutorContext() {
      throw new Error("not used in tool tests")
    },
  }

  return {
    listProviders: () => [provider],
    findProvider: providerName => (providerName === "shopify" ? provider : undefined),
    getDocumentationSources: () => [{ url: "https://shopify.dev/docs/api/admin-graphql" }],
    searchDocumentation: async () => [
      {
        title: "Shopify rules",
        url: "provider://shopify/rules",
        heading: "Shopify rules",
        excerpt: "Use Admin GraphQL first.",
        sourceKind: "provider_note" as const,
        lastFetchedAt: "2026-03-19T00:00:00.000Z",
        score: 12,
      },
    ],
    executeScript: async input => ({
      status: "ok" as const,
      result: {
        ok: true,
        scriptLength: input.script.length,
      },
      logs: ["ran script"],
      warnings: [],
      requestSummary: [
        {
          method: "POST",
          url: "https://example.myshopify.com/admin/api/2026-01/graphql.json",
          status: 200,
          durationMs: 8,
          description: "POST /graphql.json",
        },
      ],
      rawResponses: [
        {
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
        },
      ],
    }),
  }
}

const createToolApi = () => {
  const registrations: Array<{
    name: string
    execute: (id: string, params: unknown) => Promise<unknown>
  }> = []

  const api: SellerToolApi = {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    registerTool(tool) {
      if (!("execute" in tool)) {
        throw new Error("tool factories are not used in these tests")
      }

      registrations.push({
        name: tool.name,
        execute: tool.execute,
      })
    },
  }

  return { api, registrations }
}

describe("registerSellerTools", () => {
  it("returns safe profile summaries without secret env field names", async () => {
    const { api, registrations } = createToolApi()
    registerSellerTools(api, createPluginConfig(), createDependencies())

    const sellerProfiles = registrations.find(tool => tool.name === "seller_profiles")

    const result = (await sellerProfiles?.execute("tool-1", {
      operation: "list",
    })) as {
      details: {
        profiles: Array<{
          connection: Record<string, unknown>
        }>
      }
    }

    assert.deepEqual(result.details.profiles[0]?.connection, {
      storeDomain: "example.myshopify.com",
      apiVersion: "2026-01",
    })
    assert.equal("clientSecretEnv" in (result.details.profiles[0]?.connection ?? {}), false)
  })

  it("returns not found for an unknown profile id", async () => {
    const { api, registrations } = createToolApi()
    registerSellerTools(api, createPluginConfig(), createDependencies())

    const sellerProfiles = registrations.find(tool => tool.name === "seller_profiles")

    const result = (await sellerProfiles?.execute("tool-missing-profile", {
      operation: "get",
      profileId: "missing-profile",
    })) as {
      content: Array<{ text: string }>
      details?: unknown
    }

    assert.equal(result.content[0]?.text, "The requested profile was not found.")
  })

  it("returns documentation matches and execute details through the new tools", async () => {
    const { api, registrations } = createToolApi()
    registerSellerTools(api, createPluginConfig(), createDependencies())

    const sellerSearch = registrations.find(tool => tool.name === "seller_search")
    const sellerExecute = registrations.find(tool => tool.name === "seller_execute")

    const searchResult = (await sellerSearch?.execute("tool-2", {
      query: "graphql",
    })) as {
      details: {
        provider: string
        results: Array<{ sourceKind: string }>
      }
    }

    const executeResult = (await sellerExecute?.execute("tool-3", {
      runtime: "javascript",
      mode: "read",
      script: 'return await provider.graphql("query { shop { name } }")',
    })) as {
      details: {
        status: string
        script: string
        requestSummary: unknown[]
        result: Record<string, unknown>
      }
    }

    assert.equal(executeResult.details.status, "ok")
  })

  it("rejects write execution when the profile policy only allows read access", async () => {
    const config = createPluginConfig()
    config.profiles[0] = {
      ...config.profiles[0],
      policy: toProfilePolicy({
        "*": ["read"],
      }),
    }

    const dependencies = createDependencies()
    const originalFindProvider = dependencies.findProvider
    dependencies.findProvider = providerName =>
      providerName === "shopify"
        ? {
            ...originalFindProvider("shopify")!,
            summarizeProfile: () => ({
              connection: {
                storeDomain: "example.myshopify.com",
                apiVersion: "2026-01",
              },
              capabilities: {
                search: true,
                execute: ["read" as const],
              },
            }),
          }
        : undefined

    const { api, registrations } = createToolApi()
    registerSellerTools(api, config, dependencies)

    const sellerExecute = registrations.find(tool => tool.name === "seller_execute")
    const result = (await sellerExecute?.execute("tool-write-denied", {
      runtime: "javascript",
      mode: "write",
      script:
        'return await provider.graphql("mutation { productUpdate(product: { id: \\"gid://shopify/Product/1\\" }) { userErrors { field } } }")',
    })) as {
      content: Array<{ text: string }>
    }

    assert.match(result.content[0]?.text ?? "", /does not allow write execution/i)
  })
})
