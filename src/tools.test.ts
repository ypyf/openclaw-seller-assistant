import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DEFAULT_PRODUCT_DECISION_POLICY, type PluginConfig } from "./config.ts"
import {
  evaluateClearanceDecision,
  evaluateDiscountDecision,
  type ShopifySalesSnapshot,
  type ShopifyProductActionSnapshot,
  type ShopifyStoreOverviewSnapshot,
  type ShopifyStoreSalesSummarySnapshot,
  type StoreOverviewRangePreset,
} from "./services/shopify.ts"
import {
  buildClearanceDecisionToolDetails,
  buildDiscountDecisionToolDetails,
  formatClearanceDecisionFallback,
  formatDiscountDecisionFallback,
  formatProductDecisionToolContent,
  registerSellerTools,
  type SellerToolApi,
  type SellerToolDependencies,
} from "./tools.ts"

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

const formatOptions = {
  locale: "en-US",
  fallbackCurrency: "USD",
}

const createPluginConfig = (): PluginConfig => ({
  currency: "USD",
  locale: "en-US",
  lowInventoryDays: 14,
  decisionPolicy: DEFAULT_PRODUCT_DECISION_POLICY,
  responseTone: "consultative",
  defaultStoreId: "shopify-us",
  stores: {
    shopify: [
      {
        id: "shopify-us",
        name: "US Shopify Store",
        storeDomain: "example.myshopify.com",
        clientId: "client-id",
        clientSecretEnv: "SHOPIFY_CLIENT_SECRET",
        operations: {
          salesLookbackDays: 30,
        },
      },
    ],
  },
})

const createStoreOverviewSnapshot = (
  overrides: Partial<ShopifyStoreOverviewSnapshot> = {},
): ShopifyStoreOverviewSnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  currencyCode: "USD",
  windowLabel: "Today",
  ordersCount: 4,
  unitsSold: 7,
  revenue: 123.45,
  inventoryUnits: 200,
  averageDailyUnits: 7,
  inventoryDaysLeft: 28.6,
  ...overrides,
})

const createStoreSalesSummarySnapshot = (
  overrides: Partial<ShopifyStoreSalesSummarySnapshot> = {},
): ShopifyStoreSalesSummarySnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  currencyCode: "USD",
  windows: [
    {
      rangePreset: "today",
      windowLabel: "Today",
      ordersCount: 1,
      unitsSold: 2,
      revenue: 100,
    },
    {
      rangePreset: "last_7_days",
      windowLabel: "Last 7 days",
      ordersCount: 5,
      unitsSold: 11,
      revenue: 700,
    },
  ],
  inventoryUnits: 250,
  inventoryDaysLeft: 22.7,
  ...overrides,
})

const createSalesSnapshot = (
  overrides: Partial<ShopifySalesSnapshot> = {},
): ShopifySalesSnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  locale: "en-US",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  productName: "Short sleeve t-shirt",
  sku: "WM-01",
  lookbackDays: 21,
  dailySalesUnits: 1.5,
  unitsSold: 32,
  ...overrides,
})

const extractToolText = async (resultPromise: Promise<unknown>) => {
  const result = await resultPromise
  if (!result || typeof result !== "object" || !("content" in result)) {
    assert.fail("Expected a tool result object with content")
  }

  const content = result.content
  if (!Array.isArray(content) || content.length === 0) {
    assert.fail("Expected a non-empty content array")
  }

  const firstEntry = content[0]
  if (!firstEntry || typeof firstEntry !== "object" || !("text" in firstEntry)) {
    assert.fail("Expected the first content entry to include text")
  }
  assert.equal(typeof firstEntry.text, "string")
  return firstEntry.text
}

type CapturedTool = {
  name: string
  description: string
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown>
}

const createToolHarness = () => {
  const overviewCalls: Array<Record<string, unknown>> = []
  const summaryCalls: Array<Record<string, unknown>> = []
  const salesCalls: Array<{
    productRef: string
    salesLookbackDays: number
    locale: string
  }> = []
  const tools: CapturedTool[] = []

  const api: SellerToolApi = {
    registerTool(tool) {
      tools.push({
        name: tool.name,
        description: tool.description,
        execute: (id, params) => tool.execute(id, params as never),
      })
    },
  }

  const dependencies: SellerToolDependencies = {
    async loadShopifyStoreOverview(_store, options) {
      overviewCalls.push({ ...options })
      const windowLabel =
        options.startDate && options.endDate
          ? `${options.startDate} to ${options.endDate}`
          : options.rangePreset === "last_7_days"
            ? "Last 7 days"
            : "Today"

      return createStoreOverviewSnapshot({
        windowLabel,
      })
    },
    async loadShopifyStoreSalesSummary(_store, options) {
      summaryCalls.push({
        windows: [...options.windows],
        includeInventory: options.includeInventory,
      })

      return createStoreSalesSummarySnapshot({
        windows: options.windows.map((rangePreset, index) => ({
          rangePreset,
          windowLabel: rangePreset,
          ordersCount: index + 1,
          unitsSold: (index + 1) * 2,
          revenue: (index + 1) * 100,
        })),
      })
    },
    async loadShopifyInventorySnapshot() {
      throw new Error("loadShopifyInventorySnapshot should not be called in these tests")
    },
    async loadShopifySalesSnapshot(_store, productRef, salesLookbackDays, locale) {
      salesCalls.push({ productRef, salesLookbackDays, locale })
      return {
        kind: "ready",
        value: createSalesSnapshot({
          lookbackDays: salesLookbackDays,
        }),
      }
    },
    async loadShopifyProductActionSnapshot() {
      throw new Error("loadShopifyProductActionSnapshot should not be called in these tests")
    },
  }

  registerSellerTools(api, createPluginConfig(), dependencies)

  const getTool = (name: string) => {
    const tool = tools.find(candidate => candidate.name === name)
    assert.ok(tool, `Expected tool ${name} to be registered`)
    return tool
  }

  return {
    overviewCalls,
    summaryCalls,
    salesCalls,
    tools,
    getTool,
  }
}

describe("registerSellerTools", () => {
  it("registers seller_store_overview as the only store-level sales tool", () => {
    const harness = createToolHarness()
    const toolNames = harness.tools.map(tool => tool.name)

    assert.ok(toolNames.includes("seller_store_overview"))
    assert.ok(toolNames.includes("seller_sales_query"))
    assert.ok(!toolNames.includes("seller_store_sales_summary"))
  })

  it("returns today-style store overview output by default", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_store_overview")

    const text = await extractToolText(tool.execute("tool-call", {}))

    assert.equal(harness.overviewCalls.length, 1)
    assert.equal(harness.summaryCalls.length, 0)
    assert.match(text, /^Source: shopify/m)
    assert.match(text, /^Window: Today$/m)
    assert.match(text, /^Revenue: \$123\.45$/m)
    assert.doesNotMatch(text, /sales summary:/i)
  })

  it("uses single-window overview mode for range presets", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_store_overview")

    const text = await extractToolText(
      tool.execute("tool-call", {
        rangePreset: "last_7_days",
      }),
    )

    assert.deepEqual(harness.overviewCalls, [
      {
        rangePreset: "last_7_days",
        startDate: undefined,
        endDate: undefined,
        includeInventory: undefined,
      },
    ])
    assert.equal(harness.summaryCalls.length, 0)
    assert.match(text, /^Window: Last 7 days$/m)
  })

  it("uses single-window overview mode for custom start and end dates", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_store_overview")

    const text = await extractToolText(
      tool.execute("tool-call", {
        startDate: "2026-03-01",
        endDate: "2026-03-07",
      }),
    )

    assert.deepEqual(harness.overviewCalls, [
      {
        rangePreset: undefined,
        startDate: "2026-03-01",
        endDate: "2026-03-07",
        includeInventory: undefined,
      },
    ])
    assert.equal(harness.summaryCalls.length, 0)
    assert.match(text, /^Window: 2026-03-01 to 2026-03-07$/m)
  })

  it("uses multi-window summary mode when windows are provided", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_store_overview")

    const text = await extractToolText(
      tool.execute("tool-call", {
        windows: ["today", "last_7_days"],
      }),
    )

    assert.equal(harness.overviewCalls.length, 0)
    assert.deepEqual(harness.summaryCalls, [
      {
        windows: ["today", "last_7_days"],
        includeInventory: undefined,
      },
    ])
    assert.match(
      text,
      /^Store US Shopify Store \(store timezone: America\/New_York\) sales summary:$/m,
    )
    assert.match(text, /^Today: \$100\.00 \(1 orders, 2 units\)$/m)
    assert.match(text, /^Last 7 days: \$200\.00 \(2 orders, 4 units\)$/m)
    assert.match(text, /^Inventory: 250 units$/m)
  })

  it("uses the default full summary window set when windows is empty", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_store_overview")

    const text = await extractToolText(
      tool.execute("tool-call", {
        windows: [],
      }),
    )

    assert.equal(harness.overviewCalls.length, 0)
    assert.deepEqual(harness.summaryCalls, [
      {
        windows: [
          "today",
          "yesterday",
          "last_7_days",
          "last_30_days",
          "last_60_days",
          "last_90_days",
          "last_180_days",
          "last_365_days",
        ],
        includeInventory: undefined,
      },
    ])
    assert.match(
      text,
      /^Store US Shopify Store \(store timezone: America\/New_York\) sales summary:$/m,
    )
    assert.match(text, /^Today: \$100\.00 \(1 orders, 2 units\)$/m)
    assert.match(text, /^Yesterday: \$200\.00 \(2 orders, 4 units\)$/m)
    assert.match(text, /^Last 1 year: \$800\.00 \(8 orders, 16 units\)$/m)
  })

  it("rejects windows with rangePreset", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_store_overview")

    const text = await extractToolText(
      tool.execute("tool-call", {
        windows: ["today"],
        rangePreset: "last_7_days",
      }),
    )

    assert.equal(text, 'Use either "windows" or "rangePreset" for seller_store_overview, not both.')
    assert.equal(harness.overviewCalls.length, 0)
    assert.equal(harness.summaryCalls.length, 0)
  })

  it("rejects windows with custom dates", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_store_overview")

    const text = await extractToolText(
      tool.execute("tool-call", {
        windows: ["today"],
        startDate: "2026-03-01",
        endDate: "2026-03-07",
      }),
    )

    assert.equal(
      text,
      'Use either "windows" or "startDate"/"endDate" for seller_store_overview, not both.',
    )
    assert.equal(harness.overviewCalls.length, 0)
    assert.equal(harness.summaryCalls.length, 0)
  })

  it("rejects incomplete custom date input", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_store_overview")

    const text = await extractToolText(
      tool.execute("tool-call", {
        startDate: "2026-03-01",
      }),
    )

    assert.equal(
      text,
      'Ask the user for both "startDate" and "endDate" in YYYY-MM-DD format, or use a range preset such as today, yesterday, last_7_days, last_30_days, last_60_days, last_90_days, last_180_days, or last_365_days.',
    )
    assert.equal(harness.overviewCalls.length, 0)
    assert.equal(harness.summaryCalls.length, 0)
  })

  it("keeps seller_sales_query behavior unchanged as a product-level sales tool", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_sales_query")

    const text = await extractToolText(
      tool.execute("tool-call", {
        productRef: "WM-01",
        salesLookbackDays: 21,
      }),
    )

    assert.deepEqual(harness.salesCalls, [
      {
        productRef: "WM-01",
        salesLookbackDays: 21,
        locale: "en-US",
      },
    ])
    assert.match(text, /^Product: Short sleeve t-shirt$/m)
    assert.match(text, /^Sales lookback: last 21 days$/m)
    assert.match(text, /^Estimated units sold: 32$/m)
  })
})

describe("decision tool details", () => {
  it("builds structured clearance details for LLM formatting", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot(),
    })

    const details = buildClearanceDecisionToolDetails(evaluation, formatOptions)

    assert.equal(details.status, "ok")
    assert.equal(details.toolName, "seller_clearance_decision")
    assert.equal(details.decisionType, "clearance")
    assert.deepEqual(details.presentation.sectionOrder, [
      "current_situation",
      "analysis",
      "recommended_actions",
      "conclusion",
    ])
    assert.equal(details.presentation.localizeSectionTitles, true)
    assert.equal(details.facts.productName, "Short sleeve t-shirt")
    assert.equal(details.facts.onHandUnits, 29)
    assert.equal(details.facts.minimumAllowedUnitPrice, 12.5)
    assert.equal(details.decision.key, "review_for_clearance")
    assert.equal(details.decision.reason, evaluation.clearanceReason)
    assert.equal(details.analysisPoints.length, evaluation.analysisPoints.length)
    assert.equal(details.recommendedActions.length, 4)
  })

  it("builds structured discount details for LLM formatting", () => {
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

    const details = buildDiscountDecisionToolDetails(evaluation, formatOptions)

    assert.equal(details.toolName, "seller_discount_decision")
    assert.equal(details.decisionType, "discount")
    assert.equal(details.decision.key, "test_discount")
    assert.equal(details.decision.summary, evaluation.decisionSummary)
    assert.equal(details.facts.currencyCode, "USD")
    assert.equal(details.facts.marginFloorPct, 30)
    assert.equal(details.recommendedActions.length, 4)
  })

  it("keeps zero-sales inventory cover JSON-safe in structured details", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot({
        sku: "WM-03B",
        onHandUnits: 64,
        dailySalesUnits: 0,
        unitsSold: 0,
        inventoryDaysLeft: Number.POSITIVE_INFINITY,
      }),
    })

    const details = buildClearanceDecisionToolDetails(evaluation, formatOptions)

    assert.equal(details.facts.inventoryDaysLeft, null)
    assert.equal(details.facts.inventoryCoverText, "n/a (no recent sales detected)")
  })

  it("embeds structured decision data in model-visible tool content", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-03C",
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

    const details = buildDiscountDecisionToolDetails(evaluation, formatOptions)
    const content = formatProductDecisionToolContent(details, { locale: formatOptions.locale })

    assert.match(content, /Structured decision data \(for agent use only/)
    assert.match(content, /"toolName": "seller_discount_decision"/)
    assert.match(content, /"analysisPoints": \[/)
    assert.match(content, /"recommendedActions": \[/)
  })
})

describe("decision fallback text", () => {
  it("keeps clearance fallback readable without hard-coded section headers", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot(),
    })

    const fallback = formatClearanceDecisionFallback(evaluation, formatOptions)

    assert.match(fallback, /Review for clearance/)
    assert.match(fallback, /Next steps:/)
    assert.doesNotMatch(
      fallback,
      /Conclusion:|Objective data:|Current situation:|Analysis:|Recommended actions:/,
    )
  })

  it("keeps discount fallback readable without hard-coded section headers", () => {
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

    const fallback = formatDiscountDecisionFallback(evaluation, formatOptions)

    assert.match(fallback, /Test discount/)
    assert.match(fallback, /Store Lotan:/)
    assert.match(fallback, /Next steps:/)
    assert.doesNotMatch(
      fallback,
      /Conclusion:|Objective data:|Current situation:|Analysis:|Recommended actions:/,
    )
    assert.doesNotMatch(fallback, /\bops:|\bsales:|\bpricing:|\breview:/)
  })

  it("uses clearance-review fallback headlines for aged discount cases", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-04",
        inventoryDaysLeft: 220,
        dailySalesUnits: 0.1,
        unitsSold: 3,
      }),
      marginFloorPct: 30,
    })

    const fallback = formatDiscountDecisionFallback(evaluation, formatOptions)

    assert.match(fallback, /^Start clearance review for Short sleeve t-shirt \(WM-04\)\./)
    assert.doesNotMatch(fallback, /^Hold price/)
  })

  it("uses no-action fallback headlines for sold-out discount cases", () => {
    const evaluation = evaluateDiscountDecision({
      snapshot: createSnapshot({
        sku: "WM-04A",
        onHandUnits: 0,
        dailySalesUnits: 0,
        unitsSold: 0,
        inventoryDaysLeft: Number.POSITIVE_INFINITY,
      }),
    })

    const fallback = formatDiscountDecisionFallback(evaluation, formatOptions)

    assert.match(fallback, /^No discount action is needed for Short sleeve t-shirt \(WM-04A\)\./)
    assert.doesNotMatch(fallback, /^Hold price/)
  })

  it("keeps fallback prose free of internal action labels", () => {
    const evaluation = evaluateClearanceDecision({
      snapshot: createSnapshot(),
    })

    const fallback = formatClearanceDecisionFallback(evaluation, formatOptions)
    const details = buildClearanceDecisionToolDetails(evaluation, formatOptions)

    assert.doesNotMatch(fallback, /\bops:|\bsales:|\bpricing:|\breview:/)
    assert.equal(details.recommendedActions.length, 4)
  })
})
