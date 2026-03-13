import {
  SHOPIFY_LOCALES_QUERY,
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
import type { ShopifyStoreConfig } from "../config.js"
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

export type ShopifyHealthSnapshot = {
  source: "shopify"
  storeName: string
  periodLabel: string
  currencyCode: string
  timezone: string | null
  locale: string | null
  revenue: number
  previousRevenue: number
  visits: number
  previousVisits: number
  conversionRatePct: number
  previousConversionRatePct: number
  adSpend: number
  inventoryDaysLeft: number
  inventoryUnits: number
  unitsSold: number
  previousUnitsSold: number
  previousDailyUnits: number
}

export type ShopifyInventorySnapshot = {
  source: "shopify"
  storeName: string
  sku: string
  productName: string
  onHandUnits: number
}

export type ShopifyRestockSnapshot = ShopifyInventorySnapshot & {
  dailySalesUnits: number
  lookbackDays: number
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
  source?: string
  storeName?: string
  productName?: string
  lookbackDays?: number
  reorderPointUnits: number
  daysLeft: number
  urgency: "normal" | "high" | "critical"
  action: string
}

type ShopifyCandidateMatchKind = "sku_exact" | "title_exact" | "title_fuzzy"

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

export const loadShopifyHealthSnapshot = async (
  store: ShopifyStoreConfig,
): Promise<ShopifyHealthSnapshot> => {
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
  const localesResult = await client.request<{ shopLocales?: { nodes?: Array<unknown> } }>(
    SHOPIFY_LOCALES_QUERY,
  )
  if (!localesResult.errors) {
    const locales = toArray<{ locale?: string; primary?: boolean }>(
      localesResult.data?.shopLocales?.nodes,
    )
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

export const loadShopifyRestockSnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  sku: string,
  lookbackDays: number,
): Promise<FlowResolution<ShopifyRestockSnapshot>> => {
  const selection = await resolveShopifyVariantSelection(client, sku)
  if (selection.kind !== "ready") {
    return selection
  }
  const [variants, dailySalesUnits] = await Promise.all([
    Promise.resolve(selection.value.variants),
    fetchShopifyDailySalesBySku(client, selection.value, lookbackDays),
  ])

  const onHandUnits = sum(variants.map(variant => toNumber(variant?.inventoryQuantity)))
  const firstVariant = variants[0]

  return ready({
    source: "shopify",
    storeName: store.name,
    sku: selection.value.resolvedSku,
    productName:
      firstVariant?.product?.title ??
      firstVariant?.displayName ??
      firstVariant?.sku ??
      selection.value.resolvedSku,
    onHandUnits,
    dailySalesUnits,
    lookbackDays,
  })
}

export const loadShopifyInventorySnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  productRef: string,
): Promise<FlowResolution<ShopifyInventorySnapshot>> => {
  const selection = await resolveShopifyVariantSelection(client, productRef)
  if (selection.kind !== "ready") {
    return selection
  }
  const variants = selection.value.variants
  const onHandUnits = sum(variants.map(variant => toNumber(variant?.inventoryQuantity)))
  const firstVariant = variants[0]

  return ready({
    source: "shopify",
    storeName: store.name,
    sku: selection.value.resolvedSku,
    productName:
      firstVariant?.product?.title ??
      firstVariant?.displayName ??
      firstVariant?.sku ??
      selection.value.resolvedSku,
    onHandUnits,
  })
}

export const loadShopifyInventorySnapshot = async (
  store: ShopifyStoreConfig,
  productRef: string,
): Promise<FlowResolution<ShopifyInventorySnapshot>> => {
  const client = await createShopifyClient(store)
  return loadShopifyInventorySnapshotFromClient(client, store, productRef)
}

export const loadShopifyProductSnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  productRef: string,
): Promise<FlowResolution<ShopifyProductSnapshot>> => {
  const selection = await resolveShopifyVariantSelection(client, productRef)
  if (selection.kind !== "ready") {
    return selection
  }
  const variants = selection.value.variants
  const firstVariant = variants[0]
  const shopResult = await client.request<{
    shop?: { currencyCode?: string | null }
  }>(SHOPIFY_SHOP_QUERY)

  if (shopResult.errors) {
    throw new Error(formatShopifyErrors(shopResult.errors))
  }

  return ready({
    source: "shopify",
    storeName: store.name,
    sku: selection.value.resolvedSku,
    productName:
      firstVariant?.product?.title ??
      firstVariant?.displayName ??
      firstVariant?.sku ??
      selection.value.resolvedSku,
    onHandUnits: sum(variants.map(variant => toNumber(variant?.inventoryQuantity))),
    currencyCode: shopResult.data?.shop?.currencyCode ?? null,
    ...summarizeShopifyVariantPricing(variants),
  })
}

export const loadShopifyRestockSnapshot = async (
  store: ShopifyStoreConfig,
  sku: string,
  lookbackDays: number,
): Promise<FlowResolution<ShopifyRestockSnapshot>> => {
  const client = await createShopifyClient(store)
  return loadShopifyRestockSnapshotFromClient(client, store, sku, lookbackDays)
}

export const loadShopifyCampaignSnapshot = async (
  store: ShopifyStoreConfig,
  sku: string,
  lookbackDays: number,
): Promise<FlowResolution<ShopifyCampaignSnapshot>> => {
  const client = await createShopifyClient(store)
  const snapshot = await loadShopifyRestockSnapshotFromClient(client, store, sku, lookbackDays)
  if (snapshot.kind !== "ready") {
    return snapshot
  }
  const productSnapshot = await loadShopifyProductSnapshotFromClient(
    client,
    store,
    snapshot.value.sku,
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
    currencyCode: productSnapshot.value.currencyCode,
    currentMarginPct: productSnapshot.value.currentMarginPct,
    inventoryDaysLeft,
    averageUnitPrice: productSnapshot.value.averageUnitPrice,
    averageUnitCost: productSnapshot.value.averageUnitCost,
  })
}

export const evaluateRestockSignal = (input: {
  sku: string
  onHandUnits: number
  dailySalesUnits: number
  supplierLeadDays: number
  safetyStockDays: number
  source?: string
  storeName?: string
  productName?: string
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
