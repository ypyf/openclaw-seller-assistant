import { createAdminApiClient } from "@shopify/admin-api-client"

declare const process: {
  env: Record<string, string | undefined>
}

const DEFAULT_CONFIG = {
  defaultCurrency: "USD",
  defaultLocale: "en-US",
  targetMarginFloorPct: 20,
  lowInventoryDays: 14,
  defaultResponseTone: "consultative",
}

const SHOPIFY_API_VERSION = "2026-01"

const percentage = (value: number) => `${value.toFixed(1)}%`

const currency = (
  value: number,
  code = DEFAULT_CONFIG.defaultCurrency,
  locale = DEFAULT_CONFIG.defaultLocale,
) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(value)

const toNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const toPluginConfig = (api: any) => ({
  ...DEFAULT_CONFIG,
  ...(api?.pluginConfig ?? {}),
})

const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

const textResult = (text: string) => ({
  content: [{ type: "text", text }],
})

type ShopifyStoreConfig = {
  id: string
  name: string
  storeDomain: string
  clientId: string
  clientSecretEnv: string
}

type ConfiguredStore =
  | { platform: "shopify"; store: ShopifyStoreConfig }
  | { platform: "amazon"; store: Record<string, unknown> }

const findConfiguredStore = (config: any, storeId?: string): ConfiguredStore | null => {
  const groupedStores: ConfiguredStore[] = [
    ...toArray<ShopifyStoreConfig>(config?.stores?.shopify)
      .filter(Boolean)
      .map(store => ({ platform: "shopify" as const, store })),
    ...toArray<Record<string, unknown>>(config?.stores?.amazon)
      .filter(Boolean)
      .map(store => ({ platform: "amazon" as const, store })),
  ]

  if (storeId) {
    return groupedStores.find(entry => entry.store.id === storeId) ?? null
  }

  if (config?.defaultStoreId) {
    return groupedStores.find(entry => entry.store.id === config.defaultStoreId) ?? null
  }

  return groupedStores[0] ?? null
}

const getShopifyClientSecret = (store: ShopifyStoreConfig) => {
  const secret = process.env[store.clientSecretEnv]
  if (!secret) {
    throw new Error(
      `Missing Shopify client secret env var "${store.clientSecretEnv}" for store "${store.id}".`,
    )
  }
  return secret
}

const getShopifyAccessToken = async (store: ShopifyStoreConfig) => {
  const response = await fetch(`https://${store.storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: store.clientId,
      client_secret: getShopifyClientSecret(store),
    }).toString(),
  })

  const payload = await response.json()
  if (!response.ok || !payload?.access_token) {
    throw new Error(
      `Failed to fetch Shopify access token for "${store.id}": ${payload?.error_description ?? payload?.error ?? response.statusText}`,
    )
  }

  return payload.access_token as string
}

const createShopifyClient = async (store: ShopifyStoreConfig) => {
  const accessToken = await getShopifyAccessToken(store)

  return createAdminApiClient({
    storeDomain: store.storeDomain,
    apiVersion: SHOPIFY_API_VERSION,
    accessToken,
  })
}

const getDateRange = (windowDays: number, endDaysAgo: number) => {
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() - endDaysAgo)

  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - windowDays)

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

const SHOPIFY_SHOP_QUERY = `
  query SellerHealthShop {
    shop {
      name
      currencyCode
      ianaTimezone
    }
  }
`

const SHOPIFY_ORDERS_PAGE_QUERY = `
  query SellerHealthOrdersPage($ordersQuery: String!, $after: String) {
    orders(first: 250, after: $after, query: $ordersQuery, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentSubtotalLineItemsQuantity
      }
    }
  }
`

const SHOPIFY_VARIANTS_PAGE_QUERY = `
  query SellerHealthVariantsPage($after: String) {
    productVariants(first: 250, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        inventoryQuantity
      }
    }
  }
`

const SHOPIFY_LOCALES_QUERY = `
  query SellerHealthLocales {
    shopLocales(first: 10) {
      nodes {
        locale
        primary
      }
    }
  }
`

const formatShopifyErrors = (errors: any) => {
  const baseMessage =
    typeof errors?.message === "string" && errors.message.trim()
      ? errors.message.trim()
      : "Shopify Admin API request failed."

  const gqlMessages = toArray<any>(errors?.graphQLErrors)
    .map(error => {
      const message =
        typeof error?.message === "string" && error.message.trim() ? error.message.trim() : null
      const fieldPath = Array.isArray(error?.path) ? error.path.join(".") : null
      if (message && fieldPath) {
        return `${fieldPath}: ${message}`
      }
      return message
    })
    .filter(Boolean)

  return gqlMessages.length > 0 ? `${baseMessage} ${gqlMessages.join("; ")}` : baseMessage
}

type ShopifyOrdersPage = {
  orders?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      currentTotalPriceSet?: {
        shopMoney?: {
          amount?: string
          currencyCode?: string
        }
      }
      currentSubtotalLineItemsQuantity?: number
    }>
  }
}

type ShopifyVariantsPage = {
  productVariants?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      inventoryQuantity?: number | null
    }>
  }
}

type ShopifyGraphQLClient = {
  request: <TData>(
    operation: string,
    options?: {
      variables?: Record<string, unknown>
    },
  ) => Promise<{
    data?: TData
    errors?: any
  }>
}

const fetchAllShopifyOrders = async (client: ShopifyGraphQLClient, ordersQuery: string) => {
  const orders: NonNullable<NonNullable<ShopifyOrdersPage["orders"]>["nodes"]> = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result = await client.request<ShopifyOrdersPage>(SHOPIFY_ORDERS_PAGE_QUERY, {
      variables: {
        ordersQuery,
        after,
      },
    })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.orders
    orders.push(
      ...toArray<NonNullable<NonNullable<ShopifyOrdersPage["orders"]>["nodes"]>[number]>(
        page?.nodes,
      ),
    )
    hasNextPage = Boolean(page?.pageInfo?.hasNextPage)
    after = page?.pageInfo?.endCursor ?? null
  }

  return orders
}

const fetchAllShopifyInventoryUnits = async (client: ShopifyGraphQLClient) => {
  let inventoryUnits = 0
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result = await client.request<ShopifyVariantsPage>(SHOPIFY_VARIANTS_PAGE_QUERY, {
      variables: {
        after,
      },
    })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.productVariants
    inventoryUnits += sum(
      toArray<NonNullable<NonNullable<ShopifyVariantsPage["productVariants"]>["nodes"]>[number]>(
        page?.nodes,
      ).map(variant => toNumber(variant?.inventoryQuantity)),
    )
    hasNextPage = Boolean(page?.pageInfo?.hasNextPage)
    after = page?.pageInfo?.endCursor ?? null
  }

  return inventoryUnits
}

const loadShopifyHealthSnapshot = async (store: ShopifyStoreConfig) => {
  const client = await createShopifyClient(store)
  const currentRange = getDateRange(7, 0)
  const previousRange = getDateRange(7, 7)

  const buildOrderQuery = (range: { start: string; end: string }) =>
    `created_at:>=${range.start} created_at:<${range.end} financial_status:paid`

  const [shopResult, currentOrders, previousOrders, inventoryUnits] = await Promise.all([
    client.request<{
      shop?: { name?: string; currencyCode?: string; ianaTimezone?: string | null }
    }>(SHOPIFY_SHOP_QUERY),
    fetchAllShopifyOrders(client, buildOrderQuery(currentRange)),
    fetchAllShopifyOrders(client, buildOrderQuery(previousRange)),
    fetchAllShopifyInventoryUnits(client),
  ])

  if (shopResult.errors) {
    throw new Error(formatShopifyErrors(shopResult.errors))
  }

  const shop = shopResult.data?.shop

  const revenue = sum(
    currentOrders.map(order =>
      toNumber(
        order?.currentTotalPriceSet?.shopMoney?.amount
          ? Number(order.currentTotalPriceSet.shopMoney.amount)
          : 0,
      ),
    ),
  )
  const previousRevenue = sum(
    previousOrders.map(order =>
      toNumber(
        order?.currentTotalPriceSet?.shopMoney?.amount
          ? Number(order.currentTotalPriceSet.shopMoney.amount)
          : 0,
      ),
    ),
  )
  const unitsSold = sum(
    currentOrders.map(order => toNumber(order?.currentSubtotalLineItemsQuantity)),
  )
  const previousUnitsSold = sum(
    previousOrders.map(order => toNumber(order?.currentSubtotalLineItemsQuantity)),
  )
  const averageDailyUnits = unitsSold / 7
  const inventoryDaysLeft = averageDailyUnits > 0 ? inventoryUnits / averageDailyUnits : 999
  const previousDailyUnits = previousUnitsSold / 7

  let primaryLocale: string | null = null
  const localesResult = await client.request<{ shopLocales?: { nodes?: Array<any> } }>(
    SHOPIFY_LOCALES_QUERY,
  )
  if (!localesResult.errors) {
    const locales = toArray<any>(localesResult.data?.shopLocales?.nodes)
    primaryLocale = locales.find(locale => locale?.primary)?.locale ?? locales[0]?.locale ?? null
  }

  return {
    source: "shopify",
    storeName: shop?.name ?? store.name,
    periodLabel: "last 7 days",
    currencyCode:
      shop?.currencyCode ??
      currentOrders[0]?.currentTotalPriceSet?.shopMoney?.currencyCode ??
      "USD",
    timezone: shop?.ianaTimezone ?? null,
    locale: primaryLocale,
    revenue,
    previousRevenue,
    visits: 0,
    previousVisits: 0,
    conversionRatePct: 0,
    previousConversionRatePct: 0,
    adSpend: 0,
    inventoryDaysLeft,
    inventoryUnits,
    unitsSold,
    previousUnitsSold,
    previousDailyUnits,
  }
}

const formatHealthCheck = (input: {
  source?: string
  storeName: string
  periodLabel?: string
  revenue: number
  previousRevenue: number
  visits: number
  previousVisits: number
  conversionRatePct: number
  previousConversionRatePct: number
  adSpend: number
  inventoryDaysLeft: number
  currencyCode?: string
  timezone?: string | null
  locale?: string | null
  inventoryUnits?: number
  unitsSold?: number
  previousUnitsSold?: number
}) => {
  const revenueDeltaPct =
    input.previousRevenue > 0
      ? ((input.revenue - input.previousRevenue) / input.previousRevenue) * 100
      : 0
  const trafficDeltaPct =
    input.previousVisits > 0
      ? ((input.visits - input.previousVisits) / input.previousVisits) * 100
      : 0
  const conversionDeltaPct = input.conversionRatePct - input.previousConversionRatePct
  const roas = input.adSpend > 0 ? input.revenue / input.adSpend : null

  const alerts: string[] = []
  if (input.inventoryDaysLeft <= DEFAULT_CONFIG.lowInventoryDays) {
    alerts.push(`Inventory risk: only ${input.inventoryDaysLeft.toFixed(1)} days left.`)
  }
  if (input.previousVisits > 0 && trafficDeltaPct < -10) {
    alerts.push(`Traffic dropped ${percentage(Math.abs(trafficDeltaPct))} versus the prior period.`)
  }
  if (input.previousConversionRatePct > 0 && conversionDeltaPct < -0.5) {
    alerts.push(`Conversion declined by ${conversionDeltaPct.toFixed(1)} percentage points.`)
  }
  if (roas !== null && roas < 2) {
    alerts.push(`Paid efficiency is weak with ROAS at ${roas.toFixed(2)}.`)
  }
  if (alerts.length === 0) {
    alerts.push("No immediate structural risk detected.")
  }

  const actions = [
    input.previousVisits > 0 && trafficDeltaPct < -10
      ? "Review channel mix and campaign pacing before changing price."
      : "Preserve traffic sources that are still compounding demand.",
    input.previousConversionRatePct > 0 && conversionDeltaPct < -0.5
      ? "Audit PDP quality, offer clarity, and checkout friction."
      : "Keep the current conversion playbook and test one upsell lever.",
    input.inventoryDaysLeft <= DEFAULT_CONFIG.lowInventoryDays
      ? "Prioritize replenishment or slow paid demand on thin-stock SKUs."
      : "Maintain current inventory posture and watch days of cover weekly.",
  ]

  return [
    input.source ? `Source: ${input.source}` : null,
    `Store: ${input.storeName}`,
    `Window: ${input.periodLabel ?? "last 7 days"}`,
    `Revenue: ${currency(input.revenue, input.currencyCode ?? DEFAULT_CONFIG.defaultCurrency, DEFAULT_CONFIG.defaultLocale)} (${input.previousRevenue > 0 && revenueDeltaPct >= 0 ? "+" : ""}${percentage(revenueDeltaPct)} vs prior)`,
    input.timezone ? `Timezone: ${input.timezone}` : "Timezone: n/a",
    input.locale ? `Locale: ${input.locale}` : "Locale: n/a",
    input.previousVisits > 0
      ? `Visits: ${input.visits} (${trafficDeltaPct >= 0 ? "+" : ""}${percentage(trafficDeltaPct)} vs prior)`
      : "Visits: n/a (Shopify Admin API does not provide storefront traffic)",
    input.previousConversionRatePct > 0
      ? `Conversion: ${percentage(input.conversionRatePct)} (${conversionDeltaPct >= 0 ? "+" : ""}${conversionDeltaPct.toFixed(1)} pts vs prior)`
      : "Conversion: n/a (requires traffic analytics outside Shopify Admin API)",
    roas === null || input.adSpend <= 0 ? "ROAS: n/a" : `ROAS: ${roas.toFixed(2)}`,
    `Inventory cover: ${input.inventoryDaysLeft.toFixed(1)} days`,
    typeof input.inventoryUnits === "number"
      ? `Inventory units: ${Math.round(input.inventoryUnits)}`
      : null,
    typeof input.unitsSold === "number"
      ? `Units sold: ${Math.round(input.unitsSold)} vs ${Math.round(input.previousUnitsSold ?? 0)} prior`
      : null,
    "",
    "Alerts:",
    ...alerts.map(item => `- ${item}`),
    "",
    "Recommended next actions:",
    ...actions.map(item => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n")
}

export default function register(api: any) {
  const pluginConfig = toPluginConfig(api)

  api.registerTool({
    name: "seller_health_check",
    description:
      "Check store health for a configured store. If storeId is omitted, use the configured default store. If no configured store is available, prompt the user to configure a store first.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        storeId: {
          type: "string",
          description:
            "Optional configured store id. If omitted, the tool should use defaultStoreId or the first configured store.",
        },
      },
      required: [],
    },
    async execute(_id: string, params: any) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "No configured store was found. Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_health_check.",
        )
      }

      if (configuredStore.platform === "shopify") {
        const snapshot = await loadShopifyHealthSnapshot(configuredStore.store)
        return textResult(formatHealthCheck(snapshot))
      }

      throw new Error(
        `seller_health_check is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
      )
    },
  })

  api.registerTool({
    name: "seller_quote_builder",
    description:
      "Draft a seller-side RFQ or buyer reply with price guardrails, SLA, and commercial terms.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        buyerName: { type: "string" },
        productName: { type: "string" },
        quantity: { type: "number" },
        unitCost: { type: "number" },
        suggestedUnitPrice: { type: "number" },
        competitorUnitPrice: { type: "number" },
        shippingLeadDays: { type: "number" },
        paymentTerms: { type: "string" },
        notes: { type: "string" },
        tone: {
          type: "string",
          enum: ["concise", "consultative", "premium"],
        },
      },
      required: ["buyerName", "productName", "quantity", "unitCost", "suggestedUnitPrice"],
    },
    async execute(_id: string, params: any) {
      const unitCost = toNumber(params.unitCost)
      const suggestedUnitPrice = toNumber(params.suggestedUnitPrice)
      const competitorUnitPrice = toNumber(params.competitorUnitPrice, suggestedUnitPrice)
      const quantity = toNumber(params.quantity)
      const shippingLeadDays = toNumber(params.shippingLeadDays, 7)
      const floorPrice = unitCost * (1 + pluginConfig.targetMarginFloorPct / 100)
      const marginPct = unitCost > 0 ? ((suggestedUnitPrice - unitCost) / unitCost) * 100 : 0
      const pricePositioning =
        suggestedUnitPrice <= competitorUnitPrice
          ? "at or below market"
          : "above the nearest market reference"
      const tone = params.tone ?? pluginConfig.defaultResponseTone

      const openingByTone: Record<string, string> = {
        concise: `Quote for ${params.productName}`,
        consultative: `Thanks for the RFQ. Below is a recommended quote for ${params.productName}.`,
        premium: `We reviewed your requirement and prepared a supply proposal for ${params.productName}.`,
      }

      return textResult(
        [
          openingByTone[tone] ?? openingByTone.consultative,
          "",
          `Buyer: ${params.buyerName}`,
          `Quantity: ${quantity}`,
          `Suggested unit price: ${currency(suggestedUnitPrice, pluginConfig.defaultCurrency, pluginConfig.defaultLocale)}`,
          `Commercial floor: ${currency(floorPrice, pluginConfig.defaultCurrency, pluginConfig.defaultLocale)}`,
          `Gross margin at suggested price: ${percentage(marginPct)}`,
          `Market position: ${pricePositioning}`,
          `Lead time: ${shippingLeadDays} days`,
          `Payment terms: ${params.paymentTerms ?? "50% deposit, balance before dispatch"}`,
          "",
          "Draft response:",
          `We can offer ${quantity} units of ${params.productName} at ${currency(suggestedUnitPrice, pluginConfig.defaultCurrency, pluginConfig.defaultLocale)} per unit, with an estimated lead time of ${shippingLeadDays} days.`,
          suggestedUnitPrice < floorPrice
            ? `Warning: the proposed price is below the configured margin floor of ${percentage(pluginConfig.targetMarginFloorPct)}.`
            : `This quote remains above the configured margin floor of ${percentage(pluginConfig.targetMarginFloorPct)}.`,
          params.notes
            ? `Notes: ${params.notes}`
            : "Notes: Offer optional upsell, MOQ ladder, or faster-shipping surcharge if negotiation starts.",
        ].join("\n"),
      )
    },
  })

  api.registerTool({
    name: "seller_restock_signal",
    description:
      "Estimate restock urgency from inventory, daily sales, supplier lead time, and safety stock.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        sku: { type: "string" },
        onHandUnits: { type: "number" },
        dailySalesUnits: { type: "number" },
        supplierLeadDays: { type: "number" },
        safetyStockDays: { type: "number" },
      },
      required: ["sku", "onHandUnits", "dailySalesUnits", "supplierLeadDays"],
    },
    async execute(_id: string, params: any) {
      const onHandUnits = toNumber(params.onHandUnits)
      const dailySalesUnits = Math.max(toNumber(params.dailySalesUnits), 0.0001)
      const supplierLeadDays = toNumber(params.supplierLeadDays)
      const safetyStockDays = toNumber(params.safetyStockDays, 7)
      const daysLeft = onHandUnits / dailySalesUnits
      const reorderPointUnits = (supplierLeadDays + safetyStockDays) * dailySalesUnits
      const urgency =
        daysLeft <= supplierLeadDays
          ? "critical"
          : daysLeft <= supplierLeadDays + safetyStockDays
            ? "high"
            : "normal"

      return textResult(
        [
          `SKU: ${params.sku}`,
          `On-hand units: ${onHandUnits}`,
          `Average daily sales: ${dailySalesUnits.toFixed(2)}`,
          `Days of cover: ${daysLeft.toFixed(1)}`,
          `Supplier lead time: ${supplierLeadDays} days`,
          `Safety stock: ${safetyStockDays} days`,
          `Reorder point: ${Math.ceil(reorderPointUnits)} units`,
          `Urgency: ${urgency}`,
          "",
          urgency === "critical"
            ? "Action: place a replenishment order now and throttle demand on this SKU."
            : urgency === "high"
              ? "Action: start replenishment this cycle and avoid discounting until inbound stock is confirmed."
              : "Action: inventory posture is acceptable; keep monitoring weekly.",
        ].join("\n"),
      )
    },
  })

  api.registerTool({
    name: "seller_campaign_plan",
    description:
      "Generate a short seller-side campaign plan from objective, offer, and operating constraints.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        objective: {
          type: "string",
          enum: ["clear_inventory", "grow_revenue", "launch_product", "recover_conversion"],
        },
        heroSku: { type: "string" },
        currentMarginPct: { type: "number" },
        inventoryDaysLeft: { type: "number" },
        channel: { type: "string" },
        constraint: { type: "string" },
      },
      required: ["objective", "heroSku", "currentMarginPct", "inventoryDaysLeft", "channel"],
    },
    async execute(_id: string, params: any) {
      const margin = toNumber(params.currentMarginPct)
      const inventoryDaysLeft = toNumber(params.inventoryDaysLeft)

      const byObjective: Record<string, string[]> = {
        clear_inventory: [
          "Use time-boxed discounts with a hard stop date.",
          "Bundle the hero SKU with slower-moving accessories.",
          "Move spend toward retargeting instead of cold acquisition.",
        ],
        grow_revenue: [
          "Lead with value messaging rather than deep discounting.",
          "Test AOV expansion via bundle and threshold-based offers.",
          "Keep CAC guardrails visible in the daily operating review.",
        ],
        launch_product: [
          "Sequence launch into teaser, proof, and urgency phases.",
          "Collect early reviews or creator proof before scaling spend.",
          "Use tight landing-page narrative around one core use case.",
        ],
        recover_conversion: [
          "Audit landing-page clarity, offer framing, and checkout friction first.",
          "Run one trust-building creative and one urgency variant in parallel.",
          "Limit traffic expansion until conversion stabilizes.",
        ],
      }

      const riskNotes = [
        inventoryDaysLeft <= pluginConfig.lowInventoryDays
          ? "Inventory is tight, so avoid broad promotion without inbound stock visibility."
          : "Inventory depth is workable for a controlled campaign.",
        margin < pluginConfig.targetMarginFloorPct
          ? "Current margin is below the configured floor, so discounting should be narrow and conditional."
          : "Current margin supports moderate offer testing.",
        params.constraint
          ? `Constraint to respect: ${params.constraint}`
          : "Constraint to respect: keep operations simple enough for weekly review.",
      ]

      return textResult(
        [
          `Objective: ${params.objective}`,
          `Hero SKU: ${params.heroSku}`,
          `Primary channel: ${params.channel}`,
          "",
          "Plan:",
          ...(byObjective[params.objective] ?? byObjective.grow_revenue).map(item => `- ${item}`),
          "",
          "Risk notes:",
          ...riskNotes.map(item => `- ${item}`),
        ].join("\n"),
      )
    },
  })
}
