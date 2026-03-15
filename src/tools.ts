import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { Type, type Static } from "@sinclair/typebox"
import {
  DEFAULT_PLUGIN_CONFIG,
  findConfiguredStore,
  getStoreSettingNumber,
  type PluginConfig,
} from "./config.js"
import { createShopifyClient } from "./shopify/client.js"
import {
  evaluateRestockSignal,
  loadShopifyCampaignSnapshot,
  loadShopifyInventorySnapshot,
  loadShopifyInventorySnapshotFromClient,
  loadShopifyProductSnapshotFromClient,
  loadShopifyRestockSnapshotFromClient,
  loadShopifyStoreOverview,
  type RestockSignal,
  type ShopifyInventorySnapshot,
  type ShopifySalesSnapshot,
  type ShopifyStoreOverviewSnapshot,
  loadShopifySalesSnapshot,
} from "./services/shopify.js"
import {
  currency,
  formatDateTime,
  formatObjectiveLabel,
  optionalNumber,
  percentage,
  ready,
  resolveNonNegativeNumber,
  resolvePositiveNumber,
  textResult,
  toNumber,
} from "./utils.js"

const SellerStoreOverviewParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store.",
      }),
    ),
    rangePreset: Type.Optional(
      Type.Union([Type.Literal("today"), Type.Literal("yesterday"), Type.Literal("last_7_days")]),
    ),
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
          "Optional sales lookback window for Shopify data loading. If omitted, use the configured default lookback window.",
      }),
    ),
  },
  { additionalProperties: false },
)

const SellerRestockSignalParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    sku: Type.String({
      description:
        "Exact SKU, full product title, or product title keywords to search in Shopify before calculating restock urgency.",
    }),
    onHandUnits: Type.Optional(Type.Number()),
    dailySalesUnits: Type.Optional(Type.Number()),
    supplierLeadDays: Type.Optional(Type.Number()),
    safetyStockDays: Type.Optional(Type.Number()),
    salesLookbackDays: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
)

const SellerCampaignPlanParamsSchema = Type.Object(
  {
    objective: Type.Union([
      Type.Literal("clear_inventory"),
      Type.Literal("grow_revenue"),
      Type.Literal("launch_product"),
      Type.Literal("recover_conversion"),
    ]),
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    heroSku: Type.String({
      description:
        "Exact SKU, full product title, or product title keywords to search in Shopify before loading campaign planning context.",
    }),
    currentMarginPct: Type.Optional(
      Type.Number({
        description:
          "Optional manual gross margin override. Use only when Shopify cannot calculate margin from price and unit cost.",
      }),
    ),
    inventoryDaysLeft: Type.Optional(
      Type.Number({
        description:
          "Optional manual inventory cover override. Normally this should be calculated from Shopify inventory and recent sales.",
      }),
    ),
    channel: Type.String({
      description: "Primary campaign channel, for example Meta ads, Google Shopping, or email.",
    }),
    constraint: Type.Optional(Type.String()),
    salesLookbackDays: Type.Optional(
      Type.Number({
        description:
          "Optional sales lookback window for Shopify data loading. If omitted, use the configured default lookback window.",
      }),
    ),
  },
  { additionalProperties: false },
)

type SellerStoreOverviewParams = Static<typeof SellerStoreOverviewParamsSchema>
type SellerQuoteBuilderParams = Static<typeof SellerQuoteBuilderParamsSchema>
type SellerInventoryLookupParams = Static<typeof SellerInventoryLookupParamsSchema>
type SellerSalesLookupParams = Static<typeof SellerSalesLookupParamsSchema>
type SellerRestockSignalParams = Static<typeof SellerRestockSignalParamsSchema>
type SellerCampaignPlanParams = Static<typeof SellerCampaignPlanParamsSchema>
type CampaignContextViewModel = {
  objective: string
  heroSku: string
  channel: string
  currentMarginPct: number
  inventoryDaysLeft: number
  currency: string
  locale: string
  productName: string
  source: string
  retrievedAtIso: string
  storeName: string
  timezone: string
  lookbackDays?: number
  constraint?: string
  currencyCode?: string | null
  averageUnitPrice?: number
  averageUnitCost?: number | null
  targetMarginFloorPct?: number
}

const resolveOptionalConfiguredNumber = (
  configuredStore: ReturnType<typeof findConfiguredStore>,
  key: Parameters<typeof getStoreSettingNumber>[1],
  pluginFallback?: number,
) => getStoreSettingNumber(configuredStore, key) ?? pluginFallback

const resolveSalesLookbackDays = (
  value: unknown,
  configuredStore: ReturnType<typeof findConfiguredStore>,
  pluginConfig: PluginConfig,
) =>
  Math.max(
    1,
    Math.round(
      toNumber(
        value,
        getStoreSettingNumber(configuredStore, "salesLookbackDays") ??
          pluginConfig.salesLookbackDays,
      ),
    ),
  )

const formatRestockSignal = (input: RestockSignal) =>
  [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, input.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Product: ${input.productName}`,
    `SKU: ${input.sku}`,
    `On-hand units: ${Math.round(input.onHandUnits)}`,
    `Average daily sales: ${input.dailySalesUnits.toFixed(2)}`,
    Number.isFinite(input.daysLeft)
      ? `Days of cover: ${input.daysLeft.toFixed(1)}`
      : "Days of cover: n/a (no recent sales detected)",
    `Supplier lead time: ${input.supplierLeadDays} days`,
    `Safety stock: ${input.safetyStockDays} days`,
    `Reorder point: ${Math.ceil(input.reorderPointUnits)} units`,
    typeof input.lookbackDays === "number"
      ? `Sales lookback: last ${input.lookbackDays} days`
      : null,
    `Urgency: ${input.urgency}`,
    "",
    input.action,
  ]
    .filter(Boolean)
    .join("\n")

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

const formatCampaignContext = (input: CampaignContextViewModel) => {
  const marginBuffer =
    typeof input.targetMarginFloorPct === "number"
      ? input.currentMarginPct - input.targetMarginFloorPct
      : null

  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, input.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Objective: ${formatObjectiveLabel(input.objective)}`,
    `Hero SKU: ${input.heroSku}`,
    `Product: ${input.productName}`,
    `Primary channel: ${input.channel}`,
    typeof input.averageUnitPrice === "number" && input.averageUnitPrice > 0
      ? `Average unit price: ${currency(input.averageUnitPrice, input.currencyCode ?? input.currency, input.locale)}`
      : null,
    typeof input.averageUnitCost === "number" && input.averageUnitCost > 0
      ? `Average unit cost: ${currency(input.averageUnitCost, input.currencyCode ?? input.currency, input.locale)}`
      : null,
    typeof input.lookbackDays === "number"
      ? `Sales lookback: last ${input.lookbackDays} days`
      : null,
    `Current margin: ${percentage(input.currentMarginPct)}`,
    `Inventory cover: ${input.inventoryDaysLeft.toFixed(1)} days`,
    marginBuffer !== null
      ? `Margin buffer vs configured floor: ${marginBuffer >= 0 ? "+" : ""}${percentage(marginBuffer)}`
      : null,
    input.constraint ? `Constraint: ${input.constraint}` : null,
    "",
    "Planning context:",
    "- This tool returns campaign inputs and operating constraints for the campaign-planning skill.",
    "- Ask the user for any missing required campaign inputs before giving a final plan.",
    "- Required inputs for a final plan are objective, hero SKU/title, channel, current margin, and inventory cover.",
  ]
    .filter(Boolean)
    .join("\n")
}

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

const formatQuoteDraft = (input: {
  buyerName: string
  productName: string
  quantity: number
  suggestedUnitPrice: number
  floorPrice: number
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
      ? `Commercial floor: ${currency(input.floorPrice, input.currency, input.locale)}`
      : null,
    `Gross margin at suggested price: ${percentage(input.marginPct)}`,
    `Market position: ${input.pricePositioning}`,
    `Lead time: ${input.shippingLeadDays} days`,
    `Payment terms: ${input.paymentTerms ?? "50% deposit, balance before dispatch"}`,
    "",
    "Draft response:",
    `We can offer ${input.quantity} units of ${input.productName} at ${currency(input.suggestedUnitPrice, input.currency, input.locale)} per unit, with an estimated lead time of ${input.shippingLeadDays} days.`,
    typeof input.targetMarginFloorPct === "number" && input.suggestedUnitPrice < input.floorPrice
      ? `Warning: the proposed price is below the configured margin floor of ${percentage(input.targetMarginFloorPct)}.`
      : typeof input.targetMarginFloorPct === "number"
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
export const registerSellerTools = (api: OpenClawPluginApi, pluginConfig: PluginConfig) => {
  api.registerTool({
    name: "seller_store_overview",
    label: "Seller Store Overview",
    description:
      "Load store-level sales and inventory facts for a configured store. Use this for questions like today's sales, yesterday's sales, or recent store totals. If storeId is omitted, use the configured default store.",
    parameters: SellerStoreOverviewParamsSchema,
    async execute(_id: string, params: SellerStoreOverviewParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_store_overview.",
        )
      }

      const hasCustomRange = Boolean(params.startDate || params.endDate)
      if (hasCustomRange && (!params.startDate || !params.endDate)) {
        return textResult(
          'Ask the user for both "startDate" and "endDate" in YYYY-MM-DD format, or use a range preset such as today, yesterday, or last_7_days.',
        )
      }

      if (hasCustomRange && params.rangePreset) {
        return textResult(
          'Use either "rangePreset" or "startDate"/"endDate" for seller_store_overview, not both.',
        )
      }

      if (configuredStore.platform === "shopify") {
        let snapshot: ShopifyStoreOverviewSnapshot
        try {
          snapshot = await loadShopifyStoreOverview(configuredStore.store, {
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
          ? unitCost * (1 + pluginConfig.targetMarginFloorPct / 100)
          : 0
      const marginPct = unitCost > 0 ? ((suggestedUnitPrice - unitCost) / unitCost) * 100 : 0
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

      const snapshot = await loadShopifyInventorySnapshot(
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

      const salesLookbackDays = resolveSalesLookbackDays(
        params.salesLookbackDays,
        configuredStore,
        pluginConfig,
      )
      const snapshot = await loadShopifySalesSnapshot(
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
    name: "seller_restock_signal",
    label: "Seller Restock Signal",
    description:
      "Estimate restock urgency for an exact SKU or product title search. Try the tool before asking for an exact SKU. If inventory or sales inputs are omitted, load them from a configured Shopify store. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm. Only ask for supplierLeadDays or safetyStockDays if they are still missing after checking plugin config.",
    parameters: SellerRestockSignalParamsSchema,
    async execute(_id: string, params: SellerRestockSignalParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      const supplierLeadDays = resolvePositiveNumber(
        optionalNumber(params.supplierLeadDays) ??
          optionalNumber(
            resolveOptionalConfiguredNumber(
              configuredStore,
              "supplierLeadDays",
              pluginConfig.supplierLeadDays,
            ),
          ),
        "supplierLeadDays",
        'Ask the user for supplier lead time in days, or configure "supplierLeadDays" on the store or plugin config.',
      )
      const safetyStockDays = resolveNonNegativeNumber(
        optionalNumber(params.safetyStockDays) ??
          optionalNumber(
            resolveOptionalConfiguredNumber(
              configuredStore,
              "safetyStockDays",
              pluginConfig.safetyStockDays,
            ),
          ),
        "safetyStockDays",
        'Ask the user for safety stock in days, or configure "safetyStockDays" on the store or plugin config.',
      )
      const salesLookbackDays = resolveSalesLookbackDays(
        params.salesLookbackDays,
        configuredStore,
        pluginConfig,
      )
      const hasManualInventory = typeof params.onHandUnits === "number"
      const hasManualSales = typeof params.dailySalesUnits === "number"

      if (supplierLeadDays.kind !== "ready") {
        return textResult(supplierLeadDays.message)
      }
      if (safetyStockDays.kind !== "ready") {
        return textResult(safetyStockDays.message)
      }

      if (hasManualInventory && hasManualSales) {
        const onHandUnits = resolveNonNegativeNumber(
          params.onHandUnits,
          "onHandUnits",
          "Ask the user for current on-hand inventory.",
        )
        const dailySalesUnits = resolveNonNegativeNumber(
          params.dailySalesUnits,
          "dailySalesUnits",
          "Ask the user for average daily sales.",
        )
        if (onHandUnits.kind !== "ready") {
          return textResult(onHandUnits.message)
        }
        if (dailySalesUnits.kind !== "ready") {
          return textResult(dailySalesUnits.message)
        }
        return textResult(
          formatRestockSignal(
            evaluateRestockSignal({
              sku: params.sku,
              onHandUnits: onHandUnits.value,
              dailySalesUnits: dailySalesUnits.value,
              supplierLeadDays: supplierLeadDays.value,
              safetyStockDays: safetyStockDays.value,
              source: "manual",
              retrievedAtIso: new Date().toISOString(),
              locale: pluginConfig.locale,
              storeName: "Manual input",
              timezone: "UTC",
              productName: params.sku,
            }),
          ),
        )
      }

      if (hasManualInventory && !hasManualSales && !configuredStore) {
        return textResult(
          "Ask the user for average daily sales, or configure a Shopify store so sales can be loaded automatically.",
        )
      }

      if (!hasManualInventory && hasManualSales && !configuredStore) {
        return textResult(
          "Ask the user for current on-hand inventory, or configure a Shopify store so inventory can be loaded automatically.",
        )
      }

      if (!configuredStore) {
        return textResult(
          "Ask the user either to provide inventory and sales inputs manually, or to configure a store in plugins.entries.seller-assistant.config.",
        )
      }

      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_restock_signal data loading is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const client = await createShopifyClient(configuredStore.store)
      const snapshot =
        hasManualSales && !hasManualInventory
          ? await loadShopifyInventorySnapshotFromClient(
              client,
              configuredStore.store,
              params.sku,
              pluginConfig.locale,
            )
          : await loadShopifyRestockSnapshotFromClient(
              client,
              configuredStore.store,
              params.sku,
              salesLookbackDays,
              pluginConfig.locale,
            )
      if (snapshot.kind !== "ready") {
        return textResult(snapshot.message)
      }

      const onHandUnits = hasManualInventory
        ? resolveNonNegativeNumber(
            params.onHandUnits,
            "onHandUnits",
            "Ask the user for current on-hand inventory.",
          )
        : ready(snapshot.value.onHandUnits)
      const dailySalesUnits = hasManualSales
        ? resolveNonNegativeNumber(
            params.dailySalesUnits,
            "dailySalesUnits",
            "Ask the user for average daily sales.",
          )
        : "dailySalesUnits" in snapshot.value
          ? ready(toNumber(snapshot.value.dailySalesUnits))
          : 0
      if (onHandUnits.kind !== "ready") {
        return textResult(onHandUnits.message)
      }
      if (typeof dailySalesUnits !== "number" && dailySalesUnits.kind !== "ready") {
        return textResult(dailySalesUnits.message)
      }

      return textResult(
        formatRestockSignal(
          evaluateRestockSignal({
            ...snapshot.value,
            onHandUnits: onHandUnits.value,
            dailySalesUnits:
              typeof dailySalesUnits === "number" ? dailySalesUnits : dailySalesUnits.value,
            supplierLeadDays: supplierLeadDays.value,
            safetyStockDays: safetyStockDays.value,
            lookbackDays:
              "lookbackDays" in snapshot.value
                ? (optionalNumber(snapshot.value.lookbackDays) ?? undefined)
                : undefined,
          }),
        ),
      )
    },
  })

  api.registerTool({
    name: "seller_campaign_context",
    label: "Seller Campaign Context",
    description:
      "Load campaign planning context for an exact SKU or product title search. Use this before drafting a final campaign recommendation. Prefer loading inventory cover and recent sales from a configured Shopify store. Ask the user for any required missing campaign inputs before giving the final plan. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm.",
    parameters: SellerCampaignPlanParamsSchema,
    async execute(_id: string, params: SellerCampaignPlanParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      const salesLookbackDays = resolveSalesLookbackDays(
        params.salesLookbackDays,
        configuredStore,
        pluginConfig,
      )
      const hasManualMargin = typeof params.currentMarginPct === "number"
      const hasManualInventoryDays = typeof params.inventoryDaysLeft === "number"

      if (hasManualMargin && hasManualInventoryDays) {
        const currentMarginPct = resolveNonNegativeNumber(
          params.currentMarginPct,
          "currentMarginPct",
          "Ask the user for the current gross margin percentage.",
        )
        const inventoryDaysLeft = resolveNonNegativeNumber(
          params.inventoryDaysLeft,
          "inventoryDaysLeft",
          "Ask the user for current inventory cover in days.",
        )
        if (currentMarginPct.kind !== "ready") {
          return textResult(currentMarginPct.message)
        }
        if (inventoryDaysLeft.kind !== "ready") {
          return textResult(inventoryDaysLeft.message)
        }
        return textResult(
          formatCampaignContext({
            objective: params.objective,
            heroSku: params.heroSku,
            currentMarginPct: currentMarginPct.value,
            inventoryDaysLeft: inventoryDaysLeft.value,
            productName: params.heroSku,
            channel: params.channel,
            source: "manual",
            retrievedAtIso: new Date().toISOString(),
            storeName: "Manual input",
            timezone: "UTC",
            constraint: params.constraint,
            targetMarginFloorPct: pluginConfig.targetMarginFloorPct,
            currency: pluginConfig.currency,
            locale: pluginConfig.locale,
          }),
        )
      }

      if (hasManualMargin && !hasManualInventoryDays && !configuredStore) {
        return textResult(
          "To continue the campaign plan, ask the user for current inventory cover in days, or use a configured Shopify store so it can be loaded automatically.",
        )
      }

      if (!hasManualMargin && hasManualInventoryDays && !configuredStore) {
        return textResult(
          "To continue the campaign plan, ask the user for the current gross margin percentage, or use a configured Shopify store with product cost data so it can be calculated automatically.",
        )
      }

      if (!configuredStore) {
        return textResult(
          "Ask the user either to provide margin and inventory inputs manually, or to configure a store in plugins.entries.seller-assistant.config.",
        )
      }

      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_campaign_context data loading is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const client = await createShopifyClient(configuredStore.store)
      const snapshot =
        hasManualInventoryDays && !hasManualMargin
          ? await loadShopifyProductSnapshotFromClient(
              client,
              configuredStore.store,
              params.heroSku,
              pluginConfig.locale,
            )
          : await loadShopifyCampaignSnapshot(
              configuredStore.store,
              params.heroSku,
              salesLookbackDays,
              pluginConfig.locale,
            )
      if (snapshot.kind !== "ready") {
        return textResult(snapshot.message)
      }
      const resolvedCurrentMarginPct = hasManualMargin
        ? resolveNonNegativeNumber(
            params.currentMarginPct,
            "currentMarginPct",
            "Ask the user for the current gross margin percentage.",
          )
        : ready(optionalNumber(snapshot.value.currentMarginPct))
      const resolvedInventoryDaysLeft = hasManualInventoryDays
        ? resolveNonNegativeNumber(
            params.inventoryDaysLeft,
            "inventoryDaysLeft",
            "Ask the user for current inventory cover in days.",
          )
        : ready(
            "inventoryDaysLeft" in snapshot.value
              ? toNumber(snapshot.value.inventoryDaysLeft, 999)
              : 999,
          )
      const lookbackDays =
        "lookbackDays" in snapshot.value
          ? (optionalNumber(snapshot.value.lookbackDays) ?? undefined)
          : undefined

      if (resolvedCurrentMarginPct.kind !== "ready") {
        return textResult(resolvedCurrentMarginPct.message)
      }
      if (resolvedInventoryDaysLeft.kind !== "ready") {
        return textResult(resolvedInventoryDaysLeft.message)
      }
      if (resolvedCurrentMarginPct.value === null) {
        return textResult(
          `Ask the user for the current gross margin % for "${params.heroSku}". If they do not know it, ask for unit cost and selling price so margin can be calculated.`,
        )
      }

      return textResult(
        formatCampaignContext({
          objective: params.objective,
          heroSku: params.heroSku,
          currentMarginPct: resolvedCurrentMarginPct.value,
          inventoryDaysLeft: resolvedInventoryDaysLeft.value,
          productName: snapshot.value.productName,
          channel: params.channel,
          constraint: params.constraint,
          source: snapshot.value.source,
          retrievedAtIso: snapshot.value.retrievedAtIso,
          storeName: snapshot.value.storeName,
          timezone: snapshot.value.timezone,
          lookbackDays,
          currencyCode: "currencyCode" in snapshot.value ? snapshot.value.currencyCode : null,
          averageUnitPrice:
            "averageUnitPrice" in snapshot.value ? snapshot.value.averageUnitPrice : undefined,
          averageUnitCost:
            "averageUnitCost" in snapshot.value ? snapshot.value.averageUnitCost : undefined,
          targetMarginFloorPct: pluginConfig.targetMarginFloorPct,
          currency: pluginConfig.currency,
          locale: pluginConfig.locale,
        }),
      )
    },
  })
}
