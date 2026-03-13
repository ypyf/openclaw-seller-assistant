import { createAdminApiClient } from "@shopify/admin-api-client"
import { Type, type Static } from "@sinclair/typebox"
import type { AgentToolResult } from "@mariozechner/pi-agent-core"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

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

type PluginConfig = typeof DEFAULT_CONFIG & {
  defaultStoreId?: string
  defaultSupplierLeadDays?: number
  defaultSafetyStockDays?: number
  stores?: {
    shopify?: ShopifyStoreConfig[]
    amazon?: Record<string, unknown>[]
  }
} & Record<string, unknown>

const toPluginConfig = (api: Pick<OpenClawPluginApi, "pluginConfig">): PluginConfig => ({
  ...DEFAULT_CONFIG,
  ...(api?.pluginConfig ?? {}),
})

const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

const textResult = (text: string): AgentToolResult<unknown> => ({
  content: [{ type: "text", text }],
  details: null,
})

const requireNonNegativeNumber = (value: unknown, fieldName: string) => {
  const parsed = optionalNumber(value)
  if (parsed === null) {
    throw new Error(`Ask the user to provide ${fieldName}.`)
  }
  if (parsed < 0) {
    throw new Error(`Ask the user to correct ${fieldName}. The current value ${parsed} is invalid.`)
  }
  return parsed
}

const requirePositiveNumber = (value: unknown, fieldName: string) => {
  const parsed = optionalNumber(value)
  if (parsed === null) {
    throw new Error(`Ask the user to provide ${fieldName}.`)
  }
  if (parsed <= 0) {
    throw new Error(`Ask the user to correct ${fieldName}. The current value ${parsed} is invalid.`)
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

type ShopifyGraphQLResponse<TData> = {
  data?: TData
  errors?: any
}

const fetchAllShopifyOrders = async (client: ShopifyGraphQLClient, ordersQuery: string) => {
  const orders: NonNullable<NonNullable<ShopifyOrdersPage["orders"]>["nodes"]> = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result: ShopifyGraphQLResponse<ShopifyOrdersPage> = await client.request<ShopifyOrdersPage>(SHOPIFY_ORDERS_PAGE_QUERY, {
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
    const result: ShopifyGraphQLResponse<ShopifyVariantsPage> = await client.request<ShopifyVariantsPage>(SHOPIFY_VARIANTS_PAGE_QUERY, {
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

type ShopifyCandidateMatchKind = "sku_exact" | "title_exact" | "title_fuzzy"

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
    const result: ShopifyGraphQLResponse<ShopifyProductVariantsPage> = await client.request<ShopifyProductVariantsPage>(SHOPIFY_PRODUCT_VARIANTS_PAGE_QUERY, {
      variables: {
        productId,
        after,
      },
    })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page: NonNullable<ShopifyProductVariantsPage["product"]>["variants"] | undefined = result.data?.product?.variants
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
    const result: ShopifyGraphQLResponse<ShopifyVariantLookupPage> = await client.request<ShopifyVariantLookupPage>(SHOPIFY_VARIANT_BY_SKU_QUERY, {
      variables: {
        skuQuery,
        after,
      },
    })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page: ShopifyVariantLookupPage["productVariants"] | undefined = result.data?.productVariants
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
    const result: ShopifyGraphQLResponse<ShopifyProductsByTitlePage> = await client.request<ShopifyProductsByTitlePage>(SHOPIFY_PRODUCTS_BY_TITLE_QUERY, {
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
      `Ask the user to confirm the exact SKU or full product title for "${requestedValue}". No matching Shopify product was found.`,
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
      `Ask the user to choose one exact SKU or full product title for "${requestedValue}": ${formatChoiceList(productChoices)}.`,
    )
  }

  if (distinctProductKeys.length > 1) {
    const productChoices = dedupeProductChoices(bestCandidates)
    throw new Error(
      `Ask the user to choose one exact SKU or full product title for "${requestedValue}": ${formatChoiceList(productChoices)}.`,
    )
  }

  const resolvedProductKey = distinctProductKeys[0]
  const winningCandidate = bestCandidates[0]
  const isSkuMatch = bestMatchKind === "sku_exact"

  if (isSkuMatch && bestCandidates.length > 1) {
    throw new Error(
      `Ask the user to choose one exact SKU for "${requestedValue}": ${formatChoiceList(bestCandidates.map(candidate => candidate.variant))}.`,
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
    const result: ShopifyGraphQLResponse<ShopifyOrdersWithLineItemsPage> = await client.request<ShopifyOrdersWithLineItemsPage>(
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

const formatObjectiveLabel = (objective: string) =>
  objective
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

const formatCampaignContext = (input: {
  objective: string
  heroSku: string
  productName?: string
  channel: string
  currentMarginPct: number
  inventoryDaysLeft: number
  constraint?: string
  source?: string
  storeName?: string
  lookbackDays?: number
  currencyCode?: string | null
  averageUnitPrice?: number
  averageUnitCost?: number | null
  targetMarginFloorPct: number
}) => {
  const marginBuffer = input.currentMarginPct - input.targetMarginFloorPct

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
    `Current margin: ${percentage(input.currentMarginPct)}`,
    `Inventory cover: ${input.inventoryDaysLeft.toFixed(1)} days`,
    `Margin buffer vs configured floor: ${marginBuffer >= 0 ? "+" : ""}${percentage(marginBuffer)}`,
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

const SellerHealthCheckParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, the tool should use defaultStoreId or the first configured store.",
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
    tone: Type.Optional(Type.Union([Type.Literal("concise"), Type.Literal("consultative"), Type.Literal("premium")])),
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

type SellerHealthCheckParams = Static<typeof SellerHealthCheckParamsSchema>
type SellerQuoteBuilderParams = Static<typeof SellerQuoteBuilderParamsSchema>
type SellerInventoryLookupParams = Static<typeof SellerInventoryLookupParamsSchema>
type SellerRestockSignalParams = Static<typeof SellerRestockSignalParamsSchema>
type SellerCampaignPlanParams = Static<typeof SellerCampaignPlanParamsSchema>

export default function register(api: OpenClawPluginApi) {
  const pluginConfig = toPluginConfig(api)

  api.registerTool({
    name: "seller_health_check",
    label: "Seller Health Check",
    description:
      "Check store health for a configured store. If storeId is omitted, use the configured default store. If no configured store is available, prompt the user to configure a store first.",
    parameters: SellerHealthCheckParamsSchema,
    async execute(_id: string, params: SellerHealthCheckParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_health_check.",
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
    label: "Seller Inventory Lookup",
    description:
      "Look up current on-hand inventory for an exact SKU or product title search. Use this when the user asks how much inventory a product has. Try the tool before asking for an exact SKU. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm. This tool reads Shopify inventory only and does not require order access.",
    parameters: SellerInventoryLookupParamsSchema,
    async execute(_id: string, params: SellerInventoryLookupParams) {
      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_inventory_lookup.",
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
    label: "Seller Restock Signal",
    description:
      "Estimate restock urgency for an exact SKU or product title search. Try the tool before asking for an exact SKU. If inventory or sales inputs are omitted, load them from a configured Shopify store. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm. Only ask for supplierLeadDays or safetyStockDays if they are still missing after checking plugin config.",
    parameters: SellerRestockSignalParamsSchema,
    async execute(_id: string, params: SellerRestockSignalParams) {
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
          'Ask the user for supplier lead time in days, or configure "defaultSupplierLeadDays" in the plugin config.',
        )
      }
      if (supplierLeadDays <= 0) {
        throw new Error(
          `Ask the user to provide a supplier lead time greater than 0 days. The current value is ${supplierLeadDays}.`,
        )
      }

      if (safetyStockDays === null) {
        throw new Error(
          'Ask the user for safety stock in days, or configure "defaultSafetyStockDays" in the plugin config.',
        )
      }
      if (safetyStockDays < 0) {
        throw new Error(
          `Ask the user to provide a safety stock value greater than or equal to 0 days. The current value is ${safetyStockDays}.`,
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
          "Ask the user for average daily sales, or configure a Shopify store so sales can be loaded automatically.",
        )
      }

      if (!hasManualInventory && hasManualSales && !configuredStore) {
        throw new Error(
          "Ask the user for current on-hand inventory, or configure a Shopify store so inventory can be loaded automatically.",
        )
      }

      if (!configuredStore) {
        throw new Error(
          "Ask the user either to provide inventory and sales inputs manually, or to configure a store in plugins.entries.seller-assistant.config.",
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
    name: "seller_campaign_context",
    label: "Seller Campaign Context",
    description:
      "Load campaign planning context for an exact SKU or product title search. Use this before drafting a final campaign recommendation. Prefer loading inventory cover and recent sales from a configured Shopify store. Ask the user for any required missing campaign inputs before giving the final plan. Exact or unique matches can resolve automatically; ambiguous title searches should return choices for the user to confirm.",
    parameters: SellerCampaignPlanParamsSchema,
    async execute(_id: string, params: SellerCampaignPlanParams) {
      const salesLookbackDays = Math.max(
        1,
        Math.round(toNumber(params.salesLookbackDays, pluginConfig.defaultSalesLookbackDays)),
      )
      const hasManualMargin = typeof params.currentMarginPct === "number"
      const hasManualInventoryDays = typeof params.inventoryDaysLeft === "number"

      if (hasManualMargin && hasManualInventoryDays) {
        return textResult(
          formatCampaignContext({
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
          }),
        )
      }

      if (hasManualMargin && !hasManualInventoryDays && !findConfiguredStore(pluginConfig, params.storeId)) {
        throw new Error(
          "To continue the campaign plan, ask the user for current inventory cover in days, or use a configured Shopify store so it can be loaded automatically.",
        )
      }

      if (!hasManualMargin && hasManualInventoryDays && !findConfiguredStore(pluginConfig, params.storeId)) {
        throw new Error(
          "To continue the campaign plan, ask the user for the current gross margin percentage, or use a configured Shopify store with product cost data so it can be calculated automatically.",
        )
      }

      const configuredStore = findConfiguredStore(pluginConfig, params.storeId)
      if (!configuredStore) {
        throw new Error(
          "Ask the user either to provide margin and inventory inputs manually, or to configure a store in plugins.entries.seller-assistant.config.",
        )
      }

      if (configuredStore.platform !== "shopify") {
        throw new Error(
          `seller_campaign_context data loading is not implemented yet for the configured ${configuredStore.platform} store "${configuredStore.store.id}".`,
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
          `Ask the user for the current gross margin % for "${params.heroSku}". If they do not know it, ask for unit cost and selling price so margin can be calculated.`,
        )
      }

      return textResult(
        formatCampaignContext({
          objective: params.objective,
          heroSku: params.heroSku,
          currentMarginPct: resolvedCurrentMarginPct,
          inventoryDaysLeft: resolvedInventoryDaysLeft,
          productName: snapshot.productName,
          channel: params.channel,
          constraint: params.constraint,
          source: snapshot.source,
          storeName: snapshot.storeName,
          lookbackDays,
          currencyCode: snapshot.currencyCode,
          averageUnitPrice: snapshot.averageUnitPrice,
          averageUnitCost: snapshot.averageUnitCost,
          targetMarginFloorPct: pluginConfig.targetMarginFloorPct,
        }),
      )
    },
  })
}
