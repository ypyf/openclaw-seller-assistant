import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"
import {
  evaluateClearanceDecision,
  evaluateDiscountDecision,
  loadShopifyStoreOverview,
  resolveStoreOverviewWindow,
  type ShopifyProductActionSnapshot,
} from "./shopify.ts"

const createSnapshot = (
  overrides: Partial<ShopifyProductActionSnapshot> = {},
): ShopifyProductActionSnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-17T00:00:00.000Z",
  locale: "en-US",
  storeName: "Lotan",
  timezone: "Asia/Shanghai",
  sku: "WM-01",
  productName: "Short sleeve t-shirt",
  onHandUnits: 29,
  dailySalesUnits: 2 / 30,
  lookbackDays: 30,
  unitsSold: 2,
  currencyCode: "USD",
  inventoryDaysLeft: 435,
  averageUnitPrice: 39,
  averageUnitCost: 12.5,
  currentMarginPct: 67.94871794871796,
  ...overrides,
})

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

describe("evaluateClearanceDecision", () => {
  it("returns structured low-confidence clearance guidance for thin-sample aged inventory", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot(),
    })

    assert.equal(evaluation.clearanceDecision, "review_for_clearance")
    assert.equal(evaluation.decisionConfidence, "low")
    assert.match(evaluation.decisionSummary, /controlled clearance test/i)
    assert.match(evaluation.clearanceReason, /not reliable enough|demand is weak/i)
    assert.ok(
      evaluation.analysisPoints.some(
        point => point.includes("435.0 days") && point.includes("180-day strong-signal threshold"),
      ),
    )
    assert.ok(
      evaluation.analysisPoints.some(
        point => point.includes("thin sample") || point.includes("too thin"),
      ),
    )
    assert.match(evaluation.recommendedActions[2] ?? "", /\$12\.50/)
    assert.equal(evaluation.reviewWindowDays, 14)
    assert.match(evaluation.escalationTrigger ?? "", /escalate/i)
  })

  it("uses sold-out-specific guidance when there is no inventory left to clear", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot({
        sku: "WM-01Z",
        onHandUnits: 0,
        dailySalesUnits: 0,
        unitsSold: 0,
        inventoryDaysLeft: Number.POSITIVE_INFINITY,
      }),
    })

    assert.equal(evaluation.clearanceDecision, "not_clearance_candidate")
    assert.equal(
      evaluation.decisionSummary,
      "No clearance action is needed because the SKU has no on-hand inventory.",
    )
    assert.match(evaluation.analysisPoints[0] ?? "", /nothing left to clear/i)
    assert.match(evaluation.recommendedActions[0] ?? "", /clearance or aged-inventory queues/i)
    assert.match(evaluation.recommendedActions[1] ?? "", /Do not schedule clearance placements/i)
    assert.match(evaluation.recommendedActions[3] ?? "", /No clearance follow-up is needed/i)
    assert.equal(evaluation.reviewWindowDays, 0)
    assert.match(evaluation.escalationTrigger ?? "", /inventory becomes available again/i)
    assert.equal(evaluation.analysisPoints.length, 3)
    assert.ok(
      evaluation.analysisPoints.every(
        point =>
          !point.startsWith("Current margin is") &&
          !point.startsWith("Pricing guardrails are unavailable"),
      ),
    )
    assert.ok(
      evaluation.recommendedActions.every(
        action => !/standard pricing|standard merchandising/i.test(action),
      ),
    )
  })

  it("returns a high-confidence clearance move for extreme aged inventory with no sales", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot({
        sku: "WM-02",
        onHandUnits: 64,
        dailySalesUnits: 0,
        unitsSold: 0,
        inventoryDaysLeft: 999,
      }),
    })

    assert.equal(evaluation.clearanceDecision, "clear_inventory")
    assert.equal(evaluation.decisionConfidence, "high")
    assert.match(evaluation.decisionSummary, /clearance now/i)
    assert.match(evaluation.recommendedActions[1] ?? "", /strong clearance action/i)
    assert.equal(evaluation.reviewWindowDays, 7)
  })

  it("formats zero-sales inventory cover without exposing Infinity in clearance analysis", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot({
        sku: "WM-02B",
        onHandUnits: 64,
        dailySalesUnits: 0,
        unitsSold: 0,
        inventoryDaysLeft: Number.POSITIVE_INFINITY,
      }),
    })

    assert.ok(
      evaluation.analysisPoints.some(point => point.includes("n/a (no recent sales detected)")),
    )
    assert.ok(evaluation.analysisPoints.every(point => !point.includes("Infinity")))
  })
})

describe("evaluateDiscountDecision", () => {
  it("returns a controlled discount test with price guardrails when inventory is heavy and demand is weak", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-03",
        onHandUnits: 45,
        dailySalesUnits: 0.2,
        unitsSold: 6,
        inventoryDaysLeft: 120,
        averageUnitPrice: 20,
        averageUnitCost: 8,
        currentMarginPct: 60,
      }),
      marginFloorPct: 30,
    })

    assert.equal(evaluation.discountDecision, "test_discount")
    assert.equal(evaluation.decisionConfidence, "medium")
    assert.match(evaluation.decisionSummary, /controlled discount test/i)
    assert.ok(
      evaluation.analysisPoints.some(
        point => point.includes("120.0 days") && point.includes("60-day discount threshold"),
      ),
    )
    assert.match(evaluation.recommendedActions[2] ?? "", /\$11\.43/)
    assert.equal(evaluation.reviewWindowDays, 7)
    assert.match(evaluation.escalationTrigger ?? "", /clearance review/i)
    assert.doesNotMatch(evaluation.discountReason, /test_discount|hold_price|discount_blocked/)
  })

  it("routes aged inventory to clearance-oriented guidance instead of standard pricing", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-04",
        inventoryDaysLeft: 220,
        dailySalesUnits: 0.1,
        unitsSold: 3,
      }),
      marginFloorPct: 30,
    })

    assert.equal(evaluation.discountDecision, "hold_price")
    assert.match(evaluation.discountReason, /clearance review/i)
    assert.match(evaluation.decisionSummary, /clearance review/i)
    assert.match(evaluation.analysisPoints[3] ?? "", /clearance case/i)
    assert.match(evaluation.recommendedActions[0] ?? "", /clearance review queue/i)
    assert.match(evaluation.recommendedActions[1] ?? "", /clearance/i)
    assert.doesNotMatch(evaluation.recommendedActions[1] ?? "", /standard merchandising/i)
    assert.match(evaluation.escalationTrigger ?? "", /clearance/i)
    assert.equal(evaluation.reviewWindowDays, 7)
  })

  it("uses sold-out-specific guidance when there is no inventory left to discount", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-04A",
        onHandUnits: 0,
        dailySalesUnits: 0,
        unitsSold: 0,
        inventoryDaysLeft: Number.POSITIVE_INFINITY,
      }),
    })

    assert.equal(evaluation.discountDecision, "hold_price")
    assert.equal(evaluation.discountReason, "There is no on-hand inventory left to discount.")
    assert.equal(
      evaluation.decisionSummary,
      "No discount action is needed because the SKU has no on-hand inventory.",
    )
    assert.match(evaluation.analysisPoints[0] ?? "", /nothing available to discount/i)
    assert.match(evaluation.recommendedActions[0] ?? "", /out of markdown or discount queues/i)
    assert.match(evaluation.recommendedActions[1] ?? "", /Do not launch discount messaging/i)
    assert.match(evaluation.recommendedActions[3] ?? "", /No discount follow-up is needed/i)
    assert.equal(evaluation.reviewWindowDays, 0)
    assert.match(evaluation.escalationTrigger ?? "", /inventory becomes available again/i)
    assert.equal(evaluation.analysisPoints.length, 3)
    assert.ok(
      evaluation.analysisPoints.every(
        point =>
          !point.startsWith("Current margin is") &&
          !point.startsWith("Pricing guardrails are unavailable"),
      ),
    )
    assert.ok(
      evaluation.recommendedActions.every(
        action => !/standard pricing|future discount floor/i.test(action),
      ),
    )
  })

  it("keeps healthy high-stock SKUs on normal pricing guidance", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-04B",
        onHandUnits: 400,
        dailySalesUnits: 2,
        unitsSold: 60,
        inventoryDaysLeft: 200,
        averageUnitPrice: 20,
        averageUnitCost: 8,
        currentMarginPct: 60,
      }),
      marginFloorPct: 30,
    })

    assert.equal(evaluation.discountDecision, "hold_price")
    assert.match(evaluation.discountReason, /healthy/i)
    assert.equal(evaluation.decisionSummary, "Keep price unchanged for now.")
    assert.match(evaluation.recommendedActions[0] ?? "", /standard pricing/i)
    assert.match(evaluation.recommendedActions[1] ?? "", /standard merchandising/i)
    assert.ok(evaluation.recommendedActions.every(action => !/clearance/i.test(action)))
  })

  it("does not claim cost data is missing when only current margin is unavailable", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-05",
        dailySalesUnits: 0.2,
        unitsSold: 6,
        inventoryDaysLeft: 120,
        averageUnitPrice: 0,
        averageUnitCost: 8,
        currentMarginPct: null,
      }),
      marginFloorPct: 30,
    })

    assert.equal(evaluation.discountDecision, "discount_blocked")
    assert.match(evaluation.decisionSummary, /selling-price data/i)
    assert.ok(
      evaluation.analysisPoints.some(point =>
        point.includes("recent selling price data is missing"),
      ),
    )
    assert.ok(evaluation.analysisPoints.some(point => point.includes("$11.43")))
    assert.ok(
      evaluation.analysisPoints.every(point => !point.includes("product cost data is missing")),
    )
    assert.match(evaluation.recommendedActions[2] ?? "", /selling-price data/i)
    assert.doesNotMatch(evaluation.recommendedActions[2] ?? "", /cost data/i)
  })

  it("treats missing price-and-cost data as a combined pricing-data gap", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-05C",
        dailySalesUnits: 0.2,
        unitsSold: 6,
        inventoryDaysLeft: 120,
        averageUnitPrice: 0,
        averageUnitCost: null,
        currentMarginPct: null,
      }),
      marginFloorPct: 30,
    })

    assert.equal(evaluation.discountDecision, "discount_blocked")
    assert.match(evaluation.decisionSummary, /both product cost and recent selling-price data/i)
    assert.ok(
      evaluation.analysisPoints.some(point =>
        point.includes("both product cost data and recent selling price data are missing"),
      ),
    )
    assert.match(
      evaluation.recommendedActions[2] ?? "",
      /both product cost and recent selling-price data/i,
    )
  })

  it("does not report discount headroom when the SKU is already below cost", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-05A",
        dailySalesUnits: 0.2,
        unitsSold: 6,
        inventoryDaysLeft: 120,
        averageUnitPrice: 6,
        averageUnitCost: 8,
        currentMarginPct: -33.33333333333333,
      }),
    })

    assert.equal(evaluation.discountDecision, "discount_blocked")
    assert.ok(
      evaluation.analysisPoints.some(point =>
        point.includes("already at or below the cost-aware floor"),
      ),
    )
    assert.ok(
      evaluation.analysisPoints.some(point =>
        point.includes("raising price rather than discounting"),
      ),
    )
    assert.ok(
      evaluation.analysisPoints.every(point => !point.includes("leaving room to move price")),
    )
  })

  it("keeps insufficient-data demand analysis neutral instead of calling it weak", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-05B",
        lookbackDays: 7,
        dailySalesUnits: 10,
        unitsSold: 70,
        inventoryDaysLeft: 90,
        onHandUnits: 120,
      }),
      marginFloorPct: 30,
    })

    assert.equal(evaluation.discountDecision, "hold_price")
    assert.match(
      evaluation.analysisPoints[1] ?? "",
      /not reliable enough to classify demand confidently/i,
    )
    assert.doesNotMatch(evaluation.analysisPoints[1] ?? "", /weak movement|weak demand/i)
  })

  it("uses the provided fallback currency in discount guidance strings", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-06",
        currencyCode: null,
        onHandUnits: 45,
        dailySalesUnits: 0.2,
        unitsSold: 6,
        inventoryDaysLeft: 120,
        averageUnitPrice: 20,
        averageUnitCost: 8,
        currentMarginPct: 60,
      }),
      marginFloorPct: 30,
      fallbackCurrency: "EUR",
    })

    assert.ok(
      evaluation.analysisPoints.some(point => point.includes("EUR") || point.includes("€11.43")),
    )
    assert.match(evaluation.recommendedActions[2] ?? "", /€11\.43/)
  })

  it("formats zero-sales inventory cover without exposing Infinity in discount analysis", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-07",
        onHandUnits: 64,
        dailySalesUnits: 0,
        unitsSold: 0,
        inventoryDaysLeft: Number.POSITIVE_INFINITY,
      }),
      marginFloorPct: 30,
    })

    assert.ok(
      evaluation.analysisPoints.some(point => point.includes("n/a (no recent sales detected)")),
    )
    assert.ok(evaluation.analysisPoints.every(point => !point.includes("Infinity")))
  })

  it("does not blame cost data when the configured margin floor is impossible", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-08",
        inventoryDaysLeft: 220,
        dailySalesUnits: 0.1,
        unitsSold: 3,
        averageUnitCost: 8,
        averageUnitPrice: 20,
        currentMarginPct: 60,
      }),
      marginFloorPct: 100,
    })

    assert.equal(evaluation.discountDecision, "hold_price")
    assert.match(evaluation.analysisPoints[2] ?? "", /gross-margin floor cannot be satisfied/i)
    assert.match(evaluation.recommendedActions[2] ?? "", /gross-margin floor/i)
    assert.doesNotMatch(evaluation.recommendedActions[2] ?? "", /Confirm cost data/i)
  })

  it("surfaces invalid margin-floor configuration in blocked-discount summaries", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-08B",
        inventoryDaysLeft: 120,
        dailySalesUnits: 0.1,
        unitsSold: 3,
        averageUnitCost: 8,
        averageUnitPrice: 20,
        currentMarginPct: 60,
      }),
      marginFloorPct: 100,
    })

    assert.equal(evaluation.discountDecision, "discount_blocked")
    assert.equal(
      evaluation.decisionSummary,
      "Do not discount until the configured gross-margin floor is fixed.",
    )
    assert.match(evaluation.analysisPoints[2] ?? "", /gross-margin floor cannot be satisfied/i)
  })

  it("does not blame cost data in clearance guidance when the configured margin floor is impossible", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot({
        sku: "WM-09",
        inventoryDaysLeft: 220,
        dailySalesUnits: 0.1,
        unitsSold: 3,
        averageUnitCost: 8,
        averageUnitPrice: 20,
        currentMarginPct: 60,
      }),
      marginFloorPct: 100,
    })

    assert.equal(evaluation.clearanceDecision, "clear_inventory")
    assert.match(evaluation.analysisPoints[2] ?? "", /gross-margin floor cannot be satisfied/i)
    assert.match(evaluation.recommendedActions[2] ?? "", /gross-margin floor/i)
    assert.doesNotMatch(evaluation.recommendedActions[2] ?? "", /Confirm cost data/i)
  })

  it("uses combined pricing-data remediation in clearance guidance when price and cost are both missing", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot({
        sku: "WM-10",
        inventoryDaysLeft: 220,
        dailySalesUnits: 0.1,
        unitsSold: 3,
        averageUnitCost: null,
        averageUnitPrice: 0,
        currentMarginPct: null,
      }),
      marginFloorPct: 30,
    })

    assert.ok(
      evaluation.analysisPoints.some(point =>
        point.includes("both product cost data and recent selling price data are missing"),
      ),
    )
    assert.match(
      evaluation.recommendedActions[2] ?? "",
      /both product cost and recent selling-price data/i,
    )
  })
})
