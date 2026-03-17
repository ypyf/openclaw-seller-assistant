import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  evaluateClearanceDecision,
  evaluateDiscountDecision,
  type ShopifyProductActionSnapshot,
} from "./services/shopify.ts"
import {
  buildClearanceDecisionToolDetails,
  buildDiscountDecisionToolDetails,
  formatClearanceDecisionFallback,
  formatDiscountDecisionFallback,
  formatProductDecisionToolContent,
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
