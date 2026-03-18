import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"
import {
  beginShopifyOrderEdit,
  cancelShopifyOrder,
  captureShopifyOrder,
  completeShopifyDraftOrder,
  createShopifyDraftOrder,
  createShopifyFulfillment,
  createShopifyRefund,
  createShopifyReturn,
  getShopifyOrder,
  holdShopifyFulfillmentOrder,
  moveShopifyFulfillmentOrder,
  queryShopifyDraftOrders,
  queryShopifyFulfillmentOrders,
  queryShopifyCatalogProducts,
  queryShopifyCatalogVariants,
  loadShopifyStoreOverview,
  queryShopifyReturnableFulfillments,
  queryShopifyOrders,
  releaseHoldShopifyFulfillmentOrder,
  resolveStoreOverviewWindow,
  sendShopifyDraftOrderInvoice,
  updateShopifyDraftOrder,
  updateShopifyOrder,
} from "./shopify.ts"

const TEST_SHOPIFY_SECRET_ENV = "TEST_SHOPIFY_CLIENT_SECRET"

const TEST_SHOPIFY_STORE = {
  id: "shopify-test",
  name: "Test Shopify Store",
  storeDomain: "example.myshopify.com",
  clientId: "test-client-id",
  clientSecretEnv: TEST_SHOPIFY_SECRET_ENV,
}

const createJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  })

const getRequestUrl = (input: string | URL | Request) => {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

const getGraphQLQuery = (init?: RequestInit) => {
  if (typeof init?.body !== "string") {
    return ""
  }

  const payload: unknown = JSON.parse(init.body)
  if (!payload || typeof payload !== "object") {
    return ""
  }

  const query = Reflect.get(payload, "query")
  return typeof query === "string" ? query : ""
}

const getGraphQLVariables = (init?: RequestInit) => {
  if (typeof init?.body !== "string") {
    return {}
  }

  const payload: unknown = JSON.parse(init.body)
  if (!payload || typeof payload !== "object") {
    return {}
  }

  const variables = Reflect.get(payload, "variables")
  return variables && typeof variables === "object" ? variables : {}
}

describe("resolveStoreOverviewWindow", () => {
  it("anchors relative today to the store timezone instead of the caller timezone", () => {
    const now = new Date("2026-03-18T00:30:00+08:00")

    const window = resolveStoreOverviewWindow("today", "America/New_York", now)

    assert.equal(window.windowLabel, "today")
    assert.equal(window.start, "2026-03-17T04:00:00.000Z")
    assert.equal(window.end, "2026-03-18T04:00:00.000Z")
    assert.equal(window.dayCount, 1)
  })

  it("can anchor relative today to the caller timezone when requested", () => {
    const now = new Date("2026-03-18T00:30:00+08:00")

    const window = resolveStoreOverviewWindow("today", "Asia/Shanghai", now)

    assert.equal(window.windowLabel, "today")
    assert.equal(window.start, "2026-03-17T16:00:00.000Z")
    assert.equal(window.end, "2026-03-18T16:00:00.000Z")
    assert.equal(window.dayCount, 1)
  })
})

describe("loadShopifyStoreOverview", () => {
  it("returns sales facts when inventory totals are unavailable", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerHealthVariantsPage")) {
            return createJsonResponse({
              errors: [
                {
                  message: "Missing access scope read_products",
                },
              ],
            })
          }

          if (query.includes("SellerHealthOrdersPage")) {
            return createJsonResponse({
              data: {
                orders: {
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null,
                  },
                  nodes: [
                    {
                      createdAt: "2026-03-17T16:00:00.000Z",
                      currentTotalPriceSet: {
                        shopMoney: {
                          amount: "123.45",
                          currencyCode: "USD",
                        },
                      },
                      currentSubtotalLineItemsQuantity: 7,
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await loadShopifyStoreOverview(TEST_SHOPIFY_STORE, {
        timeBasis: "store",
        startDate: "2026-03-17",
        endDate: "2026-03-17",
      })

      assert.equal(snapshot.storeName, "Test Shopify Store")
      assert.equal(snapshot.windowLabel, "2026-03-17 to 2026-03-17")
      assert.equal(snapshot.ordersCount, 1)
      assert.equal(snapshot.unitsSold, 7)
      assert.equal(snapshot.revenue, 123.45)
      assert.equal(snapshot.inventoryUnits, undefined)
      assert.equal(snapshot.inventoryDaysLeft, undefined)
      assert.match(snapshot.inventoryErrorMessage ?? "", /read_products/i)
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("queryShopifyOrders", () => {
  it("queries one page of Shopify order summaries with explicit cursor input", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderSummaries")) {
            assert.deepEqual(variables, {
              first: 10,
              after: "cursor-0",
              query: "financial_status:paid",
              reverse: false,
            })

            return createJsonResponse({
              data: {
                orders: {
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: "cursor-1",
                  },
                  nodes: [
                    {
                      id: "gid://shopify/Order/1001",
                      name: "#1001",
                      email: "checkout@example.com",
                      createdAt: "2026-03-18T08:00:00.000Z",
                      displayFinancialStatus: "PAID",
                      displayFulfillmentStatus: "UNFULFILLED",
                      currentSubtotalLineItemsQuantity: 3,
                      currentTotalPriceSet: {
                        shopMoney: {
                          amount: "123.45",
                          currencyCode: "USD",
                        },
                      },
                      customer: {
                        displayName: "Ada Lovelace",
                        email: "ada@example.com",
                      },
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await queryShopifyOrders(TEST_SHOPIFY_STORE, {
        query: "financial_status:paid",
        first: 10,
        after: "cursor-0",
        reverse: false,
      })

      assert.equal(snapshot.storeName, "Test Shopify Store")
      assert.equal(snapshot.orders.length, 1)
      assert.equal(snapshot.orders[0]?.name, "#1001")
      assert.equal(snapshot.orders[0]?.customerEmail, "ada@example.com")
      assert.equal(snapshot.orders[0]?.totalPrice, 123.45)
      assert.equal(snapshot.pageInfo.endCursor, "cursor-1")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })

  it("falls back to the order email when the customer record is unavailable", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderSummaries")) {
            return createJsonResponse({
              data: {
                orders: {
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null,
                  },
                  nodes: [
                    {
                      id: "gid://shopify/Order/1002",
                      name: "#1002",
                      email: "guest@example.com",
                      createdAt: "2026-03-18T09:00:00.000Z",
                      displayFinancialStatus: "PAID",
                      displayFulfillmentStatus: "FULFILLED",
                      currentSubtotalLineItemsQuantity: 1,
                      currentTotalPriceSet: {
                        shopMoney: {
                          amount: "49.00",
                          currencyCode: "USD",
                        },
                      },
                      customer: null,
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await queryShopifyOrders(TEST_SHOPIFY_STORE)

      assert.equal(snapshot.orders[0]?.customerEmail, "guest@example.com")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("queryShopifyDraftOrders", () => {
  it("queries one page of Shopify draft-order summaries with explicit cursor input", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerDraftOrders")) {
            assert.deepEqual(variables, {
              first: 10,
              after: "draft-cursor-0",
              query: "status:open",
              reverse: false,
            })

            return createJsonResponse({
              data: {
                draftOrders: {
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: "draft-cursor-1",
                  },
                  nodes: [
                    {
                      id: "gid://shopify/DraftOrder/1",
                      name: "#D1",
                      status: "OPEN",
                      ready: true,
                      createdAt: "2026-03-18T08:00:00.000Z",
                      updatedAt: "2026-03-18T09:00:00.000Z",
                      invoiceUrl: "https://invoice.example.com/draft/1",
                      invoiceSentAt: null,
                      reserveInventoryUntil: "2026-03-19T08:00:00.000Z",
                      email: "buyer@example.com",
                      note: "manual quote",
                      tags: ["vip"],
                      taxExempt: false,
                      totalPriceSet: {
                        presentmentMoney: {
                          amount: "89.50",
                          currencyCode: "USD",
                        },
                      },
                      order: null,
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await queryShopifyDraftOrders(TEST_SHOPIFY_STORE, {
        query: "status:open",
        first: 10,
        after: "draft-cursor-0",
        reverse: false,
      })

      assert.equal(snapshot.storeName, "Test Shopify Store")
      assert.equal(snapshot.query, "status:open")
      assert.equal(snapshot.draftOrders.length, 1)
      assert.equal(snapshot.draftOrders[0]?.name, "#D1")
      assert.equal(snapshot.draftOrders[0]?.totalPrice, 89.5)
      assert.equal(snapshot.pageInfo.endCursor, "draft-cursor-1")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("queryShopifyFulfillmentOrders", () => {
  it("queries one page of Shopify fulfillment-order summaries with explicit cursor input", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerFulfillmentOrders")) {
            assert.deepEqual(variables, {
              first: 10,
              after: "fo-cursor-0",
              query: "status:open",
              reverse: false,
              includeClosed: true,
            })

            return createJsonResponse({
              data: {
                fulfillmentOrders: {
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: "fo-cursor-1",
                  },
                  nodes: [
                    {
                      id: "gid://shopify/FulfillmentOrder/1",
                      createdAt: "2026-03-18T08:00:00.000Z",
                      updatedAt: "2026-03-18T09:00:00.000Z",
                      status: "OPEN",
                      requestStatus: "UNSUBMITTED",
                      orderId: "gid://shopify/Order/1001",
                      orderName: "#1001",
                      fulfillAt: null,
                      fulfillBy: null,
                      assignedLocation: {
                        name: "Main Warehouse",
                        location: {
                          id: "gid://shopify/Location/1",
                        },
                      },
                      deliveryMethod: {
                        methodType: "SHIPPING",
                      },
                      destination: {
                        city: "New York",
                        countryCode: "US",
                      },
                      fulfillmentHolds: [
                        {
                          id: "gid://shopify/FulfillmentHold/1",
                          reason: "AWAITING_PAYMENT",
                          reasonNotes: "payment pending",
                          handle: "manual-hold",
                        },
                      ],
                      supportedActions: [
                        {
                          action: "HOLD",
                        },
                        {
                          action: "MOVE",
                        },
                      ],
                      lineItems: {
                        nodes: [
                          {
                            id: "gid://shopify/FulfillmentOrderLineItem/1",
                            remainingQuantity: 2,
                            totalQuantity: 2,
                            lineItem: {
                              id: "gid://shopify/LineItem/1",
                              sku: "WM-01",
                              name: "Short sleeve t-shirt",
                              quantity: 2,
                            },
                          },
                        ],
                      },
                      locationsForMove: {
                        edges: [
                          {
                            node: {
                              location: {
                                id: "gid://shopify/Location/2",
                                name: "Backup Warehouse",
                              },
                              message: null,
                              movable: true,
                              availableLineItemsCount: {
                                count: 1,
                              },
                              unavailableLineItemsCount: {
                                count: 0,
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await queryShopifyFulfillmentOrders(TEST_SHOPIFY_STORE, {
        query: "status:open",
        first: 10,
        after: "fo-cursor-0",
        reverse: false,
        includeClosed: true,
      })

      assert.equal(snapshot.storeName, "Test Shopify Store")
      assert.equal(snapshot.includeClosed, true)
      assert.equal(snapshot.fulfillmentOrders.length, 1)
      assert.equal(snapshot.fulfillmentOrders[0]?.orderName, "#1001")
      assert.equal(snapshot.fulfillmentOrders[0]?.holds[0]?.id, "gid://shopify/FulfillmentHold/1")
      assert.equal(
        snapshot.fulfillmentOrders[0]?.moveCandidates[0]?.locationName,
        "Backup Warehouse",
      )
      assert.equal(snapshot.pageInfo.endCursor, "fo-cursor-1")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("queryShopifyCatalogProducts", () => {
  it("queries one page of Shopify product summaries with query-string filters", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerCatalogProducts")) {
            assert.deepEqual(variables, {
              first: 10,
              after: "product-cursor-0",
              query: "status:active",
            })

            return createJsonResponse({
              data: {
                products: {
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: "product-cursor-1",
                  },
                  nodes: [
                    {
                      id: "gid://shopify/Product/1",
                      title: "Short sleeve t-shirt",
                      handle: "short-sleeve-t-shirt",
                      status: "ACTIVE",
                      vendor: "Acme",
                      totalInventory: 120,
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await queryShopifyCatalogProducts(TEST_SHOPIFY_STORE, {
        query: "status:active",
        first: 10,
        after: "product-cursor-0",
      })

      assert.equal(snapshot.storeName, "Test Shopify Store")
      assert.equal(snapshot.query, "status:active")
      assert.equal(snapshot.products.length, 1)
      assert.equal(snapshot.products[0]?.title, "Short sleeve t-shirt")
      assert.equal(snapshot.products[0]?.totalInventory, 120)
      assert.equal(snapshot.pageInfo.endCursor, "product-cursor-1")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("queryShopifyCatalogVariants", () => {
  it("queries one page of Shopify variant summaries and applies the shop currency fallback", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerCatalogVariants")) {
            assert.deepEqual(variables, {
              first: 5,
              after: "variant-cursor-0",
              query: "sku:WM-01",
            })

            return createJsonResponse({
              data: {
                productVariants: {
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: "variant-cursor-1",
                  },
                  nodes: [
                    {
                      id: "gid://shopify/ProductVariant/1",
                      sku: "WM-01",
                      displayName: "Short sleeve t-shirt / Blue / M",
                      price: "39.00",
                      inventoryQuantity: 29,
                      product: {
                        id: "gid://shopify/Product/1",
                        title: "Short sleeve t-shirt",
                      },
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await queryShopifyCatalogVariants(TEST_SHOPIFY_STORE, {
        query: "sku:WM-01",
        first: 5,
        after: "variant-cursor-0",
      })

      assert.equal(snapshot.storeName, "Test Shopify Store")
      assert.equal(snapshot.query, "sku:WM-01")
      assert.equal(snapshot.variants.length, 1)
      assert.equal(snapshot.variants[0]?.sku, "WM-01")
      assert.equal(snapshot.variants[0]?.price, 39)
      assert.equal(snapshot.variants[0]?.currencyCode, "USD")
      assert.equal(snapshot.pageInfo.endCursor, "variant-cursor-1")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })

  it("queries all remaining Shopify variant pages when allPages is true", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    let variantRequestCount = 0

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerCatalogVariants")) {
            variantRequestCount += 1

            if (variantRequestCount === 1) {
              assert.deepEqual(variables, {
                first: 2,
                after: null,
                query: "sku:*",
              })

              return createJsonResponse({
                data: {
                  productVariants: {
                    pageInfo: {
                      hasNextPage: true,
                      endCursor: "variant-cursor-1",
                    },
                    nodes: [
                      {
                        id: "gid://shopify/ProductVariant/1",
                        sku: "WM-01",
                        displayName: "Short sleeve t-shirt / Blue / M",
                        price: "39.00",
                        inventoryQuantity: 29,
                        product: {
                          id: "gid://shopify/Product/1",
                          title: "Short sleeve t-shirt",
                        },
                      },
                      {
                        id: "gid://shopify/ProductVariant/2",
                        sku: "WM-02",
                        displayName: "Short sleeve t-shirt / Blue / L",
                        price: "41.00",
                        inventoryQuantity: 17,
                        product: {
                          id: "gid://shopify/Product/1",
                          title: "Short sleeve t-shirt",
                        },
                      },
                    ],
                  },
                },
              })
            }

            assert.equal(variantRequestCount, 2)
            assert.deepEqual(variables, {
              first: 2,
              after: "variant-cursor-1",
              query: "sku:*",
            })

            return createJsonResponse({
              data: {
                productVariants: {
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: "variant-cursor-2",
                  },
                  nodes: [
                    {
                      id: "gid://shopify/ProductVariant/3",
                      sku: "WM-03",
                      displayName: "Short sleeve t-shirt / Red / M",
                      price: "42.00",
                      inventoryQuantity: 11,
                      product: {
                        id: "gid://shopify/Product/1",
                        title: "Short sleeve t-shirt",
                      },
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await queryShopifyCatalogVariants(TEST_SHOPIFY_STORE, {
        query: "sku:*",
        first: 2,
        allPages: true,
      })

      assert.equal(variantRequestCount, 2)
      assert.equal(snapshot.query, "sku:*")
      assert.equal(snapshot.variants.length, 3)
      assert.deepEqual(
        snapshot.variants.map(variant => variant.sku),
        ["WM-01", "WM-02", "WM-03"],
      )
      assert.equal(snapshot.pageInfo.hasNextPage, false)
      assert.equal(snapshot.pageInfo.endCursor, "variant-cursor-2")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("createShopifyDraftOrder", () => {
  it("submits explicit draft-order input and returns the created draft-order summary", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerDraftOrderCreate")) {
            assert.deepEqual(variables, {
              input: {
                lineItems: [
                  {
                    variantId: "gid://shopify/ProductVariant/1",
                    quantity: 2,
                    customAttributes: [
                      {
                        key: "source",
                        value: "phone",
                      },
                    ],
                  },
                  {
                    title: "Custom Setup",
                    originalUnitPrice: "15.00",
                    quantity: 1,
                    weight: {
                      value: 1,
                      unit: "KILOGRAMS",
                    },
                  },
                ],
                email: "buyer@example.com",
                note: "manual quote",
                tags: ["vip", "quote"],
                taxExempt: false,
                reserveInventoryUntil: "2026-03-19T08:00:00Z",
                billingAddress: {
                  firstName: "Ada",
                  address1: "1 Main St",
                  city: "New York",
                  countryCode: "US",
                },
                shippingAddress: {
                  firstName: "Ada",
                  address1: "1 Main St",
                  city: "New York",
                  countryCode: "US",
                },
                shippingLine: {
                  title: "Standard",
                  price: "5.00",
                },
                appliedDiscount: {
                  value: "10.00",
                  valueType: "PERCENTAGE",
                  title: "VIP",
                  description: "Manual VIP discount",
                },
                customAttributes: [
                  {
                    key: "channel",
                    value: "phone",
                  },
                ],
              },
            })

            return createJsonResponse({
              data: {
                draftOrderCreate: {
                  draftOrder: {
                    id: "gid://shopify/DraftOrder/1",
                    name: "#D1",
                    status: "OPEN",
                    ready: true,
                    createdAt: "2026-03-18T08:00:00.000Z",
                    updatedAt: "2026-03-18T09:00:00.000Z",
                    invoiceUrl: "https://invoice.example.com/draft/1",
                    invoiceSentAt: null,
                    reserveInventoryUntil: "2026-03-19T08:00:00.000Z",
                    email: "buyer@example.com",
                    note: "manual quote",
                    tags: ["vip", "quote"],
                    taxExempt: false,
                    totalPriceSet: {
                      presentmentMoney: {
                        amount: "89.50",
                        currencyCode: "USD",
                      },
                    },
                    order: null,
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await createShopifyDraftOrder(TEST_SHOPIFY_STORE, {
        email: "buyer@example.com",
        note: "manual quote",
        tags: ["vip", "quote"],
        taxExempt: false,
        reserveInventoryUntil: "2026-03-19T08:00:00Z",
        billingAddress: {
          firstName: "Ada",
          address1: "1 Main St",
          city: "New York",
          countryCode: "US",
        },
        shippingAddress: {
          firstName: "Ada",
          address1: "1 Main St",
          city: "New York",
          countryCode: "US",
        },
        shippingLine: {
          title: "Standard",
          price: 5,
        },
        appliedDiscount: {
          value: 10,
          valueType: "PERCENTAGE",
          title: "VIP",
          description: "Manual VIP discount",
        },
        customAttributes: [
          {
            key: "channel",
            value: "phone",
          },
        ],
        lineItems: [
          {
            variantId: "gid://shopify/ProductVariant/1",
            quantity: 2,
            customAttributes: [
              {
                key: "source",
                value: "phone",
              },
            ],
          },
          {
            title: "Custom Setup",
            originalUnitPrice: 15,
            quantity: 1,
            weight: {
              value: 1,
              unit: "KILOGRAMS",
            },
          },
        ],
      })

      assert.equal(result.draftOrder?.id, "gid://shopify/DraftOrder/1")
      assert.equal(result.draftOrder?.totalPrice, 89.5)
      assert.equal(result.draftOrder?.taxExempt, false)
      assert.equal(result.userErrors.length, 0)
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("updateShopifyDraftOrder", () => {
  it("updates a Shopify draft order with explicit mutable fields", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerDraftOrderUpdate")) {
            assert.deepEqual(variables, {
              id: "gid://shopify/DraftOrder/1",
              input: {
                note: "updated quote",
                tags: ["vip", "revised"],
                taxExempt: true,
              },
            })

            return createJsonResponse({
              data: {
                draftOrderUpdate: {
                  draftOrder: {
                    id: "gid://shopify/DraftOrder/1",
                    name: "#D1",
                    status: "OPEN",
                    ready: true,
                    createdAt: "2026-03-18T08:00:00.000Z",
                    updatedAt: "2026-03-18T10:00:00.000Z",
                    invoiceUrl: "https://invoice.example.com/draft/1",
                    invoiceSentAt: null,
                    reserveInventoryUntil: null,
                    email: "buyer@example.com",
                    note: "updated quote",
                    tags: ["vip", "revised"],
                    taxExempt: true,
                    totalPriceSet: {
                      presentmentMoney: {
                        amount: "89.50",
                        currencyCode: "USD",
                      },
                    },
                    order: null,
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await updateShopifyDraftOrder(TEST_SHOPIFY_STORE, {
        draftOrderId: "gid://shopify/DraftOrder/1",
        note: "updated quote",
        tags: ["vip", "revised"],
        taxExempt: true,
      })

      assert.equal(result.draftOrder?.id, "gid://shopify/DraftOrder/1")
      assert.equal(result.draftOrder?.note, "updated quote")
      assert.equal(result.draftOrder?.taxExempt, true)
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })

  it("preserves explicit clear operations for mutable draft-order fields", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerDraftOrderUpdate")) {
            assert.deepEqual(variables, {
              id: "gid://shopify/DraftOrder/1",
              input: {
                email: null,
                note: null,
                tags: [],
                reserveInventoryUntil: null,
                customAttributes: [],
              },
            })

            return createJsonResponse({
              data: {
                draftOrderUpdate: {
                  draftOrder: {
                    id: "gid://shopify/DraftOrder/1",
                    name: "#D1",
                    status: "OPEN",
                    ready: true,
                    createdAt: "2026-03-18T08:00:00.000Z",
                    updatedAt: "2026-03-18T10:30:00.000Z",
                    invoiceUrl: "https://invoice.example.com/draft/1",
                    invoiceSentAt: null,
                    reserveInventoryUntil: null,
                    email: null,
                    note: null,
                    tags: [],
                    taxExempt: false,
                    totalPriceSet: {
                      presentmentMoney: {
                        amount: "89.50",
                        currencyCode: "USD",
                      },
                    },
                    order: null,
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await updateShopifyDraftOrder(TEST_SHOPIFY_STORE, {
        draftOrderId: "gid://shopify/DraftOrder/1",
        email: "",
        note: "",
        tags: [],
        reserveInventoryUntil: "",
        customAttributes: [],
      })

      assert.equal(result.draftOrder?.email, null)
      assert.equal(result.draftOrder?.note, null)
      assert.deepEqual(result.draftOrder?.tags, [])
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })

  it("ignores blank tags and invalid custom attributes during draft-order updates", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerDraftOrderUpdate")) {
            assert.deepEqual(variables, {
              id: "gid://shopify/DraftOrder/1",
              input: {
                note: "updated quote",
              },
            })

            return createJsonResponse({
              data: {
                draftOrderUpdate: {
                  draftOrder: {
                    id: "gid://shopify/DraftOrder/1",
                    name: "#D1",
                    status: "OPEN",
                    ready: true,
                    createdAt: "2026-03-18T08:00:00.000Z",
                    updatedAt: "2026-03-18T10:45:00.000Z",
                    invoiceUrl: "https://invoice.example.com/draft/1",
                    invoiceSentAt: null,
                    reserveInventoryUntil: null,
                    email: "buyer@example.com",
                    note: "updated quote",
                    tags: ["vip"],
                    taxExempt: false,
                    totalPriceSet: {
                      presentmentMoney: {
                        amount: "89.50",
                        currencyCode: "USD",
                      },
                    },
                    order: null,
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await updateShopifyDraftOrder(TEST_SHOPIFY_STORE, {
        draftOrderId: "gid://shopify/DraftOrder/1",
        note: "updated quote",
        tags: [" "],
        customAttributes: [
          {
            key: " ",
            value: " ",
          },
        ],
      })

      assert.equal(result.draftOrder?.note, "updated quote")
      assert.deepEqual(result.draftOrder?.tags, ["vip"])
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("sendShopifyDraftOrderInvoice", () => {
  it("sends a Shopify draft-order invoice with explicit email input", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerDraftOrderInvoiceSend")) {
            assert.deepEqual(variables, {
              id: "gid://shopify/DraftOrder/1",
              emailInput: {
                to: "buyer@example.com",
                subject: "Quote for approval",
                customMessage: "Please review today.",
              },
            })

            return createJsonResponse({
              data: {
                draftOrderInvoiceSend: {
                  draftOrder: {
                    id: "gid://shopify/DraftOrder/1",
                    name: "#D1",
                    status: "INVOICE_SENT",
                    ready: true,
                    createdAt: "2026-03-18T08:00:00.000Z",
                    updatedAt: "2026-03-18T10:00:00.000Z",
                    invoiceUrl: "https://invoice.example.com/draft/1",
                    invoiceSentAt: "2026-03-18T10:00:00.000Z",
                    reserveInventoryUntil: null,
                    email: "buyer@example.com",
                    note: "manual quote",
                    tags: ["vip"],
                    taxExempt: false,
                    totalPriceSet: {
                      presentmentMoney: {
                        amount: "89.50",
                        currencyCode: "USD",
                      },
                    },
                    order: null,
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await sendShopifyDraftOrderInvoice(TEST_SHOPIFY_STORE, {
        draftOrderId: "gid://shopify/DraftOrder/1",
        email: {
          to: "buyer@example.com",
          subject: "Quote for approval",
          customMessage: "Please review today.",
        },
      })

      assert.equal(result.draftOrder?.invoiceSentAt, "2026-03-18T10:00:00.000Z")
      assert.equal(result.draftOrder?.status, "INVOICE_SENT")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("completeShopifyDraftOrder", () => {
  it("completes a Shopify draft order and returns the resulting order linkage", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerDraftOrderComplete")) {
            assert.deepEqual(variables, {
              id: "gid://shopify/DraftOrder/1",
              paymentGatewayId: "gid://shopify/PaymentGateway/1",
              sourceName: "openclaw",
            })

            return createJsonResponse({
              data: {
                draftOrderComplete: {
                  draftOrder: {
                    id: "gid://shopify/DraftOrder/1",
                    name: "#D1",
                    status: "COMPLETED",
                    ready: true,
                    createdAt: "2026-03-18T08:00:00.000Z",
                    updatedAt: "2026-03-18T10:30:00.000Z",
                    invoiceUrl: "https://invoice.example.com/draft/1",
                    invoiceSentAt: "2026-03-18T10:00:00.000Z",
                    reserveInventoryUntil: null,
                    email: "buyer@example.com",
                    note: "manual quote",
                    tags: ["vip"],
                    taxExempt: false,
                    totalPriceSet: {
                      presentmentMoney: {
                        amount: "89.50",
                        currencyCode: "USD",
                      },
                    },
                    order: {
                      id: "gid://shopify/Order/2001",
                      name: "#2001",
                    },
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await completeShopifyDraftOrder(TEST_SHOPIFY_STORE, {
        draftOrderId: "gid://shopify/DraftOrder/1",
        paymentGatewayId: "gid://shopify/PaymentGateway/1",
        sourceName: "openclaw",
      })

      assert.equal(result.draftOrder?.status, "COMPLETED")
      assert.equal(result.draftOrder?.orderId, "gid://shopify/Order/2001")
      assert.equal(result.draftOrder?.orderName, "#2001")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("holdShopifyFulfillmentOrder", () => {
  it("places a Shopify fulfillment order on hold with explicit hold input", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerFulfillmentOrderHold")) {
            assert.deepEqual(variables, {
              id: "gid://shopify/FulfillmentOrder/1",
              fulfillmentHold: {
                reason: "AWAITING_PAYMENT",
                reasonNotes: "payment pending",
                notifyMerchant: true,
                handle: "manual-hold",
                externalId: "ext-1",
                fulfillmentOrderLineItems: [
                  {
                    id: "gid://shopify/FulfillmentOrderLineItem/1",
                    quantity: 1,
                  },
                ],
              },
            })

            return createJsonResponse({
              data: {
                fulfillmentOrderHold: {
                  fulfillmentHold: {
                    id: "gid://shopify/FulfillmentHold/1",
                    reason: "AWAITING_PAYMENT",
                    reasonNotes: "payment pending",
                    handle: "manual-hold",
                  },
                  fulfillmentOrder: {
                    id: "gid://shopify/FulfillmentOrder/1",
                    createdAt: "2026-03-18T08:00:00.000Z",
                    updatedAt: "2026-03-18T09:00:00.000Z",
                    status: "ON_HOLD",
                    requestStatus: "UNSUBMITTED",
                    orderId: "gid://shopify/Order/1001",
                    orderName: "#1001",
                    assignedLocation: {
                      name: "Main Warehouse",
                      location: {
                        id: "gid://shopify/Location/1",
                      },
                    },
                    deliveryMethod: {
                      methodType: "SHIPPING",
                    },
                    destination: {
                      city: "New York",
                      countryCode: "US",
                    },
                    fulfillmentHolds: [
                      {
                        id: "gid://shopify/FulfillmentHold/1",
                        reason: "AWAITING_PAYMENT",
                        reasonNotes: "payment pending",
                        handle: "manual-hold",
                      },
                    ],
                    supportedActions: [
                      {
                        action: "RELEASE_HOLD",
                      },
                    ],
                    lineItems: {
                      nodes: [
                        {
                          id: "gid://shopify/FulfillmentOrderLineItem/1",
                          remainingQuantity: 2,
                          totalQuantity: 2,
                          lineItem: {
                            id: "gid://shopify/LineItem/1",
                            sku: "WM-01",
                            name: "Short sleeve t-shirt",
                            quantity: 2,
                          },
                        },
                      ],
                    },
                    locationsForMove: {
                      edges: [],
                    },
                  },
                  remainingFulfillmentOrder: null,
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await holdShopifyFulfillmentOrder(TEST_SHOPIFY_STORE, {
        fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
        reason: "AWAITING_PAYMENT",
        reasonNotes: "payment pending",
        notifyMerchant: true,
        handle: "manual-hold",
        externalId: "ext-1",
        fulfillmentOrderLineItems: [
          {
            id: "gid://shopify/FulfillmentOrderLineItem/1",
            quantity: 1,
          },
        ],
      })

      assert.equal(result.fulfillmentOrder?.status, "ON_HOLD")
      assert.equal(result.fulfillmentHold?.id, "gid://shopify/FulfillmentHold/1")
      assert.equal(result.userErrors.length, 0)
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("releaseHoldShopifyFulfillmentOrder", () => {
  it("releases specific holds from a Shopify fulfillment order", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerFulfillmentOrderReleaseHold")) {
            assert.deepEqual(variables, {
              id: "gid://shopify/FulfillmentOrder/1",
              holdIds: ["gid://shopify/FulfillmentHold/1"],
            })

            return createJsonResponse({
              data: {
                fulfillmentOrderReleaseHold: {
                  fulfillmentOrder: {
                    id: "gid://shopify/FulfillmentOrder/1",
                    createdAt: "2026-03-18T08:00:00.000Z",
                    updatedAt: "2026-03-18T09:30:00.000Z",
                    status: "OPEN",
                    requestStatus: "UNSUBMITTED",
                    orderId: "gid://shopify/Order/1001",
                    orderName: "#1001",
                    assignedLocation: {
                      name: "Main Warehouse",
                      location: {
                        id: "gid://shopify/Location/1",
                      },
                    },
                    deliveryMethod: {
                      methodType: "SHIPPING",
                    },
                    destination: {
                      city: "New York",
                      countryCode: "US",
                    },
                    fulfillmentHolds: [],
                    supportedActions: [
                      {
                        action: "HOLD",
                      },
                      {
                        action: "MOVE",
                      },
                    ],
                    lineItems: {
                      nodes: [],
                    },
                    locationsForMove: {
                      edges: [],
                    },
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await releaseHoldShopifyFulfillmentOrder(TEST_SHOPIFY_STORE, {
        fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
        holdIds: ["gid://shopify/FulfillmentHold/1"],
      })

      assert.equal(result.fulfillmentOrder?.status, "OPEN")
      assert.equal(result.fulfillmentOrder?.holds.length, 0)
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("moveShopifyFulfillmentOrder", () => {
  it("moves a Shopify fulfillment order to a new location", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerFulfillmentOrderMove")) {
            assert.deepEqual(variables, {
              id: "gid://shopify/FulfillmentOrder/1",
              newLocationId: "gid://shopify/Location/2",
              fulfillmentOrderLineItems: [
                {
                  id: "gid://shopify/FulfillmentOrderLineItem/1",
                  quantity: 1,
                },
              ],
            })

            return createJsonResponse({
              data: {
                fulfillmentOrderMove: {
                  movedFulfillmentOrder: {
                    id: "gid://shopify/FulfillmentOrder/2",
                    createdAt: "2026-03-18T09:30:00.000Z",
                    updatedAt: "2026-03-18T09:30:00.000Z",
                    status: "OPEN",
                    requestStatus: "UNSUBMITTED",
                    orderId: "gid://shopify/Order/1001",
                    orderName: "#1001",
                    assignedLocation: {
                      name: "Backup Warehouse",
                      location: {
                        id: "gid://shopify/Location/2",
                      },
                    },
                    deliveryMethod: {
                      methodType: "SHIPPING",
                    },
                    destination: {
                      city: "New York",
                      countryCode: "US",
                    },
                    fulfillmentHolds: [],
                    supportedActions: [
                      {
                        action: "HOLD",
                      },
                    ],
                    lineItems: {
                      nodes: [],
                    },
                    locationsForMove: {
                      edges: [],
                    },
                  },
                  originalFulfillmentOrder: {
                    id: "gid://shopify/FulfillmentOrder/1",
                    createdAt: "2026-03-18T08:00:00.000Z",
                    updatedAt: "2026-03-18T09:30:00.000Z",
                    status: "OPEN",
                    requestStatus: "UNSUBMITTED",
                    orderId: "gid://shopify/Order/1001",
                    orderName: "#1001",
                    assignedLocation: {
                      name: "Main Warehouse",
                      location: {
                        id: "gid://shopify/Location/1",
                      },
                    },
                    deliveryMethod: {
                      methodType: "SHIPPING",
                    },
                    destination: {
                      city: "New York",
                      countryCode: "US",
                    },
                    fulfillmentHolds: [],
                    supportedActions: [
                      {
                        action: "MOVE",
                      },
                    ],
                    lineItems: {
                      nodes: [],
                    },
                    locationsForMove: {
                      edges: [],
                    },
                  },
                  remainingFulfillmentOrder: null,
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await moveShopifyFulfillmentOrder(TEST_SHOPIFY_STORE, {
        fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
        newLocationId: "gid://shopify/Location/2",
        fulfillmentOrderLineItems: [
          {
            id: "gid://shopify/FulfillmentOrderLineItem/1",
            quantity: 1,
          },
        ],
      })

      assert.equal(result.originalFulfillmentOrder?.assignedLocationName, "Main Warehouse")
      assert.equal(result.movedFulfillmentOrder?.assignedLocationName, "Backup Warehouse")
      assert.equal(result.userErrors.length, 0)
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("getShopifyOrder", () => {
  it("returns order detail and degrades gracefully when fulfillment orders are unavailable", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderDetail")) {
            assert.deepEqual(variables, {
              orderId: "gid://shopify/Order/1001",
            })

            return createJsonResponse({
              data: {
                order: {
                  id: "gid://shopify/Order/1001",
                  name: "#1001",
                  email: "checkout@example.com",
                  createdAt: "2026-03-18T08:00:00.000Z",
                  displayFinancialStatus: "PAID",
                  displayFulfillmentStatus: "UNFULFILLED",
                  note: "priority customer",
                  tags: ["vip"],
                  currentSubtotalLineItemsQuantity: 3,
                  currentTotalPriceSet: {
                    shopMoney: {
                      amount: "123.45",
                      currencyCode: "USD",
                    },
                  },
                  totalRefundedSet: {
                    shopMoney: {
                      amount: "0.00",
                      currencyCode: "USD",
                    },
                  },
                  customer: {
                    displayName: "Ada Lovelace",
                    email: "ada@example.com",
                  },
                  lineItems: {
                    nodes: [
                      {
                        id: "gid://shopify/LineItem/1",
                        sku: "WM-01",
                        name: "Short sleeve t-shirt",
                        quantity: 3,
                        refundableQuantity: 3,
                        unfulfilledQuantity: 3,
                      },
                    ],
                  },
                  transactions: {
                    nodes: [
                      {
                        id: "gid://shopify/OrderTransaction/1",
                        kind: "SALE",
                        status: "SUCCESS",
                        gateway: "shopify_payments",
                        processedAt: "2026-03-18T08:00:00.000Z",
                        amountSet: {
                          shopMoney: {
                            amount: "123.45",
                            currencyCode: "USD",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            })
          }

          if (query.includes("SellerOrderFulfillmentOrders")) {
            return createJsonResponse({
              errors: [
                {
                  message: "Missing access scope read_merchant_managed_fulfillment_orders",
                },
              ],
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await getShopifyOrder(TEST_SHOPIFY_STORE, "gid://shopify/Order/1001")

      assert.ok(snapshot)
      assert.equal(snapshot?.name, "#1001")
      assert.equal(snapshot?.customerEmail, "ada@example.com")
      assert.equal(snapshot?.lineItems.length, 1)
      assert.equal(snapshot?.transactions.length, 1)
      assert.equal(snapshot?.fulfillmentOrders.length, 0)
      assert.match(
        snapshot?.fulfillmentOrdersErrorMessage ?? "",
        /read_merchant_managed_fulfillment_orders/i,
      )
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })

  it("paginates nested order collections and falls back to the order email", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderDetail")) {
            assert.deepEqual(variables, {
              orderId: "gid://shopify/Order/1002",
            })

            return createJsonResponse({
              data: {
                order: {
                  id: "gid://shopify/Order/1002",
                  name: "#1002",
                  email: "guest@example.com",
                  createdAt: "2026-03-18T09:00:00.000Z",
                  displayFinancialStatus: "PARTIALLY_REFUNDED",
                  displayFulfillmentStatus: "PARTIALLY_FULFILLED",
                  note: "wholesale split shipment",
                  tags: ["b2b"],
                  currentSubtotalLineItemsQuantity: 4,
                  currentTotalPriceSet: {
                    shopMoney: {
                      amount: "220.00",
                      currencyCode: "USD",
                    },
                  },
                  totalRefundedSet: {
                    shopMoney: {
                      amount: "20.00",
                      currencyCode: "USD",
                    },
                  },
                  customer: null,
                  lineItems: {
                    pageInfo: {
                      hasNextPage: true,
                      endCursor: "line-cursor-1",
                    },
                    nodes: [
                      {
                        id: "gid://shopify/LineItem/1",
                        sku: "WM-01",
                        name: "Short sleeve t-shirt",
                        quantity: 2,
                        refundableQuantity: 2,
                        unfulfilledQuantity: 1,
                      },
                    ],
                  },
                  transactions: {
                    pageInfo: {
                      hasNextPage: true,
                      endCursor: "txn-cursor-1",
                    },
                    nodes: [
                      {
                        id: "gid://shopify/OrderTransaction/1",
                        kind: "SALE",
                        status: "SUCCESS",
                        gateway: "shopify_payments",
                        processedAt: "2026-03-18T09:00:00.000Z",
                        amountSet: {
                          shopMoney: {
                            amount: "200.00",
                            currencyCode: "USD",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            })
          }

          if (query.includes("SellerOrderLineItemsPage")) {
            assert.deepEqual(variables, {
              orderId: "gid://shopify/Order/1002",
              after: "line-cursor-1",
            })

            return createJsonResponse({
              data: {
                order: {
                  lineItems: {
                    pageInfo: {
                      hasNextPage: false,
                      endCursor: "line-cursor-2",
                    },
                    nodes: [
                      {
                        id: "gid://shopify/LineItem/2",
                        sku: "WM-02",
                        name: "Hoodie",
                        quantity: 2,
                        refundableQuantity: 1,
                        unfulfilledQuantity: 0,
                      },
                    ],
                  },
                },
              },
            })
          }

          if (query.includes("SellerOrderTransactionsPage")) {
            assert.deepEqual(variables, {
              orderId: "gid://shopify/Order/1002",
              after: "txn-cursor-1",
            })

            return createJsonResponse({
              data: {
                order: {
                  transactions: {
                    pageInfo: {
                      hasNextPage: false,
                      endCursor: "txn-cursor-2",
                    },
                    nodes: [
                      {
                        id: "gid://shopify/OrderTransaction/2",
                        kind: "REFUND",
                        status: "SUCCESS",
                        gateway: "shopify_payments",
                        processedAt: "2026-03-19T09:00:00.000Z",
                        amountSet: {
                          shopMoney: {
                            amount: "20.00",
                            currencyCode: "USD",
                          },
                        },
                      },
                    ],
                  },
                },
              },
            })
          }

          if (query.includes("SellerFulfillmentOrderLineItemsPage")) {
            assert.deepEqual(variables, {
              fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
              after: "fo-line-cursor-1",
            })

            return createJsonResponse({
              data: {
                fulfillmentOrder: {
                  lineItems: {
                    pageInfo: {
                      hasNextPage: false,
                      endCursor: "fo-line-cursor-2",
                    },
                    nodes: [
                      {
                        id: "gid://shopify/FulfillmentOrderLineItem/2",
                        remainingQuantity: 1,
                        totalQuantity: 1,
                        lineItem: {
                          id: "gid://shopify/LineItem/2",
                          sku: "WM-02",
                          name: "Hoodie",
                          quantity: 2,
                        },
                      },
                    ],
                  },
                },
              },
            })
          }

          if (query.includes("SellerOrderFulfillmentOrders")) {
            if (variables.after === null) {
              return createJsonResponse({
                data: {
                  order: {
                    fulfillmentOrders: {
                      pageInfo: {
                        hasNextPage: true,
                        endCursor: "fo-cursor-1",
                      },
                      nodes: [
                        {
                          id: "gid://shopify/FulfillmentOrder/1",
                          status: "OPEN",
                          requestStatus: "UNSUBMITTED",
                          assignedLocation: {
                            name: "Main Warehouse",
                            location: {
                              id: "gid://shopify/Location/1",
                            },
                          },
                          lineItems: {
                            pageInfo: {
                              hasNextPage: true,
                              endCursor: "fo-line-cursor-1",
                            },
                            nodes: [
                              {
                                id: "gid://shopify/FulfillmentOrderLineItem/1",
                                remainingQuantity: 1,
                                totalQuantity: 1,
                                lineItem: {
                                  id: "gid://shopify/LineItem/1",
                                  sku: "WM-01",
                                  name: "Short sleeve t-shirt",
                                  quantity: 2,
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              })
            }

            assert.deepEqual(variables, {
              orderId: "gid://shopify/Order/1002",
              after: "fo-cursor-1",
            })

            return createJsonResponse({
              data: {
                order: {
                  fulfillmentOrders: {
                    pageInfo: {
                      hasNextPage: false,
                      endCursor: null,
                    },
                    nodes: [
                      {
                        id: "gid://shopify/FulfillmentOrder/2",
                        status: "CLOSED",
                        requestStatus: "ACCEPTED",
                        assignedLocation: {
                          name: "Overflow Warehouse",
                          location: {
                            id: "gid://shopify/Location/2",
                          },
                        },
                        lineItems: {
                          pageInfo: {
                            hasNextPage: false,
                            endCursor: null,
                          },
                          nodes: [
                            {
                              id: "gid://shopify/FulfillmentOrderLineItem/3",
                              remainingQuantity: 0,
                              totalQuantity: 1,
                              lineItem: {
                                id: "gid://shopify/LineItem/2",
                                sku: "WM-02",
                                name: "Hoodie",
                                quantity: 2,
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await getShopifyOrder(TEST_SHOPIFY_STORE, "gid://shopify/Order/1002")

      assert.ok(snapshot)
      assert.equal(snapshot?.customerEmail, "guest@example.com")
      assert.equal(snapshot?.lineItems.length, 2)
      assert.equal(snapshot?.transactions.length, 2)
      assert.equal(snapshot?.fulfillmentOrders.length, 2)
      assert.equal(snapshot?.fulfillmentOrders[0]?.lineItems.length, 2)
      assert.equal(snapshot?.fulfillmentOrders[1]?.assignedLocationName, "Overflow Warehouse")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("queryShopifyReturnableFulfillments", () => {
  it("loads returnable fulfillment line items for one order", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerReturnableFulfillments")) {
            assert.deepEqual(variables, {
              orderId: "gid://shopify/Order/1001",
              after: null,
              first: 25,
              lineItemsFirst: 100,
            })

            return createJsonResponse({
              data: {
                returnableFulfillments: {
                  nodes: [
                    {
                      id: "gid://shopify/ReturnableFulfillment/1",
                      fulfillment: {
                        id: "gid://shopify/Fulfillment/1",
                      },
                      returnableFulfillmentLineItems: {
                        nodes: [
                          {
                            quantity: 2,
                            fulfillmentLineItem: {
                              id: "gid://shopify/FulfillmentLineItem/1",
                              lineItem: {
                                id: "gid://shopify/LineItem/1",
                                sku: "WM-01",
                                name: "Short sleeve t-shirt",
                                quantity: 3,
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await queryShopifyReturnableFulfillments(
        TEST_SHOPIFY_STORE,
        "gid://shopify/Order/1001",
      )

      assert.equal(snapshot.orderId, "gid://shopify/Order/1001")
      assert.equal(snapshot.returnableFulfillments.length, 1)
      assert.equal(
        snapshot.returnableFulfillments[0]?.lineItems[0]?.fulfillmentLineItemId,
        "gid://shopify/FulfillmentLineItem/1",
      )
      assert.equal(snapshot.returnableFulfillments[0]?.lineItems[0]?.returnableQuantity, 2)
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })

  it("paginates returnable fulfillments and nested returnable line items", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerReturnableFulfillmentLineItemsPage")) {
            assert.deepEqual(variables, {
              returnableFulfillmentId: "gid://shopify/ReturnableFulfillment/1",
              after: "rf-line-cursor-1",
            })

            return createJsonResponse({
              data: {
                returnableFulfillment: {
                  returnableFulfillmentLineItems: {
                    pageInfo: {
                      hasNextPage: false,
                      endCursor: "rf-line-cursor-2",
                    },
                    nodes: [
                      {
                        quantity: 1,
                        fulfillmentLineItem: {
                          id: "gid://shopify/FulfillmentLineItem/2",
                          lineItem: {
                            id: "gid://shopify/LineItem/2",
                            sku: "WM-02",
                            name: "Hoodie",
                            quantity: 1,
                          },
                        },
                      },
                    ],
                  },
                },
              },
            })
          }

          if (query.includes("SellerReturnableFulfillments")) {
            if (variables.after === null) {
              assert.deepEqual(variables, {
                orderId: "gid://shopify/Order/1001",
                after: null,
                first: 25,
                lineItemsFirst: 100,
              })

              return createJsonResponse({
                data: {
                  returnableFulfillments: {
                    pageInfo: {
                      hasNextPage: true,
                      endCursor: "rf-cursor-1",
                    },
                    nodes: [
                      {
                        id: "gid://shopify/ReturnableFulfillment/1",
                        fulfillment: {
                          id: "gid://shopify/Fulfillment/1",
                        },
                        returnableFulfillmentLineItems: {
                          pageInfo: {
                            hasNextPage: true,
                            endCursor: "rf-line-cursor-1",
                          },
                          nodes: [
                            {
                              quantity: 2,
                              fulfillmentLineItem: {
                                id: "gid://shopify/FulfillmentLineItem/1",
                                lineItem: {
                                  id: "gid://shopify/LineItem/1",
                                  sku: "WM-01",
                                  name: "Short sleeve t-shirt",
                                  quantity: 2,
                                },
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              })
            }

            assert.deepEqual(variables, {
              orderId: "gid://shopify/Order/1001",
              after: "rf-cursor-1",
              first: 25,
              lineItemsFirst: 100,
            })

            return createJsonResponse({
              data: {
                returnableFulfillments: {
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null,
                  },
                  nodes: [
                    {
                      id: "gid://shopify/ReturnableFulfillment/2",
                      fulfillment: {
                        id: "gid://shopify/Fulfillment/2",
                      },
                      returnableFulfillmentLineItems: {
                        pageInfo: {
                          hasNextPage: false,
                          endCursor: null,
                        },
                        nodes: [
                          {
                            quantity: 3,
                            fulfillmentLineItem: {
                              id: "gid://shopify/FulfillmentLineItem/3",
                              lineItem: {
                                id: "gid://shopify/LineItem/3",
                                sku: "WM-03",
                                name: "Cap",
                                quantity: 3,
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const snapshot = await queryShopifyReturnableFulfillments(
        TEST_SHOPIFY_STORE,
        "gid://shopify/Order/1001",
      )

      assert.equal(snapshot.returnableFulfillments.length, 2)
      assert.equal(snapshot.returnableFulfillments[0]?.lineItems.length, 2)
      assert.equal(snapshot.returnableFulfillments[1]?.lineItems[0]?.name, "Cap")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("cancelShopifyOrder", () => {
  it("submits explicit cancellation input and returns cancel-specific user errors", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderCancel")) {
            assert.deepEqual(variables, {
              orderId: "gid://shopify/Order/1001",
              notifyCustomer: true,
              refundMethod: {
                originalPaymentMethodsRefund: false,
              },
              restock: true,
              reason: "CUSTOMER",
              staffNote: "customer requested cancellation",
            })

            return createJsonResponse({
              data: {
                orderCancel: {
                  job: {
                    id: "gid://shopify/Job/1",
                    done: false,
                  },
                  orderCancelUserErrors: [
                    {
                      code: "ALREADY_CANCELLED",
                      field: ["orderId"],
                      message: "Order is already cancelled",
                    },
                  ],
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await cancelShopifyOrder(TEST_SHOPIFY_STORE, {
        orderId: "gid://shopify/Order/1001",
        notifyCustomer: true,
        refundMethod: {
          originalPaymentMethodsRefund: false,
        },
        restock: true,
        reason: "CUSTOMER",
        staffNote: "customer requested cancellation",
      })

      assert.equal(result.jobId, "gid://shopify/Job/1")
      assert.equal(result.jobDone, false)
      assert.equal(result.orderCancelUserErrors[0]?.field, "orderId")
      assert.equal(result.orderCancelUserErrors[0]?.code, "ALREADY_CANCELLED")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("captureShopifyOrder", () => {
  it("captures an authorized Shopify order transaction", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderCapture")) {
            assert.deepEqual(variables, {
              input: {
                id: "gid://shopify/Order/1001",
                parentTransactionId: "gid://shopify/OrderTransaction/1",
                amount: "25.00",
                currency: "USD",
                finalCapture: true,
              },
            })

            return createJsonResponse({
              data: {
                orderCapture: {
                  transaction: {
                    id: "gid://shopify/OrderTransaction/2",
                    kind: "CAPTURE",
                    status: "SUCCESS",
                    processedAt: "2026-03-18T10:00:00.000Z",
                    amountSet: {
                      presentmentMoney: {
                        amount: "25.00",
                        currencyCode: "USD",
                      },
                    },
                    parentTransaction: {
                      id: "gid://shopify/OrderTransaction/1",
                    },
                    multiCapturable: false,
                    order: {
                      id: "gid://shopify/Order/1001",
                      capturable: false,
                      totalCapturable: {
                        amount: "0.00",
                        currencyCode: "USD",
                      },
                    },
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await captureShopifyOrder(TEST_SHOPIFY_STORE, {
        orderId: "gid://shopify/Order/1001",
        parentTransactionId: "gid://shopify/OrderTransaction/1",
        amount: 25,
        currency: "USD",
        finalCapture: true,
      })

      assert.equal(result.transactionId, "gid://shopify/OrderTransaction/2")
      assert.equal(result.amount, 25)
      assert.equal(result.parentTransactionId, "gid://shopify/OrderTransaction/1")
      assert.equal(result.totalCapturable, 0)
      assert.equal(result.totalCapturableCurrencyCode, "USD")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("updateShopifyOrder", () => {
  it("updates mutable Shopify order fields with explicit order input", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderUpdate")) {
            assert.deepEqual(variables, {
              input: {
                id: "gid://shopify/Order/1001",
                customAttributes: [
                  {
                    key: "channel",
                    value: "phone",
                  },
                ],
                email: "buyer@example.com",
                note: "customer asked for gift wrap",
                phone: "+1-212-555-0100",
                poNumber: "PO-1001",
                shippingAddress: {
                  firstName: "Ada",
                  lastName: "Lovelace",
                  address1: "1 Main St",
                  city: "New York",
                  provinceCode: "NY",
                  countryCode: "US",
                  zip: "10001",
                  phone: "+1-212-555-0100",
                },
                tags: ["vip", "gift-wrap"],
              },
            })

            return createJsonResponse({
              data: {
                orderUpdate: {
                  order: {
                    id: "gid://shopify/Order/1001",
                    name: "#1001",
                    displayFinancialStatus: "PAID",
                    displayFulfillmentStatus: "UNFULFILLED",
                    email: "buyer@example.com",
                    phone: "+1-212-555-0100",
                    note: "customer asked for gift wrap",
                    poNumber: "PO-1001",
                    tags: ["vip", "gift-wrap"],
                    customAttributes: [
                      {
                        key: "channel",
                        value: "phone",
                      },
                    ],
                    shippingAddress: {
                      firstName: "Ada",
                      lastName: "Lovelace",
                      address1: "1 Main St",
                      city: "New York",
                      province: "New York",
                      provinceCode: "NY",
                      country: "United States",
                      countryCodeV2: "US",
                      zip: "10001",
                      phone: "+1-212-555-0100",
                    },
                    currentTotalPriceSet: {
                      shopMoney: {
                        amount: "123.45",
                        currencyCode: "USD",
                      },
                    },
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await updateShopifyOrder(TEST_SHOPIFY_STORE, {
        orderId: "gid://shopify/Order/1001",
        customAttributes: [
          {
            key: "channel",
            value: "phone",
          },
        ],
        email: "buyer@example.com",
        note: "customer asked for gift wrap",
        phone: "+1-212-555-0100",
        poNumber: "PO-1001",
        shippingAddress: {
          firstName: "Ada",
          lastName: "Lovelace",
          address1: "1 Main St",
          city: "New York",
          provinceCode: "NY",
          countryCode: "US",
          zip: "10001",
          phone: "+1-212-555-0100",
        },
        tags: ["vip", "gift-wrap"],
      })

      assert.equal(result.orderId, "gid://shopify/Order/1001")
      assert.equal(result.note, "customer asked for gift wrap")
      assert.equal(result.customAttributes[0]?.key, "channel")
      assert.equal(result.shippingAddress?.countryCode, "US")
      assert.equal(result.totalPrice, 123.45)
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })

  it("preserves explicit clear operations for mutable order fields", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderUpdate")) {
            assert.deepEqual(variables, {
              input: {
                id: "gid://shopify/Order/1001",
                customAttributes: [],
                email: null,
                note: null,
                phone: null,
                poNumber: null,
                tags: [],
              },
            })

            return createJsonResponse({
              data: {
                orderUpdate: {
                  order: {
                    id: "gid://shopify/Order/1001",
                    name: "#1001",
                    displayFinancialStatus: "PAID",
                    displayFulfillmentStatus: "UNFULFILLED",
                    email: null,
                    phone: null,
                    note: null,
                    poNumber: null,
                    tags: [],
                    customAttributes: [],
                    shippingAddress: null,
                    currentTotalPriceSet: {
                      shopMoney: {
                        amount: "123.45",
                        currencyCode: "USD",
                      },
                    },
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await updateShopifyOrder(TEST_SHOPIFY_STORE, {
        orderId: "gid://shopify/Order/1001",
        customAttributes: [],
        email: "",
        note: "",
        phone: "",
        poNumber: "",
        tags: [],
      })

      assert.equal(result.email, null)
      assert.equal(result.note, null)
      assert.equal(result.phone, null)
      assert.deepEqual(result.tags, [])
      assert.deepEqual(result.customAttributes, [])
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })

  it("ignores blank tags and invalid custom attributes during order updates", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderUpdate")) {
            assert.deepEqual(variables, {
              input: {
                id: "gid://shopify/Order/1001",
                note: "customer asked for gift wrap",
              },
            })

            return createJsonResponse({
              data: {
                orderUpdate: {
                  order: {
                    id: "gid://shopify/Order/1001",
                    name: "#1001",
                    displayFinancialStatus: "PAID",
                    displayFulfillmentStatus: "UNFULFILLED",
                    email: "buyer@example.com",
                    phone: "+1-212-555-0100",
                    note: "customer asked for gift wrap",
                    poNumber: "PO-1001",
                    tags: ["vip"],
                    customAttributes: [
                      {
                        key: "channel",
                        value: "phone",
                      },
                    ],
                    shippingAddress: null,
                    currentTotalPriceSet: {
                      shopMoney: {
                        amount: "123.45",
                        currencyCode: "USD",
                      },
                    },
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await updateShopifyOrder(TEST_SHOPIFY_STORE, {
        orderId: "gid://shopify/Order/1001",
        note: "customer asked for gift wrap",
        tags: [" "],
        customAttributes: [
          {
            key: " ",
            value: " ",
          },
        ],
      })

      assert.equal(result.note, "customer asked for gift wrap")
      assert.deepEqual(result.tags, ["vip"])
      assert.equal(result.customAttributes[0]?.key, "channel")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("beginShopifyOrderEdit", () => {
  it("starts a Shopify order-edit session and returns the calculated order context", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerOrderEditBegin")) {
            assert.deepEqual(variables, {
              id: "gid://shopify/Order/1001",
            })

            return createJsonResponse({
              data: {
                orderEditBegin: {
                  calculatedOrder: {
                    id: "gid://shopify/CalculatedOrder/1",
                    originalOrder: {
                      id: "gid://shopify/Order/1001",
                      name: "#1001",
                    },
                    subtotalLineItemsQuantity: 3,
                    subtotalPriceSet: {
                      presentmentMoney: {
                        amount: "123.45",
                        currencyCode: "USD",
                      },
                    },
                    totalOutstandingSet: {
                      presentmentMoney: {
                        amount: "0.00",
                        currencyCode: "USD",
                      },
                    },
                    lineItems: {
                      nodes: [
                        {
                          id: "gid://shopify/CalculatedLineItem/1",
                          sku: "WM-01",
                          title: "Short sleeve t-shirt",
                          quantity: 3,
                        },
                      ],
                    },
                    stagedChanges: {
                      nodes: [],
                    },
                  },
                  orderEditSession: {
                    id: "gid://shopify/OrderEditSession/1",
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await beginShopifyOrderEdit(TEST_SHOPIFY_STORE, {
        orderId: "gid://shopify/Order/1001",
      })

      assert.equal(result.orderId, "gid://shopify/Order/1001")
      assert.equal(result.orderEditSessionId, "gid://shopify/OrderEditSession/1")
      assert.equal(result.calculatedOrderId, "gid://shopify/CalculatedOrder/1")
      assert.equal(result.lineItems[0]?.sku, "WM-01")
      assert.equal(result.subtotalPrice, 123.45)
      assert.equal(result.stagedChangeTypes.length, 0)
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("createShopifyFulfillment", () => {
  it("submits explicit fulfillment-order input and returns user errors when Shopify rejects it", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerFulfillmentCreate")) {
            assert.deepEqual(variables, {
              fulfillment: {
                notifyCustomer: true,
                lineItemsByFulfillmentOrder: [
                  {
                    fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
                    fulfillmentOrderLineItems: [
                      {
                        id: "gid://shopify/FulfillmentOrderLineItem/1",
                        quantity: 2,
                      },
                    ],
                  },
                ],
                trackingInfo: {
                  company: "UPS",
                  number: "1Z999",
                  url: "https://tracking.example.com/1Z999",
                },
                originAddress: {
                  address1: "1 Main St",
                  city: "New York",
                  countryCode: "US",
                },
              },
              message: "packed and ready",
            })

            return createJsonResponse({
              data: {
                fulfillmentCreate: {
                  fulfillment: null,
                  userErrors: [
                    {
                      field: [
                        "fulfillment",
                        "lineItemsByFulfillmentOrder",
                        "0",
                        "fulfillmentOrderId",
                      ],
                      message: "Fulfillment order is already closed",
                    },
                  ],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await createShopifyFulfillment(TEST_SHOPIFY_STORE, {
        notifyCustomer: true,
        message: "packed and ready",
        trackingInfo: {
          company: "UPS",
          number: "1Z999",
          url: "https://tracking.example.com/1Z999",
        },
        originAddress: {
          address1: "1 Main St",
          city: "New York",
          countryCode: "US",
        },
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
            fulfillmentOrderLineItems: [
              {
                id: "gid://shopify/FulfillmentOrderLineItem/1",
                quantity: 2,
              },
            ],
          },
        ],
      })

      assert.equal(result.fulfillmentId, null)
      assert.equal(result.userErrors.length, 1)
      assert.equal(
        result.userErrors[0]?.field,
        "fulfillment.lineItemsByFulfillmentOrder.0.fulfillmentOrderId",
      )
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("createShopifyReturn", () => {
  it("submits explicit return input with fulfillment line items", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("SellerReturnCreate")) {
            assert.deepEqual(variables, {
              returnInput: {
                orderId: "gid://shopify/Order/1001",
                notifyCustomer: true,
                requestedAt: "2026-03-18T10:00:00Z",
                returnLineItems: [
                  {
                    fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/1",
                    quantity: 1,
                    returnReason: "WRONG_ITEM",
                    returnReasonNote: "received the wrong color",
                  },
                ],
              },
            })

            return createJsonResponse({
              data: {
                returnCreate: {
                  return: {
                    id: "gid://shopify/Return/1",
                    status: "OPEN",
                    order: {
                      id: "gid://shopify/Order/1001",
                    },
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await createShopifyReturn(TEST_SHOPIFY_STORE, {
        orderId: "gid://shopify/Order/1001",
        notifyCustomer: true,
        requestedAt: "2026-03-18T10:00:00Z",
        returnLineItems: [
          {
            fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/1",
            quantity: 1,
            returnReason: "WRONG_ITEM",
            returnReasonNote: "received the wrong color",
          },
        ],
      })

      assert.equal(result.orderId, "gid://shopify/Order/1001")
      assert.equal(result.returnId, "gid://shopify/Return/1")
      assert.equal(result.status, "OPEN")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})

describe("createShopifyRefund", () => {
  it("uses the idempotent refund mutation when an idempotency key is provided", async () => {
    process.env[TEST_SHOPIFY_SECRET_ENV] = "test-secret"

    const fetchMock = mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = getRequestUrl(input)
        if (url === "https://example.myshopify.com/admin/oauth/access_token") {
          return createJsonResponse({
            access_token: "test-access-token",
          })
        }

        if (url === "https://example.myshopify.com/admin/api/2026-01/graphql.json") {
          const query = getGraphQLQuery(init)
          const variables = getGraphQLVariables(init)

          if (query.includes("SellerHealthShop")) {
            return createJsonResponse({
              data: {
                shop: {
                  name: "Test Shopify Store",
                  currencyCode: "USD",
                  ianaTimezone: "America/New_York",
                },
              },
            })
          }

          if (query.includes("@idempotent")) {
            assert.deepEqual(variables, {
              input: {
                orderId: "gid://shopify/Order/1001",
                notify: true,
                note: "customer appeasement",
                currency: "USD",
                shipping: {
                  amount: "5.00",
                },
                refundLineItems: [
                  {
                    lineItemId: "gid://shopify/LineItem/1",
                    quantity: 1,
                    restockType: "RETURN",
                  },
                ],
                transactions: [
                  {
                    amount: "25.00",
                    gateway: "shopify_payments",
                    kind: "REFUND",
                    orderId: "gid://shopify/Order/1001",
                    parentId: "gid://shopify/OrderTransaction/1",
                  },
                ],
              },
              idempotencyKey: "refund-1001-1",
            })

            return createJsonResponse({
              data: {
                refundCreate: {
                  order: {
                    id: "gid://shopify/Order/1001",
                  },
                  refund: {
                    id: "gid://shopify/Refund/1",
                    note: "customer appeasement",
                    createdAt: "2026-03-18T10:00:00.000Z",
                    totalRefundedSet: {
                      shopMoney: {
                        amount: "30.00",
                        currencyCode: "USD",
                      },
                    },
                    transactions: {
                      nodes: [
                        {
                          id: "gid://shopify/OrderTransaction/2",
                          kind: "REFUND",
                          status: "SUCCESS",
                          gateway: "shopify_payments",
                          processedAt: "2026-03-18T10:00:00.000Z",
                          amountSet: {
                            shopMoney: {
                              amount: "30.00",
                              currencyCode: "USD",
                            },
                          },
                        },
                      ],
                    },
                  },
                  userErrors: [],
                },
              },
            })
          }
        }

        throw new Error(`Unexpected fetch URL: ${url}`)
      },
    )

    try {
      const result = await createShopifyRefund(TEST_SHOPIFY_STORE, {
        orderId: "gid://shopify/Order/1001",
        notify: true,
        note: "customer appeasement",
        currency: "USD",
        shipping: {
          amount: 5,
        },
        refundLineItems: [
          {
            lineItemId: "gid://shopify/LineItem/1",
            quantity: 1,
            restockType: "RETURN",
          },
        ],
        transactions: [
          {
            amount: 25,
            gateway: "shopify_payments",
            parentId: "gid://shopify/OrderTransaction/1",
          },
        ],
        idempotencyKey: "refund-1001-1",
      })

      assert.equal(result.refundId, "gid://shopify/Refund/1")
      assert.equal(result.totalRefunded, 30)
      assert.equal(result.transactions.length, 1)
      assert.equal(result.transactions[0]?.gateway, "shopify_payments")
    } finally {
      fetchMock.mock.restore()
      delete process.env[TEST_SHOPIFY_SECRET_ENV]
    }
  })
})
