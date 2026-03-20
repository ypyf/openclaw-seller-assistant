import assert from "node:assert/strict"
import { afterEach, describe, it, mock } from "node:test"
import { toProfilePolicy } from "../policy.ts"
import { shopifyProvider } from "./shopify.ts"

const TEST_SECRET_ENV = "TEST_SHOPIFY_CLIENT_SECRET"

const createProfile = (resources: Record<string, string[]> = { "*": ["read"] }) => ({
  id: "shopify-main",
  name: "Main Shopify",
  provider: "shopify",
  connection: {
    storeDomain: "example.myshopify.com",
    clientId: "client-id",
    clientSecretEnv: TEST_SECRET_ENV,
  },
  policy: toProfilePolicy(resources),
})

const mockShopifyFetch = (
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
) => {
  process.env[TEST_SECRET_ENV] = "test-secret"

  return mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url

      if (url === "https://example.myshopify.com/admin/oauth/access_token") {
        return new Response(
          JSON.stringify({
            access_token: "access-token",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      return handler(url, init)
    },
  )
}

let fetchMock: ReturnType<typeof mockShopifyFetch> | undefined

afterEach(() => {
  fetchMock?.mock.restore()
  fetchMock = undefined
  delete process.env[TEST_SECRET_ENV]
})

describe("shopifyProvider", () => {
  it("describes safe connection fields for invalid profiles", () => {
    const description = shopifyProvider.describeProfile({
      ...createProfile(),
      connection: {
        storeDomain: "example.myshopify.com",
      },
    })

    assert.deepEqual(description.connection, {
      storeDomain: "example.myshopify.com",
      apiVersion: "2026-01",
    })
  })

  it("creates a read-only executor context with graphql and request helpers", async () => {
    fetchMock = mockShopifyFetch(async (url, init) => {
      if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
        return new Response(
          JSON.stringify({
            data: {
              shop: {
                name: "Example Shop",
              },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      if (url === "https://example.myshopify.com/admin/api/2026-01/orders.json?limit=1") {
        assert.equal(init?.method, "GET")
        return new Response(
          JSON.stringify({
            orders: [{ id: 1 }],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        )
      }

      assert.fail(`Unexpected fetch URL: ${url}`)
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile(),
      new AbortController().signal,
      {
        mode: "read",
      },
    )

    const graphqlResult = await context.graphql("query { shop { name } }")
    const requestResult = await context.request({
      path: "/orders.json",
      query: {
        limit: 1,
      },
    })

    assert.notEqual(graphqlResult, undefined)
    assert.notEqual(requestResult, undefined)
  })

  it("rejects non-read REST methods in the executor context", async () => {
    fetchMock = mockShopifyFetch(async url => {
      assert.fail(`Unexpected fetch URL: ${url}`)
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile(),
      new AbortController().signal,
      {
        mode: "read",
      },
    )

    await assert.rejects(
      () =>
        context.request({
          method: "POST",
          path: "/orders.json",
          json: {
            limit: 1,
          },
        }),
      /GET or HEAD/i,
    )
  })

  it("supports HEAD requests with empty JSON responses", async () => {
    fetchMock = mockShopifyFetch(async (url, init) => {
      assert.equal(url, "https://example.myshopify.com/admin/api/2026-01/orders.json?limit=1")
      assert.equal(init?.method, "HEAD")
      return new Response(null, {
        status: 200,
        headers: {
          "content-type": "application/json",
          etag: "orders-head",
        },
      })
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile(),
      new AbortController().signal,
      {
        mode: "read",
      },
    )

    const requestResult = await context.request({
      method: "HEAD",
      path: "/orders.json",
      query: {
        limit: 1,
      },
    })

    assert.equal(requestResult, undefined)
    assert.equal(context.rawResponses[0]?.headers.etag, "orders-head")
  })

  it("rejects GraphQL mutations in the executor context", async () => {
    fetchMock = mockShopifyFetch(async url => {
      assert.fail(`Unexpected fetch URL: ${url}`)
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile(),
      new AbortController().signal,
      {
        mode: "read",
      },
    )

    await assert.rejects(
      () =>
        context.graphql(`
          fragment OrderFields on Order { id }
          mutation UpdateOrder($id: ID!) {
            orderUpdate(input: { id: $id, tags: ["vip"] }) {
              order { id }
            }
          }
        `),
      /queries.*mutations.*not allowed/i,
    )
  })

  it("allows query documents that use mutation as an identifier", async () => {
    fetchMock = mockShopifyFetch(async url => {
      assert.equal(url, "https://example.myshopify.com/admin/api/2026-01/graphql.json")
      return new Response(
        JSON.stringify({
          data: {
            shop: {
              name: "Example Shop",
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      )
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile(),
      new AbortController().signal,
      {
        mode: "read",
      },
    )

    const result = await context.graphql(`
      query mutation {
        shop {
          name
        }
      }
    `)

    assert.notEqual(result, undefined)
  })

  it("keeps escaped triple quotes inside GraphQL block strings", async () => {
    fetchMock = mockShopifyFetch(async url => {
      assert.equal(url, "https://example.myshopify.com/admin/api/2026-01/graphql.json")
      return new Response(
        JSON.stringify({
          data: {
            shop: {
              name: "Example Shop",
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      )
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile(),
      new AbortController().signal,
      {
        mode: "read",
      },
    )

    const result = await context.graphql(`
      query {
        shop(note: """foo \\""" mutation bar""") {
          name
        }
      }
    `)

    assert.notEqual(result, undefined)
  })

  it('still rejects mutations after block strings containing \\\\""" sequences', async () => {
    fetchMock = mockShopifyFetch(async url => {
      assert.fail(`Unexpected fetch URL: ${url}`)
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile(),
      new AbortController().signal,
      {
        mode: "read",
      },
    )

    await assert.rejects(
      () =>
        context.graphql(`
          fragment ProductFields on Query {
            shop(note: """foo \\\\""\" bar""") {
              name
            }
          }

          mutation UpdateProduct {
            productUpdate(product: { id: "gid://shopify/Product/1", title: "Updated" }) {
              product {
                id
              }
            }
          }
        `),
      /queries.*mutations.*not allowed/i,
    )
  })

  it("rejects GraphQL subscriptions in the executor context", async () => {
    fetchMock = mockShopifyFetch(async url => {
      assert.fail(`Unexpected fetch URL: ${url}`)
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile(),
      new AbortController().signal,
      {
        mode: "read",
      },
    )

    await assert.rejects(
      () =>
        context.graphql(`
          subscription ProductUpdates {
            products {
              edges {
                node {
                  id
                }
              }
            }
          }
        `),
      /queries.*subscriptions are not allowed/i,
    )
  })

  it("allows scoped mutations in write mode", async () => {
    fetchMock = mockShopifyFetch(async (url, init) => {
      assert.equal(url, "https://example.myshopify.com/admin/api/2026-01/graphql.json")
      assert.equal(init?.method, "POST")
      return new Response(
        JSON.stringify({
          data: {
            productUpdate: {
              product: {
                id: "gid://shopify/Product/1",
              },
            },
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      )
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile({
        "*": ["read"],
        product: ["write"],
      }),
      new AbortController().signal,
      {
        mode: "write",
      },
    )

    const result = await context.graphql(`
      mutation UpdateProduct {
        productUpdate(product: { id: "gid://shopify/Product/1", title: "Updated" }) {
          product {
            id
          }
        }
      }
    `)

    assert.notEqual(result, undefined)
  })

  it("rejects write operations when the local scopes do not allow them", async () => {
    fetchMock = mockShopifyFetch(async url => {
      assert.fail(`Unexpected fetch URL: ${url}`)
    })

    const context = await shopifyProvider.createExecutorContext(
      createProfile({
        "*": ["read"],
      }),
      new AbortController().signal,
      {
        mode: "write",
      },
    )

    await assert.rejects(
      () =>
        context.graphql(`
          mutation UpdateProduct {
            productUpdate(product: { id: "gid://shopify/Product/1", title: "Updated" }) {
              product {
                id
              }
            }
          }
        `),
      /does not allow product\.write/i,
    )
  })
})
