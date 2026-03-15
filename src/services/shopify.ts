import {
  SHOPIFY_ORDERS_PAGE_QUERY,
  SHOPIFY_ORDERS_WITH_LINE_ITEMS_PAGE_QUERY,
  SHOPIFY_ORDER_LINE_ITEMS_PAGE_QUERY,
  SHOPIFY_PRODUCTS_BY_TITLE_QUERY,
  SHOPIFY_PRODUCT_VARIANTS_PAGE_QUERY,
  SHOPIFY_SHOP_QUERY,
  SHOPIFY_VARIANTS_PAGE_QUERY,
  SHOPIFY_VARIANT_BY_SKU_QUERY,
} from "../shopify/queries.js"
import type {
  ShopifyGraphQLClient,
  ShopifyGraphQLResponse,
  ShopifyInitialOrderLineItem,
  ShopifyOrderLineItemsPage,
  ShopifyOrderWithLineItems,
  ShopifyOrdersPage,
  ShopifyOrdersWithLineItemsPage,
  ShopifyPaginatedOrderLineItem,
  ShopifyProductByTitle,
  ShopifyProductVariantNode,
  ShopifyProductVariantsPage,
  ShopifyProductWithVariants,
  ShopifyProductsByTitlePage,
  ShopifyResolvedCandidate,
  ShopifyResolvedVariant,
  ShopifyVariantLookupPage,
  ShopifyVariantsPage,
  ShopifyVariantSelection,
} from "../shopify/types.js"
import { DEFAULT_PLUGIN_CONFIG, type ShopifyStoreConfig } from "../config.js"
import { createShopifyClient, formatShopifyErrors, getDateRange } from "../shopify/client.js"
import {
  type FlowResolution,
  needsInput,
  normalizeSku,
  optionalNumber,
  ready,
  sum,
  toArray,
  toNumber,
  tokenizeSearchTerms,
  unique,
} from "../utils.js"

const SHOPIFY_TITLE_SEARCH_LIMIT = 50
const SHOPIFY_MATCH_CHOICE_LIMIT = 5
const SHOPIFY_VARIANT_FETCH_BATCH_SIZE = 5

export type ShopifyStoreOverviewSnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  currencyCode: string
  windowLabel: string
  ordersCount: number
  unitsSold: number
  revenue: number
  inventoryUnits?: number
  averageDailyUnits?: number
  inventoryDaysLeft?: number
}

export type ShopifyStoreSalesSummaryWindow = {
  rangePreset: StoreOverviewRangePreset
  windowLabel: string
  ordersCount: number
  unitsSold: number
  revenue: number
}

export type ShopifyStoreSalesSummarySnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  currencyCode: string
  windows: ShopifyStoreSalesSummaryWindow[]
  inventoryUnits?: number
  inventoryDaysLeft?: number
  inventoryErrorMessage?: string
}

export type ShopifyInventorySnapshot = {
  source: "shopify"
  retrievedAtIso: string
  locale: string
  storeName: string
  timezone: string
  sku: string
  productName: string
  onHandUnits: number
}

export type ShopifySalesSnapshot = {
  source: "shopify"
  retrievedAtIso: string
  locale: string
  storeName: string
  timezone: string
  sku: string
  productName: string
  dailySalesUnits: number
  lookbackDays: number
  unitsSold: number
}

export type ShopifyRestockSnapshot = ShopifyInventorySnapshot & {
  dailySalesUnits: number
  lookbackDays: number
  unitsSold: number
}

export type ShopifyProductSnapshot = ShopifyInventorySnapshot & {
  currencyCode: string | null
  averageUnitPrice: number
  averageUnitCost: number | null
  currentMarginPct: number | null
}

export type ShopifyCampaignSnapshot = ShopifyRestockSnapshot & {
  currencyCode: string | null
  currentMarginPct: number | null
  inventoryDaysLeft: number
  averageUnitPrice: number
  averageUnitCost: number | null
}

export type RestockSignal = {
  sku: string
  onHandUnits: number
  dailySalesUnits: number
  supplierLeadDays: number
  safetyStockDays: number
  source: string
  retrievedAtIso: string
  locale: string
  storeName: string
  timezone: string
  productName: string
  lookbackDays?: number
  reorderPointUnits: number
  daysLeft: number
  urgency: "normal" | "high" | "critical"
  action: string
}

type ShopifyCandidateMatchKind = "sku_exact" | "title_exact" | "title_fuzzy"
export type StoreOverviewRangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_60_days"
  | "last_90_days"
  | "last_180_days"
  | "last_365_days"

type StoreOverviewWindow = {
  windowLabel: string
  start: string
  end: string
  dayCount: number
}

const STORE_OVERVIEW_ROLLING_WINDOW_CONFIG: Record<
  Exclude<StoreOverviewRangePreset, "today" | "yesterday">,
  { windowLabel: string; dayCount: number }
> = {
  last_7_days: {
    windowLabel: "last 7 days",
    dayCount: 7,
  },
  last_30_days: {
    windowLabel: "last 30 days",
    dayCount: 30,
  },
  last_60_days: {
    windowLabel: "last 60 days",
    dayCount: 60,
  },
  last_90_days: {
    windowLabel: "last 90 days",
    dayCount: 90,
  },
  last_180_days: {
    windowLabel: "last 180 days",
    dayCount: 180,
  },
  last_365_days: {
    windowLabel: "last 365 days",
    dayCount: 365,
  },
}

const listCandidateSkus = (variants: Array<{ sku?: string | null }>) =>
  variants.map(variant => variant?.sku?.trim()).filter((value): value is string => Boolean(value))

const formatVariantChoice = (variant: ShopifyResolvedVariant) => {
  const sku = variant?.sku?.trim() || "no-sku"
  const title = variant?.product?.title?.trim() || variant?.displayName?.trim() || sku
  return `${sku} (${title})`
}

const scoreVariantCandidate = (variant: ShopifyResolvedVariant, requestedValue: string) => {
  const normalizedRequestedValue = normalizeSku(requestedValue)
  const requestedValueTrimmed = requestedValue.trim().toLowerCase()
  const requestedTokens = tokenizeSearchTerms(requestedValue)
  const sku = variant?.sku?.trim() ?? ""
  const title = variant?.product?.title?.trim() ?? variant?.displayName?.trim() ?? ""
  const normalizedSku = sku ? normalizeSku(sku) : ""
  const normalizedTitle = title ? normalizeSku(title) : ""
  const titleTokens = tokenizeSearchTerms(title)
  const matchedTitleTokens = requestedTokens.filter(token => titleTokens.includes(token))

  if (sku && sku === requestedValue) {
    return 100
  }
  if (normalizedSku && normalizedSku === normalizedRequestedValue) {
    return 90
  }
  if (title && title.toLowerCase() === requestedValueTrimmed) {
    return 88
  }
  if (normalizedTitle && normalizedTitle === normalizedRequestedValue) {
    return 70
  }
  if (
    requestedTokens.length > 1 &&
    matchedTitleTokens.length === requestedTokens.length &&
    requestedTokens.every(token => titleTokens.includes(token))
  ) {
    return titleTokens.join(" ").includes(requestedTokens.join(" ")) ? 68 : 66
  }
  if (requestedTokens.length > 0 && matchedTitleTokens.length === requestedTokens.length) {
    return 64
  }
  if (
    normalizedTitle &&
    normalizedRequestedValue &&
    normalizedTitle.startsWith(normalizedRequestedValue)
  ) {
    return 60
  }
  if (
    normalizedTitle &&
    normalizedRequestedValue &&
    normalizedTitle.includes(normalizedRequestedValue)
  ) {
    return 50
  }
  return 0
}

const getCandidateMatchKind = (score: number): ShopifyCandidateMatchKind | null => {
  if (score >= 90) {
    return "sku_exact"
  }
  if (score === 88 || score === 70) {
    return "title_exact"
  }
  if (score === 68 || score === 66 || score === 64 || score === 60 || score === 50) {
    return "title_fuzzy"
  }
  return null
}

const getVariantKey = (variant: ShopifyResolvedVariant) =>
  variant?.id?.trim() ||
  `${variant?.sku?.trim() ?? ""}:${variant?.product?.id?.trim() ?? ""}:${variant?.product?.title?.trim() ?? variant?.displayName?.trim() ?? ""}`

const getProductKey = (variant: ShopifyResolvedVariant) =>
  variant?.product?.id?.trim() ||
  variant?.product?.title?.trim() ||
  variant?.displayName?.trim() ||
  variant?.sku?.trim() ||
  variant?.id?.trim() ||
  "unknown-product"

const dedupeCandidates = (candidates: ShopifyResolvedCandidate[]) => {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    const key = getVariantKey(candidate.variant)
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

const dedupeProductChoices = (
  candidates: Array<{ productKey: string; variant: ShopifyResolvedVariant }>,
) => [...new Map(candidates.map(candidate => [candidate.productKey, candidate.variant])).values()]

const formatChoiceList = (variants: ShopifyResolvedVariant[]) =>
  variants
    .slice(0, SHOPIFY_MATCH_CHOICE_LIMIT)
    .map(variant => formatVariantChoice(variant))
    .join(", ")

const runInBatches = async <TInput, TOutput>(
  items: TInput[],
  batchSize: number,
  worker: (item: TInput) => Promise<TOutput>,
) => {
  const results: TOutput[] = []

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize)
    results.push(...(await Promise.all(batch.map(item => worker(item)))))
  }

  return results
}

const coerceShopTimeZone = (value: string | null | undefined) =>
  value?.trim() || DEFAULT_PLUGIN_CONFIG.timeZone

const fetchShopifyShopMetadata = async (client: ShopifyGraphQLClient) => {
  const result = await client.request<{
    shop?: { name?: string; currencyCode?: string; ianaTimezone?: string | null }
  }>(SHOPIFY_SHOP_QUERY)

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  return result.data?.shop ?? null
}

const getTimeZoneParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat(DEFAULT_PLUGIN_CONFIG.locale, {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const parts = formatter.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value ?? "0")

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  }
}

const getTimeZoneOffsetMs = (date: Date, timeZone: string) => {
  const parts = getTimeZoneParts(date, timeZone)
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return zonedAsUtc - date.getTime()
}

const getUtcForTimeZoneMidnight = (timeZone: string, year: number, month: number, day: number) => {
  const approximateUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const offsetMs = getTimeZoneOffsetMs(approximateUtc, timeZone)
  return new Date(approximateUtc.getTime() - offsetMs)
}

const shiftLocalDate = (year: number, month: number, day: number, deltaDays: number) => {
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays, 0, 0, 0))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

export const resolveStoreOverviewWindow = (
  rangePreset: StoreOverviewRangePreset,
  timeZone: string,
  now = new Date(),
): StoreOverviewWindow => {
  const today = getTimeZoneParts(now, timeZone)
  const todayStart = getUtcForTimeZoneMidnight(timeZone, today.year, today.month, today.day)
  const tomorrow = shiftLocalDate(today.year, today.month, today.day, 1)
  const tomorrowStart = getUtcForTimeZoneMidnight(
    timeZone,
    tomorrow.year,
    tomorrow.month,
    tomorrow.day,
  )

  if (rangePreset === "today") {
    return {
      windowLabel: "today",
      start: todayStart.toISOString(),
      end: tomorrowStart.toISOString(),
      dayCount: 1,
    }
  }

  if (rangePreset === "yesterday") {
    const yesterday = shiftLocalDate(today.year, today.month, today.day, -1)
    return {
      windowLabel: "yesterday",
      start: getUtcForTimeZoneMidnight(
        timeZone,
        yesterday.year,
        yesterday.month,
        yesterday.day,
      ).toISOString(),
      end: todayStart.toISOString(),
      dayCount: 1,
    }
  }

  const rollingWindow = STORE_OVERVIEW_ROLLING_WINDOW_CONFIG[rangePreset]
  const startDate = shiftLocalDate(today.year, today.month, today.day, 1 - rollingWindow.dayCount)

  return {
    windowLabel: rollingWindow.windowLabel,
    start: getUtcForTimeZoneMidnight(
      timeZone,
      startDate.year,
      startDate.month,
      startDate.day,
    ).toISOString(),
    end: tomorrowStart.toISOString(),
    dayCount: rollingWindow.dayCount,
  }
}

const parseIsoDate = (input: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim())
  if (!match) {
    return null
  }
  const [, year, month, day] = match
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  }
}

const resolveCustomStoreOverviewWindow = (startDate: string, endDate: string, timeZone: string) => {
  const start = parseIsoDate(startDate)
  const end = parseIsoDate(endDate)
  if (!start || !end) {
    throw new Error('Custom store overview dates must use "YYYY-MM-DD".')
  }

  const startUtc = getUtcForTimeZoneMidnight(timeZone, start.year, start.month, start.day)
  const exclusiveEndDate = shiftLocalDate(end.year, end.month, end.day, 1)
  const endUtc = getUtcForTimeZoneMidnight(
    timeZone,
    exclusiveEndDate.year,
    exclusiveEndDate.month,
    exclusiveEndDate.day,
  )

  if (endUtc.getTime() <= startUtc.getTime()) {
    throw new Error("Custom store overview endDate must be on or after startDate.")
  }

  const dayCount = Math.round((endUtc.getTime() - startUtc.getTime()) / 86400000)
  return {
    windowLabel: `${startDate.trim()} to ${endDate.trim()}`,
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
    dayCount,
  }
}

const fetchAllShopifyOrders = async (client: ShopifyGraphQLClient, ordersQuery: string) => {
  const orders: NonNullable<NonNullable<ShopifyOrdersPage["orders"]>["nodes"]> = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result: ShopifyGraphQLResponse<ShopifyOrdersPage> =
      await client.request<ShopifyOrdersPage>(SHOPIFY_ORDERS_PAGE_QUERY, {
        variables: {
          ordersQuery,
          after,
        },
      })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page: ShopifyOrdersPage["orders"] | undefined = result.data?.orders
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

const summarizeShopifyOrders = (
  orders: NonNullable<NonNullable<ShopifyOrdersPage["orders"]>["nodes"]>,
  window: { start: string; end: string },
) => {
  const startMs = Date.parse(window.start)
  const endMs = Date.parse(window.end)
  const ordersInWindow = orders.filter(order => {
    const createdAt = order?.createdAt
    if (!createdAt) {
      return false
    }
    const createdAtMs = Date.parse(createdAt)
    return Number.isFinite(createdAtMs) && createdAtMs >= startMs && createdAtMs < endMs
  })

  return {
    ordersCount: ordersInWindow.length,
    unitsSold: sum(ordersInWindow.map(order => toNumber(order?.currentSubtotalLineItemsQuantity))),
    revenue: sum(
      ordersInWindow.map(order =>
        toNumber(
          order?.currentTotalPriceSet?.shopMoney?.amount
            ? Number(order.currentTotalPriceSet.shopMoney.amount)
            : 0,
        ),
      ),
    ),
  }
}

const fetchAllShopifyInventoryUnits = async (client: ShopifyGraphQLClient) => {
  let inventoryUnits = 0
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result: ShopifyGraphQLResponse<ShopifyVariantsPage> =
      await client.request<ShopifyVariantsPage>(SHOPIFY_VARIANTS_PAGE_QUERY, {
        variables: {
          after,
        },
      })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page: ShopifyVariantsPage["productVariants"] | undefined = result.data?.productVariants
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

const fetchAllProductVariants = async (
  client: ShopifyGraphQLClient,
  product: ShopifyProductByTitle,
): Promise<ShopifyProductWithVariants> => {
  const productId = product?.id?.trim()
  if (!productId) {
    return {
      ...product,
      variants: { nodes: [] },
    }
  }

  const variants: ShopifyProductVariantNode[] = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result: ShopifyGraphQLResponse<ShopifyProductVariantsPage> =
      await client.request<ShopifyProductVariantsPage>(SHOPIFY_PRODUCT_VARIANTS_PAGE_QUERY, {
        variables: {
          productId,
          after,
        },
      })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page: NonNullable<ShopifyProductVariantsPage["product"]>["variants"] | undefined =
      result.data?.product?.variants
    variants.push(...toArray<ShopifyProductVariantNode>(page?.nodes))
    hasNextPage = Boolean(page?.pageInfo?.hasNextPage)
    after = page?.pageInfo?.endCursor ?? null
  }

  return {
    ...product,
    variants: { nodes: variants },
  }
}

const fetchAllSkuCandidates = async (client: ShopifyGraphQLClient, requestedValue: string) => {
  const skuQuery = `sku:${JSON.stringify(requestedValue)}`
  const skuVariants: NonNullable<
    NonNullable<ShopifyVariantLookupPage["productVariants"]>["nodes"]
  > = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result: ShopifyGraphQLResponse<ShopifyVariantLookupPage> =
      await client.request<ShopifyVariantLookupPage>(SHOPIFY_VARIANT_BY_SKU_QUERY, {
        variables: {
          skuQuery,
          after,
        },
      })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page: ShopifyVariantLookupPage["productVariants"] | undefined =
      result.data?.productVariants
    skuVariants.push(
      ...toArray<
        NonNullable<NonNullable<ShopifyVariantLookupPage["productVariants"]>["nodes"]>[number]
      >(page?.nodes),
    )
    hasNextPage = Boolean(page?.pageInfo?.hasNextPage)
    after = page?.pageInfo?.endCursor ?? null
  }

  return skuVariants
}

const fetchAllProductSearchResults = async (client: ShopifyGraphQLClient, titleQuery: string) => {
  const products: ShopifyProductByTitle[] = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage && products.length < SHOPIFY_TITLE_SEARCH_LIMIT) {
    const result: ShopifyGraphQLResponse<ShopifyProductsByTitlePage> =
      await client.request<ShopifyProductsByTitlePage>(SHOPIFY_PRODUCTS_BY_TITLE_QUERY, {
        variables: {
          titleQuery,
          after,
        },
      })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page: ShopifyProductsByTitlePage["products"] | undefined = result.data?.products
    products.push(...toArray<ShopifyProductByTitle>(page?.nodes))
    hasNextPage =
      Boolean(page?.pageInfo?.hasNextPage) && products.length < SHOPIFY_TITLE_SEARCH_LIMIT
    after = page?.pageInfo?.endCursor ?? null
  }

  return products.slice(0, SHOPIFY_TITLE_SEARCH_LIMIT)
}

const buildTitleKeywordQuery = (requestedValue: string) => {
  const tokens = tokenizeSearchTerms(requestedValue)

  if (tokens.length === 0) {
    return ""
  }

  return tokens.map(token => `title:${JSON.stringify(token)}`).join(" ")
}

const fetchAllTitleProducts = async (client: ShopifyGraphQLClient, requestedValue: string) => {
  const trimmedValue = requestedValue.trim()
  if (!trimmedValue) {
    return []
  }

  const exactTitleQuery = `title:${JSON.stringify(trimmedValue)}`
  const keywordTitleQuery = buildTitleKeywordQuery(trimmedValue)
  const queryStrings = unique(
    [exactTitleQuery, keywordTitleQuery].filter((value): value is string => Boolean(value)),
  )

  const products: ShopifyProductByTitle[] = []
  for (const queryString of queryStrings) {
    const queryProducts = await fetchAllProductSearchResults(client, queryString)
    products.push(...queryProducts)
    if (products.length >= SHOPIFY_TITLE_SEARCH_LIMIT) {
      break
    }
  }

  return [
    ...new Map(
      products.map(product => [product?.id?.trim() || product?.title?.trim() || "", product]),
    ).values(),
  ]
    .filter(product => Boolean(product?.id?.trim() || product?.title?.trim()))
    .slice(0, SHOPIFY_TITLE_SEARCH_LIMIT)
}

const collectTitleCandidates = async (client: ShopifyGraphQLClient, title: string) => {
  const skuVariants = await fetchAllSkuCandidates(client, title)
  const titleProducts = await fetchAllTitleProducts(client, title)
  const products = await runInBatches(titleProducts, SHOPIFY_VARIANT_FETCH_BATCH_SIZE, product =>
    fetchAllProductVariants(client, product),
  )

  const titleVariants = products.flatMap(product =>
    toArray<ShopifyProductVariantNode>(product?.variants?.nodes).map(variant => ({
      variant,
      productKey: product?.id?.trim() || product?.title?.trim() || getProductKey(variant),
    })),
  )

  return dedupeCandidates([
    ...skuVariants.map(variant => ({
      variant,
      productKey: getProductKey(variant),
    })),
    ...titleVariants,
  ])
}

const resolveShopifyVariantSelection = async (
  client: ShopifyGraphQLClient,
  requestedValue: string,
): Promise<FlowResolution<ShopifyVariantSelection>> => {
  const candidates = await collectTitleCandidates(client, requestedValue)
  if (candidates.length === 0) {
    return needsInput(
      `Ask the user to confirm the exact SKU or full product title for "${requestedValue}". No matching Shopify product was found.`,
    )
  }

  const scoredCandidates = candidates
    .map(candidate => {
      const score = scoreVariantCandidate(candidate.variant, requestedValue)
      return {
        ...candidate,
        score,
        matchKind: getCandidateMatchKind(score),
      }
    })
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score)

  if (scoredCandidates.length === 0) {
    return needsInput(
      `Ask the user to confirm the exact SKU or full product title for "${requestedValue}". No matching Shopify product was found.`,
    )
  }

  const bestScore = scoredCandidates[0].score
  const bestCandidates = scoredCandidates.filter(candidate => candidate.score === bestScore)
  const bestMatchKind = getCandidateMatchKind(bestScore)
  const distinctProductKeys = [...new Set(bestCandidates.map(candidate => candidate.productKey))]

  if (bestMatchKind === "title_fuzzy" && distinctProductKeys.length > 1) {
    const productChoices = dedupeProductChoices(bestCandidates)
    return needsInput(
      `Ask the user to choose one exact SKU or full product title for "${requestedValue}": ${formatChoiceList(productChoices)}.`,
    )
  }

  if (distinctProductKeys.length > 1) {
    const productChoices = dedupeProductChoices(bestCandidates)
    return needsInput(
      `Ask the user to choose one exact SKU or full product title for "${requestedValue}": ${formatChoiceList(productChoices)}.`,
    )
  }

  const resolvedProductKey = distinctProductKeys[0]
  const winningCandidate = bestCandidates[0]
  const isSkuMatch = bestMatchKind === "sku_exact"

  if (isSkuMatch && bestCandidates.length > 1) {
    return needsInput(
      `Ask the user to choose one exact SKU for "${requestedValue}": ${formatChoiceList(bestCandidates.map(candidate => candidate.variant))}.`,
    )
  }

  const resolvedVariants = isSkuMatch
    ? [winningCandidate.variant]
    : candidates
        .filter(candidate => candidate.productKey === resolvedProductKey)
        .map(candidate => candidate.variant)
  const resolvedSkus = [...new Set(listCandidateSkus(resolvedVariants))]
  const matchNames = [
    ...new Set(
      resolvedVariants
        .flatMap(variant => [variant?.product?.title?.trim(), variant?.displayName?.trim()])
        .filter((value): value is string => Boolean(value)),
    ),
  ]

  return ready({
    variants: resolvedVariants,
    resolvedSku: resolvedSkus.length === 1 ? resolvedSkus[0] : requestedValue,
    resolvedSkus: resolvedSkus.length > 0 ? resolvedSkus : [requestedValue],
    matchNames,
  })
}

const fetchShopifyDailySalesBySku = async (
  client: ShopifyGraphQLClient,
  selection: Pick<ShopifyVariantSelection, "resolvedSkus" | "matchNames">,
  lookbackDays: number,
) => {
  const normalizedRequestedSkus = new Set(
    selection.resolvedSkus.map(value => normalizeSku(value)).filter(Boolean),
  )
  const normalizedMatchNames = selection.matchNames
    .map(value => normalizeSku(value))
    .filter(Boolean)
  const range = getDateRange(lookbackDays, 0)
  const ordersQuery = `created_at:>=${range.start} created_at:<${range.end} financial_status:paid`
  let hasNextPage = true
  let after: string | null = null
  let unitsSold = 0

  const matchesLineItem = (line: { sku?: string | null; name?: string | null }) => {
    const normalizedLineSku = line?.sku ? normalizeSku(line.sku) : ""
    if (normalizedLineSku && normalizedRequestedSkus.has(normalizedLineSku)) {
      return true
    }

    const normalizedLineName = line?.name ? normalizeSku(line.name) : ""
    if (!normalizedLineName) {
      return false
    }

    return normalizedMatchNames.some(candidateName => normalizedLineName === candidateName)
  }

  while (hasNextPage) {
    const result: ShopifyGraphQLResponse<ShopifyOrdersWithLineItemsPage> =
      await client.request<ShopifyOrdersWithLineItemsPage>(
        SHOPIFY_ORDERS_WITH_LINE_ITEMS_PAGE_QUERY,
        {
          variables: {
            ordersQuery,
            after,
          },
        },
      )

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page: ShopifyOrdersWithLineItemsPage["orders"] | undefined = result.data?.orders
    const orders = toArray<ShopifyOrderWithLineItems>(page?.nodes)

    for (const order of orders) {
      const initialLineItems = order?.lineItems
      const initialOrderLineItems = toArray<ShopifyInitialOrderLineItem>(initialLineItems?.nodes)
      unitsSold += sum(
        initialOrderLineItems.filter(matchesLineItem).map(line => toNumber(line?.quantity)),
      )

      let hasMoreLineItems = Boolean(initialLineItems?.pageInfo?.hasNextPage)
      let lineItemsAfter = initialLineItems?.pageInfo?.endCursor ?? null
      const orderId = order?.id?.trim()

      while (hasMoreLineItems && orderId) {
        const lineItemsResult = await client.request<ShopifyOrderLineItemsPage>(
          SHOPIFY_ORDER_LINE_ITEMS_PAGE_QUERY,
          {
            variables: {
              orderId,
              after: lineItemsAfter,
            },
          },
        )

        if (lineItemsResult.errors) {
          throw new Error(formatShopifyErrors(lineItemsResult.errors))
        }

        const lineItemsPage = lineItemsResult.data?.order?.lineItems
        const pagedLineItems = toArray<ShopifyPaginatedOrderLineItem>(lineItemsPage?.nodes)
        unitsSold += sum(
          pagedLineItems.filter(matchesLineItem).map(line => toNumber(line?.quantity)),
        )

        hasMoreLineItems = Boolean(lineItemsPage?.pageInfo?.hasNextPage)
        lineItemsAfter = lineItemsPage?.pageInfo?.endCursor ?? null
      }
    }

    hasNextPage = Boolean(page?.pageInfo?.hasNextPage)
    after = page?.pageInfo?.endCursor ?? null
  }

  return unitsSold / lookbackDays
}

const summarizeShopifyVariantPricing = (variants: ShopifyResolvedVariant[]) => {
  const pricedVariants = variants.filter(variant => toNumber(Number(variant?.price), 0) > 0)
  const averageUnitPrice =
    pricedVariants.length > 0
      ? sum(pricedVariants.map(variant => Number(variant?.price ?? 0))) / pricedVariants.length
      : 0
  const costAmounts = pricedVariants.map(variant => {
    const unitCost = variant?.inventoryItem?.unitCost?.amount
    const parsedUnitCost = unitCost ? Number(unitCost) : Number.NaN
    return Number.isFinite(parsedUnitCost) && parsedUnitCost > 0 ? parsedUnitCost : null
  })
  const hasCompleteCostCoverage =
    pricedVariants.length > 0 && costAmounts.every((value): value is number => value !== null)
  const averageUnitCost =
    hasCompleteCostCoverage && costAmounts.length > 0 ? sum(costAmounts) / costAmounts.length : null
  const currentMarginPct =
    averageUnitPrice > 0 && averageUnitCost !== null
      ? ((averageUnitPrice - averageUnitCost) / averageUnitPrice) * 100
      : null

  return {
    averageUnitPrice,
    averageUnitCost,
    currentMarginPct,
  }
}

/** Loads a Shopify store overview with sales and optional inventory totals for a time window. */
export const loadShopifyStoreOverview = async (
  store: ShopifyStoreConfig,
  options: {
    rangePreset?: StoreOverviewRangePreset
    startDate?: string
    endDate?: string
    includeInventory?: boolean
  },
): Promise<ShopifyStoreOverviewSnapshot> => {
  const client = await createShopifyClient(store)
  const [shopResult, inventoryUnits] = await Promise.all([
    client.request<{
      shop?: { name?: string; currencyCode?: string; ianaTimezone?: string | null }
    }>(SHOPIFY_SHOP_QUERY),
    options.includeInventory === false
      ? Promise.resolve<number | undefined>(undefined)
      : fetchAllShopifyInventoryUnits(client),
  ])

  if (shopResult.errors) {
    throw new Error(formatShopifyErrors(shopResult.errors))
  }

  const shop = shopResult.data?.shop
  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const window =
    options.startDate && options.endDate
      ? resolveCustomStoreOverviewWindow(options.startDate, options.endDate, timeZone)
      : resolveStoreOverviewWindow(options.rangePreset ?? "today", timeZone)
  const ordersQuery = `created_at:>=${window.start} created_at:<${window.end} financial_status:paid`
  const orders = await fetchAllShopifyOrders(client, ordersQuery)
  const revenue = sum(
    orders.map(order =>
      toNumber(
        order?.currentTotalPriceSet?.shopMoney?.amount
          ? Number(order.currentTotalPriceSet.shopMoney.amount)
          : 0,
      ),
    ),
  )
  const unitsSold = sum(orders.map(order => toNumber(order?.currentSubtotalLineItemsQuantity)))
  const averageDailyUnits = window.dayCount > 1 ? unitsSold / window.dayCount : undefined
  const inventoryDaysLeft =
    typeof inventoryUnits === "number" && averageDailyUnits && averageDailyUnits > 0
      ? inventoryUnits / averageDailyUnits
      : undefined
  const retrievedAtIso = new Date().toISOString()

  return {
    source: "shopify",
    retrievedAtIso,
    storeName: shop?.name ?? store.name,
    timezone: timeZone,
    currencyCode:
      shop?.currencyCode ??
      orders[0]?.currentTotalPriceSet?.shopMoney?.currencyCode ??
      DEFAULT_PLUGIN_CONFIG.currency,
    windowLabel: window.windowLabel,
    ordersCount: orders.length,
    unitsSold,
    revenue,
    inventoryUnits,
    averageDailyUnits,
    inventoryDaysLeft,
  }
}

/** Loads a Shopify store sales summary across multiple standard windows using one order crawl. */
export const loadShopifyStoreSalesSummary = async (
  store: ShopifyStoreConfig,
  options: {
    windows: StoreOverviewRangePreset[]
    includeInventory?: boolean
  },
): Promise<ShopifyStoreSalesSummarySnapshot> => {
  const client = await createShopifyClient(store)
  const shop = await fetchShopifyShopMetadata(client)
  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const now = new Date()
  const windows = options.windows.map(rangePreset => ({
    rangePreset,
    ...resolveStoreOverviewWindow(rangePreset, timeZone, now),
  }))
  const widestWindow = windows.reduce((widest, candidate) =>
    candidate.dayCount > widest.dayCount ? candidate : widest,
  )
  const aggregateStart = windows.reduce(
    (earliest, candidate) => (candidate.start < earliest ? candidate.start : earliest),
    windows[0].start,
  )
  const aggregateEnd = windows.reduce(
    (latest, candidate) => (candidate.end > latest ? candidate.end : latest),
    windows[0].end,
  )
  const ordersQuery = `created_at:>=${aggregateStart} created_at:<${aggregateEnd} financial_status:paid`
  const orders = await fetchAllShopifyOrders(client, ordersQuery)
  let inventoryUnits: number | undefined
  let inventoryErrorMessage: string | undefined

  if (options.includeInventory !== false) {
    try {
      inventoryUnits = await fetchAllShopifyInventoryUnits(client)
    } catch (error) {
      inventoryUnits = undefined
      inventoryErrorMessage =
        error instanceof Error ? error.message : "Failed to load Shopify inventory totals."
    }
  }

  const currencyCode =
    shop?.currencyCode ??
    orders[0]?.currentTotalPriceSet?.shopMoney?.currencyCode ??
    DEFAULT_PLUGIN_CONFIG.currency
  const summaryWindows = windows.map(window => {
    const summary = summarizeShopifyOrders(orders, window)
    return {
      rangePreset: window.rangePreset,
      windowLabel: window.windowLabel,
      ordersCount: summary.ordersCount,
      unitsSold: summary.unitsSold,
      revenue: summary.revenue,
    }
  })
  const widestWindowSummary = summaryWindows.find(
    window => window.rangePreset === widestWindow.rangePreset,
  )
  const averageDailyUnits =
    widestWindowSummary && widestWindow.dayCount > 1
      ? widestWindowSummary.unitsSold / widestWindow.dayCount
      : undefined
  const inventoryDaysLeft =
    typeof inventoryUnits === "number" && averageDailyUnits && averageDailyUnits > 0
      ? inventoryUnits / averageDailyUnits
      : undefined

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: timeZone,
    currencyCode,
    windows: summaryWindows,
    inventoryUnits,
    inventoryDaysLeft,
    inventoryErrorMessage,
  }
}

/** Resolves a product and recent sales using an existing Shopify client. */
export const loadShopifySalesSnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  productRef: string,
  lookbackDays: number,
  locale: string,
): Promise<FlowResolution<ShopifySalesSnapshot>> => {
  const selection = await resolveShopifyVariantSelection(client, productRef)
  if (selection.kind !== "ready") {
    return selection
  }
  const shop = await fetchShopifyShopMetadata(client)
  const dailySalesUnits = await fetchShopifyDailySalesBySku(client, selection.value, lookbackDays)
  const firstVariant = selection.value.variants[0]
  const unitsSold = dailySalesUnits * lookbackDays
  const retrievedAtIso = new Date().toISOString()

  return ready({
    source: "shopify",
    retrievedAtIso,
    locale,
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    sku: selection.value.resolvedSku,
    productName:
      firstVariant?.product?.title ??
      firstVariant?.displayName ??
      firstVariant?.sku ??
      selection.value.resolvedSku,
    dailySalesUnits,
    lookbackDays,
    unitsSold,
  })
}

/** Resolves a product and recent sales by creating a Shopify client on demand. */
export const loadShopifySalesSnapshot = async (
  store: ShopifyStoreConfig,
  productRef: string,
  lookbackDays: number,
  locale: string,
): Promise<FlowResolution<ShopifySalesSnapshot>> => {
  const client = await createShopifyClient(store)
  return loadShopifySalesSnapshotFromClient(client, store, productRef, lookbackDays, locale)
}

/** Resolves a product and recent sales using an existing Shopify client. */
export const loadShopifyRestockSnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  sku: string,
  lookbackDays: number,
  locale: string,
): Promise<FlowResolution<ShopifyRestockSnapshot>> => {
  const [inventorySnapshot, salesSnapshot] = await Promise.all([
    loadShopifyInventorySnapshotFromClient(client, store, sku, locale),
    loadShopifySalesSnapshotFromClient(client, store, sku, lookbackDays, locale),
  ])
  if (inventorySnapshot.kind !== "ready") {
    return inventorySnapshot
  }
  if (salesSnapshot.kind !== "ready") {
    return salesSnapshot
  }

  return ready({
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    locale: salesSnapshot.value.locale,
    storeName: inventorySnapshot.value.storeName,
    timezone: inventorySnapshot.value.timezone,
    sku: salesSnapshot.value.sku,
    productName: salesSnapshot.value.productName,
    onHandUnits: inventorySnapshot.value.onHandUnits,
    dailySalesUnits: salesSnapshot.value.dailySalesUnits,
    lookbackDays: salesSnapshot.value.lookbackDays,
    unitsSold: salesSnapshot.value.unitsSold,
  })
}

/** Resolves current inventory for a product reference using an existing Shopify client. */
export const loadShopifyInventorySnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  productRef: string,
  locale: string,
): Promise<FlowResolution<ShopifyInventorySnapshot>> => {
  const selection = await resolveShopifyVariantSelection(client, productRef)
  if (selection.kind !== "ready") {
    return selection
  }
  const shop = await fetchShopifyShopMetadata(client)
  const variants = selection.value.variants
  const onHandUnits = sum(variants.map(variant => toNumber(variant?.inventoryQuantity)))
  const firstVariant = variants[0]
  const retrievedAtIso = new Date().toISOString()

  return ready({
    source: "shopify",
    retrievedAtIso,
    locale,
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    sku: selection.value.resolvedSku,
    productName:
      firstVariant?.product?.title ??
      firstVariant?.displayName ??
      firstVariant?.sku ??
      selection.value.resolvedSku,
    onHandUnits,
  })
}

/** Resolves current inventory for a product reference by creating a Shopify client on demand. */
export const loadShopifyInventorySnapshot = async (
  store: ShopifyStoreConfig,
  productRef: string,
  locale: string,
): Promise<FlowResolution<ShopifyInventorySnapshot>> => {
  const client = await createShopifyClient(store)
  return loadShopifyInventorySnapshotFromClient(client, store, productRef, locale)
}

/** Loads inventory and pricing details for a product reference using an existing Shopify client. */
export const loadShopifyProductSnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  productRef: string,
  locale: string,
): Promise<FlowResolution<ShopifyProductSnapshot>> => {
  const selection = await resolveShopifyVariantSelection(client, productRef)
  if (selection.kind !== "ready") {
    return selection
  }
  const variants = selection.value.variants
  const firstVariant = variants[0]
  const shop = await fetchShopifyShopMetadata(client)
  const retrievedAtIso = new Date().toISOString()

  return ready({
    source: "shopify",
    retrievedAtIso,
    locale,
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    sku: selection.value.resolvedSku,
    productName:
      firstVariant?.product?.title ??
      firstVariant?.displayName ??
      firstVariant?.sku ??
      selection.value.resolvedSku,
    onHandUnits: sum(variants.map(variant => toNumber(variant?.inventoryQuantity))),
    currencyCode: shop?.currencyCode ?? null,
    ...summarizeShopifyVariantPricing(variants),
  })
}

/** Resolves a product and recent sales by creating a Shopify client on demand. */
export const loadShopifyRestockSnapshot = async (
  store: ShopifyStoreConfig,
  sku: string,
  lookbackDays: number,
  locale: string,
): Promise<FlowResolution<ShopifyRestockSnapshot>> => {
  const client = await createShopifyClient(store)
  return loadShopifyRestockSnapshotFromClient(client, store, sku, lookbackDays, locale)
}

/** Loads campaign planning inputs from Shopify, including sales, inventory cover, and pricing. */
export const loadShopifyCampaignSnapshot = async (
  store: ShopifyStoreConfig,
  sku: string,
  lookbackDays: number,
  locale: string,
): Promise<FlowResolution<ShopifyCampaignSnapshot>> => {
  const client = await createShopifyClient(store)
  const snapshot = await loadShopifyRestockSnapshotFromClient(
    client,
    store,
    sku,
    lookbackDays,
    locale,
  )
  if (snapshot.kind !== "ready") {
    return snapshot
  }
  const productSnapshot = await loadShopifyProductSnapshotFromClient(
    client,
    store,
    snapshot.value.sku,
    locale,
  )
  if (productSnapshot.kind !== "ready") {
    return productSnapshot
  }
  const inventoryDaysLeft =
    snapshot.value.dailySalesUnits > 0
      ? snapshot.value.onHandUnits / snapshot.value.dailySalesUnits
      : 999

  return ready({
    ...snapshot.value,
    retrievedAtIso: new Date().toISOString(),
    currencyCode: productSnapshot.value.currencyCode,
    currentMarginPct: productSnapshot.value.currentMarginPct,
    inventoryDaysLeft,
    averageUnitPrice: productSnapshot.value.averageUnitPrice,
    averageUnitCost: productSnapshot.value.averageUnitCost,
  })
}

/** Computes reorder urgency and action guidance from inventory and demand inputs. */
export const evaluateRestockSignal = (input: {
  sku: string
  onHandUnits: number
  dailySalesUnits: number
  supplierLeadDays: number
  safetyStockDays: number
  source: string
  retrievedAtIso: string
  locale: string
  storeName: string
  timezone: string
  productName: string
  lookbackDays?: number
}): RestockSignal => {
  const dailySalesUnits = Math.max(input.dailySalesUnits, 0)
  const reorderPointUnits = (input.supplierLeadDays + input.safetyStockDays) * dailySalesUnits
  const daysLeft =
    dailySalesUnits > 0 ? input.onHandUnits / dailySalesUnits : Number.POSITIVE_INFINITY
  const urgency =
    dailySalesUnits <= 0
      ? "normal"
      : daysLeft <= input.supplierLeadDays
        ? "critical"
        : daysLeft <= input.supplierLeadDays + input.safetyStockDays
          ? "high"
          : "normal"

  const action =
    dailySalesUnits <= 0
      ? "Action: no recent sales were detected for this SKU, so verify demand before placing a replenishment order."
      : urgency === "critical"
        ? "Action: place a replenishment order now and throttle demand on this SKU."
        : urgency === "high"
          ? "Action: start replenishment this cycle and avoid discounting until inbound stock is confirmed."
          : "Action: inventory posture is acceptable; keep monitoring weekly."

  return {
    ...input,
    dailySalesUnits,
    reorderPointUnits,
    daysLeft,
    urgency,
    action,
  }
}
