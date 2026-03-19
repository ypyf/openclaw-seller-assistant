import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { searchDocumentation } from "./docs.ts"

describe("searchDocumentation", () => {
  it("fetches docs, caches them in memory, and prioritizes provider notes", async () => {
    const cacheStore = new Map()

    const results = await searchDocumentation(
      {
        query: "orders graphql",
        limit: 5,
        refresh: false,
        notes: [
          {
            title: "Shopify provider note",
            url: "provider://shopify/note",
            content: "Use Admin GraphQL for order reads and paginate carefully.",
          },
        ],
        sources: [
          {
            url: "https://docs.example.com/shopify",
            title: "Shopify Docs",
          },
        ],
      },
      {
        cacheStore,
        fetch: async () => {
          return new Response(
            `
              <html>
                <head><title>Shopify Orders</title></head>
                <body>
                  <h1>Orders</h1>
                  <p>Use GraphQL queries to inspect orders and line items.</p>
                </body>
              </html>
            `,
            {
              status: 200,
              headers: {
                "content-type": "text/html",
              },
            },
          )
        },
      },
    )

    assert.equal(results[0]?.sourceKind, "provider_note")
    assert.equal(results[1]?.sourceKind, "official_doc")

    const cachedResults = await searchDocumentation(
      {
        query: "orders",
        limit: 5,
        refresh: false,
        notes: [],
        sources: [
          {
            url: "https://docs.example.com/shopify",
            title: "Shopify Docs",
          },
        ],
      },
      {
        cacheStore,
        fetch: async () => {
          throw new Error("in-memory cache should have been used")
        },
      },
    )

    assert.equal(cachedResults[0]?.title, "Shopify Docs")
  })

  it("refetches docs when refresh is true", async () => {
    const cacheStore = new Map()
    let revision = 0

    const fetchDocument = async () => {
      revision += 1
      return new Response(
        `<html><head><title>Shopify Docs</title></head><body>Products revision ${revision}</body></html>`,
        {
          status: 200,
          headers: {
            "content-type": "text/html",
          },
        },
      )
    }

    await searchDocumentation(
      {
        query: "products",
        limit: 5,
        refresh: false,
        notes: [],
        sources: [{ url: "https://docs.example.com/shopify", title: "Shopify Docs" }],
      },
      {
        cacheStore,
        fetch: fetchDocument,
      },
    )

    const refreshedResults = await searchDocumentation(
      {
        query: "revision 2",
        limit: 5,
        refresh: true,
        notes: [],
        sources: [{ url: "https://docs.example.com/shopify", title: "Shopify Docs" }],
      },
      {
        cacheStore,
        fetch: fetchDocument,
      },
    )

    assert.equal(refreshedResults[0]?.title, "Shopify Docs")
  })

  it("continues search when one documentation source fails to load", async () => {
    const results = await searchDocumentation(
      {
        query: "orders",
        limit: 5,
        refresh: false,
        notes: [
          {
            title: "Shopify provider note",
            url: "provider://shopify/note",
            content: "Use Admin GraphQL for orders and read workflows.",
          },
        ],
        sources: [
          {
            url: "https://docs.example.com/failing",
            title: "Failing Docs",
          },
          {
            url: "https://docs.example.com/shopify",
            title: "Shopify Docs",
          },
        ],
      },
      {
        fetch: async input => {
          const url = typeof input === "string" ? input : input.toString()
          if (url === "https://docs.example.com/failing") {
            return new Response("upstream error", {
              status: 503,
              headers: {
                "content-type": "text/plain",
              },
            })
          }

          return new Response(
            "<html><head><title>Shopify Docs</title></head><body>Orders can be queried safely.</body></html>",
            {
              status: 200,
              headers: {
                "content-type": "text/html",
              },
            },
          )
        },
      },
    )

    assert.equal(results[0]?.sourceKind, "provider_note")
    assert.equal(results[1]?.title, "Shopify Docs")
  })

  it("fails when every documentation source fails to load", async () => {
    await assert.rejects(
      () =>
        searchDocumentation(
          {
            query: "inventory",
            limit: 5,
            refresh: false,
            notes: [
              {
                title: "Shopify provider note",
                url: "provider://shopify/note",
                content: "Use Admin GraphQL for orders and read workflows.",
              },
            ],
            sources: [
              {
                url: "https://docs.example.com/failing",
                title: "Failing Docs",
              },
            ],
          },
          {
            fetch: async () =>
              new Response("upstream error", {
                status: 503,
                headers: {
                  "content-type": "text/plain",
                },
              }),
          },
        ),
      /Failed to fetch documentation/i,
    )
  })

  it("returns provider notes when every documentation source fails but notes still match", async () => {
    const results = await searchDocumentation(
      {
        query: "orders",
        limit: 5,
        refresh: false,
        notes: [
          {
            title: "Shopify provider note",
            url: "provider://shopify/note",
            content: "Use Admin GraphQL for orders and read workflows.",
          },
        ],
        sources: [
          {
            url: "https://docs.example.com/failing",
            title: "Failing Docs",
          },
        ],
      },
      {
        fetch: async () =>
          new Response("upstream error", {
            status: 503,
            headers: {
              "content-type": "text/plain",
            },
          }),
      },
    )

    assert.equal(results.length, 1)
    assert.equal(results[0]?.sourceKind, "provider_note")
    assert.equal(results[0]?.title, "Shopify provider note")
  })

  it("fails when a matching documentation source errors and the remaining sources have no hits", async () => {
    await assert.rejects(
      () =>
        searchDocumentation(
          {
            query: "inventory",
            limit: 5,
            refresh: false,
            notes: [],
            sources: [
              {
                url: "https://docs.example.com/failing",
                title: "Inventory Docs",
              },
              {
                url: "https://docs.example.com/orders",
                title: "Orders Docs",
              },
            ],
          },
          {
            fetch: async input => {
              const url = typeof input === "string" ? input : input.toString()
              if (url === "https://docs.example.com/failing") {
                return new Response("upstream error", {
                  status: 503,
                  headers: {
                    "content-type": "text/plain",
                  },
                })
              }

              return new Response(
                "<html><head><title>Orders Docs</title></head><body>Orders can be queried safely.</body></html>",
                {
                  status: 200,
                  headers: {
                    "content-type": "text/html",
                  },
                },
              )
            },
          },
        ),
      /Failed to fetch documentation/i,
    )
  })
})
