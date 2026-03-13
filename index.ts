import { createAdminApiClient } from "@shopify/admin-api-client"

declare const process: {
  env: Record<string, string | undefined>
}

const DEFAULT_CONFIG = {
  defaultCurrency: "USD",
  defaultLocale: "en-US",
  targetMarginFloorPct: 20,
  lowInventoryDays: 14,
  defaultSalesLookbackDays: 30,
  defaultResponseTone: "consultative",
}

const SHOPIFY_API_VERSION = "2026-01"
const SHOPIFY_TITLE_SEARCH_LIMIT = 50
const SHOPIFY_MATCH_CHOICE_LIMIT = 5
const SHOPIFY_VARIANT_FETCH_BATCH_SIZE = 5

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

const optionalNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const normalizeSku = (value: string) => value.trim().toLowerCase().replace(/[-_\s]+/g, "")
const unique = <T>(values: T[]) => [...new Set(values)]
const tokenizeSearchTerms = (value: string) =>
  unique(
    value
      .trim()
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map(token => token.trim())
      .filter(Boolean),
  )

const toPluginConfig = (api: any) => ({
  ...DEFAULT_CONFIG,
  ...(api?.pluginConfig ?? {}),
})

const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

const textResult = (text: string) => ({
  content: [{ type: "text", text }],
})

const requireNonNegativeNumber = (value: unknown, fieldName: string) => {
  const parsed = optionalNumber(value)
  if (parsed === null) {
    throw new Error(`Missing ${fieldName}. Ask the user to provide it.`)
  }
  if (parsed < 0) {
    throw new Error(`Invalid ${fieldName}: ${parsed}. Ask the user to correct it.`)
  }
  return parsed
}

const requirePositiveNumber = (value: unknown, fieldName: string) => {
  const parsed = optionalNumber(value)
  if (parsed === null) {
    throw new Error(`Missing ${fieldName}. Ask the user to provide it.`)
  }
  if (parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: ${parsed}. Ask the user to correct it.`)
  }
  return parsed
}

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

const SHOPIFY_VARIANT_BY_SKU_QUERY = `
  query SellerVariantBySku($skuQuery: String!, $after: String) {
    productVariants(first: 250, query: $skuQuery, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        sku
        displayName
        price
        inventoryQuantity
        inventoryItem {
          unitCost {
            amount
            currencyCode
          }
        }
        product {
          id
          title
        }
      }
    }
  }
`

const SHOPIFY_ORDERS_WITH_LINE_ITEMS_PAGE_QUERY = `
  query SellerOrdersWithLineItemsPage($ordersQuery: String!, $after: String) {
    orders(first: 250, after: $after, query: $ordersQuery, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        lineItems(first: 250) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            sku
            name
            quantity
          }
        }
      }
    }
  }
`

const SHOPIFY_ORDER_LINE_ITEMS_PAGE_QUERY = `
  query SellerOrderLineItemsPage($orderId: ID!, $after: String) {
    order(id: $orderId) {
      lineItems(first: 250, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          sku
          name
          quantity
        }
      }
    }
  }
`

const SHOPIFY_PRODUCTS_BY_TITLE_QUERY = `
  query SellerProductsByTitle($titleQuery: String!, $after: String) {
    products(first: 50, after: $after, query: $titleQuery, sortKey: RELEVANCE) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
      }
    }
  }
`

const SHOPIFY_PRODUCT_VARIANTS_PAGE_QUERY = `
  query SellerProductVariantsPage($productId: ID!, $after: String) {
    product(id: $productId) {
      variants(first: 250, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          sku
          displayName
          price
          inventoryQuantity
          inventoryItem {
            unitCost {
              amount
              currencyCode
            }
          }
          product {
            id
            title
          }
        }
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

type ShopifyVariantLookupPage = {
  productVariants?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      id?: string
      sku?: string | null
      displayName?: string | null
      price?: string | null
      inventoryQuantity?: number | null
      inventoryItem?: {
        unitCost?: {
          amount?: string | null
          currencyCode?: string | null
        } | null
      } | null
      product?: {
        id?: string | null
        title?: string | null
      }
    }>
  }
}

type ShopifyOrdersWithLineItemsPage = {
  orders?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      id?: string | null
      lineItems?: {
        pageInfo?: {
          hasNextPage?: boolean
          endCursor?: string | null
        }
        nodes?: Array<{
          sku?: string | null
          name?: string | null
          quantity?: number | null
        }>
      }
    }>
  }
}

type ShopifyOrderLineItemsPage = {
  order?: {
    lineItems?: {
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
      nodes?: Array<{
        sku?: string | null
        name?: string | null
        quantity?: number | null
      }>
    }
  }
}

type ShopifyProductsByTitlePage = {
  products?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      id?: string
      title?: string | null
    }>
  }
}

type ShopifyProductVariantsPage = {
  product?: {
    variants?: {
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
      nodes?: Array<{
        id?: string
        sku?: string | null
        displayName?: string | null
        price?: string | null
        inventoryQuantity?: number | null
        inventoryItem?: {
          unitCost?: {
            amount?: string | null
            currencyCode?: string | null
          } | null
        } | null
        product?: {
          id?: string | null
          title?: string | null
        }
      }>
    }
  }
}

type ShopifyProductByTitle = NonNullable<NonNullable<ShopifyProductsByTitlePage["products"]>["nodes"]>[number]

type ShopifyProductVariantNode = NonNullable<
  NonNullable<NonNullable<ShopifyProductVariantsPage["product"]>["variants"]>["nodes"]
>[number]

type ShopifyProductWithVariants = ShopifyProductByTitle & {
  variants?: {
    nodes?: ShopifyProductVariantNode[]
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

const listCandidateSkus = (variants: Array<{ sku?: string | null }>) =>
  variants
    .map(variant => variant?.sku?.trim())
    .filter((value): value is string => Boolean(value))

type ShopifyResolvedVariant =
  | NonNullable<NonNullable<ShopifyVariantLookupPage["productVariants"]>["nodes"]>[number]
  | ShopifyProductVariantNode

type ShopifyResolvedCandidate = {
  variant: ShopifyResolvedVariant
  productKey: string
}

type ShopifyCandidateMatchKind = "sku_exact" | "sku_partial" | "title_exact" | "title_fuzzy"

type ShopifyVariantSelection = {
  variants: ShopifyResolvedVariant[]
  resolvedSku: string
  resolvedSkus: string[]
  matchNames: string[]
}

type ShopifyOrderWithLineItems = NonNullable<
  NonNullable<ShopifyOrdersWithLineItemsPage["orders"]>["nodes"]
>[number]

type ShopifyInitialOrderLineItem = NonNullable<
  NonNullable<ShopifyOrderWithLineItems["lineItems"]>["nodes"]
>[number]

type ShopifyPaginatedOrderLineItem = NonNullable<
  NonNullable<NonNullable<ShopifyOrderLineItemsPage["order"]>["lineItems"]>["nodes"]
>[number]

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
  if (normalizedSku && normalizedRequestedValue && normalizedSku.startsWith(normalizedRequestedValue)) {
    return 85
  }
  if (normalizedSku && normalizedRequestedValue && normalizedSku.includes(normalizedRequestedValue)) {
    return 75
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
  if (normalizedTitle && normalizedRequestedValue && normalizedTitle.startsWith(normalizedRequestedValue)) {
    return 60
  }
  if (normalizedTitle && normalizedRequestedValue && normalizedTitle.includes(normalizedRequestedValue)) {
    return 50
  }
  return 0
}

const getCandidateMatchKind = (score: number): ShopifyCandidateMatchKind | null => {
  if (score >= 90) {
    return "sku_exact"
  }
  if (score === 85 || score === 75) {
    return "sku_partial"
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

const dedupeProductChoices = (candidates: Array<{ productKey: string; variant: ShopifyResolvedVariant }>) =>
  [...new Map(candidates.map(candidate => [candidate.productKey, candidate.variant])).values()]

const formatChoiceList = (variants: ShopifyResolvedVariant[]) =>
  variants.slice(0, SHOPIFY_MATCH_CHOICE_LIMIT).map(variant => formatVariantChoice(variant)).join(", ")

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
    const result = await client.request<ShopifyProductVariantsPage>(SHOPIFY_PRODUCT_VARIANTS_PAGE_QUERY, {
      variables: {
        productId,
        after,
      },
    })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.product?.variants
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
  const skuVariants: NonNullable<NonNullable<ShopifyVariantLookupPage["productVariants"]>["nodes"]> = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result = await client.request<ShopifyVariantLookupPage>(SHOPIFY_VARIANT_BY_SKU_QUERY, {
      variables: {
        skuQuery,
        after,
      },
    })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.productVariants
    skuVariants.push(
      ...toArray<NonNullable<NonNullable<ShopifyVariantLookupPage["productVariants"]>["nodes"]>[number]>(
        page?.nodes,
      ),
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
    const result = await client.request<ShopifyProductsByTitlePage>(SHOPIFY_PRODUCTS_BY_TITLE_QUERY, {
      variables: {
        titleQuery,
        after,
      },
    })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.products
    products.push(...toArray<ShopifyProductByTitle>(page?.nodes))
    hasNextPage = Boolean(page?.pageInfo?.hasNextPage) && products.length < SHOPIFY_TITLE_SEARCH_LIMIT
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

  return [...new Map(products.map(product => [product?.id?.trim() || product?.title?.trim() || "", product])).values()]
    .filter(product => Boolean(product?.id?.trim() || product?.title?.trim()))
    .slice(0, SHOPIFY_TITLE_SEARCH_LIMIT)
}

const collectTitleCandidates = async (client: ShopifyGraphQLClient, title: string) => {
  const skuVariants = await fetchAllSkuCandidates(client, title)
  const titleProducts = await fetchAllTitleProducts(client, title)
  const products = await runInBatches(
    titleProducts,
    SHOPIFY_VARIANT_FETCH_BATCH_SIZE,
    product => fetchAllProductVariants(client, product),
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
): Promise<ShopifyVariantSelection> => {
  const candidates = await collectTitleCandidates(client, requestedValue)
  if (candidates.length === 0) {
    throw new Error(`No Shopify product variant was found for "${requestedValue}".`)
  }

  const scoredCandidates = candidates
    .map(candidate => ({
      ...candidate,
      score: scoreVariantCandidate(candidate.variant, requestedValue),
      matchKind: getCandidateMatchKind(scoreVariantCandidate(candidate.variant, requestedValue)),
    }))
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score)

  if (scoredCandidates.length === 0) {
    throw new Error(
      `No Shopify SKU or product title match was found for "${requestedValue}". Ask the user to confirm the exact SKU or product title.`,
    )
  }

  const bestScore = scoredCandidates[0].score
  const bestCandidates = scoredCandidates.filter(candidate => candidate.score === bestScore)
  const bestMatchKind = getCandidateMatchKind(bestScore)
  const distinctProductKeys = [...new Set(bestCandidates.map(candidate => candidate.productKey))]
  const titleCandidates = scoredCandidates.filter(
    candidate =>
      (candidate.matchKind === "title_exact" || candidate.matchKind === "title_fuzzy") &&
      !bestCandidates.some(bestCandidate => bestCandidate.productKey === candidate.productKey),
  )

  if (bestMatchKind === "title_fuzzy" && distinctProductKeys.length > 1) {
    const productChoices = dedupeProductChoices(bestCandidates)
    throw new Error(
      `Related Shopify products matched "${requestedValue}". Ask the user to choose one exact SKU or full product title: ${formatChoiceList(productChoices)}.`,
    )
  }

  if (distinctProductKeys.length > 1) {
    const productChoices = dedupeProductChoices(bestCandidates)
    throw new Error(
      `Multiple Shopify products matched "${requestedValue}". Ask the user to choose one exact SKU or full product title: ${formatChoiceList(productChoices)}.`,
    )
  }

  const resolvedProductKey = distinctProductKeys[0]
  const winningCandidate = bestCandidates[0]
  const isSkuMatch = bestMatchKind === "sku_exact" || bestMatchKind === "sku_partial"

  if (bestMatchKind === "sku_partial" && titleCandidates.length > 0) {
    const productChoices = dedupeProductChoices([...bestCandidates, ...titleCandidates])
    throw new Error(
      `Multiple Shopify matches were found for "${requestedValue}". Ask the user to choose one exact SKU or full product title: ${formatChoiceList(productChoices)}.`,
    )
  }

  if (isSkuMatch && bestCandidates.length > 1) {
    throw new Error(
      `Multiple Shopify variants matched "${requestedValue}". Ask the user to choose one exact SKU: ${formatChoiceList(bestCandidates.map(candidate => candidate.variant))}.`,
    )
  }

  const resolvedVariants = isSkuMatch
    ? [winningCandidate.variant]
    : candidates
        .filter(candidate => candidate.productKey === resolvedProductKey)
        .map(candidate => candidate.variant)
  const resolvedSkus = [...new Set(listCandidateSkus(resolvedVariants))]
  const resolvedVariant = resolvedVariants[0]
  const matchNames = [
    ...new Set(
      resolvedVariants
        .flatMap(variant => [variant?.product?.title?.trim(), variant?.displayName?.trim()])
        .filter((value): value is string => Boolean(value)),
    ),
  ]

  return {
    variants: resolvedVariants,
    resolvedSku: resolvedSkus.length === 1 ? resolvedSkus[0] : requestedValue,
    resolvedSkus: resolvedSkus.length > 0 ? resolvedSkus : [requestedValue],
    matchNames,
  }
}

const fetchShopifyVariantBySku = async (client: ShopifyGraphQLClient, sku: string) => {
  return (await resolveShopifyVariantSelection(client, sku)).variants
}

const fetchShopifyDailySalesBySku = async (
  client: ShopifyGraphQLClient,
  selection: Pick<ShopifyVariantSelection, "resolvedSkus" | "matchNames">,
  lookbackDays: number,
) => {
  const normalizedRequestedSkus = new Set(
    selection.resolvedSkus.map(value => normalizeSku(value)).filter(Boolean),
  )
  const normalizedMatchNames = selection.matchNames.map(value => normalizeSku(value)).filter(Boolean)
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
    const result = await client.request<ShopifyOrdersWithLineItemsPage>(
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

    const page = result.data?.orders
    const orders = toArray<ShopifyOrderWithLineItems>(page?.nodes)

    for (const order of orders) {
      const initialLineItems = order?.lineItems
      const initialOrderLineItems = toArray<ShopifyInitialOrderLineItem>(initialLineItems?.nodes)
      unitsSold += sum(
        initialOrderLineItems
          .filter(matchesLineItem)
          .map(line => toNumber(line?.quantity)),
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
          pagedLineItems
            .filter(matchesLineItem)
            .map(line => toNumber(line?.quantity)),
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

const loadShopifyRestockSnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  sku: string,
  lookbackDays: number,
) => {
  const selection = await resolveShopifyVariantSelection(client, sku)
  const [variants, dailySalesUnits] = await Promise.all([
    Promise.resolve(selection.variants),
    fetchShopifyDailySalesBySku(client, selection, lookbackDays),
  ])

  const onHandUnits = sum(variants.map(variant => toNumber(variant?.inventoryQuantity)))
  const firstVariant = variants[0]

  return {
    source: "shopify",
    storeName: store.name,
    sku: selection.resolvedSku,
    productName:
      firstVariant?.product?.title ?? firstVariant?.displayName ?? firstVariant?.sku ?? selection.resolvedSku,
    onHandUnits,
    dailySalesUnits,
    lookbackDays,
  }
}

const loadShopifyInventorySnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  productRef: string,
) => {
  const selection = await resolveShopifyVariantSelection(client, productRef)
  const variants = selection.variants
  const onHandUnits = sum(variants.map(variant => toNumber(variant?.inventoryQuantity)))
  const firstVariant = variants[0]

  return {
    source: "shopify",
    storeName: store.name,
    sku: selection.resolvedSku,
    productName:
      firstVariant?.product?.title ??
      firstVariant?.displayName ??
      firstVariant?.sku ??
      selection.resolvedSku,
    onHandUnits,
  }
}

const loadShopifyInventorySnapshot = async (store: ShopifyStoreConfig, productRef: string) => {
  const client = await createShopifyClient(store)
  return loadShopifyInventorySnapshotFromClient(client, store, productRef)
}

const summarizeShopifyVariantPricing = (variants: ShopifyResolvedVariant[]) => {
  const pricedVariants = variants.filter(variant => toNumber(Number(variant?.price), 0) > 0)
  const averageUnitPrice =
    pricedVariants.length > 0
      ? sum(pricedVariants.map(variant => Number(variant?.price ?? 0))) / pricedVariants.length
      : 0
  const costAmounts = pricedVariants.map(variant => {
    const unitCost = variant?.inventoryItem?.unitCost?.amount
    const parsedUnitCost = unitCost ? Number(unitCost) : NaN
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

const loadShopifyProductSnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  productRef: string,
) => {
  const selection = await resolveShopifyVariantSelection(client, productRef)
  const variants = selection.variants
  const firstVariant = variants[0]
  const shopResult = await client.request<{
    shop?: { currencyCode?: string | null }
  }>(SHOPIFY_SHOP_QUERY)

  if (shopResult.errors) {
    throw new Error(formatShopifyErrors(shopResult.errors))
  }

  return {
    source: "shopify",
    storeName: store.name,
    sku: selection.resolvedSku,
    productName:
      firstVariant?.product?.title ?? firstVariant?.displayName ?? firstVariant?.sku ?? selection.resolvedSku,
    onHandUnits: sum(variants.map(variant => toNumber(variant?.inventoryQuantity))),
    currencyCode: shopResult.data?.shop?.currencyCode ?? null,
    ...summarizeShopifyVariantPricing(variants),
  }
}

const loadShopifyRestockSnapshot = async (
  store: ShopifyStoreConfig,
  sku: string,
  lookbackDays: number,
) => {
  const client = await createShopifyClient(store)
  return loadShopifyRestockSnapshotFromClient(client, store, sku, lookbackDays)
}

const loadShopifyCampaignSnapshot = async (
  store: ShopifyStoreConfig,
  sku: string,
  lookbackDays: number,
) => {
  const client = await createShopifyClient(store)
  const snapshot = await loadShopifyRestockSnapshotFromClient(client, store, sku, lookbackDays)
  const productSnapshot = await loadShopifyProductSnapshotFromClient(client, store, snapshot.sku)
  const inventoryDaysLeft =
    snapshot.dailySalesUnits > 0 ? snapshot.onHandUnits / snapshot.dailySalesUnits : 999

  return {
    ...snapshot,
    currencyCode: productSnapshot.currencyCode,
    currentMarginPct: productSnapshot.currentMarginPct,
    inventoryDaysLeft,
    averageUnitPrice: productSnapshot.averageUnitPrice,
    averageUnitCost: productSnapshot.averageUnitCost,
  }
}

const evaluateRestockSignal = (input: {
  sku: string
  onHandUnits: number
  dailySalesUnits: number
  supplierLeadDays: number
  safetyStockDays: number
  source?: string
  storeName?: string
  productName?: string
  lookbackDays?: number
}) => {
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

const formatRestockSignal = (input: ReturnType<typeof evaluateRestockSignal>) =>
  [
    input.source ? `Source: ${input.source}` : null,
    input.storeName ? `Store: ${input.storeName}` : null,
    input.productName ? `Product: ${input.productName}` : null,
    `SKU: ${input.sku}`,
    `On-hand units: ${Math.round(input.onHandUnits)}`,
    `Average daily sales: ${input.dailySalesUnits.toFixed(2)}`,
    Number.isFinite(input.daysLeft)
      ? `Days of cover: ${input.daysLeft.toFixed(1)}`
      : "Days of cover: n/a (no recent sales detected)",
    `Supplier lead time: ${input.supplierLeadDays} days`,
    `Safety stock: ${input.safetyStockDays} days`,
    `Reorder point: ${Math.ceil(input.reorderPointUnits)} units`,
    input.lookbackDays ? `Sales lookback: last ${input.lookbackDays} days` : null,
    `Urgency: ${input.urgency}`,
    "",
    input.action,
  ]
    .filter(Boolean)
    .join("\n")

const formatInventoryLookup = (input: {
  source?: string
  storeName?: string
  productName?: string
  sku: string
  onHandUnits: number
}) =>
  [
    input.source ? `Source: ${input.source}` : null,
    input.storeName ? `Store: ${input.storeName}` : null,
    input.productName ? `Product: ${input.productName}` : null,
    `SKU: ${input.sku}`,
    `On-hand units: ${Math.round(input.onHandUnits)}`,
  ]
    .filter(Boolean)
    .join("\n")

const campaignDiscountBand = (objective: string, margin: number) => {
  if (objective !== "clear_inventory") {
    return margin >= 30 ? "5%-10%" : "0%-8%"
  }

  if (margin >= 35) {
    return "12%-18%"
  }
  if (margin >= 25) {
    return "8%-12%"
  }
  return "5%-8%"
}

const formatObjectiveLabel = (objective: string) =>
  objective
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

const buildCampaignPlan = (input: {
  objective: string
  heroSku: string
  productName?: string
  currentMarginPct: number
  inventoryDaysLeft: number
  channel: string
  constraint?: string
  targetMarginFloorPct: number
  lowInventoryDays: number
  source?: string
  storeName?: string
  lookbackDays?: number
  currencyCode?: string | null
  averageUnitPrice?: number
  averageUnitCost?: number | null
}) => {
  const discountBand = campaignDiscountBand(input.objective, input.currentMarginPct)
  const marginBuffer = input.currentMarginPct - input.targetMarginFloorPct
  const inventoryPressure =
    input.inventoryDaysLeft <= input.lowInventoryDays
      ? "tight"
      : input.inventoryDaysLeft <= 30
        ? "moderate"
        : "comfortable"
  const stockPosture =
    inventoryPressure === "tight"
      ? `Stock posture: ${input.heroSku} is running tight on cover, so clearance should stay controlled until replenishment visibility is clear.`
      : inventoryPressure === "moderate"
        ? `Stock posture: ${input.heroSku} has enough cover for a controlled clearance push, but avoid broad discounting that drains stock too fast.`
        : `Stock posture: ${input.heroSku} has comfortable cover, so you can test clearance pressure without forcing an immediate deep discount.`

  const offerLines: Record<string, string[]> = {
    clear_inventory: [
      `Run a time-boxed offer for ${input.heroSku} with a planned discount band of ${discountBand}.`,
      "Set a hard stop date so the campaign feels finite rather than permanently discounted.",
      "Add a bundle or buy-more-save-more option to raise units per order without forcing the deepest price cut.",
    ],
    grow_revenue: [
      `Lead with a value-first offer on ${input.heroSku} and keep discounting in the ${discountBand} band.`,
      "Use bundle or threshold offers to lift AOV before widening spend.",
      "Protect margin by testing one offer at a time instead of stacking incentives.",
    ],
    launch_product: [
      `Anchor the launch around one clear promise for ${input.heroSku}, with an opening offer in the ${discountBand} band.`,
      "Sequence teaser, proof, and urgency rather than running one generic launch ad set.",
      "Keep traffic concentrated on one hero landing experience until the conversion story is proven.",
    ],
    recover_conversion: [
      `Use a light incentive in the ${discountBand} band only after fixing the offer and landing page for ${input.heroSku}.`,
      "Prioritize trust, proof, and checkout clarity before increasing spend.",
      "Run a simple A/B test between one proof-led angle and one urgency-led angle.",
    ],
  }

  const audienceLines: Record<string, string[]> = {
    clear_inventory: [
      "Prioritize retargeting: product viewers, add-to-cart users, and recent engaged visitors.",
      "Test a warm lookalike only after retargeting frequency and conversion are healthy.",
      "Exclude recent purchasers unless the offer is a bundle or repeat-buy use case.",
    ],
    grow_revenue: [
      "Split budget between proven warm audiences and one controlled prospecting segment.",
      "Build a repeat-purchase audience if the SKU has complementary accessories.",
      "Exclude low-intent traffic pools that have already absorbed spend without converting.",
    ],
    launch_product: [
      "Start with warm traffic and creator/proof audiences before scaling to broad acquisition.",
      "Use one narrow prospecting audience built around the clearest use case.",
      "Refresh exclusions weekly so launch spend does not keep chasing the same non-buyers.",
    ],
    recover_conversion: [
      "Keep spend on warm intent audiences until the PDP and offer stop leaking conversion.",
      "Use cart abandoners and high-time-on-site visitors as the primary recovery pool.",
      "Pause weak prospecting sets until the conversion baseline improves.",
    ],
  }

  const creativeLines: Record<string, string[]> = {
    clear_inventory: [
      "Lead with inventory urgency, offer clarity, and one practical usage angle.",
      "Show the product quickly and put the price or savings in the first frame.",
      "Prepare one static proof ad and one short-motion variant for Meta testing.",
    ],
    grow_revenue: [
      "Focus creative on value, outcomes, and what makes the SKU worth buying now.",
      "Use social proof and product detail before introducing any incentive.",
      "Match the landing page headline to the exact ad promise.",
    ],
    launch_product: [
      "Use one hero creative that explains the product in under 10 seconds.",
      "Support it with proof content such as demos, reviews, or creator endorsements.",
      "Keep the CTA consistent across ad, PDP, and checkout entry.",
    ],
    recover_conversion: [
      "Simplify messaging to one promise and one CTA per asset.",
      "Add trust builders: reviews, shipping clarity, and returns reassurance.",
      "Mirror the ad promise on the landing page to reduce drop-off.",
    ],
  }

  const budgetLines =
    input.objective === "clear_inventory"
      ? [
          "Start with roughly 70%-80% of spend on retargeting and existing demand capture.",
          "Keep prospecting to a small test budget until the clearance offer proves efficient.",
          "Increase budget only when inventory is moving and blended efficiency stays within target.",
        ]
      : [
          "Keep the first week budget concentrated on the highest-signal audience and one test lane.",
          "Avoid scaling more than one variable at a time across audience, offer, and creative.",
          "Move budget toward the best converting segment after each weekly review.",
        ]

  const guardrails = [
    marginBuffer < 0
      ? `Current margin is already below the configured floor by ${percentage(Math.abs(marginBuffer))}, so any discount should be narrow and conditional.`
      : `Current margin leaves roughly ${percentage(marginBuffer)} above the configured floor, which sets the discount room for testing.`,
    inventoryPressure === "tight"
      ? "Inventory cover is tight, so cap volume expansion and protect availability while inbound stock is uncertain."
      : inventoryPressure === "moderate"
        ? "Inventory cover is workable for a controlled push, but avoid broad discounting that empties stock too fast."
        : "Inventory cover is comfortable enough for measured testing, but still use a fixed stop date and weekly review.",
    input.constraint
      ? `Constraint: ${input.constraint}`
      : "Constraint: keep execution simple enough to review and adjust every week.",
  ]

  const kpis =
    input.objective === "clear_inventory"
      ? [
          "Units sold per day for the hero SKU",
          "Inventory days of cover after the first 7 days",
          "Blended ROAS or contribution efficiency",
          "Add-to-cart rate and checkout conversion on the campaign landing path",
        ]
      : [
          "Revenue per session on the campaign path",
          "Conversion rate by audience segment",
          "CAC or ROAS against the test threshold",
          "AOV movement if bundles or threshold offers are in play",
        ]

  return [
    input.source ? `Source: ${input.source}` : null,
    input.storeName ? `Store: ${input.storeName}` : null,
    `Objective: ${formatObjectiveLabel(input.objective)}`,
    `Hero SKU: ${input.heroSku}`,
    input.productName ? `Product: ${input.productName}` : null,
    `Primary channel: ${input.channel}`,
    typeof input.averageUnitPrice === "number" && input.averageUnitPrice > 0
      ? `Average unit price: ${currency(input.averageUnitPrice, input.currencyCode ?? DEFAULT_CONFIG.defaultCurrency, DEFAULT_CONFIG.defaultLocale)}`
      : null,
    typeof input.averageUnitCost === "number" && input.averageUnitCost > 0
      ? `Average unit cost: ${currency(input.averageUnitCost, input.currencyCode ?? DEFAULT_CONFIG.defaultCurrency, DEFAULT_CONFIG.defaultLocale)}`
      : null,
    input.lookbackDays ? `Sales lookback: last ${input.lookbackDays} days` : null,
    stockPosture,
    "",
    "Offer:",
    ...offerLines[input.objective].map(item => `- ${item}`),
    "",
    "Audience:",
    ...audienceLines[input.objective].map(item => `- ${item}`),
    "",
    "Creative:",
    ...creativeLines[input.objective].map(item => `- ${item}`),
    "",
    "Budget and pacing:",
    ...budgetLines.map(item => `- ${item}`),
    "",
    "Guardrails:",
    ...guardrails.map(item => `- ${item}`),
    "",
    "Weekly KPIs:",
    ...kpis.map(item => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n")
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
    name: "seller_inventory_lookup",
    description:
      "Look up current on-hand inventory for an exact SKU, a partial SKU, or product title keywords. Use this when the user asks how much inventory a product has. Try the tool before asking for an exact SKU. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm. This tool reads Shopify inventory only and does not require order access.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        storeId: {
          type: "string",
          description:
            "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
        },
        productRef: {
          type: "string",
          description:
            "Exact SKU, partial SKU, full product title, or product title keywords to search in Shopify before returning on-hand inventory.",
        },
      },
      required: ["productRef"],
    },
    async execute(_id: string, params: any) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "No configured store was found. Configure a store in plugins.entries.seller-assistant.config before running seller_inventory_lookup.",
        )
      }

      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_inventory_lookup is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const snapshot = await loadShopifyInventorySnapshot(configuredStore.store, params.productRef)
      return textResult(formatInventoryLookup(snapshot))
    },
  })

  api.registerTool({
    name: "seller_restock_signal",
    description:
      "Estimate restock urgency for an exact SKU, a partial SKU, or product title keywords. Try the tool before asking for an exact SKU. If inventory or sales inputs are omitted, load them from a configured Shopify store. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm. Only ask for supplierLeadDays or safetyStockDays if they are still missing after checking plugin config.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        storeId: {
          type: "string",
          description:
            "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
        },
        sku: {
          type: "string",
          description:
            "Exact SKU, partial SKU, full product title, or product title keywords to search in Shopify before calculating restock urgency.",
        },
        onHandUnits: { type: "number" },
        dailySalesUnits: { type: "number" },
        supplierLeadDays: { type: "number" },
        safetyStockDays: { type: "number" },
        salesLookbackDays: { type: "number" },
      },
      required: ["sku"],
    },
    async execute(_id: string, params: any) {
      const supplierLeadDays =
        optionalNumber(params.supplierLeadDays) ??
        optionalNumber(pluginConfig.defaultSupplierLeadDays)
      const safetyStockDays =
        optionalNumber(params.safetyStockDays) ??
        optionalNumber(pluginConfig.defaultSafetyStockDays)
      const salesLookbackDays = Math.max(
        1,
        Math.round(toNumber(params.salesLookbackDays, pluginConfig.defaultSalesLookbackDays)),
      )
      const hasManualInventory = typeof params.onHandUnits === "number"
      const hasManualSales = typeof params.dailySalesUnits === "number"
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)

      if (supplierLeadDays === null) {
        throw new Error(
          'Missing supplierLeadDays. Ask the user for supplier lead time in days, or configure "defaultSupplierLeadDays" in the plugin config.',
        )
      }
      if (supplierLeadDays <= 0) {
        throw new Error(
          `Invalid supplierLeadDays: ${supplierLeadDays}. Ask the user to provide a value greater than 0.`,
        )
      }

      if (safetyStockDays === null) {
        throw new Error(
          'Missing safetyStockDays. Ask the user for safety stock in days, or configure "defaultSafetyStockDays" in the plugin config.',
        )
      }
      if (safetyStockDays < 0) {
        throw new Error(
          `Invalid safetyStockDays: ${safetyStockDays}. Ask the user to provide a value greater than or equal to 0.`,
        )
      }

      if (hasManualInventory && hasManualSales) {
        return textResult(
          formatRestockSignal(
            evaluateRestockSignal({
              sku: params.sku,
              onHandUnits: requireNonNegativeNumber(params.onHandUnits, "onHandUnits"),
              dailySalesUnits: requireNonNegativeNumber(params.dailySalesUnits, "dailySalesUnits"),
              supplierLeadDays,
              safetyStockDays,
            }),
          ),
        )
      }

      if (hasManualInventory && !hasManualSales && !configuredStore) {
        throw new Error(
          "Missing dailySalesUnits. Ask the user for average daily sales, or configure a Shopify store so the tool can load sales automatically.",
        )
      }

      if (!hasManualInventory && hasManualSales && !configuredStore) {
        throw new Error(
          "Missing onHandUnits. Ask the user for current on-hand inventory, or configure a Shopify store so the tool can load inventory automatically.",
        )
      }

      if (!configuredStore) {
        throw new Error(
          "No configured store was found. Provide manual inventory and sales inputs, or configure a store in plugins.entries.seller-assistant.config.",
        )
      }

      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_restock_signal data loading is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const client = await createShopifyClient(configuredStore.store)
      const snapshot = hasManualSales && !hasManualInventory
        ? await loadShopifyInventorySnapshotFromClient(client, configuredStore.store, params.sku)
        : await loadShopifyRestockSnapshotFromClient(
            client,
            configuredStore.store,
            params.sku,
            salesLookbackDays,
          )
      const onHandUnits = hasManualInventory
        ? requireNonNegativeNumber(params.onHandUnits, "onHandUnits")
        : snapshot.onHandUnits
      const dailySalesUnits = hasManualSales
        ? requireNonNegativeNumber(params.dailySalesUnits, "dailySalesUnits")
        : "dailySalesUnits" in snapshot
          ? toNumber(snapshot.dailySalesUnits)
          : 0

      return textResult(
        formatRestockSignal(
          evaluateRestockSignal({
            ...snapshot,
            onHandUnits,
            dailySalesUnits,
            supplierLeadDays,
            safetyStockDays,
          }),
        ),
      )
    },
  })

  api.registerTool({
    name: "seller_campaign_plan",
    description:
      "Generate a practical seller-side campaign plan for an exact SKU, a partial SKU, or product title keywords. Try the tool before asking for an exact SKU. Prefer loading inventory cover and recent sales from a configured Shopify store. Do not ask for inventoryDaysLeft before trying the tool. Only ask the user for currentMarginPct if Shopify cost data is unavailable. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        objective: {
          type: "string",
          enum: ["clear_inventory", "grow_revenue", "launch_product", "recover_conversion"],
        },
        storeId: {
          type: "string",
          description:
            "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
        },
        heroSku: {
          type: "string",
          description:
            "Exact SKU, partial SKU, full product title, or product title keywords to search in Shopify before generating the campaign plan.",
        },
        currentMarginPct: {
          type: "number",
          description:
            "Optional manual gross margin override. Use only when Shopify cannot calculate margin from price and unit cost.",
        },
        inventoryDaysLeft: {
          type: "number",
          description:
            "Optional manual inventory cover override. Normally this should be calculated from Shopify inventory and recent sales.",
        },
        channel: {
          type: "string",
          description: "Primary campaign channel, for example Meta ads, Google Shopping, or email.",
        },
        constraint: { type: "string" },
        salesLookbackDays: {
          type: "number",
          description:
            "Optional sales lookback window for Shopify data loading. If omitted, use the configured default lookback window.",
        },
      },
      required: ["objective", "heroSku", "channel"],
    },
    async execute(_id: string, params: any) {
      const salesLookbackDays = Math.max(
        1,
        Math.round(toNumber(params.salesLookbackDays, pluginConfig.defaultSalesLookbackDays)),
      )
      const hasManualMargin = typeof params.currentMarginPct === "number"
      const hasManualInventoryDays = typeof params.inventoryDaysLeft === "number"

      if (hasManualMargin && hasManualInventoryDays) {
        return textResult(
          buildCampaignPlan({
            objective: params.objective,
            heroSku: params.heroSku,
            currentMarginPct: requireNonNegativeNumber(
              params.currentMarginPct,
              "currentMarginPct",
            ),
            inventoryDaysLeft: requireNonNegativeNumber(
              params.inventoryDaysLeft,
              "inventoryDaysLeft",
            ),
            channel: params.channel,
            constraint: params.constraint,
            targetMarginFloorPct: pluginConfig.targetMarginFloorPct,
          lowInventoryDays: pluginConfig.lowInventoryDays,
        }),
      )
      }

      if (hasManualMargin && !hasManualInventoryDays && !findConfiguredStore(pluginConfig, params.storeId)) {
        throw new Error(
          "Missing inventoryDaysLeft. Ask the user for current inventory cover in days, or configure a Shopify store so the tool can load it automatically.",
        )
      }

      if (!hasManualMargin && hasManualInventoryDays && !findConfiguredStore(pluginConfig, params.storeId)) {
        throw new Error(
          "Missing currentMarginPct. Ask the user for the current gross margin percentage, or configure a Shopify store with product cost data so the tool can calculate it automatically.",
        )
      }

      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "No configured store was found. Provide manual margin and inventory inputs, or configure a store in plugins.entries.seller-assistant.config.",
        )
      }

      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_campaign_plan data loading is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
        )
      }

      const client = await createShopifyClient(configuredStore.store)
      const snapshot = hasManualInventoryDays && !hasManualMargin
        ? await loadShopifyProductSnapshotFromClient(client, configuredStore.store, params.heroSku)
        : await loadShopifyCampaignSnapshot(configuredStore.store, params.heroSku, salesLookbackDays)
      const resolvedCurrentMarginPct = hasManualMargin
        ? requireNonNegativeNumber(params.currentMarginPct, "currentMarginPct")
        : optionalNumber(snapshot.currentMarginPct)
      const resolvedInventoryDaysLeft = hasManualInventoryDays
        ? requireNonNegativeNumber(params.inventoryDaysLeft, "inventoryDaysLeft")
        : "inventoryDaysLeft" in snapshot
          ? toNumber(snapshot.inventoryDaysLeft, 999)
          : 999
      const lookbackDays = "lookbackDays" in snapshot ? optionalNumber(snapshot.lookbackDays) ?? undefined : undefined

      if (resolvedCurrentMarginPct === null) {
        throw new Error(
          `Unable to calculate margin for SKU "${params.heroSku}" from Shopify data. Provide currentMarginPct manually or ensure the variant has both price and unit cost.`,
        )
      }

      return textResult(
        buildCampaignPlan({
          objective: params.objective,
          heroSku: params.heroSku,
          currentMarginPct: resolvedCurrentMarginPct,
          inventoryDaysLeft: resolvedInventoryDaysLeft,
          productName: snapshot.productName,
          channel: params.channel,
          constraint: params.constraint,
          targetMarginFloorPct: pluginConfig.targetMarginFloorPct,
          lowInventoryDays: pluginConfig.lowInventoryDays,
          source: snapshot.source,
          storeName: snapshot.storeName,
          lookbackDays,
          currencyCode: snapshot.currencyCode,
          averageUnitPrice: snapshot.averageUnitPrice,
          averageUnitCost: snapshot.averageUnitCost,
        }),
      )
    },
  })
}
