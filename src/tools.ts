import type { AgentToolResult } from "@mariozechner/pi-agent-core"
import { Type, type Static } from "@sinclair/typebox"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import {
  DEFAULT_PLUGIN_CONFIG,
  findConfiguredStore,
  getStoreOperationNumber,
  type PluginConfig,
} from "./config.ts"
import {
  evaluateClearanceDecision,
  evaluateDiscountDecision,
  evaluateReplenishmentDecision,
  loadShopifyInventorySnapshot,
  loadShopifyProductActionSnapshot,
  loadShopifyStoreSalesSummary,
  loadShopifyStoreOverview,
  type ClearanceDecisionEvaluation,
  type DiscountDecisionEvaluation,
  type ProductDecisionAction,
  type ProductDecisionConfidence,
  type ProductDecisionDemandStatus,
  type ReplenishmentDecisionEvaluation,
  type ShopifyInventorySnapshot,
  type ShopifySalesSnapshot,
  type ShopifyStoreSalesSummarySnapshot,
  type ShopifyStoreOverviewSnapshot,
  type StoreOverviewRangePreset,
  loadShopifySalesSnapshot,
} from "./services/shopify.ts"
import {
  currency,
  formatDateTime,
  grossMarginPct,
  minimumPriceForGrossMargin,
  needsInputResult,
  optionalNumber,
  percentage,
  textResult,
  textResultWithDetails,
  toNumber,
} from "./utils.ts"

const StoreOverviewRangePresetSchema = Type.Union([
  Type.Literal("today"),
  Type.Literal("yesterday"),
  Type.Literal("last_7_days"),
  Type.Literal("last_30_days"),
  Type.Literal("last_60_days"),
  Type.Literal("last_90_days"),
  Type.Literal("last_180_days"),
  Type.Literal("last_365_days"),
])

const STORE_SALES_SUMMARY_WINDOW_ORDER: StoreOverviewRangePreset[] = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "last_60_days",
  "last_90_days",
  "last_180_days",
  "last_365_days",
]

const STORE_SALES_SUMMARY_WINDOW_LABELS: Record<StoreOverviewRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_60_days: "Last 60 days",
  last_90_days: "Last 90 days",
  last_180_days: "Last 180 days",
  last_365_days: "Last 1 year",
}

const SellerStoreOverviewParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store.",
      }),
    ),
    rangePreset: Type.Optional(StoreOverviewRangePresetSchema),
    startDate: Type.Optional(
      Type.String({
        description:
          'Optional custom start date in "YYYY-MM-DD". Use together with endDate instead of rangePreset.',
      }),
    ),
    endDate: Type.Optional(
      Type.String({
        description:
          'Optional custom end date in "YYYY-MM-DD". Use together with startDate instead of rangePreset.',
      }),
    ),
    windows: Type.Optional(
      Type.Array(StoreOverviewRangePresetSchema, {
        description:
          "Optional standard summary windows to include. Use this for multi-window store sales summaries. If omitted, seller_store_overview stays in single-window overview mode. Pass an empty array to request the default full summary window set.",
      }),
    ),
    includeInventory: Type.Optional(
      Type.Boolean({
        description:
          "Whether to include total inventory units and inventory cover in the store overview. Defaults to true.",
      }),
    ),
  },
  { additionalProperties: false },
)

const SellerQuoteBuilderParamsSchema = Type.Object(
  {
    buyerName: Type.String(),
    productName: Type.String(),
    quantity: Type.Number(),
    unitCost: Type.Number(),
    suggestedUnitPrice: Type.Number(),
    competitorUnitPrice: Type.Optional(Type.Number()),
    shippingLeadDays: Type.Optional(Type.Number()),
    paymentTerms: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
    tone: Type.Optional(
      Type.Union([Type.Literal("concise"), Type.Literal("consultative"), Type.Literal("premium")]),
    ),
  },
  { additionalProperties: false },
)

const SellerInventoryLookupParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    productRef: Type.String({
      description:
        "Exact SKU, full product title, or product title keywords to search in Shopify before returning on-hand inventory.",
    }),
  },
  { additionalProperties: false },
)

const SellerSalesLookupParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    productRef: Type.String({
      description:
        "Exact SKU, full product title, or product title keywords to search in Shopify before loading recent sales.",
    }),
    salesLookbackDays: Type.Optional(
      Type.Number({
        description:
          "Optional sales lookback window for Shopify data loading. If omitted, use store operations.salesLookbackDays or the built-in 30-day default.",
      }),
    ),
  },
  { additionalProperties: false },
)

const SellerReplenishmentDecisionParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    productRef: Type.String({
      description:
        "Exact SKU, full product title, or product title keywords to search in Shopify before calculating replenishment guidance.",
    }),
    salesLookbackDays: Type.Optional(Type.Number()),
    supplierLeadDays: Type.Optional(Type.Number()),
    safetyStockDays: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
)

const SellerDiscountDecisionParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    productRef: Type.String({
      description:
        "Exact SKU, full product title, or product title keywords to search in Shopify before calculating discount guidance.",
    }),
    salesLookbackDays: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
)

const SellerClearanceDecisionParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    productRef: Type.String({
      description:
        "Exact SKU, full product title, or product title keywords to search in Shopify before calculating clearance guidance.",
    }),
    salesLookbackDays: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
)

type SellerStoreOverviewParams = Static<typeof SellerStoreOverviewParamsSchema>
type SellerQuoteBuilderParams = Static<typeof SellerQuoteBuilderParamsSchema>
type SellerInventoryLookupParams = Static<typeof SellerInventoryLookupParamsSchema>
type SellerSalesLookupParams = Static<typeof SellerSalesLookupParamsSchema>
type SellerReplenishmentDecisionParams = Static<typeof SellerReplenishmentDecisionParamsSchema>
type SellerDiscountDecisionParams = Static<typeof SellerDiscountDecisionParamsSchema>
type SellerClearanceDecisionParams = Static<typeof SellerClearanceDecisionParamsSchema>

const resolveOptionalConfiguredNumber = (
  configuredStore: ReturnType<typeof findConfiguredStore>,
  key: Parameters<typeof getStoreOperationNumber>[1],
) => getStoreOperationNumber(configuredStore, key)

const resolveSalesLookbackDays = (
  value: unknown,
  configuredStore: ReturnType<typeof findConfiguredStore>,
) =>
  Math.max(
    1,
    Math.round(
      toNumber(
        value,
        getStoreOperationNumber(configuredStore, "salesLookbackDays") ??
          DEFAULT_PLUGIN_CONFIG.salesLookbackDays,
      ),
    ),
  )

const resolveStoreSalesSummaryWindows = (windows?: StoreOverviewRangePreset[]) => {
  if (!windows || windows.length === 0) {
    return [...STORE_SALES_SUMMARY_WINDOW_ORDER]
  }
  const requestedWindows = new Set(windows ?? STORE_SALES_SUMMARY_WINDOW_ORDER)
  return STORE_SALES_SUMMARY_WINDOW_ORDER.filter(window => requestedWindows.has(window))
}

type SellerToolRegistration<TParams> = {
  name: string
  label: string
  description: string
  parameters: unknown
  execute: (id: string, params: TParams) => Promise<AgentToolResult<unknown>>
}

export type SellerToolApi = {
  registerTool: <TParams>(tool: SellerToolRegistration<TParams>) => void
}

export type SellerToolDependencies = {
  loadShopifyStoreOverview: typeof loadShopifyStoreOverview
  loadShopifyStoreSalesSummary: typeof loadShopifyStoreSalesSummary
  loadShopifyInventorySnapshot: typeof loadShopifyInventorySnapshot
  loadShopifySalesSnapshot: typeof loadShopifySalesSnapshot
  loadShopifyProductActionSnapshot: typeof loadShopifyProductActionSnapshot
}

const DEFAULT_SELLER_TOOL_DEPENDENCIES: SellerToolDependencies = {
  loadShopifyStoreOverview,
  loadShopifyStoreSalesSummary,
  loadShopifyInventorySnapshot,
  loadShopifySalesSnapshot,
  loadShopifyProductActionSnapshot,
}

const formatInventoryLookup = (input: ShopifyInventorySnapshot) =>
  [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, input.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Product: ${input.productName}`,
    `SKU: ${input.sku}`,
    `On-hand units: ${Math.round(input.onHandUnits)}`,
  ]
    .filter(Boolean)
    .join("\n")

const formatSalesLookup = (input: ShopifySalesSnapshot) =>
  [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, input.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Product: ${input.productName}`,
    `SKU: ${input.sku}`,
    `Sales lookback: last ${input.lookbackDays} days`,
    `Average daily sales: ${input.dailySalesUnits.toFixed(2)}`,
    `Estimated units sold: ${Math.round(input.unitsSold)}`,
  ]
    .filter(Boolean)
    .join("\n")

const formatInventoryCover = (value: number) =>
  Number.isFinite(value) ? `${value.toFixed(1)} days` : "n/a (no recent sales detected)"

const formatMarginValue = (value: number | null) =>
  typeof value === "number" ? percentage(value) : "unavailable"

const formatDemandStatus = (value: ProductDecisionDemandStatus) =>
  value === "insufficient_data" ? "insufficient data" : value

const formatProductActionInvalidInputPrompt = (invalidParameters: string[]) => {
  if (
    invalidParameters.includes("supplierLeadDays") &&
    invalidParameters.includes("safetyStockDays")
  ) {
    return 'Ask the user to correct supplier lead time and safety stock. "supplierLeadDays" must be positive and "safetyStockDays" must be non-negative.'
  }
  if (invalidParameters.includes("supplierLeadDays")) {
    return 'Ask the user to correct supplier lead time. "supplierLeadDays" must be a positive number.'
  }
  return 'Ask the user to correct safety stock. "safetyStockDays" must be a non-negative number.'
}

const formatProductActionMissingInputPrompt = (missingParameters: string[]) => {
  if (
    missingParameters.includes("supplierLeadDays") &&
    missingParameters.includes("safetyStockDays")
  ) {
    return 'Ask the user to provide supplier lead time and safety stock. "supplierLeadDays" must be a positive number and "safetyStockDays" must be a non-negative number.'
  }
  if (missingParameters.includes("supplierLeadDays")) {
    return 'Ask the user to provide supplier lead time. "supplierLeadDays" must be a positive number.'
  }
  return 'Ask the user to provide safety stock. "safetyStockDays" must be a non-negative number.'
}

export type ProductActionReplenishmentInputResolution =
  | {
      kind: "ready"
      supplierLeadDays: number
      safetyStockDays: number
    }
  | {
      kind: "needs_input"
      userPrompt: string
      missingParameters: string[]
      invalidParameters: Array<{
        name: string
        issue: string
      }>
    }

export const resolveProductActionReplenishmentInputs = (input: {
  supplierLeadDays?: number
  safetyStockDays?: number
}): ProductActionReplenishmentInputResolution => {
  const { supplierLeadDays, safetyStockDays } = input
  const normalizedSupplierLeadDays =
    typeof supplierLeadDays === "number" && supplierLeadDays > 0 ? supplierLeadDays : undefined
  const normalizedSafetyStockDays =
    typeof safetyStockDays === "number" && safetyStockDays >= 0 ? safetyStockDays : undefined

  const invalidParameters = [
    typeof supplierLeadDays === "number" && supplierLeadDays <= 0
      ? {
          name: "supplierLeadDays",
          issue: "must be a positive number",
        }
      : null,
    typeof safetyStockDays === "number" && safetyStockDays < 0
      ? {
          name: "safetyStockDays",
          issue: "must be a non-negative number",
        }
      : null,
  ].filter((value): value is { name: string; issue: string } => value !== null)

  if (invalidParameters.length > 0) {
    return {
      kind: "needs_input",
      userPrompt: formatProductActionInvalidInputPrompt(
        invalidParameters.map(parameter => parameter.name),
      ),
      missingParameters: [],
      invalidParameters,
    }
  }

  const missingParameters = [
    typeof supplierLeadDays === "number" ? null : "supplierLeadDays",
    typeof safetyStockDays === "number" ? null : "safetyStockDays",
  ].filter((value): value is string => value !== null)

  if (missingParameters.length > 0) {
    return {
      kind: "needs_input",
      userPrompt: formatProductActionMissingInputPrompt(missingParameters),
      missingParameters,
      invalidParameters: [],
    }
  }

  if (
    typeof normalizedSupplierLeadDays !== "number" ||
    typeof normalizedSafetyStockDays !== "number"
  ) {
    return {
      kind: "needs_input",
      userPrompt: formatProductActionMissingInputPrompt(["supplierLeadDays", "safetyStockDays"]),
      missingParameters: ["supplierLeadDays", "safetyStockDays"],
      invalidParameters: [],
    }
  }

  return {
    kind: "ready",
    supplierLeadDays: normalizedSupplierLeadDays,
    safetyStockDays: normalizedSafetyStockDays,
  }
}

const formatProductDecisionHeader = (input: {
  storeName: string
  productName: string
  sku: string
  lookbackDays: number
  dailySalesUnits: number
  demandStatus: ProductDecisionDemandStatus
  unitsSold: number
  onHandUnits: number
  inventoryDaysLeft: number
}) => [
  `Store: ${input.storeName}`,
  `Product: ${input.productName}`,
  `SKU: ${input.sku}`,
  `Sales lookback: last ${input.lookbackDays} days`,
  `Average daily sales: ${input.dailySalesUnits.toFixed(2)}`,
  `Demand status: ${formatDemandStatus(input.demandStatus)}`,
  `Estimated units sold: ${Math.round(input.unitsSold)}`,
  `On-hand units: ${Math.round(input.onHandUnits)}`,
  `Inventory cover: ${formatInventoryCover(input.inventoryDaysLeft)}`,
]

const PRODUCT_DECISION_SECTION_ORDER = [
  "current_situation",
  "analysis",
  "recommended_actions",
  "conclusion",
] as const

export type ProductDecisionSectionKey = (typeof PRODUCT_DECISION_SECTION_ORDER)[number]

export type StructuredProductDecisionFacts = {
  storeName: string
  productName: string
  sku: string
  lookbackDays: number
  dailySalesUnits: number
  demandStatus: ProductDecisionDemandStatus
  unitsSold: number
  onHandUnits: number
  inventoryDaysLeft: number | null
  inventoryCoverText: string
  averageUnitPrice: number
  currencyCode: string
  currentMarginPct: number | null
  marginFloorPct: number | null
  minimumAllowedUnitPrice: number | null
}

export type StructuredProductDecisionDetails = {
  status: "ok"
  toolName: "seller_discount_decision" | "seller_clearance_decision"
  decisionType: "discount" | "clearance"
  presentation: {
    sectionOrder: ProductDecisionSectionKey[]
    localizeSectionTitles: true
  }
  facts: StructuredProductDecisionFacts
  analysisPoints: string[]
  recommendedActions: ProductDecisionAction[]
  decision: {
    key:
      | DiscountDecisionEvaluation["discountDecision"]
      | ClearanceDecisionEvaluation["clearanceDecision"]
    summary: string
    reason: string
    confidence: ProductDecisionConfidence
    reviewWindowDays: number
    escalationTrigger: string | null
  }
}

const formatDiscountDecisionHeadline = (details: StructuredProductDecisionDetails) => {
  const productSummary = `${details.facts.productName} (${details.facts.sku})`
  if (details.decision.key === "test_discount") {
    return `Test discount for ${productSummary}.`
  }
  if (details.decision.key === "discount_blocked") {
    return `Discount blocked for ${productSummary}.`
  }
  if (details.facts.onHandUnits <= 0) {
    return `No discount action is needed for ${productSummary}.`
  }

  const routesToClearanceReview =
    details.decision.summary.toLowerCase().includes("clearance review") ||
    details.decision.reason.toLowerCase().includes("clearance review")
  if (routesToClearanceReview) {
    return `Start clearance review for ${productSummary}.`
  }

  return `Hold price for ${productSummary}.`
}

const formatClearanceDecisionLabel = (value: ClearanceDecisionEvaluation["clearanceDecision"]) => {
  if (value === "clear_inventory") {
    return "Clear inventory"
  }
  if (value === "review_for_clearance") {
    return "Review for clearance"
  }
  return "Not a clearance candidate"
}

const formatClearanceDecisionHeadline = (details: StructuredProductDecisionDetails) =>
  `${formatClearanceDecisionLabel(
    details.decision.key === "clear_inventory" ||
      details.decision.key === "review_for_clearance" ||
      details.decision.key === "not_clearance_candidate"
      ? details.decision.key
      : "not_clearance_candidate",
  )} for ${details.facts.productName} (${details.facts.sku}).`

const buildStructuredProductDecisionFacts = (
  input: {
    storeName: string
    productName: string
    sku: string
    lookbackDays: number
    dailySalesUnits: number
    demandStatus: ProductDecisionDemandStatus
    unitsSold: number
    onHandUnits: number
    inventoryDaysLeft: number
    averageUnitPrice: number
    currentMarginPct: number | null
    marginFloorPct: number | null
    hasValidMarginFloor: boolean
    minimumAllowedUnitPrice: number | null
    currencyCode: string | null
  },
  options: { locale: string; fallbackCurrency: string },
): StructuredProductDecisionFacts => ({
  storeName: input.storeName,
  productName: input.productName,
  sku: input.sku,
  lookbackDays: input.lookbackDays,
  dailySalesUnits: input.dailySalesUnits,
  demandStatus: input.demandStatus,
  unitsSold: input.unitsSold,
  onHandUnits: input.onHandUnits,
  inventoryDaysLeft: Number.isFinite(input.inventoryDaysLeft) ? input.inventoryDaysLeft : null,
  inventoryCoverText: formatInventoryCover(input.inventoryDaysLeft),
  averageUnitPrice: input.averageUnitPrice,
  currencyCode: input.currencyCode ?? options.fallbackCurrency,
  currentMarginPct: input.currentMarginPct,
  marginFloorPct: input.marginFloorPct,
  minimumAllowedUnitPrice: input.minimumAllowedUnitPrice,
})

const formatProductDecisionFactsFallback = (
  input: StructuredProductDecisionFacts,
  options: { locale: string },
) => {
  const averagePriceSentence =
    input.averageUnitPrice > 0
      ? ` Average price is ${currency(input.averageUnitPrice, input.currencyCode, options.locale)}.`
      : ""
  const marginSentence =
    input.currentMarginPct !== null
      ? ` Current margin is ${formatMarginValue(input.currentMarginPct)}.`
      : ""
  const floorSentence =
    input.minimumAllowedUnitPrice !== null
      ? ` Cost-aware floor is ${currency(input.minimumAllowedUnitPrice, input.currencyCode, options.locale)}.`
      : ""

  return `Store ${input.storeName}: ${input.productName} (${input.sku}) sold ${Math.round(input.unitsSold)} units in the last ${input.lookbackDays} days, with ${Math.round(input.onHandUnits)} units on hand and ${input.inventoryCoverText} of inventory cover.${averagePriceSentence}${marginSentence}${floorSentence}`
}

const formatRecommendedActionsFallback = (actions: ProductDecisionAction[]) => actions.join(" ")

export const buildDiscountDecisionToolDetails = (
  input: DiscountDecisionEvaluation,
  options: { locale: string; fallbackCurrency: string },
): StructuredProductDecisionDetails => ({
  status: "ok",
  toolName: "seller_discount_decision",
  decisionType: "discount",
  presentation: {
    sectionOrder: [...PRODUCT_DECISION_SECTION_ORDER],
    localizeSectionTitles: true,
  },
  facts: buildStructuredProductDecisionFacts(input, options),
  analysisPoints: [...input.analysisPoints],
  recommendedActions: [...input.recommendedActions],
  decision: {
    key: input.discountDecision,
    summary: input.decisionSummary,
    reason: input.discountReason,
    confidence: input.decisionConfidence,
    reviewWindowDays: input.reviewWindowDays,
    escalationTrigger: input.escalationTrigger,
  },
})

export const buildClearanceDecisionToolDetails = (
  input: ClearanceDecisionEvaluation,
  options: { locale: string; fallbackCurrency: string },
): StructuredProductDecisionDetails => ({
  status: "ok",
  toolName: "seller_clearance_decision",
  decisionType: "clearance",
  presentation: {
    sectionOrder: [...PRODUCT_DECISION_SECTION_ORDER],
    localizeSectionTitles: true,
  },
  facts: buildStructuredProductDecisionFacts(input, options),
  analysisPoints: [...input.analysisPoints],
  recommendedActions: [...input.recommendedActions],
  decision: {
    key: input.clearanceDecision,
    summary: input.decisionSummary,
    reason: input.clearanceReason,
    confidence: input.decisionConfidence,
    reviewWindowDays: input.reviewWindowDays,
    escalationTrigger: input.escalationTrigger,
  },
})

export const formatStructuredProductDecisionDataBlock = (
  details: StructuredProductDecisionDetails,
) =>
  [
    "Structured decision data (for agent use only; do not quote raw JSON in the final answer):",
    "```json",
    JSON.stringify(details, null, 2),
    "```",
  ].join("\n")

const formatProductDecisionFallback = (
  details: StructuredProductDecisionDetails,
  options: { locale: string },
) => {
  const headline =
    details.decisionType === "discount"
      ? formatDiscountDecisionHeadline(details)
      : formatClearanceDecisionHeadline(details)

  return [
    headline,
    formatProductDecisionFactsFallback(details.facts, { locale: options.locale }),
    details.decision.summary,
    `Reason: ${details.decision.reason}`,
    `Next steps: ${formatRecommendedActionsFallback(details.recommendedActions)}`,
  ].join(" ")
}

export const formatProductDecisionToolContent = (
  details: StructuredProductDecisionDetails,
  options: { locale: string },
) =>
  [
    formatProductDecisionFallback(details, { locale: options.locale }),
    "",
    formatStructuredProductDecisionDataBlock(details),
  ].join("\n")

export const formatDiscountDecisionFallback = (
  input: DiscountDecisionEvaluation,
  options: { locale: string; fallbackCurrency: string },
) => {
  return formatProductDecisionFallback(buildDiscountDecisionToolDetails(input, options), {
    locale: options.locale,
  })
}

export const formatClearanceDecisionFallback = (
  input: ClearanceDecisionEvaluation,
  options: { locale: string; fallbackCurrency: string },
) => {
  return formatProductDecisionFallback(buildClearanceDecisionToolDetails(input, options), {
    locale: options.locale,
  })
}

const formatReplenishmentDecision = (input: ReplenishmentDecisionEvaluation) =>
  [
    ...formatProductDecisionHeader(input),
    `Target stock level: ${Math.round(input.targetStockUnits)}`,
    `Recommended reorder quantity: ${Math.round(input.recommendedReorderUnits)}`,
    "",
    `Replenishment: ${input.replenishmentReason}`,
  ].join("\n")

const formatStoreOverview = (input: ShopifyStoreOverviewSnapshot, options: { locale: string }) => {
  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Window: ${input.windowLabel}`,
    `Revenue: ${currency(input.revenue, input.currencyCode, options.locale)}`,
    input.timezone ? `Timezone: ${input.timezone}` : "Timezone: n/a",
    `Orders: ${input.ordersCount}`,
    `Units sold: ${Math.round(input.unitsSold)}`,
    typeof input.averageDailyUnits === "number"
      ? `Average daily units: ${input.averageDailyUnits.toFixed(2)}`
      : null,
    typeof input.inventoryUnits === "number"
      ? `Inventory units: ${Math.round(input.inventoryUnits)}`
      : null,
    typeof input.inventoryDaysLeft === "number"
      ? `Inventory cover: ${input.inventoryDaysLeft.toFixed(1)} days`
      : null,
  ]
    .filter(Boolean)
    .join("\n")
}

const formatStoreSalesSummary = (input: {
  storeName: string
  timezone?: string
  locale: string
  currencyCode: string
  lines: ShopifyStoreSalesSummarySnapshot["windows"]
  inventoryUnits?: number
  inventoryDaysLeft?: number
  inventoryErrorMessage?: string
}) => {
  const summaryLines = input.lines.map(line => {
    const label = STORE_SALES_SUMMARY_WINDOW_LABELS[line.rangePreset]
    return `${label}: ${currency(line.revenue, input.currencyCode, input.locale)} (${line.ordersCount} orders, ${Math.round(line.unitsSold)} units)`
  })
  const inventoryLines = [
    typeof input.inventoryUnits === "number"
      ? `Inventory: ${Math.round(input.inventoryUnits)} units`
      : input.inventoryErrorMessage
        ? `Inventory: unavailable (${input.inventoryErrorMessage})`
        : null,
    typeof input.inventoryDaysLeft === "number"
      ? `Inventory cover: ${input.inventoryDaysLeft.toFixed(1)} days`
      : null,
  ].filter(Boolean)

  return [
    `Store ${input.storeName} (store timezone: ${input.timezone ?? "n/a"}) sales summary:`,
    "",
    ...summaryLines,
    inventoryLines.length > 0 ? "" : null,
    ...inventoryLines,
  ]
    .filter(Boolean)
    .join("\n")
}

const formatQuoteDraft = (input: {
  buyerName: string
  productName: string
  quantity: number
  suggestedUnitPrice: number
  floorPrice: number | null
  marginPct: number
  pricePositioning: string
  shippingLeadDays: number
  paymentTerms?: string
  notes?: string
  tone: string
  targetMarginFloorPct?: number
  currency: string
  locale: string
}) => {
  const openingByTone: Record<string, string> = {
    concise: `Quote for ${input.productName}`,
    consultative: `Thanks for the RFQ. Below is a recommended quote for ${input.productName}.`,
    premium: `We reviewed your requirement and prepared a supply proposal for ${input.productName}.`,
  }

  return [
    openingByTone[input.tone] ?? openingByTone.consultative,
    "",
    `Buyer: ${input.buyerName}`,
    `Quantity: ${input.quantity}`,
    `Suggested unit price: ${currency(input.suggestedUnitPrice, input.currency, input.locale)}`,
    typeof input.targetMarginFloorPct === "number"
      ? input.floorPrice === null
        ? `Commercial floor: unavailable (configured ${percentage(input.targetMarginFloorPct)} gross margin is not achievable with a finite selling price)`
        : `Commercial floor: ${currency(input.floorPrice, input.currency, input.locale)}`
      : null,
    `Gross margin at suggested price: ${percentage(input.marginPct)}`,
    `Market position: ${input.pricePositioning}`,
    `Lead time: ${input.shippingLeadDays} days`,
    `Payment terms: ${input.paymentTerms ?? "50% deposit, balance before dispatch"}`,
    "",
    "Draft response:",
    `We can offer ${input.quantity} units of ${input.productName} at ${currency(input.suggestedUnitPrice, input.currency, input.locale)} per unit, with an estimated lead time of ${input.shippingLeadDays} days.`,
    typeof input.targetMarginFloorPct === "number" && input.floorPrice === null
      ? `Warning: the configured margin floor of ${percentage(input.targetMarginFloorPct)} is impossible to satisfy with a finite selling price.`
      : typeof input.targetMarginFloorPct === "number" &&
          input.floorPrice !== null &&
          input.suggestedUnitPrice < input.floorPrice
        ? `Warning: the proposed price is below the configured margin floor of ${percentage(input.targetMarginFloorPct)}.`
        : typeof input.targetMarginFloorPct === "number" && input.floorPrice !== null
          ? `This quote remains above the configured margin floor of ${percentage(input.targetMarginFloorPct)}.`
          : null,
    input.notes
      ? `Notes: ${input.notes}`
      : "Notes: Offer optional upsell, MOQ ladder, or faster-shipping surcharge if negotiation starts.",
  ]
    .filter(Boolean)
    .join("\n")
}

/** Registers all seller-facing OpenClaw tools for this plugin instance. */
export const registerSellerTools = (
  api: SellerToolApi,
  pluginConfig: PluginConfig,
  dependencies: SellerToolDependencies = DEFAULT_SELLER_TOOL_DEPENDENCIES,
) => {
  api.registerTool({
    name: "seller_store_overview",
    label: "Seller Store Overview",
    description:
      "Load store-level sales and inventory facts for a configured store. Use single-window mode for one store window with rangePreset or custom dates, or multi-window summary mode with windows for standard comparative windows. If storeId is omitted, use the configured default store.",
    parameters: SellerStoreOverviewParamsSchema,
    async execute(_id: string, params: SellerStoreOverviewParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_store_overview.",
        )
      }

      const hasWindows = Array.isArray(params.windows)
      const hasCustomRange = Boolean(params.startDate || params.endDate)

      if (hasWindows && params.rangePreset) {
        return textResult(
          'Use either "windows" or "rangePreset" for seller_store_overview, not both.',
        )
      }

      if (hasWindows && hasCustomRange) {
        return textResult(
          'Use either "windows" or "startDate"/"endDate" for seller_store_overview, not both.',
        )
      }

      if (hasCustomRange && (!params.startDate || !params.endDate)) {
        return textResult(
          'Ask the user for both "startDate" and "endDate" in YYYY-MM-DD format, or use a range preset such as today, yesterday, last_7_days, last_30_days, last_60_days, last_90_days, last_180_days, or last_365_days.',
        )
      }

      if (hasCustomRange && params.rangePreset) {
        return textResult(
          'Use either "rangePreset" or "startDate"/"endDate" for seller_store_overview, not both.',
        )
      }

      if (configuredStore.platform === "shopify") {
        if (hasWindows) {
          const requestedWindows = resolveStoreSalesSummaryWindows(params.windows)
          const summary = await dependencies.loadShopifyStoreSalesSummary(configuredStore.store, {
            windows: requestedWindows,
            includeInventory: params.includeInventory,
          })

          return textResult(
            formatStoreSalesSummary({
              storeName: summary.storeName,
              timezone: summary.timezone,
              locale: pluginConfig.locale,
              currencyCode: summary.currencyCode,
              lines: summary.windows,
              inventoryUnits: summary.inventoryUnits,
              inventoryDaysLeft: summary.inventoryDaysLeft,
              inventoryErrorMessage: summary.inventoryErrorMessage,
            }),
          )
        }

        let snapshot: ShopifyStoreOverviewSnapshot
        try {
          snapshot = await dependencies.loadShopifyStoreOverview(configuredStore.store, {
            rangePreset: params.rangePreset,
            startDate: params.startDate,
            endDate: params.endDate,
            includeInventory: params.includeInventory,
          })
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Custom store overview")) {
            return textResult(error.message)
          }
          throw error
        }
        return textResult(
          formatStoreOverview(snapshot, {
            locale: pluginConfig.locale,
          }),
        )
      }

      throw new Error(
        `seller_store_overview is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
      )
    },
  })

  api.registerTool({
    name: "seller_quote_builder",
    label: "Seller Quote Builder",
    description:
      "Draft a seller-side RFQ or buyer reply with price guardrails, SLA, and commercial terms.",
    parameters: SellerQuoteBuilderParamsSchema,
    async execute(_id: string, params: SellerQuoteBuilderParams) {
      const unitCost = toNumber(params.unitCost)
      const suggestedUnitPrice = toNumber(params.suggestedUnitPrice)
      const competitorUnitPrice = toNumber(params.competitorUnitPrice, suggestedUnitPrice)
      const quantity = toNumber(params.quantity)
      const shippingLeadDays = toNumber(params.shippingLeadDays, 7)
      const floorPrice =
        typeof pluginConfig.targetMarginFloorPct === "number"
          ? minimumPriceForGrossMargin(unitCost, pluginConfig.targetMarginFloorPct)
          : null
      const marginPct = suggestedUnitPrice > 0 ? grossMarginPct(suggestedUnitPrice, unitCost) : 0
      const pricePositioning =
        suggestedUnitPrice <= competitorUnitPrice
          ? "at or below market"
          : "above the nearest market reference"
      const tone = params.tone ?? pluginConfig.responseTone

      return textResult(
        formatQuoteDraft({
          buyerName: params.buyerName,
          productName: params.productName,
          quantity,
          suggestedUnitPrice,
          floorPrice,
          marginPct,
          pricePositioning,
          shippingLeadDays,
          paymentTerms: params.paymentTerms,
          notes: params.notes,
          tone,
          targetMarginFloorPct: pluginConfig.targetMarginFloorPct,
          currency: pluginConfig.currency,
          locale: pluginConfig.locale,
        }),
      )
    },
  })

  api.registerTool({
    name: "seller_inventory_query",
    label: "Seller Inventory Lookup",
    description:
      "Look up current on-hand inventory for an exact SKU or product title search. Use this when the user asks how much inventory a product has. Try the tool before asking for an exact SKU. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm. This tool reads Shopify inventory only and does not require order access.",
    parameters: SellerInventoryLookupParamsSchema,
    async execute(_id: string, params: SellerInventoryLookupParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_inventory_query.",
        )
      }

      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_inventory_query is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const snapshot = await dependencies.loadShopifyInventorySnapshot(
        configuredStore.store,
        params.productRef,
        pluginConfig.locale,
      )
      if (snapshot.kind !== "ready") {
        return textResult(snapshot.message)
      }
      return textResult(formatInventoryLookup(snapshot.value))
    },
  })

  api.registerTool({
    name: "seller_sales_query",
    label: "Seller Sales Query",
    description:
      "Query recent product sales for an exact SKU or product title search. Use this when the user asks how much a product sold over a recent window. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm. This is a product-level sales tool, not a store-total sales tool.",
    parameters: SellerSalesLookupParamsSchema,
    async execute(_id: string, params: SellerSalesLookupParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_sales_query.",
        )
      }

      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_sales_query is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const salesLookbackDays = resolveSalesLookbackDays(params.salesLookbackDays, configuredStore)
      const snapshot = await dependencies.loadShopifySalesSnapshot(
        configuredStore.store,
        params.productRef,
        salesLookbackDays,
        pluginConfig.locale,
      )
      if (snapshot.kind !== "ready") {
        return textResult(snapshot.message)
      }
      return textResult(formatSalesLookup(snapshot.value))
    },
  })

  api.registerTool({
    name: "seller_replenishment_decision",
    label: "Seller Replenishment Decision",
    description:
      "Return conservative replenishment guidance for one product using Shopify-backed inventory and recent sales. Use this for questions about whether to restock or reorder a product. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm.",
    parameters: SellerReplenishmentDecisionParamsSchema,
    async execute(_id: string, params: SellerReplenishmentDecisionParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        return needsInputResult({
          userPrompt:
            "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_replenishment_decision.",
        })
      }
      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_replenishment_decision is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const salesLookbackDays = resolveSalesLookbackDays(params.salesLookbackDays, configuredStore)
      const snapshot = await dependencies.loadShopifyProductActionSnapshot(
        configuredStore.store,
        params.productRef,
        salesLookbackDays,
        pluginConfig.locale,
        {
          includePricing: false,
        },
      )
      if (snapshot.kind !== "ready") {
        return needsInputResult({
          userPrompt: snapshot.message,
        })
      }

      const configuredSupplierLeadDays =
        params.supplierLeadDays ??
        resolveOptionalConfiguredNumber(configuredStore, "supplierLeadDays")
      const configuredSafetyStockDays =
        params.safetyStockDays ??
        resolveOptionalConfiguredNumber(configuredStore, "safetyStockDays")
      const replenishmentInputs = resolveProductActionReplenishmentInputs({
        supplierLeadDays: configuredSupplierLeadDays,
        safetyStockDays: configuredSafetyStockDays,
      })

      if (replenishmentInputs.kind === "needs_input") {
        return needsInputResult({
          userPrompt: replenishmentInputs.userPrompt,
          missingParameters: replenishmentInputs.missingParameters,
          invalidParameters: replenishmentInputs.invalidParameters,
        })
      }

      const evaluation = evaluateReplenishmentDecision({
        snapshot: snapshot.value,
        supplierLeadDays: replenishmentInputs.supplierLeadDays,
        safetyStockDays: replenishmentInputs.safetyStockDays,
        policy: pluginConfig.decisionPolicy,
      })

      return textResult(formatReplenishmentDecision(evaluation))
    },
  })

  api.registerTool({
    name: "seller_discount_decision",
    label: "Seller Discount Decision",
    description:
      "Return conservative discount guidance for one product using Shopify-backed inventory, recent sales, and margin data when available. Use this for questions about markdowns or price testing on a product. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm.",
    parameters: SellerDiscountDecisionParamsSchema,
    async execute(_id: string, params: SellerDiscountDecisionParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        return needsInputResult({
          userPrompt:
            "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_discount_decision.",
        })
      }
      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_discount_decision is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const salesLookbackDays = resolveSalesLookbackDays(params.salesLookbackDays, configuredStore)
      const snapshot = await dependencies.loadShopifyProductActionSnapshot(
        configuredStore.store,
        params.productRef,
        salesLookbackDays,
        pluginConfig.locale,
      )
      if (snapshot.kind !== "ready") {
        return needsInputResult({
          userPrompt: snapshot.message,
        })
      }

      const evaluation = evaluateDiscountDecision({
        snapshot: snapshot.value,
        marginFloorPct: pluginConfig.targetMarginFloorPct,
        policy: pluginConfig.decisionPolicy,
        fallbackCurrency: pluginConfig.currency,
      })

      const formatOptions = {
        locale: pluginConfig.locale,
        fallbackCurrency: pluginConfig.currency,
      }
      const details = buildDiscountDecisionToolDetails(evaluation, formatOptions)

      return textResultWithDetails(
        formatProductDecisionToolContent(details, { locale: pluginConfig.locale }),
        details,
      )
    },
  })

  api.registerTool({
    name: "seller_clearance_decision",
    label: "Seller Clearance Decision",
    description:
      "Return conservative clearance guidance for one product using Shopify-backed inventory, recent sales, and margin data when available. Use this for questions about clearing aged inventory on a product. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm.",
    parameters: SellerClearanceDecisionParamsSchema,
    async execute(_id: string, params: SellerClearanceDecisionParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        return needsInputResult({
          userPrompt:
            "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_clearance_decision.",
        })
      }
      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_clearance_decision is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const salesLookbackDays = resolveSalesLookbackDays(params.salesLookbackDays, configuredStore)
      const snapshot = await dependencies.loadShopifyProductActionSnapshot(
        configuredStore.store,
        params.productRef,
        salesLookbackDays,
        pluginConfig.locale,
      )
      if (snapshot.kind !== "ready") {
        return needsInputResult({
          userPrompt: snapshot.message,
        })
      }

      const evaluation = evaluateClearanceDecision({
        snapshot: snapshot.value,
        marginFloorPct: pluginConfig.targetMarginFloorPct,
        policy: pluginConfig.decisionPolicy,
        fallbackCurrency: pluginConfig.currency,
      })

      const formatOptions = {
        locale: pluginConfig.locale,
        fallbackCurrency: pluginConfig.currency,
      }
      const details = buildClearanceDecisionToolDetails(evaluation, formatOptions)

      return textResultWithDetails(
        formatProductDecisionToolContent(details, { locale: pluginConfig.locale }),
        details,
      )
    },
  })
}
