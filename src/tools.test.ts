import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Value } from "@sinclair/typebox/value"
import type { PluginConfig } from "./config.ts"
import {
  type ShopifyCatalogProductsQuerySnapshot,
  type ShopifyCatalogVariantsQuerySnapshot,
  type ShopifyDraftOrderActionResult,
  type ShopifyDraftOrdersQuerySnapshot,
  type ShopifyFulfillmentOrderActionResult,
  type ShopifyFulfillmentOrdersQuerySnapshot,
  type ShopifyOrderCancelResult,
  type ShopifyOrderCaptureResult,
  type ShopifyOrderEditBeginResult,
  type ShopifyFulfillmentCreateResult,
  type ShopifyInventorySnapshot,
  type ShopifyOrderDetailSnapshot,
  type ShopifyOrderUpdateResult,
  type ShopifyOrdersQuerySnapshot,
  type ShopifySalesSnapshot,
  type ShopifyProductActionSnapshot,
  type ShopifyRefundCreateResult,
  type ShopifyReturnCreateResult,
  type ShopifyReturnableFulfillmentsSnapshot,
  type ShopifyStoreOverviewSnapshot,
  type ShopifyStoreSalesSummarySnapshot,
} from "./services/shopify.ts"
import { registerSellerTools, type SellerToolApi, type SellerToolDependencies } from "./tools.ts"

const createProductFactsSnapshot = (
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

const createCatalogProductsQuerySnapshot = (
  overrides: Partial<ShopifyCatalogProductsQuerySnapshot> = {},
): ShopifyCatalogProductsQuerySnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  query: "status:active",
  pageInfo: {
    hasNextPage: true,
    endCursor: "product-cursor-1",
  },
  products: [
    {
      id: "gid://shopify/Product/1",
      title: "Short sleeve t-shirt",
      handle: "short-sleeve-t-shirt",
      status: "ACTIVE",
      vendor: "Acme",
      totalInventory: 120,
    },
  ],
  ...overrides,
})

const createCatalogVariantsQuerySnapshot = (
  overrides: Partial<ShopifyCatalogVariantsQuerySnapshot> = {},
): ShopifyCatalogVariantsQuerySnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  query: "sku:WM-01",
  pageInfo: {
    hasNextPage: false,
    endCursor: "variant-cursor-1",
  },
  variants: [
    {
      id: "gid://shopify/ProductVariant/1",
      sku: "WM-01",
      displayName: "Short sleeve t-shirt / Blue / M",
      productId: "gid://shopify/Product/1",
      productTitle: "Short sleeve t-shirt",
      inventoryQuantity: 29,
      price: 39,
      currencyCode: "USD",
    },
  ],
  ...overrides,
})

const createPluginConfig = (): PluginConfig => ({
  currency: "USD",
  locale: "en-US",
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

const createInventorySnapshot = (
  overrides: Partial<ShopifyInventorySnapshot> = {},
): ShopifyInventorySnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  locale: "en-US",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  productName: "Short sleeve t-shirt",
  sku: "WM-01",
  onHandUnits: 120,
  ...overrides,
})

const createStoreOverviewSnapshot = (
  overrides: Partial<ShopifyStoreOverviewSnapshot> = {},
): ShopifyStoreOverviewSnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  windowTimeZone: "America/New_York",
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
  windowTimeZone: "America/New_York",
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

const createOrdersQuerySnapshot = (
  overrides: Partial<ShopifyOrdersQuerySnapshot> = {},
): ShopifyOrdersQuerySnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  query: "financial_status:paid",
  pageInfo: {
    hasNextPage: true,
    endCursor: "cursor-1",
  },
  orders: [
    {
      id: "gid://shopify/Order/1001",
      name: "#1001",
      createdAt: "2026-03-18T08:00:00.000Z",
      displayFinancialStatus: "PAID",
      displayFulfillmentStatus: "UNFULFILLED",
      unitsSold: 3,
      totalPrice: 123.45,
      currencyCode: "USD",
      customerName: "Ada Lovelace",
      customerEmail: "ada@example.com",
    },
  ],
  ...overrides,
})

const createDraftOrdersQuerySnapshot = (
  overrides: Partial<ShopifyDraftOrdersQuerySnapshot> = {},
): ShopifyDraftOrdersQuerySnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  query: "status:open",
  pageInfo: {
    hasNextPage: true,
    endCursor: "draft-cursor-1",
  },
  draftOrders: [
    {
      id: "gid://shopify/DraftOrder/1",
      name: "#D1",
      status: "OPEN",
      ready: true,
      createdAt: "2026-03-18T08:00:00.000Z",
      updatedAt: "2026-03-18T09:00:00.000Z",
      invoiceUrl: "https://invoice.example.com/draft/1",
      invoiceSentAt: null,
      reserveInventoryUntil: "2026-03-19T08:00:00.000Z",
      email: "buyer@example.com",
      note: "manual quote",
      tags: ["vip"],
      taxExempt: false,
      totalPrice: 89.5,
      currencyCode: "USD",
      orderId: null,
      orderName: null,
    },
  ],
  ...overrides,
})

const createFulfillmentOrdersQuerySnapshot = (
  overrides: Partial<ShopifyFulfillmentOrdersQuerySnapshot> = {},
): ShopifyFulfillmentOrdersQuerySnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  query: "status:open",
  includeClosed: false,
  pageInfo: {
    hasNextPage: true,
    endCursor: "fulfillment-order-cursor-1",
  },
  fulfillmentOrders: [
    {
      id: "gid://shopify/FulfillmentOrder/1",
      createdAt: "2026-03-18T08:00:00.000Z",
      updatedAt: "2026-03-18T09:00:00.000Z",
      status: "OPEN",
      requestStatus: "UNSUBMITTED",
      orderId: "gid://shopify/Order/1001",
      orderName: "#1001",
      fulfillAt: null,
      fulfillBy: null,
      assignedLocationName: "Main Warehouse",
      assignedLocationId: "gid://shopify/Location/1",
      deliveryMethodType: "SHIPPING",
      destinationCity: "New York",
      destinationCountryCode: "US",
      supportedActions: ["HOLD", "MOVE"],
      holds: [
        {
          id: "gid://shopify/FulfillmentHold/1",
          reason: "AWAITING_PAYMENT",
          reasonNotes: "payment pending",
          handle: "manual-hold",
        },
      ],
      lineItems: [
        {
          id: "gid://shopify/FulfillmentOrderLineItem/1",
          remainingQuantity: 2,
          totalQuantity: 2,
          orderLineItemId: "gid://shopify/LineItem/1",
          sku: "WM-01",
          name: "Short sleeve t-shirt",
          orderQuantity: 2,
        },
      ],
      moveCandidates: [
        {
          locationId: "gid://shopify/Location/2",
          locationName: "Backup Warehouse",
          movable: true,
          message: null,
          availableLineItemsCount: 1,
          unavailableLineItemsCount: 0,
        },
      ],
    },
  ],
  ...overrides,
})

const createOrderDetailSnapshot = (
  overrides: Partial<ShopifyOrderDetailSnapshot> = {},
): ShopifyOrderDetailSnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  orderId: "gid://shopify/Order/1001",
  name: "#1001",
  createdAt: "2026-03-18T08:00:00.000Z",
  cancelledAt: null,
  cancelReason: null,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  note: "priority customer",
  tags: ["vip", "manual-review"],
  unitsSold: 3,
  totalPrice: 123.45,
  totalRefunded: 0,
  currencyCode: "USD",
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  lineItems: [
    {
      id: "gid://shopify/LineItem/1",
      sku: "WM-01",
      name: "Short sleeve t-shirt",
      quantity: 3,
      refundableQuantity: 3,
      unfulfilledQuantity: 3,
    },
  ],
  transactions: [
    {
      id: "gid://shopify/OrderTransaction/1",
      kind: "SALE",
      status: "SUCCESS",
      gateway: "shopify_payments",
      processedAt: "2026-03-18T08:00:00.000Z",
      amount: 123.45,
      currencyCode: "USD",
    },
  ],
  fulfillmentOrders: [
    {
      id: "gid://shopify/FulfillmentOrder/1",
      status: "OPEN",
      requestStatus: "UNSUBMITTED",
      assignedLocationName: "Main Warehouse",
      assignedLocationId: "gid://shopify/Location/1",
      lineItems: [
        {
          id: "gid://shopify/FulfillmentOrderLineItem/1",
          remainingQuantity: 3,
          totalQuantity: 3,
          orderLineItemId: "gid://shopify/LineItem/1",
          sku: "WM-01",
          name: "Short sleeve t-shirt",
          orderQuantity: 3,
        },
      ],
    },
  ],
  ...overrides,
})

const createFulfillmentOrderActionResult = (
  overrides: Partial<ShopifyFulfillmentOrderActionResult> = {},
): ShopifyFulfillmentOrderActionResult => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  fulfillmentOrder: {
    id: "gid://shopify/FulfillmentOrder/1",
    createdAt: "2026-03-18T08:00:00.000Z",
    updatedAt: "2026-03-18T09:30:00.000Z",
    status: "ON_HOLD",
    requestStatus: "UNSUBMITTED",
    orderId: "gid://shopify/Order/1001",
    orderName: "#1001",
    fulfillAt: null,
    fulfillBy: null,
    assignedLocationName: "Main Warehouse",
    assignedLocationId: "gid://shopify/Location/1",
    deliveryMethodType: "SHIPPING",
    destinationCity: "New York",
    destinationCountryCode: "US",
    supportedActions: ["RELEASE_HOLD", "MOVE"],
    holds: [
      {
        id: "gid://shopify/FulfillmentHold/1",
        reason: "AWAITING_PAYMENT",
        reasonNotes: "payment pending",
        handle: "manual-hold",
      },
    ],
    lineItems: [
      {
        id: "gid://shopify/FulfillmentOrderLineItem/1",
        remainingQuantity: 2,
        totalQuantity: 2,
        orderLineItemId: "gid://shopify/LineItem/1",
        sku: "WM-01",
        name: "Short sleeve t-shirt",
        orderQuantity: 2,
      },
    ],
    moveCandidates: [],
  },
  originalFulfillmentOrder: null,
  movedFulfillmentOrder: null,
  remainingFulfillmentOrder: null,
  fulfillmentHold: {
    id: "gid://shopify/FulfillmentHold/1",
    reason: "AWAITING_PAYMENT",
    reasonNotes: "payment pending",
    handle: "manual-hold",
  },
  userErrors: [],
  ...overrides,
})

const createDraftOrderActionResult = (
  overrides: Partial<ShopifyDraftOrderActionResult> = {},
): ShopifyDraftOrderActionResult => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  draftOrder: {
    id: "gid://shopify/DraftOrder/1",
    name: "#D1",
    status: "INVOICE_SENT",
    ready: true,
    createdAt: "2026-03-18T08:00:00.000Z",
    updatedAt: "2026-03-18T09:15:00.000Z",
    invoiceUrl: "https://invoice.example.com/draft/1",
    invoiceSentAt: "2026-03-18T09:15:00.000Z",
    reserveInventoryUntil: "2026-03-19T08:00:00.000Z",
    email: "buyer@example.com",
    note: "manual quote",
    tags: ["vip", "quote"],
    taxExempt: false,
    totalPrice: 89.5,
    currencyCode: "USD",
    orderId: null,
    orderName: null,
  },
  userErrors: [],
  ...overrides,
})

const createFulfillmentCreateResult = (
  overrides: Partial<ShopifyFulfillmentCreateResult> = {},
): ShopifyFulfillmentCreateResult => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  fulfillmentId: "gid://shopify/Fulfillment/1",
  status: "SUCCESS",
  trackingInfo: [
    {
      company: "UPS",
      number: "1Z999",
      url: "https://tracking.example.com/1Z999",
    },
  ],
  userErrors: [],
  ...overrides,
})

const createReturnableFulfillmentsSnapshot = (
  overrides: Partial<ShopifyReturnableFulfillmentsSnapshot> = {},
): ShopifyReturnableFulfillmentsSnapshot => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  orderId: "gid://shopify/Order/1001",
  returnableFulfillments: [
    {
      id: "gid://shopify/ReturnableFulfillment/1",
      fulfillmentId: "gid://shopify/Fulfillment/1",
      lineItems: [
        {
          fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/1",
          orderLineItemId: "gid://shopify/LineItem/1",
          sku: "WM-01",
          name: "Short sleeve t-shirt",
          quantity: 3,
          returnableQuantity: 2,
        },
      ],
    },
  ],
  ...overrides,
})

const createOrderCancelResult = (
  overrides: Partial<ShopifyOrderCancelResult> = {},
): ShopifyOrderCancelResult => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  orderId: "gid://shopify/Order/1001",
  jobId: "gid://shopify/Job/1",
  jobDone: false,
  orderCancelUserErrors: [],
  userErrors: [],
  ...overrides,
})

const createOrderCaptureResult = (
  overrides: Partial<ShopifyOrderCaptureResult> = {},
): ShopifyOrderCaptureResult => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  orderId: "gid://shopify/Order/1001",
  transactionId: "gid://shopify/OrderTransaction/2",
  transactionKind: "CAPTURE",
  transactionStatus: "SUCCESS",
  processedAt: "2026-03-18T10:00:00.000Z",
  amount: 25,
  currencyCode: "USD",
  parentTransactionId: "gid://shopify/OrderTransaction/1",
  capturable: false,
  totalCapturable: 0,
  totalCapturableCurrencyCode: "USD",
  multiCapturable: false,
  userErrors: [],
  ...overrides,
})

const createOrderUpdateResult = (
  overrides: Partial<ShopifyOrderUpdateResult> = {},
): ShopifyOrderUpdateResult => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  orderId: "gid://shopify/Order/1001",
  name: "#1001",
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  note: "updated note",
  email: "buyer@example.com",
  phone: "+1-212-555-0100",
  poNumber: "PO-1001",
  tags: ["vip", "manual-review"],
  customAttributes: [
    {
      key: "channel",
      value: "phone",
    },
  ],
  shippingAddress: {
    firstName: "Ada",
    lastName: "Lovelace",
    company: null,
    address1: "1 Main St",
    address2: null,
    city: "New York",
    province: "New York",
    provinceCode: "NY",
    country: "United States",
    countryCode: "US",
    zip: "10001",
    phone: "+1-212-555-0100",
  },
  totalPrice: 123.45,
  currencyCode: "USD",
  userErrors: [],
  ...overrides,
})

const createOrderEditBeginResult = (
  overrides: Partial<ShopifyOrderEditBeginResult> = {},
): ShopifyOrderEditBeginResult => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  orderId: "gid://shopify/Order/1001",
  orderName: "#1001",
  orderEditSessionId: "gid://shopify/OrderEditSession/1",
  calculatedOrderId: "gid://shopify/CalculatedOrder/1",
  subtotalLineItemsQuantity: 3,
  subtotalPrice: 123.45,
  totalOutstanding: 0,
  currencyCode: "USD",
  lineItems: [
    {
      id: "gid://shopify/CalculatedLineItem/1",
      sku: "WM-01",
      title: "Short sleeve t-shirt",
      quantity: 3,
    },
  ],
  stagedChangeTypes: [],
  userErrors: [],
  ...overrides,
})

const createReturnCreateResult = (
  overrides: Partial<ShopifyReturnCreateResult> = {},
): ShopifyReturnCreateResult => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  orderId: "gid://shopify/Order/1001",
  returnId: "gid://shopify/Return/1",
  status: "OPEN",
  userErrors: [],
  ...overrides,
})

const createRefundCreateResult = (
  overrides: Partial<ShopifyRefundCreateResult> = {},
): ShopifyRefundCreateResult => ({
  source: "shopify",
  retrievedAtIso: "2026-03-18T09:30:00.000Z",
  storeName: "US Shopify Store",
  timezone: "America/New_York",
  orderId: "gid://shopify/Order/1001",
  refundId: "gid://shopify/Refund/1",
  note: "customer appeasement",
  createdAt: "2026-03-18T10:00:00.000Z",
  totalRefunded: 25,
  currencyCode: "USD",
  transactions: [
    {
      id: "gid://shopify/OrderTransaction/2",
      kind: "REFUND",
      status: "SUCCESS",
      gateway: "shopify_payments",
      processedAt: "2026-03-18T10:00:00.000Z",
      amount: 25,
      currencyCode: "USD",
    },
  ],
  userErrors: [],
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
  parameters: unknown
  execute: (id: string, params: Record<string, unknown>) => Promise<unknown>
}

const createToolHarness = (dependencyOverrides: Partial<SellerToolDependencies> = {}) => {
  const overviewCalls: Array<Record<string, unknown>> = []
  const summaryCalls: Array<Record<string, unknown>> = []
  const inventoryCalls: Array<{
    productRef: string
    locale: string
  }> = []
  const salesCalls: Array<{
    productRef: string
    salesLookbackDays: number
    locale: string
  }> = []
  const catalogProductQueryCalls: Array<{
    query?: string
    first?: number
    after?: string
  }> = []
  const catalogVariantQueryCalls: Array<{
    query?: string
    first?: number
    allPages?: boolean
    after?: string
  }> = []
  const draftOrderQueryCalls: Array<{
    query?: string
    first?: number
    after?: string
    reverse?: boolean
  }> = []
  const fulfillmentOrderQueryCalls: Array<{
    query?: string
    first?: number
    after?: string
    reverse?: boolean
    includeClosed?: boolean
  }> = []
  const orderQueryCalls: Array<{
    query?: string
    first?: number
    after?: string
    reverse?: boolean
  }> = []
  const draftOrderCreateCalls: Array<Record<string, unknown>> = []
  const draftOrderUpdateCalls: Array<Record<string, unknown>> = []
  const draftOrderInvoiceSendCalls: Array<Record<string, unknown>> = []
  const draftOrderCompleteCalls: Array<Record<string, unknown>> = []
  const fulfillmentOrderHoldCalls: Array<Record<string, unknown>> = []
  const fulfillmentOrderReleaseHoldCalls: Array<Record<string, unknown>> = []
  const fulfillmentOrderMoveCalls: Array<Record<string, unknown>> = []
  const returnQueryCalls: string[] = []
  const orderGetCalls: string[] = []
  const orderUpdateCalls: Array<Record<string, unknown>> = []
  const orderCancelCalls: Array<Record<string, unknown>> = []
  const orderCaptureCalls: Array<Record<string, unknown>> = []
  const orderEditBeginCalls: string[] = []
  const fulfillmentCreateCalls: Array<Record<string, unknown>> = []
  const returnCreateCalls: Array<Record<string, unknown>> = []
  const refundCreateCalls: Array<Record<string, unknown>> = []
  const productFactCalls: Array<{
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
        parameters: tool.parameters,
        execute: (id, params) => tool.execute(id, params as never),
      })
    },
  }

  const defaultDependencies: SellerToolDependencies = {
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
        windowTimeZone:
          options.timeBasis === "caller"
            ? (options.callerTimeZone ?? "America/New_York")
            : "America/New_York",
      })
    },
    async loadShopifyStoreSalesSummary(_store, options) {
      summaryCalls.push({
        timeBasis: options.timeBasis,
        windows: [...options.windows],
        callerTimeZone: options.callerTimeZone,
      })

      return createStoreSalesSummarySnapshot({
        windowTimeZone:
          options.timeBasis === "caller"
            ? (options.callerTimeZone ?? "America/New_York")
            : "America/New_York",
        windows: options.windows.map((rangePreset, index) => ({
          rangePreset,
          windowLabel: rangePreset,
          ordersCount: index + 1,
          unitsSold: (index + 1) * 2,
          revenue: (index + 1) * 100,
        })),
      })
    },
    async loadShopifyInventorySnapshot(_store, productRef, locale) {
      inventoryCalls.push({
        productRef,
        locale,
      })
      return {
        kind: "ready",
        value: createInventorySnapshot(),
      }
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
    async queryShopifyCatalogProducts(_store, input) {
      catalogProductQueryCalls.push({ ...input })
      return createCatalogProductsQuerySnapshot({
        query: input?.query ?? null,
        pageInfo: {
          hasNextPage: true,
          endCursor: input?.after ? `${input.after}-next` : "product-cursor-1",
        },
      })
    },
    async queryShopifyCatalogVariants(_store, input) {
      catalogVariantQueryCalls.push({ ...input })
      return createCatalogVariantsQuerySnapshot({
        query: input?.query ?? null,
        pageInfo: {
          hasNextPage: Boolean(input?.after),
          endCursor: input?.after ? `${input.after}-next` : "variant-cursor-1",
        },
      })
    },
    async queryShopifyDraftOrders(_store, input) {
      draftOrderQueryCalls.push({ ...input })
      return createDraftOrdersQuerySnapshot({
        query: input?.query ?? null,
        pageInfo: {
          hasNextPage: true,
          endCursor: input?.after ? `${input.after}-next` : "draft-cursor-1",
        },
      })
    },
    async queryShopifyFulfillmentOrders(_store, input) {
      fulfillmentOrderQueryCalls.push({ ...input })
      return createFulfillmentOrdersQuerySnapshot({
        query: input?.query ?? null,
        includeClosed: Boolean(input?.includeClosed),
        pageInfo: {
          hasNextPage: true,
          endCursor: input?.after ? `${input.after}-next` : "fulfillment-order-cursor-1",
        },
      })
    },
    async queryShopifyOrders(_store, input) {
      orderQueryCalls.push({ ...input })
      return createOrdersQuerySnapshot({
        query: input?.query ?? null,
        pageInfo: {
          hasNextPage: true,
          endCursor: input?.after ? `${input.after}-next` : "cursor-1",
        },
      })
    },
    async queryShopifyReturnableFulfillments(_store, orderId) {
      returnQueryCalls.push(orderId)
      return createReturnableFulfillmentsSnapshot({
        orderId,
      })
    },
    async getShopifyOrder(_store, orderId) {
      orderGetCalls.push(orderId)
      return createOrderDetailSnapshot({
        orderId,
      })
    },
    async updateShopifyOrder(_store, input) {
      orderUpdateCalls.push(input as Record<string, unknown>)
      return createOrderUpdateResult({
        orderId: input.orderId,
        note: typeof input.note === "string" ? input.note : "updated note",
        email: typeof input.email === "string" ? input.email : "buyer@example.com",
        phone: typeof input.phone === "string" ? input.phone : "+1-212-555-0100",
        poNumber: typeof input.poNumber === "string" ? input.poNumber : "PO-1001",
        tags: Array.isArray(input.tags)
          ? input.tags.filter((tag): tag is string => typeof tag === "string")
          : ["vip", "manual-review"],
      })
    },
    async createShopifyDraftOrder(_store, input) {
      draftOrderCreateCalls.push(input as Record<string, unknown>)
      const baseDraftOrder = createDraftOrderActionResult().draftOrder
      return createDraftOrderActionResult({
        draftOrder:
          baseDraftOrder === null
            ? null
            : {
                ...baseDraftOrder,
                status: "OPEN",
                invoiceSentAt: null,
              },
      })
    },
    async updateShopifyDraftOrder(_store, input) {
      draftOrderUpdateCalls.push(input as Record<string, unknown>)
      const baseDraftOrder = createDraftOrderActionResult().draftOrder
      return createDraftOrderActionResult({
        draftOrder:
          baseDraftOrder === null
            ? null
            : {
                ...baseDraftOrder,
                status: "OPEN",
                note: typeof input.note === "string" ? input.note : "manual quote",
              },
      })
    },
    async sendShopifyDraftOrderInvoice(_store, input) {
      draftOrderInvoiceSendCalls.push(input as Record<string, unknown>)
      return createDraftOrderActionResult()
    },
    async completeShopifyDraftOrder(_store, input) {
      draftOrderCompleteCalls.push(input as Record<string, unknown>)
      const baseDraftOrder = createDraftOrderActionResult().draftOrder
      return createDraftOrderActionResult({
        draftOrder:
          baseDraftOrder === null
            ? null
            : {
                ...baseDraftOrder,
                status: "COMPLETED",
                orderId: "gid://shopify/Order/2001",
                orderName: "#2001",
              },
      })
    },
    async holdShopifyFulfillmentOrder(_store, input) {
      fulfillmentOrderHoldCalls.push(input as Record<string, unknown>)
      return createFulfillmentOrderActionResult()
    },
    async releaseHoldShopifyFulfillmentOrder(_store, input) {
      fulfillmentOrderReleaseHoldCalls.push(input as Record<string, unknown>)
      const baseFulfillmentOrder = createFulfillmentOrderActionResult().fulfillmentOrder
      return createFulfillmentOrderActionResult({
        fulfillmentOrder:
          baseFulfillmentOrder === null
            ? null
            : {
                ...baseFulfillmentOrder,
                status: "OPEN",
                supportedActions: ["HOLD", "MOVE"],
                holds: [],
              },
        fulfillmentHold: null,
      })
    },
    async moveShopifyFulfillmentOrder(_store, input) {
      fulfillmentOrderMoveCalls.push(input as Record<string, unknown>)
      const baseFulfillmentOrder = createFulfillmentOrdersQuerySnapshot().fulfillmentOrders[0]
      return createFulfillmentOrderActionResult({
        fulfillmentOrder: null,
        fulfillmentHold: null,
        originalFulfillmentOrder: baseFulfillmentOrder
          ? {
              ...baseFulfillmentOrder,
            }
          : null,
        movedFulfillmentOrder: baseFulfillmentOrder
          ? {
              ...baseFulfillmentOrder,
              id: "gid://shopify/FulfillmentOrder/2",
              assignedLocationName: "Backup Warehouse",
              assignedLocationId: "gid://shopify/Location/2",
              status: "OPEN",
              requestStatus: "UNSUBMITTED",
            }
          : null,
        remainingFulfillmentOrder: null,
      })
    },
    async cancelShopifyOrder(_store, input) {
      orderCancelCalls.push(input as Record<string, unknown>)
      return createOrderCancelResult({
        orderId: input.orderId,
      })
    },
    async captureShopifyOrder(_store, input) {
      orderCaptureCalls.push(input as Record<string, unknown>)
      return createOrderCaptureResult({
        orderId: input.orderId,
        parentTransactionId: input.parentTransactionId,
      })
    },
    async beginShopifyOrderEdit(_store, input) {
      orderEditBeginCalls.push(input.orderId)
      return createOrderEditBeginResult({
        orderId: input.orderId,
      })
    },
    async createShopifyFulfillment(_store, input) {
      fulfillmentCreateCalls.push(input as Record<string, unknown>)
      return createFulfillmentCreateResult()
    },
    async createShopifyReturn(_store, input) {
      returnCreateCalls.push(input as Record<string, unknown>)
      return createReturnCreateResult({
        orderId: input.orderId,
      })
    },
    async createShopifyRefund(_store, input) {
      refundCreateCalls.push(input as Record<string, unknown>)
      return createRefundCreateResult({
        orderId: input.orderId,
      })
    },
    async loadShopifyProductActionSnapshot(_store, productRef, salesLookbackDays, locale) {
      productFactCalls.push({ productRef, salesLookbackDays, locale })
      return {
        kind: "ready",
        value: createProductFactsSnapshot({
          locale,
          lookbackDays: salesLookbackDays,
        }),
      }
    },
  }

  const dependencies: SellerToolDependencies = {
    ...defaultDependencies,
    ...dependencyOverrides,
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
    inventoryCalls,
    salesCalls,
    catalogProductQueryCalls,
    catalogVariantQueryCalls,
    draftOrderQueryCalls,
    fulfillmentOrderQueryCalls,
    orderQueryCalls,
    draftOrderCreateCalls,
    draftOrderUpdateCalls,
    draftOrderInvoiceSendCalls,
    draftOrderCompleteCalls,
    fulfillmentOrderHoldCalls,
    fulfillmentOrderReleaseHoldCalls,
    fulfillmentOrderMoveCalls,
    returnQueryCalls,
    orderGetCalls,
    orderUpdateCalls,
    orderCancelCalls,
    orderCaptureCalls,
    orderEditBeginCalls,
    fulfillmentCreateCalls,
    returnCreateCalls,
    refundCreateCalls,
    productFactCalls,
    tools,
    getTool,
  }
}

describe("registerSellerTools", () => {
  it("registers grouped seller domain tools", () => {
    const harness = createToolHarness()
    const toolNames = harness.tools.map(tool => tool.name)

    assert.ok(toolNames.includes("seller_analytics"))
    assert.ok(toolNames.includes("seller_inventory"))
    assert.ok(toolNames.includes("seller_orders"))
    assert.ok(toolNames.includes("seller_catalog"))
  })

  it("returns today-style store overview output by default", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        timeBasis: "store",
      }),
    )

    assert.equal(harness.overviewCalls.length, 1)
    assert.equal(harness.summaryCalls.length, 0)
    assert.match(text, /^Source: shopify/m)
    assert.match(text, /^Window: Today$/m)
    assert.match(text, /^Revenue: \$123\.45$/m)
    assert.match(text, /^Store timezone: America\/New_York$/m)
    assert.doesNotMatch(text, /^Window timezone:/m)
    assert.doesNotMatch(text, /sales summary:/i)
  })

  it("returns store sales facts even when inventory totals are unavailable", async () => {
    const harness = createToolHarness({
      async loadShopifyStoreOverview(_store, options) {
        harness.overviewCalls.push({ ...options })
        return createStoreOverviewSnapshot({
          inventoryUnits: undefined,
          inventoryDaysLeft: undefined,
          inventoryErrorMessage: "Missing access scope read_products",
        })
      },
    })
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        timeBasis: "store",
      }),
    )

    assert.equal(harness.overviewCalls.length, 1)
    assert.match(text, /^Revenue: \$123\.45$/m)
    assert.match(text, /^Orders: 4$/m)
    assert.match(text, /^Units sold: 7$/m)
    assert.match(text, /^Inventory: unavailable \(Missing access scope read_products\)$/m)
    assert.doesNotMatch(text, /^Inventory units:/m)
    assert.doesNotMatch(text, /^Inventory cover:/m)
  })

  it("accepts mixed-case range presets in schema and normalizes them at execution", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    assert.equal(
      Value.Check(tool.parameters as never, {
        resource: "store_sales",
        operation: "overview",
        timeBasis: "store",
        rangePreset: "Last_7_Days",
      }),
      true,
    )

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        timeBasis: "store",
        rangePreset: "Last_7_Days",
      }),
    )

    assert.deepEqual(harness.overviewCalls, [
      {
        timeBasis: "store",
        rangePreset: "last_7_days",
        callerTimeZone: undefined,
        startDate: undefined,
        endDate: undefined,
      },
    ])
    assert.equal(harness.summaryCalls.length, 0)
    assert.match(text, /^Window: Last 7 days$/m)
  })

  it("uses single-window overview mode for range presets", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        timeBasis: "store",
        rangePreset: "last_7_days",
      }),
    )

    assert.deepEqual(harness.overviewCalls, [
      {
        timeBasis: "store",
        rangePreset: "last_7_days",
        callerTimeZone: undefined,
        startDate: undefined,
        endDate: undefined,
      },
    ])
    assert.equal(harness.summaryCalls.length, 0)
    assert.match(text, /^Window: Last 7 days$/m)
  })

  it("accepts uppercase summary windows and normalizes them before loading analytics summaries", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    assert.equal(
      Value.Check(tool.parameters as never, {
        resource: "store_sales",
        operation: "summary",
        timeBasis: "store",
        windows: ["TODAY", "LAST_7_DAYS"],
      }),
      true,
    )

    await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "summary",
        timeBasis: "store",
        windows: ["TODAY", "LAST_7_DAYS"],
      }),
    )

    assert.equal(harness.overviewCalls.length, 0)
    assert.deepEqual(harness.summaryCalls, [
      {
        timeBasis: "store",
        windows: ["today", "last_7_days"],
        callerTimeZone: undefined,
      },
    ])
  })

  it("passes caller time basis through for relative range presets", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        timeBasis: "caller",
        rangePreset: "today",
        callerTimeZone: "Asia/Shanghai",
      }),
    )

    assert.deepEqual(harness.overviewCalls, [
      {
        timeBasis: "caller",
        rangePreset: "today",
        callerTimeZone: "Asia/Shanghai",
        startDate: undefined,
        endDate: undefined,
      },
    ])
    assert.match(text, /^Window timezone: Asia\/Shanghai$/m)
    assert.match(text, /^Store timezone: America\/New_York$/m)
  })

  it("uses single-window overview mode for custom start and end dates", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        timeBasis: "store",
        startDate: "2026-03-01",
        endDate: "2026-03-07",
      }),
    )

    assert.deepEqual(harness.overviewCalls, [
      {
        timeBasis: "store",
        rangePreset: undefined,
        callerTimeZone: undefined,
        startDate: "2026-03-01",
        endDate: "2026-03-07",
      },
    ])
    assert.equal(harness.summaryCalls.length, 0)
    assert.match(text, /^Window: 2026-03-01 to 2026-03-07$/m)
  })

  it("uses multi-window summary mode when windows are provided", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "summary",
        timeBasis: "store",
        windows: ["today", "last_7_days"],
      }),
    )

    assert.equal(harness.overviewCalls.length, 0)
    assert.deepEqual(harness.summaryCalls, [
      {
        timeBasis: "store",
        windows: ["today", "last_7_days"],
        callerTimeZone: undefined,
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

  it("passes caller time basis through for summary windows", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "summary",
        timeBasis: "caller",
        windows: ["today", "last_7_days"],
        callerTimeZone: "Asia/Shanghai",
      }),
    )

    assert.deepEqual(harness.summaryCalls, [
      {
        timeBasis: "caller",
        windows: ["today", "last_7_days"],
        callerTimeZone: "Asia/Shanghai",
      },
    ])
    assert.match(text, /^Window timezone: Asia\/Shanghai$/m)
  })

  it("uses the default full summary window set when windows is empty", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "summary",
        timeBasis: "store",
        windows: [],
      }),
    )

    assert.equal(harness.overviewCalls.length, 0)
    assert.deepEqual(harness.summaryCalls, [
      {
        timeBasis: "store",
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
        callerTimeZone: undefined,
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

  it("rejects summary mode with rangePreset", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "summary",
        timeBasis: "store",
        windows: ["today"],
        rangePreset: "last_7_days",
      }),
    )

    assert.equal(
      text,
      'Use `operation: "overview"` with "rangePreset" in seller_analytics. `operation: "summary"` supports only "windows".',
    )
    assert.equal(harness.overviewCalls.length, 0)
    assert.equal(harness.summaryCalls.length, 0)
  })

  it("rejects missing timeBasis", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
      }),
    )

    assert.equal(text, 'Pass "timeBasis" as either "caller" or "store" for seller_analytics.')
    assert.equal(harness.overviewCalls.length, 0)
    assert.equal(harness.summaryCalls.length, 0)
  })

  it('requires callerTimeZone when timeBasis is "caller"', async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        rangePreset: "today",
        timeBasis: "caller",
      }),
    )

    assert.equal(
      text,
      'Pass "callerTimeZone" with a valid IANA timezone such as "Asia/Shanghai" when "timeBasis" is "caller".',
    )
    assert.equal(harness.overviewCalls.length, 0)
    assert.equal(harness.summaryCalls.length, 0)
  })

  it("rejects invalid callerTimeZone values", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        rangePreset: "today",
        timeBasis: "caller",
        callerTimeZone: "Mars/Base",
      }),
    )

    assert.equal(
      text,
      'Use a valid IANA timezone such as "Asia/Shanghai" or "America/New_York" for "callerTimeZone".',
    )
    assert.equal(harness.overviewCalls.length, 0)
    assert.equal(harness.summaryCalls.length, 0)
  })

  it('rejects callerTimeZone when timeBasis is "store"', async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        rangePreset: "today",
        timeBasis: "store",
        callerTimeZone: "Asia/Shanghai",
      }),
    )

    assert.equal(text, 'Do not pass "callerTimeZone" when "timeBasis" is "store".')
    assert.equal(harness.overviewCalls.length, 0)
    assert.equal(harness.summaryCalls.length, 0)
  })

  it("rejects summary mode with custom dates", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "summary",
        timeBasis: "store",
        windows: ["today"],
        startDate: "2026-03-01",
        endDate: "2026-03-07",
      }),
    )

    assert.equal(
      text,
      'Use `operation: "overview"` with "startDate"/"endDate" in seller_analytics. `operation: "summary"` supports only "windows".',
    )
    assert.equal(harness.overviewCalls.length, 0)
    assert.equal(harness.summaryCalls.length, 0)
  })

  it("rejects incomplete custom date input", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_analytics")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "store_sales",
        operation: "overview",
        timeBasis: "store",
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

  it("returns product inventory from seller_inventory", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_inventory")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "product",
        operation: "query",
        productRef: "WM-01",
      }),
    )

    assert.deepEqual(harness.inventoryCalls, [
      {
        productRef: "WM-01",
        locale: "en-US",
      },
    ])
    assert.match(text, /^Product: Short sleeve t-shirt$/m)
    assert.match(text, /^On-hand units: 120$/m)
  })

  it("returns product sales from seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "product_sales",
        operation: "query",
        input: {
          productRef: "WM-01",
          salesLookbackDays: 21,
        },
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

  it("rejects invalid seller_orders input at execution time", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "product_sales",
        operation: "query",
        input: {},
      }),
    )

    assert.equal(text, "seller_orders product_sales query input is invalid.")
    assert.equal(harness.salesCalls.length, 0)
  })

  it("queries Shopify draft orders through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "draft_order",
        operation: "query",
        input: {
          query: "status:open",
          first: 10,
          after: "draft-cursor-0",
          reverse: false,
        },
      }),
    )

    assert.deepEqual(harness.draftOrderQueryCalls, [
      {
        query: "status:open",
        first: 10,
        after: "draft-cursor-0",
        reverse: false,
      },
    ])
    assert.match(text, /^Query: status:open$/m)
    assert.match(text, /^Returned draft orders: 1$/m)
    assert.match(text, /^End cursor: draft-cursor-0-next$/m)
    assert.match(
      text,
      /#D1 \| gid:\/\/shopify\/DraftOrder\/1 \| OPEN \| ready \| \$89\.50 \| buyer@example\.com \| invoice not sent/,
    )
  })

  it("creates a Shopify draft order through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "draft_order",
        operation: "create",
        input: {
          email: "buyer@example.com",
          note: "manual quote",
          tags: ["vip", "quote"],
          lineItems: [
            {
              variantId: "gid://shopify/ProductVariant/1",
              quantity: 2,
            },
          ],
        },
      }),
    )

    assert.deepEqual(harness.draftOrderCreateCalls, [
      {
        email: "buyer@example.com",
        note: "manual quote",
        tags: ["vip", "quote"],
        lineItems: [
          {
            variantId: "gid://shopify/ProductVariant/1",
            quantity: 2,
          },
        ],
      },
    ])
    assert.match(text, /^Draft order: #D1$/m)
    assert.match(text, /^Draft order ID: gid:\/\/shopify\/DraftOrder\/1$/m)
    assert.match(text, /^Status: OPEN$/m)
    assert.match(text, /^Total: \$89\.50$/m)
  })

  it("updates a Shopify draft order through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "draft_order",
        operation: "update",
        input: {
          draftOrderId: "gid://shopify/DraftOrder/1",
          note: "updated quote",
        },
      }),
    )

    assert.deepEqual(harness.draftOrderUpdateCalls, [
      {
        draftOrderId: "gid://shopify/DraftOrder/1",
        note: "updated quote",
      },
    ])
    assert.match(text, /^Draft order ID: gid:\/\/shopify\/DraftOrder\/1$/m)
    assert.match(text, /^Note: updated quote$/m)
  })

  it("sends a Shopify draft-order invoice through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "draft_order",
        operation: "invoice_send",
        input: {
          draftOrderId: "gid://shopify/DraftOrder/1",
          email: {
            subject: "Quote for approval",
          },
        },
      }),
    )

    assert.deepEqual(harness.draftOrderInvoiceSendCalls, [
      {
        draftOrderId: "gid://shopify/DraftOrder/1",
        email: {
          subject: "Quote for approval",
        },
      },
    ])
    assert.match(text, /^Invoice sent at: /m)
    assert.match(text, /^Invoice URL: https:\/\/invoice\.example\.com\/draft\/1$/m)
  })

  it("completes a Shopify draft order through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "draft_order",
        operation: "complete",
        input: {
          draftOrderId: "gid://shopify/DraftOrder/1",
          sourceName: "openclaw",
        },
      }),
    )

    assert.deepEqual(harness.draftOrderCompleteCalls, [
      {
        draftOrderId: "gid://shopify/DraftOrder/1",
        sourceName: "openclaw",
      },
    ])
    assert.match(text, /^Status: COMPLETED$/m)
    assert.match(text, /^Completed order ID: gid:\/\/shopify\/Order\/2001$/m)
    assert.match(text, /^Completed order: #2001$/m)
  })

  it("queries Shopify fulfillment orders through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "fulfillment_order",
        operation: "query",
        input: {
          query: "status:open",
          first: 10,
          after: "fulfillment-order-cursor-0",
          reverse: false,
          includeClosed: true,
        },
      }),
    )

    assert.deepEqual(harness.fulfillmentOrderQueryCalls, [
      {
        query: "status:open",
        first: 10,
        after: "fulfillment-order-cursor-0",
        reverse: false,
        includeClosed: true,
      },
    ])
    assert.match(text, /^Include closed: yes$/m)
    assert.match(text, /^Returned fulfillment orders: 1$/m)
    assert.match(text, /^End cursor: fulfillment-order-cursor-0-next$/m)
    assert.match(text, /^  Supported actions: HOLD, MOVE$/m)
    assert.match(text, /^  Holds: gid:\/\/shopify\/FulfillmentHold\/1/m)
  })

  it("places a Shopify fulfillment order on hold through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "fulfillment_order",
        operation: "hold",
        input: {
          fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
          reason: "AWAITING_PAYMENT",
          reasonNotes: "payment pending",
          handle: "manual-hold",
          notifyMerchant: true,
        },
      }),
    )

    assert.deepEqual(harness.fulfillmentOrderHoldCalls, [
      {
        fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
        reason: "AWAITING_PAYMENT",
        reasonNotes: "payment pending",
        handle: "manual-hold",
        notifyMerchant: true,
      },
    ])
    assert.match(text, /^Fulfillment order:$/m)
    assert.match(text, /^Created hold:$/m)
    assert.match(text, /^- gid:\/\/shopify\/FulfillmentHold\/1 \| AWAITING_PAYMENT/m)
  })

  it("releases a hold from a Shopify fulfillment order through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "fulfillment_order",
        operation: "release_hold",
        input: {
          fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
          holdIds: ["gid://shopify/FulfillmentHold/1"],
        },
      }),
    )

    assert.deepEqual(harness.fulfillmentOrderReleaseHoldCalls, [
      {
        fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
        holdIds: ["gid://shopify/FulfillmentHold/1"],
      },
    ])
    assert.match(text, /^Fulfillment order:$/m)
    assert.match(text, /^  Holds: none$/m)
    assert.match(text, /^  Supported actions: HOLD, MOVE$/m)
  })

  it("moves a Shopify fulfillment order through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "fulfillment_order",
        operation: "move",
        input: {
          fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
          newLocationId: "gid://shopify/Location/2",
          fulfillmentOrderLineItems: [
            {
              id: "gid://shopify/FulfillmentOrderLineItem/1",
              quantity: 1,
            },
          ],
        },
      }),
    )

    assert.deepEqual(harness.fulfillmentOrderMoveCalls, [
      {
        fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
        newLocationId: "gid://shopify/Location/2",
        fulfillmentOrderLineItems: [
          {
            id: "gid://shopify/FulfillmentOrderLineItem/1",
            quantity: 1,
          },
        ],
      },
    ])
    assert.match(text, /^Original fulfillment order:$/m)
    assert.match(text, /^Moved fulfillment order:$/m)
    assert.match(text, /Backup Warehouse/)
  })

  it("queries Shopify orders through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "order",
        operation: "query",
        input: {
          query: "financial_status:paid",
          first: 10,
          after: "cursor-0",
          reverse: false,
        },
      }),
    )

    assert.deepEqual(harness.orderQueryCalls, [
      {
        query: "financial_status:paid",
        first: 10,
        after: "cursor-0",
        reverse: false,
      },
    ])
    assert.match(text, /^Query: financial_status:paid$/m)
    assert.match(text, /^Returned orders: 1$/m)
    assert.match(text, /^End cursor: cursor-0-next$/m)
    assert.match(
      text,
      /#1001 \| gid:\/\/shopify\/Order\/1001 \| PAID\/UNFULFILLED \| \$123\.45 \| 3 units \| Ada Lovelace/,
    )
  })

  it("loads one Shopify order through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "order",
        operation: "get",
        input: {
          orderId: "gid://shopify/Order/1001",
        },
      }),
    )

    assert.deepEqual(harness.orderGetCalls, ["gid://shopify/Order/1001"])
    assert.match(text, /^Order: #1001$/m)
    assert.match(text, /^Order ID: gid:\/\/shopify\/Order\/1001$/m)
    assert.match(text, /^Financial status: PAID$/m)
    assert.match(text, /^Line items:$/m)
    assert.match(text, /^Transactions:$/m)
    assert.match(text, /^Fulfillment orders:$/m)
    assert.match(text, /gid:\/\/shopify\/FulfillmentOrder\/1/)
  })

  it("updates a Shopify order through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "order",
        operation: "update",
        input: {
          orderId: "gid://shopify/Order/1001",
          note: "customer asked for gift wrap",
          email: "buyer@example.com",
          phone: "+1-212-555-0100",
          poNumber: "PO-1001",
          tags: ["vip", "gift-wrap"],
          customAttributes: [
            {
              key: "channel",
              value: "phone",
            },
          ],
          shippingAddress: {
            firstName: "Ada",
            lastName: "Lovelace",
            address1: "1 Main St",
            city: "New York",
            provinceCode: "NY",
            countryCode: "US",
            zip: "10001",
          },
        },
      }),
    )

    assert.deepEqual(harness.orderUpdateCalls, [
      {
        orderId: "gid://shopify/Order/1001",
        note: "customer asked for gift wrap",
        email: "buyer@example.com",
        phone: "+1-212-555-0100",
        poNumber: "PO-1001",
        tags: ["vip", "gift-wrap"],
        customAttributes: [
          {
            key: "channel",
            value: "phone",
          },
        ],
        shippingAddress: {
          firstName: "Ada",
          lastName: "Lovelace",
          address1: "1 Main St",
          city: "New York",
          provinceCode: "NY",
          countryCode: "US",
          zip: "10001",
        },
      },
    ])
    assert.match(text, /^Order ID: gid:\/\/shopify\/Order\/1001$/m)
    assert.match(text, /^PO number: PO-1001$/m)
    assert.match(text, /^Note: customer asked for gift wrap$/m)
    assert.match(text, /^Tags: vip, gift-wrap$/m)
    assert.match(text, /^Custom attributes: channel=phone$/m)
    assert.match(
      text,
      /^Shipping address: Ada Lovelace \| 1 Main St \| New York, NY, 10001 \| US \| \+1-212-555-0100$/m,
    )
  })

  it("begins a Shopify order edit through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "order_edit",
        operation: "begin",
        input: {
          orderId: "gid://shopify/Order/1001",
        },
      }),
    )

    assert.deepEqual(harness.orderEditBeginCalls, ["gid://shopify/Order/1001"])
    assert.match(text, /^Order ID: gid:\/\/shopify\/Order\/1001$/m)
    assert.match(text, /^Order edit session ID: gid:\/\/shopify\/OrderEditSession\/1$/m)
    assert.match(text, /^Calculated order ID: gid:\/\/shopify\/CalculatedOrder\/1$/m)
    assert.match(text, /^Calculated order line items:$/m)
    assert.match(text, /gid:\/\/shopify\/CalculatedLineItem\/1/)
  })

  it("queries returnable fulfillment line items through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "return",
        operation: "query",
        input: {
          orderId: "gid://shopify/Order/1001",
        },
      }),
    )

    assert.deepEqual(harness.returnQueryCalls, ["gid://shopify/Order/1001"])
    assert.match(text, /^Order ID: gid:\/\/shopify\/Order\/1001$/m)
    assert.match(text, /^Returnable fulfillments: 1$/m)
    assert.match(text, /^Returnable fulfillment line items:$/m)
    assert.match(text, /gid:\/\/shopify\/FulfillmentLineItem\/1/)
  })

  it("captures an order through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "order",
        operation: "capture",
        input: {
          orderId: "gid://shopify/Order/1001",
          parentTransactionId: "gid://shopify/OrderTransaction/1",
          amount: 25,
          currency: "USD",
          finalCapture: true,
        },
      }),
    )

    assert.deepEqual(harness.orderCaptureCalls, [
      {
        orderId: "gid://shopify/Order/1001",
        parentTransactionId: "gid://shopify/OrderTransaction/1",
        amount: 25,
        currency: "USD",
        finalCapture: true,
      },
    ])
    assert.match(text, /^Capture transaction ID: gid:\/\/shopify\/OrderTransaction\/2$/m)
    assert.match(text, /^Captured amount: \$25\.00$/m)
    assert.match(text, /^Parent transaction ID: gid:\/\/shopify\/OrderTransaction\/1$/m)
  })

  it("cancels an order through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "order",
        operation: "cancel",
        input: {
          orderId: "gid://shopify/Order/1001",
          notifyCustomer: true,
          refundMethod: {
            originalPaymentMethodsRefund: false,
          },
          restock: true,
          reason: "CUSTOMER",
          staffNote: "customer requested cancellation",
        },
      }),
    )

    assert.deepEqual(harness.orderCancelCalls, [
      {
        orderId: "gid://shopify/Order/1001",
        notifyCustomer: true,
        refundMethod: {
          originalPaymentMethodsRefund: false,
        },
        restock: true,
        reason: "CUSTOMER",
        staffNote: "customer requested cancellation",
      },
    ])
    assert.match(text, /^Order ID: gid:\/\/shopify\/Order\/1001$/m)
    assert.match(text, /^Cancellation job ID: gid:\/\/shopify\/Job\/1$/m)
    assert.match(text, /^Cancellation job done: no$/m)
  })

  it("creates a fulfillment through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "fulfillment",
        operation: "create",
        input: {
          notifyCustomer: true,
          message: "packed and ready",
          trackingInfo: {
            company: "UPS",
            number: "1Z999",
            url: "https://tracking.example.com/1Z999",
          },
          lineItemsByFulfillmentOrder: [
            {
              fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
              fulfillmentOrderLineItems: [
                {
                  id: "gid://shopify/FulfillmentOrderLineItem/1",
                  quantity: 2,
                },
              ],
            },
          ],
        },
      }),
    )

    assert.deepEqual(harness.fulfillmentCreateCalls, [
      {
        notifyCustomer: true,
        message: "packed and ready",
        trackingInfo: {
          company: "UPS",
          number: "1Z999",
          url: "https://tracking.example.com/1Z999",
        },
        lineItemsByFulfillmentOrder: [
          {
            fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1",
            fulfillmentOrderLineItems: [
              {
                id: "gid://shopify/FulfillmentOrderLineItem/1",
                quantity: 2,
              },
            ],
          },
        ],
      },
    ])
    assert.match(text, /^Fulfillment ID: gid:\/\/shopify\/Fulfillment\/1$/m)
    assert.match(text, /^Status: SUCCESS$/m)
    assert.match(text, /^Tracking:$/m)
    assert.match(text, /UPS \| 1Z999 \| https:\/\/tracking\.example\.com\/1Z999/)
  })

  it("creates a return through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "return",
        operation: "create",
        input: {
          orderId: "gid://shopify/Order/1001",
          notifyCustomer: true,
          requestedAt: "2026-03-18T10:00:00Z",
          returnLineItems: [
            {
              fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/1",
              quantity: 1,
              returnReason: "WRONG_ITEM",
              returnReasonNote: "received the wrong color",
            },
          ],
        },
      }),
    )

    assert.deepEqual(harness.returnCreateCalls, [
      {
        orderId: "gid://shopify/Order/1001",
        notifyCustomer: true,
        requestedAt: "2026-03-18T10:00:00Z",
        returnLineItems: [
          {
            fulfillmentLineItemId: "gid://shopify/FulfillmentLineItem/1",
            quantity: 1,
            returnReason: "WRONG_ITEM",
            returnReasonNote: "received the wrong color",
          },
        ],
      },
    ])
    assert.match(text, /^Order ID: gid:\/\/shopify\/Order\/1001$/m)
    assert.match(text, /^Return ID: gid:\/\/shopify\/Return\/1$/m)
    assert.match(text, /^Return status: OPEN$/m)
  })

  it("creates a refund through seller_orders", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_orders")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "refund",
        operation: "create",
        input: {
          orderId: "gid://shopify/Order/1001",
          note: "customer appeasement",
          refundLineItems: [
            {
              lineItemId: "gid://shopify/LineItem/1",
              quantity: 1,
              restockType: "RETURN",
            },
          ],
          transactions: [
            {
              amount: 25,
              gateway: "shopify_payments",
              parentId: "gid://shopify/OrderTransaction/1",
            },
          ],
        },
      }),
    )

    assert.deepEqual(harness.refundCreateCalls, [
      {
        orderId: "gid://shopify/Order/1001",
        note: "customer appeasement",
        refundLineItems: [
          {
            lineItemId: "gid://shopify/LineItem/1",
            quantity: 1,
            restockType: "RETURN",
          },
        ],
        transactions: [
          {
            amount: 25,
            gateway: "shopify_payments",
            parentId: "gid://shopify/OrderTransaction/1",
          },
        ],
      },
    ])
    assert.match(text, /^Order ID: gid:\/\/shopify\/Order\/1001$/m)
    assert.match(text, /^Refund ID: gid:\/\/shopify\/Refund\/1$/m)
    assert.match(text, /^Total refunded: \$25\.00$/m)
    assert.match(text, /^Refund transactions:$/m)
  })

  it("returns paginated product summaries from seller_catalog", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_catalog")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "product",
        operation: "query",
        input: {
          query: "status:active",
          first: 10,
          after: "product-cursor-0",
        },
      }),
    )

    assert.deepEqual(harness.catalogProductQueryCalls, [
      {
        query: "status:active",
        first: 10,
        after: "product-cursor-0",
      },
    ])
    assert.match(text, /^Query: status:active$/m)
    assert.match(text, /^Returned products: 1$/m)
    assert.match(
      text,
      /^- Short sleeve t-shirt \| short-sleeve-t-shirt \| ACTIVE \| Acme \| inventory 120 \| gid:\/\/shopify\/Product\/1$/m,
    )
    assert.match(text, /^End cursor: product-cursor-0-next$/m)
  })

  it("returns paginated variant summaries from seller_catalog", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_catalog")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "variant",
        operation: "query",
        input: {
          query: "sku:WM-01",
          first: 5,
        },
      }),
    )

    assert.deepEqual(harness.catalogVariantQueryCalls, [
      {
        query: "sku:WM-01",
        first: 5,
      },
    ])
    assert.match(text, /^Query: sku:WM-01$/m)
    assert.match(text, /^Returned variants: 1$/m)
    assert.match(
      text,
      /^- WM-01 \| Short sleeve t-shirt \| Short sleeve t-shirt \/ Blue \/ M \| \$39\.00 \| inventory 29 \| gid:\/\/shopify\/ProductVariant\/1$/m,
    )
  })

  it("passes allPages through for complete variant or SKU lists", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_catalog")

    assert.equal(
      Value.Check(tool.parameters as never, {
        resource: "variant",
        operation: "query",
        input: {
          query: "sku:*",
          first: 50,
          allPages: true,
        },
      }),
      true,
    )

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "variant",
        operation: "query",
        input: {
          query: "sku:*",
          first: 50,
          allPages: true,
        },
      }),
    )

    assert.deepEqual(harness.catalogVariantQueryCalls, [
      {
        query: "sku:*",
        first: 50,
        allPages: true,
      },
    ])
    assert.match(text, /^Query: sku:\*$/m)
    assert.match(text, /^Returned variants: 1$/m)
  })

  it("returns product fact bundles from seller_catalog without strategy text", async () => {
    const harness = createToolHarness()
    const tool = harness.getTool("seller_catalog")

    const text = await extractToolText(
      tool.execute("tool-call", {
        resource: "product_facts",
        operation: "query",
        input: {
          productRef: "WM-01",
          salesLookbackDays: 21,
        },
      }),
    )

    assert.deepEqual(harness.productFactCalls, [
      {
        productRef: "WM-01",
        salesLookbackDays: 21,
        locale: "en-US",
      },
    ])
    assert.match(text, /^Product: Short sleeve t-shirt$/m)
    assert.match(text, /^Average unit price: \$39\.00$/m)
    assert.match(text, /^Average unit cost: \$12\.50$/m)
    assert.match(text, /^Current margin: 67\.9%$/m)
    assert.doesNotMatch(
      text,
      /Replenishment:|Structured decision data|Test discount|Review for clearance/,
    )
  })
})
