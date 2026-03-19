import {
  SHOPIFY_CATALOG_COLLECTIONS_QUERY,
  SHOPIFY_CATALOG_PRODUCTS_QUERY,
  SHOPIFY_CATALOG_VARIANTS_QUERY,
  SHOPIFY_DRAFT_ORDERS_QUERY,
  SHOPIFY_DRAFT_ORDER_COMPLETE_MUTATION,
  SHOPIFY_DRAFT_ORDER_CREATE_MUTATION,
  SHOPIFY_DRAFT_ORDER_INVOICE_SEND_MUTATION,
  SHOPIFY_DRAFT_ORDER_UPDATE_MUTATION,
  SHOPIFY_FULFILLMENT_CREATE_MUTATION,
  SHOPIFY_FULFILLMENT_ORDERS_QUERY,
  SHOPIFY_FULFILLMENT_ORDER_HOLD_MUTATION,
  SHOPIFY_FULFILLMENT_ORDER_LINE_ITEMS_PAGE_QUERY,
  SHOPIFY_FULFILLMENT_ORDER_MOVE_MUTATION,
  SHOPIFY_FULFILLMENT_ORDER_RELEASE_HOLD_MUTATION,
  SHOPIFY_ORDER_CANCEL_MUTATION,
  SHOPIFY_ORDER_CAPTURE_MUTATION,
  SHOPIFY_ORDER_DETAIL_QUERY,
  SHOPIFY_ORDER_EDIT_BEGIN_MUTATION,
  SHOPIFY_ORDER_EDIT_COMMIT_MUTATION,
  SHOPIFY_ORDER_EDIT_SET_QUANTITY_MUTATION,
  SHOPIFY_ORDER_FULFILLMENT_ORDERS_QUERY,
  SHOPIFY_ORDER_TRANSACTIONS_PAGE_QUERY,
  SHOPIFY_ORDER_UPDATE_MUTATION,
  SHOPIFY_ORDERS_PAGE_QUERY,
  SHOPIFY_ORDER_SUMMARIES_QUERY,
  SHOPIFY_ORDERS_WITH_LINE_ITEMS_PAGE_QUERY,
  SHOPIFY_ORDER_LINE_ITEMS_PAGE_QUERY,
  SHOPIFY_INVENTORY_ITEM_LEVELS_QUERY,
  SHOPIFY_LOCATIONS_QUERY,
  SHOPIFY_PRODUCTS_BY_TITLE_QUERY,
  SHOPIFY_PRODUCT_VARIANTS_PAGE_QUERY,
  SHOPIFY_PRODUCT_VARIANTS_PAGE_WITH_COST_QUERY,
  SHOPIFY_REFUND_CREATE_IDEMPOTENT_MUTATION,
  SHOPIFY_REFUND_CREATE_MUTATION,
  SHOPIFY_RETURNABLE_FULFILLMENTS_QUERY,
  SHOPIFY_RETURNABLE_FULFILLMENT_LINE_ITEMS_PAGE_QUERY,
  SHOPIFY_RETURN_CREATE_MUTATION,
  SHOPIFY_SHOP_QUERY,
  SHOPIFY_VARIANTS_PAGE_QUERY,
  SHOPIFY_VARIANT_BY_SKU_QUERY,
  SHOPIFY_VARIANT_BY_SKU_WITH_COST_QUERY,
} from "../shopify/queries.ts"
import type {
  ShopifyCatalogCollectionsQuery,
  ShopifyCatalogProductsQuery,
  ShopifyCatalogVariantsQuery,
  ShopifyDraftOrderCompleteMutation,
  ShopifyDraftOrderCreateMutation,
  ShopifyDraftOrderInvoiceSendMutation,
  ShopifyDraftOrdersQuery,
  ShopifyDraftOrderUpdateMutation,
  ShopifyDetailedFulfillmentOrderLineItem,
  ShopifyDetailedOrderLineItem,
  ShopifyDetailedOrderTransaction,
  ShopifyDetailedReturnableFulfillmentLineItem,
  ShopifyFulfillmentCreateMutation,
  ShopifyFulfillmentOrderHoldMutation,
  ShopifyFulfillmentOrderLineItemsPage,
  ShopifyFulfillmentOrderMoveMutation,
  ShopifyFulfillmentOrderReleaseHoldMutation,
  ShopifyFulfillmentOrdersQuery,
  ShopifyFulfillmentHoldNode,
  ShopifyFulfillmentOrderNode,
  ShopifyGraphQLClient,
  ShopifyGraphQLResponse,
  ShopifyInitialOrderLineItem,
  ShopifyInventoryItemLevelsQuery,
  ShopifyLocationsQuery,
  ShopifyMutationUserError,
  ShopifyOrderCancelMutation,
  ShopifyOrderCaptureMutation,
  ShopifyOrderDetailQuery,
  ShopifyOrderDetailFulfillmentOrder,
  ShopifyOrderEditBeginMutation,
  ShopifyOrderEditCommitMutation,
  ShopifyOrderEditSetQuantityMutation,
  ShopifyOrderFulfillmentOrdersQuery,
  ShopifyOrderLineItemsPage,
  ShopifyOrderTransactionsPage,
  ShopifyOrderSummariesPage,
  ShopifyOrderUpdateMutation,
  ShopifyOrderWithLineItems,
  ShopifyOrdersPage,
  ShopifyOrdersWithLineItemsPage,
  ShopifyPaginatedOrderTransaction,
  ShopifyPaginatedOrderLineItem,
  ShopifyProductByTitle,
  ShopifyProductVariantNode,
  ShopifyProductVariantsPage,
  ShopifyProductWithVariants,
  ShopifyProductsByTitlePage,
  ShopifyRefundCreateMutation,
  ShopifyReturnableFulfillmentLineItemsPage,
  ShopifyReturnableFulfillmentsQuery,
  ShopifyReturnableFulfillmentNode,
  ShopifyReturnCreateMutation,
  ShopifyResolvedCandidate,
  ShopifyResolvedVariant,
  ShopifyVariantLookupPage,
  ShopifyVariantsPage,
  ShopifyVariantSelection,
} from "../shopify/types.ts"
import { DEFAULT_PLUGIN_CONFIG, type ShopifyStoreConfig } from "../config.ts"
import { createShopifyClient, formatShopifyErrors, getDateRange } from "../shopify/client.ts"
import {
  type FlowResolution,
  grossMarginPct,
  isValidTimeZone,
  needsInput,
  normalizeSku,
  ready,
  sum,
  toArray,
  toNumber,
  tokenizeSearchTerms,
  unique,
} from "../utils.ts"

const SHOPIFY_TITLE_SEARCH_LIMIT = 50
const SHOPIFY_MATCH_CHOICE_LIMIT = 5
const SHOPIFY_VARIANT_FETCH_BATCH_SIZE = 5

export type ShopifyStoreOverviewSnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  windowTimeZone: string
  currencyCode: string
  windowLabel: string
  ordersCount: number
  unitsSold: number
  revenue: number
  inventoryUnits?: number
  averageDailyUnits?: number
  inventoryDaysLeft?: number
  inventoryErrorMessage?: string
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
  windowTimeZone: string
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

export type ShopifyLocationSnapshot = {
  id: string
  name: string
  fulfillsOnlineOrders: boolean | null
  hasActiveInventory: boolean | null
  isActive: boolean | null
  address: string | null
}

export type ShopifyLocationsQuerySnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  query: string | null
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
  locations: ShopifyLocationSnapshot[]
}

export type ShopifyInventoryLevelSnapshot = {
  locationId: string | null
  locationName: string | null
  fulfillsOnlineOrders: boolean | null
  hasActiveInventory: boolean | null
  isActive: boolean | null
  available: number | null
  committed: number | null
  incoming: number | null
  onHand: number | null
  reserved: number | null
}

export type ShopifyInventoryLevelsSnapshot = {
  source: "shopify"
  retrievedAtIso: string
  locale: string
  storeName: string
  timezone: string
  productName: string
  resolvedSkus: string[]
  locationLevels: ShopifyInventoryLevelSnapshot[]
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

export type ShopifyProductActionSnapshot = ShopifyRestockSnapshot & {
  currencyCode: string | null
  inventoryDaysLeft: number
  averageUnitPrice: number
  averageUnitCost: number | null
  currentMarginPct: number | null
}

export type ShopifyCatalogProductSnapshot = {
  id: string
  title: string
  handle: string | null
  status: string | null
  vendor: string | null
  totalInventory: number | null
}

export type ShopifyCatalogProductsQuerySnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  query: string | null
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
  products: ShopifyCatalogProductSnapshot[]
}

export type ShopifyCatalogCollectionRuleSnapshot = {
  column: string | null
  relation: string | null
  condition: string | null
}

export type ShopifyCatalogCollectionSnapshot = {
  id: string
  title: string
  handle: string | null
  updatedAt: string | null
  sortOrder: string | null
  collectionType: "smart" | "manual"
  appliedDisjunctively: boolean | null
  rules: ShopifyCatalogCollectionRuleSnapshot[]
}

export type ShopifyCatalogCollectionsQuerySnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  query: string | null
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
  collections: ShopifyCatalogCollectionSnapshot[]
}

export type ShopifyCatalogVariantSnapshot = {
  id: string
  sku: string | null
  displayName: string
  productId: string | null
  productTitle: string | null
  inventoryQuantity: number
  price: number | null
  currencyCode: string
}

export type ShopifyCatalogVariantsQuerySnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  query: string | null
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
  variants: ShopifyCatalogVariantSnapshot[]
}

export type ShopifyOrderSummarySnapshot = {
  id: string
  name: string
  createdAt: string
  displayFinancialStatus: string
  displayFulfillmentStatus: string
  unitsSold: number
  totalPrice: number
  currencyCode: string
  customerName: string | null
  customerEmail: string | null
}

export type ShopifyOrdersQuerySnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  query: string | null
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
  orders: ShopifyOrderSummarySnapshot[]
}

export type ShopifyDraftOrderSummarySnapshot = {
  id: string
  name: string
  status: string | null
  ready: boolean | null
  createdAt: string | null
  updatedAt: string | null
  invoiceUrl: string | null
  invoiceSentAt: string | null
  reserveInventoryUntil: string | null
  email: string | null
  note: string | null
  tags: string[]
  taxExempt: boolean | null
  totalPrice: number
  currencyCode: string
  orderId: string | null
  orderName: string | null
}

export type ShopifyDraftOrdersQuerySnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  query: string | null
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
  draftOrders: ShopifyDraftOrderSummarySnapshot[]
}

export type ShopifyOrderLineItemSnapshot = {
  id: string
  sku: string | null
  name: string
  quantity: number
  refundableQuantity: number
  unfulfilledQuantity: number
}

export type ShopifyOrderTransactionSnapshot = {
  id: string
  kind: string | null
  status: string | null
  gateway: string | null
  processedAt: string | null
  amount: number
  currencyCode: string
}

export type ShopifyFulfillmentOrderLineItemSnapshot = {
  id: string
  remainingQuantity: number
  totalQuantity: number
  orderLineItemId: string | null
  sku: string | null
  name: string
  orderQuantity: number
}

export type ShopifyOrderFulfillmentOrderSnapshot = {
  id: string
  status: string | null
  requestStatus: string | null
  assignedLocationName: string | null
  assignedLocationId: string | null
  lineItems: ShopifyFulfillmentOrderLineItemSnapshot[]
}

export type ShopifyFulfillmentHoldSnapshot = {
  id: string | null
  reason: string | null
  reasonNotes: string | null
  handle: string | null
}

export type ShopifyFulfillmentOrderMoveCandidateSnapshot = {
  locationId: string | null
  locationName: string | null
  movable: boolean | null
  message: string | null
  availableLineItemsCount: number | null
  unavailableLineItemsCount: number | null
}

export type ShopifyFulfillmentOrderSummarySnapshot = {
  id: string
  createdAt: string | null
  updatedAt: string | null
  status: string | null
  requestStatus: string | null
  orderId: string | null
  orderName: string | null
  fulfillAt: string | null
  fulfillBy: string | null
  assignedLocationName: string | null
  assignedLocationId: string | null
  deliveryMethodType: string | null
  destinationCity: string | null
  destinationCountryCode: string | null
  supportedActions: string[]
  holds: ShopifyFulfillmentHoldSnapshot[]
  lineItems: ShopifyFulfillmentOrderLineItemSnapshot[]
  moveCandidates: ShopifyFulfillmentOrderMoveCandidateSnapshot[]
}

export type ShopifyFulfillmentOrdersQuerySnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  query: string | null
  includeClosed: boolean
  pageInfo: {
    hasNextPage: boolean
    endCursor: string | null
  }
  fulfillmentOrders: ShopifyFulfillmentOrderSummarySnapshot[]
}

export type ShopifyOrderDetailSnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string
  name: string
  createdAt: string
  cancelledAt: string | null
  cancelReason: string | null
  displayFinancialStatus: string
  displayFulfillmentStatus: string
  note: string | null
  tags: string[]
  unitsSold: number
  totalPrice: number
  totalRefunded: number
  currencyCode: string
  customerName: string | null
  customerEmail: string | null
  lineItems: ShopifyOrderLineItemSnapshot[]
  transactions: ShopifyOrderTransactionSnapshot[]
  fulfillmentOrders: ShopifyOrderFulfillmentOrderSnapshot[]
  fulfillmentOrdersErrorMessage?: string
}

export type ShopifyReturnableLineItemSnapshot = {
  fulfillmentLineItemId: string
  orderLineItemId: string | null
  sku: string | null
  name: string
  quantity: number
  returnableQuantity: number
}

export type ShopifyReturnableFulfillmentSnapshot = {
  id: string
  fulfillmentId: string | null
  lineItems: ShopifyReturnableLineItemSnapshot[]
}

export type ShopifyReturnableFulfillmentsSnapshot = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string
  returnableFulfillments: ShopifyReturnableFulfillmentSnapshot[]
}

export type ShopifyMutationUserErrorSnapshot = {
  field: string | null
  message: string
  code?: string | null
}

export type ShopifyFulfillmentTrackingInfoSnapshot = {
  company: string | null
  number: string | null
  url: string | null
}

export type ShopifyFulfillmentCreateResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  fulfillmentId: string | null
  status: string | null
  trackingInfo: ShopifyFulfillmentTrackingInfoSnapshot[]
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyOrderCancelResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string
  jobId: string | null
  jobDone: boolean | null
  orderCancelUserErrors: ShopifyMutationUserErrorSnapshot[]
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyOrderCaptureResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string
  transactionId: string | null
  transactionKind: string | null
  transactionStatus: string | null
  processedAt: string | null
  amount: number
  currencyCode: string
  parentTransactionId: string | null
  capturable: boolean | null
  totalCapturable: number
  totalCapturableCurrencyCode: string
  multiCapturable: boolean | null
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyOrderUpdateAttributeSnapshot = {
  key: string
  value: string
}

export type ShopifyOrderUpdateAddressSnapshot = {
  firstName: string | null
  lastName: string | null
  company: string | null
  address1: string | null
  address2: string | null
  city: string | null
  province: string | null
  provinceCode: string | null
  country: string | null
  countryCode: string | null
  zip: string | null
  phone: string | null
}

export type ShopifyOrderUpdateResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string
  name: string | null
  displayFinancialStatus: string | null
  displayFulfillmentStatus: string | null
  note: string | null
  email: string | null
  phone: string | null
  poNumber: string | null
  tags: string[]
  customAttributes: ShopifyOrderUpdateAttributeSnapshot[]
  shippingAddress: ShopifyOrderUpdateAddressSnapshot | null
  totalPrice: number
  currencyCode: string
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyCalculatedOrderLineItemSnapshot = {
  id: string
  sku: string | null
  title: string
  quantity: number
}

export type ShopifyOrderEditBeginResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string
  orderName: string | null
  orderEditSessionId: string | null
  calculatedOrderId: string | null
  subtotalLineItemsQuantity: number
  subtotalPrice: number
  totalOutstanding: number
  currencyCode: string
  lineItems: ShopifyCalculatedOrderLineItemSnapshot[]
  stagedChangeTypes: string[]
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyOrderEditSetQuantityResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string | null
  orderName: string | null
  orderEditSessionId: string | null
  calculatedOrderId: string | null
  editedLineItem: ShopifyCalculatedOrderLineItemSnapshot | null
  subtotalLineItemsQuantity: number
  subtotalPrice: number
  totalOutstanding: number
  currencyCode: string
  lineItems: ShopifyCalculatedOrderLineItemSnapshot[]
  stagedChangeTypes: string[]
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyOrderEditCommitResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string | null
  orderName: string | null
  displayFinancialStatus: string | null
  displayFulfillmentStatus: string | null
  totalPrice: number
  currencyCode: string
  successMessages: string[]
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyReturnCreateResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string
  returnId: string | null
  status: string | null
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyRefundCreateResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  orderId: string
  refundId: string | null
  note: string | null
  createdAt: string | null
  totalRefunded: number
  currencyCode: string
  transactions: ShopifyOrderTransactionSnapshot[]
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyDraftOrderActionResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  draftOrder: ShopifyDraftOrderSummarySnapshot | null
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyFulfillmentOrderActionResult = {
  source: "shopify"
  retrievedAtIso: string
  storeName: string
  timezone: string
  fulfillmentOrder: ShopifyFulfillmentOrderSummarySnapshot | null
  originalFulfillmentOrder: ShopifyFulfillmentOrderSummarySnapshot | null
  movedFulfillmentOrder: ShopifyFulfillmentOrderSummarySnapshot | null
  remainingFulfillmentOrder: ShopifyFulfillmentOrderSummarySnapshot | null
  fulfillmentHold: ShopifyFulfillmentHoldSnapshot | null
  userErrors: ShopifyMutationUserErrorSnapshot[]
}

export type ShopifyFulfillmentCreateInput = {
  lineItemsByFulfillmentOrder: Array<{
    fulfillmentOrderId: string
    fulfillmentOrderLineItems?: Array<{
      id: string
      quantity: number
    }>
  }>
  notifyCustomer?: boolean
  trackingInfo?: {
    company?: string
    number?: string
    url?: string
  }
  originAddress?: {
    address1?: string
    address2?: string
    city?: string
    provinceCode?: string
    countryCode?: string
    zip?: string
  }
  message?: string
}

export type ShopifyOrderCancelInput = {
  orderId: string
  notifyCustomer?: boolean
  refundMethod: {
    originalPaymentMethodsRefund: boolean
  }
  restock: boolean
  reason: "CUSTOMER" | "DECLINED" | "FRAUD" | "INVENTORY" | "OTHER" | "STAFF"
  staffNote?: string
}

export type ShopifyOrderCaptureInput = {
  orderId: string
  parentTransactionId: string
  amount: number
  currency?: string
  finalCapture?: boolean
}

export type ShopifyOrderUpdateInput = {
  orderId: string
  customAttributes?: ShopifyDraftOrderAttributeInput[]
  email?: string
  note?: string
  phone?: string
  poNumber?: string
  shippingAddress?: ShopifyDraftOrderAddressInput
  tags?: string[]
}

export type ShopifyOrderEditBeginInput = {
  orderId: string
}

export type ShopifyOrderEditSetQuantityInput = {
  editId: string
  lineItemId: string
  quantity: number
  restock?: boolean
}

export type ShopifyOrderEditCommitInput = {
  editId: string
  notifyCustomer?: boolean
  staffNote?: string
}

export type ShopifyReturnCreateInput = {
  orderId: string
  returnLineItems: Array<{
    fulfillmentLineItemId: string
    quantity: number
    returnReason?: string
    returnReasonNote?: string
    returnReasonDefinitionId?: string
  }>
  notifyCustomer?: boolean
  requestedAt?: string
}

export type ShopifyRefundCreateInput = {
  orderId: string
  notify?: boolean
  note?: string
  currency?: string
  allowOverRefunding?: boolean
  discrepancyReason?: string
  shipping?: {
    amount: number
  }
  refundLineItems?: Array<{
    lineItemId: string
    quantity: number
    restockType?: "NO_RESTOCK" | "CANCEL" | "RETURN"
    locationId?: string
  }>
  transactions?: Array<{
    amount: number
    gateway: string
    kind?: "REFUND"
    orderId?: string
    parentId?: string
  }>
  idempotencyKey?: string
}

export type ShopifyDraftOrderAttributeInput = {
  key: string
  value: string
}

export type ShopifyDraftOrderAddressInput = {
  firstName?: string
  lastName?: string
  company?: string
  address1?: string
  address2?: string
  city?: string
  province?: string
  provinceCode?: string
  country?: string
  countryCode?: string
  zip?: string
  phone?: string
}

export type ShopifyDraftOrderAppliedDiscountInput = {
  value: number
  valueType: "FIXED_AMOUNT" | "PERCENTAGE"
  amount?: number
  title?: string
  description?: string
}

export type ShopifyDraftOrderLineItemInput =
  | {
      quantity: number
      variantId: string
      appliedDiscount?: ShopifyDraftOrderAppliedDiscountInput
      customAttributes?: ShopifyDraftOrderAttributeInput[]
    }
  | {
      quantity: number
      title: string
      originalUnitPrice: number
      appliedDiscount?: ShopifyDraftOrderAppliedDiscountInput
      customAttributes?: ShopifyDraftOrderAttributeInput[]
      weight?: {
        value: number
        unit: "GRAMS" | "KILOGRAMS" | "OUNCES" | "POUNDS"
      }
    }

export type ShopifyDraftOrderInput = {
  lineItems?: ShopifyDraftOrderLineItemInput[]
  email?: string
  note?: string
  tags?: string[]
  taxExempt?: boolean
  reserveInventoryUntil?: string
  billingAddress?: ShopifyDraftOrderAddressInput
  shippingAddress?: ShopifyDraftOrderAddressInput
  shippingLine?: {
    title: string
    price: number
  }
  appliedDiscount?: ShopifyDraftOrderAppliedDiscountInput
  customAttributes?: ShopifyDraftOrderAttributeInput[]
}

export type ShopifyDraftOrdersQueryInput = {
  query?: string
  first?: number
  after?: string
  reverse?: boolean
}

export type ShopifyDraftOrderCreateInput = ShopifyDraftOrderInput & {
  lineItems: ShopifyDraftOrderLineItemInput[]
}

export type ShopifyDraftOrderUpdateInput = ShopifyDraftOrderInput & {
  draftOrderId: string
}

export type ShopifyDraftOrderInvoiceSendInput = {
  draftOrderId: string
  email?: {
    to?: string
    subject?: string
    customMessage?: string
  }
}

export type ShopifyDraftOrderCompleteInput = {
  draftOrderId: string
  paymentGatewayId?: string
  sourceName?: string
}

export type ShopifyFulfillmentOrdersQueryInput = {
  query?: string
  first?: number
  after?: string
  reverse?: boolean
  includeClosed?: boolean
}

export type ShopifyFulfillmentOrderLineItemInput = {
  id: string
  quantity: number
}

export type ShopifyFulfillmentOrderHoldInput = {
  fulfillmentOrderId: string
  reason:
    | "AWAITING_PAYMENT"
    | "HIGH_RISK_OF_FRAUD"
    | "INCORRECT_ADDRESS"
    | "INVENTORY_OUT_OF_STOCK"
    | "OTHER"
  reasonNotes?: string
  notifyMerchant?: boolean
  handle?: string
  externalId?: string
  fulfillmentOrderLineItems?: ShopifyFulfillmentOrderLineItemInput[]
}

export type ShopifyFulfillmentOrderReleaseHoldInput = {
  fulfillmentOrderId: string
  holdIds?: string[]
  externalId?: string
}

export type ShopifyFulfillmentOrderMoveInput = {
  fulfillmentOrderId: string
  newLocationId: string
  fulfillmentOrderLineItems?: ShopifyFulfillmentOrderLineItemInput[]
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

export type StoreOverviewTimeBasis = "caller" | "store"

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

const trimOrNull = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

type ShopifyConnectionPageInfo = {
  hasNextPage?: boolean
  endCursor?: string | null
}

const hasOwnKey = <TInput extends object>(input: TInput, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(input, key)

const mapExplicitStringUpdate = <TInput extends Record<string, unknown>>(
  input: TInput,
  key: keyof TInput,
) => {
  if (!hasOwnKey(input, key)) {
    return undefined
  }

  const value = input[key]
  return typeof value === "string" ? trimOrNull(value) : undefined
}

const mapExplicitStringArrayUpdate = <TInput extends Record<string, unknown>>(
  input: TInput,
  key: keyof TInput,
) => {
  if (!hasOwnKey(input, key)) {
    return undefined
  }

  const value = input[key]
  if (!Array.isArray(value)) {
    return undefined
  }

  const mappedValues = value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)

  if (mappedValues.length > 0) {
    return mappedValues
  }

  return value.length === 0 ? [] : undefined
}

const toShopifyMoneyAmount = (value: string | null | undefined) =>
  toNumber(value ? Number(value) : Number.NaN)

const toNullableNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const mapShopifyMutationUserErrors = (errors: ShopifyMutationUserError[] | null | undefined) =>
  toArray<ShopifyMutationUserError>(errors)
    .map(error => {
      const message = trimOrNull(error?.message)
      if (!message) {
        return null
      }

      const field = Array.isArray(error?.field)
        ? error.field
            .map(segment => trimOrNull(segment))
            .filter((segment): segment is string => Boolean(segment))
            .join(".")
        : null

      const code = trimOrNull(error?.code)
      const mappedError: ShopifyMutationUserErrorSnapshot = {
        field: field && field.length > 0 ? field : null,
        message,
      }

      if (code !== null) {
        mappedError.code = code
      }

      return mappedError
    })
    .filter((error): error is ShopifyMutationUserErrorSnapshot => error !== null)

const mapShopifyOrderUpdateAttributes = (
  attributes:
    | Array<{
        key?: string | null
        value?: string | null
      }>
    | null
    | undefined,
) =>
  toArray<{
    key?: string | null
    value?: string | null
  }>(attributes)
    .map(attribute => {
      const key = trimOrNull(attribute?.key)
      const value = trimOrNull(attribute?.value)
      if (!key || !value) {
        return null
      }

      return {
        key,
        value,
      }
    })
    .filter((attribute): attribute is ShopifyOrderUpdateAttributeSnapshot => attribute !== null)

const mapShopifyOrderUpdateAddress = (
  address:
    | {
        firstName?: string | null
        lastName?: string | null
        company?: string | null
        address1?: string | null
        address2?: string | null
        city?: string | null
        province?: string | null
        provinceCode?: string | null
        country?: string | null
        countryCodeV2?: string | null
        zip?: string | null
        phone?: string | null
      }
    | null
    | undefined,
): ShopifyOrderUpdateAddressSnapshot | null => {
  if (!address) {
    return null
  }

  const snapshot = {
    firstName: trimOrNull(address.firstName),
    lastName: trimOrNull(address.lastName),
    company: trimOrNull(address.company),
    address1: trimOrNull(address.address1),
    address2: trimOrNull(address.address2),
    city: trimOrNull(address.city),
    province: trimOrNull(address.province),
    provinceCode: trimOrNull(address.provinceCode),
    country: trimOrNull(address.country),
    countryCode: trimOrNull(address.countryCodeV2),
    zip: trimOrNull(address.zip),
    phone: trimOrNull(address.phone),
  }

  return Object.values(snapshot).some(value => value !== null) ? snapshot : null
}

const mapShopifyCalculatedOrderLineItems = (
  lineItems:
    | Array<{
        id?: string | null
        sku?: string | null
        title?: string | null
        quantity?: number | null
      }>
    | null
    | undefined,
) =>
  toArray<{
    id?: string | null
    sku?: string | null
    title?: string | null
    quantity?: number | null
  }>(lineItems)
    .map(lineItem => {
      const id = trimOrNull(lineItem?.id)
      if (!id) {
        return null
      }

      return {
        id,
        sku: trimOrNull(lineItem?.sku),
        title: trimOrNull(lineItem?.title) ?? "Unnamed item",
        quantity: toNumber(lineItem?.quantity),
      }
    })
    .filter((lineItem): lineItem is ShopifyCalculatedOrderLineItemSnapshot => lineItem !== null)

const buildShopifyOrderEditContext = (
  calculatedOrder:
    | {
        id?: string | null
        originalOrder?: {
          id?: string | null
          name?: string | null
        } | null
        subtotalLineItemsQuantity?: number | null
        subtotalPriceSet?: {
          presentmentMoney?: {
            amount?: string | null
            currencyCode?: string | null
          } | null
        } | null
        totalOutstandingSet?: {
          presentmentMoney?: {
            amount?: string | null
            currencyCode?: string | null
          } | null
        } | null
        lineItems?: {
          nodes?: Array<{
            id?: string | null
            sku?: string | null
            title?: string | null
            quantity?: number | null
          }>
        } | null
        stagedChanges?: {
          nodes?: Array<{
            __typename?: string | null
          }>
        } | null
      }
    | null
    | undefined,
  fallbackCurrencyCode: string,
  fallbackOrderId?: string | null,
) => {
  const originalOrder = calculatedOrder?.originalOrder

  return {
    orderId: trimOrNull(originalOrder?.id) ?? fallbackOrderId ?? null,
    orderName: trimOrNull(originalOrder?.name),
    calculatedOrderId: trimOrNull(calculatedOrder?.id),
    subtotalLineItemsQuantity: toNumber(calculatedOrder?.subtotalLineItemsQuantity),
    subtotalPrice: toShopifyMoneyAmount(
      calculatedOrder?.subtotalPriceSet?.presentmentMoney?.amount,
    ),
    totalOutstanding: toShopifyMoneyAmount(
      calculatedOrder?.totalOutstandingSet?.presentmentMoney?.amount,
    ),
    currencyCode:
      trimOrNull(calculatedOrder?.subtotalPriceSet?.presentmentMoney?.currencyCode) ??
      trimOrNull(calculatedOrder?.totalOutstandingSet?.presentmentMoney?.currencyCode) ??
      fallbackCurrencyCode,
    lineItems: mapShopifyCalculatedOrderLineItems(calculatedOrder?.lineItems?.nodes),
    stagedChangeTypes: unique(
      toArray<{ __typename?: string | null }>(calculatedOrder?.stagedChanges?.nodes)
        .map(change => trimOrNull(change?.__typename))
        .filter((change): change is string => Boolean(change)),
    ),
  }
}

const mapShopifyOrderTransactions = (
  transactions: Array<{
    id?: string | null
    kind?: string | null
    status?: string | null
    gateway?: string | null
    processedAt?: string | null
    amountSet?: {
      shopMoney?: {
        amount?: string | null
        currencyCode?: string | null
      } | null
    } | null
  }>,
  fallbackCurrencyCode: string,
) =>
  transactions
    .map(transaction => {
      const id = trimOrNull(transaction?.id)
      if (!id) {
        return null
      }

      return {
        id,
        kind: trimOrNull(transaction?.kind),
        status: trimOrNull(transaction?.status),
        gateway: trimOrNull(transaction?.gateway),
        processedAt: trimOrNull(transaction?.processedAt),
        amount: toShopifyMoneyAmount(transaction?.amountSet?.shopMoney?.amount),
        currencyCode:
          trimOrNull(transaction?.amountSet?.shopMoney?.currencyCode) ?? fallbackCurrencyCode,
      }
    })
    .filter((transaction): transaction is ShopifyOrderTransactionSnapshot => transaction !== null)

const mapShopifyDraftOrderSummary = (
  draftOrder:
    | {
        id?: string | null
        name?: string | null
        status?: string | null
        ready?: boolean | null
        createdAt?: string | null
        updatedAt?: string | null
        invoiceUrl?: string | null
        invoiceSentAt?: string | null
        reserveInventoryUntil?: string | null
        email?: string | null
        note?: string | null
        tags?: string[] | null
        taxExempt?: boolean | null
        totalPriceSet?: {
          presentmentMoney?: {
            amount?: string | null
            currencyCode?: string | null
          } | null
        } | null
        order?: {
          id?: string | null
          name?: string | null
        } | null
      }
    | null
    | undefined,
  fallbackCurrencyCode: string,
): ShopifyDraftOrderSummarySnapshot | null => {
  const id = trimOrNull(draftOrder?.id)
  if (!id) {
    return null
  }

  const currencyCode =
    trimOrNull(draftOrder?.totalPriceSet?.presentmentMoney?.currencyCode) ?? fallbackCurrencyCode

  return {
    id,
    name: trimOrNull(draftOrder?.name) ?? id,
    status: trimOrNull(draftOrder?.status),
    ready: typeof draftOrder?.ready === "boolean" ? draftOrder.ready : null,
    createdAt: trimOrNull(draftOrder?.createdAt),
    updatedAt: trimOrNull(draftOrder?.updatedAt),
    invoiceUrl: trimOrNull(draftOrder?.invoiceUrl),
    invoiceSentAt: trimOrNull(draftOrder?.invoiceSentAt),
    reserveInventoryUntil: trimOrNull(draftOrder?.reserveInventoryUntil),
    email: trimOrNull(draftOrder?.email),
    note: trimOrNull(draftOrder?.note),
    tags: toArray<string>(draftOrder?.tags)
      .map(tag => tag.trim())
      .filter(Boolean),
    taxExempt: typeof draftOrder?.taxExempt === "boolean" ? draftOrder.taxExempt : null,
    totalPrice: toShopifyMoneyAmount(draftOrder?.totalPriceSet?.presentmentMoney?.amount),
    currencyCode,
    orderId: trimOrNull(draftOrder?.order?.id),
    orderName: trimOrNull(draftOrder?.order?.name),
  }
}

const mapShopifyDraftOrders = (
  draftOrders: Array<{
    id?: string | null
    name?: string | null
    status?: string | null
    ready?: boolean | null
    createdAt?: string | null
    updatedAt?: string | null
    invoiceUrl?: string | null
    invoiceSentAt?: string | null
    reserveInventoryUntil?: string | null
    email?: string | null
    note?: string | null
    tags?: string[] | null
    taxExempt?: boolean | null
    totalPriceSet?: {
      presentmentMoney?: {
        amount?: string | null
        currencyCode?: string | null
      } | null
    } | null
    order?: {
      id?: string | null
      name?: string | null
    } | null
  }>,
  fallbackCurrencyCode: string,
) =>
  draftOrders
    .map(draftOrder => mapShopifyDraftOrderSummary(draftOrder, fallbackCurrencyCode))
    .filter((draftOrder): draftOrder is ShopifyDraftOrderSummarySnapshot => draftOrder !== null)

const mapShopifyOrderLineItems = (
  lineItems: Array<{
    id?: string | null
    sku?: string | null
    name?: string | null
    quantity?: number | null
    refundableQuantity?: number | null
    unfulfilledQuantity?: number | null
  }>,
) =>
  lineItems
    .map(lineItem => {
      const id = trimOrNull(lineItem?.id)
      if (!id) {
        return null
      }

      return {
        id,
        sku: trimOrNull(lineItem?.sku),
        name: trimOrNull(lineItem?.name) ?? "Unnamed item",
        quantity: toNumber(lineItem?.quantity),
        refundableQuantity: toNumber(lineItem?.refundableQuantity),
        unfulfilledQuantity: toNumber(lineItem?.unfulfilledQuantity),
      }
    })
    .filter((lineItem): lineItem is ShopifyOrderLineItemSnapshot => lineItem !== null)

const mapShopifyFulfillmentOrderLineItems = (
  lineItems: Array<{
    id?: string | null
    remainingQuantity?: number | null
    totalQuantity?: number | null
    lineItem?: {
      id?: string | null
      sku?: string | null
      name?: string | null
      quantity?: number | null
    } | null
  }>,
) =>
  lineItems
    .map(lineItem => {
      const lineItemId = trimOrNull(lineItem?.id)
      if (!lineItemId) {
        return null
      }

      return {
        id: lineItemId,
        remainingQuantity: toNumber(lineItem?.remainingQuantity),
        totalQuantity: toNumber(lineItem?.totalQuantity),
        orderLineItemId: trimOrNull(lineItem?.lineItem?.id),
        sku: trimOrNull(lineItem?.lineItem?.sku),
        name: trimOrNull(lineItem?.lineItem?.name) ?? "Unnamed item",
        orderQuantity: toNumber(lineItem?.lineItem?.quantity),
      }
    })
    .filter((lineItem): lineItem is ShopifyFulfillmentOrderLineItemSnapshot => lineItem !== null)

const mapShopifyFulfillmentHolds = (holds: ShopifyFulfillmentHoldNode[] | null | undefined) =>
  toArray<ShopifyFulfillmentHoldNode>(holds)
    .map(hold => ({
      id: trimOrNull(hold?.id),
      reason: trimOrNull(hold?.reason),
      reasonNotes: trimOrNull(hold?.reasonNotes),
      handle: trimOrNull(hold?.handle),
    }))
    .filter(hold => hold.id || hold.reason || hold.reasonNotes || hold.handle)

const mapShopifyFulfillmentMoveCandidates = (
  candidates:
    | {
        edges?: Array<{
          node?: {
            location?: {
              id?: string | null
              name?: string | null
            } | null
            message?: string | null
            movable?: boolean | null
            availableLineItemsCount?: {
              count?: number | null
            } | null
            unavailableLineItemsCount?: {
              count?: number | null
            } | null
          } | null
        }>
      }
    | null
    | undefined,
) =>
  toArray<NonNullable<NonNullable<typeof candidates>["edges"]>[number]>(candidates?.edges)
    .map(edge => ({
      locationId: trimOrNull(edge?.node?.location?.id),
      locationName: trimOrNull(edge?.node?.location?.name),
      movable: typeof edge?.node?.movable === "boolean" ? edge.node.movable : null,
      message: trimOrNull(edge?.node?.message),
      availableLineItemsCount: toNullableNumber(edge?.node?.availableLineItemsCount?.count),
      unavailableLineItemsCount: toNullableNumber(edge?.node?.unavailableLineItemsCount?.count),
    }))
    .filter(
      candidate =>
        candidate.locationId ||
        candidate.locationName ||
        candidate.message ||
        candidate.movable !== null ||
        candidate.availableLineItemsCount !== null ||
        candidate.unavailableLineItemsCount !== null,
    )

const mapShopifyFulfillmentOrderSummary = (
  fulfillmentOrder: ShopifyFulfillmentOrderNode | null | undefined,
): ShopifyFulfillmentOrderSummarySnapshot | null => {
  const id = trimOrNull(fulfillmentOrder?.id)
  if (!id) {
    return null
  }

  return {
    id,
    createdAt: trimOrNull(fulfillmentOrder?.createdAt),
    updatedAt: trimOrNull(fulfillmentOrder?.updatedAt),
    status: trimOrNull(fulfillmentOrder?.status),
    requestStatus: trimOrNull(fulfillmentOrder?.requestStatus),
    orderId: trimOrNull(fulfillmentOrder?.orderId),
    orderName: trimOrNull(fulfillmentOrder?.orderName),
    fulfillAt: trimOrNull(fulfillmentOrder?.fulfillAt),
    fulfillBy: trimOrNull(fulfillmentOrder?.fulfillBy),
    assignedLocationName: trimOrNull(fulfillmentOrder?.assignedLocation?.name),
    assignedLocationId: trimOrNull(fulfillmentOrder?.assignedLocation?.location?.id),
    deliveryMethodType: trimOrNull(fulfillmentOrder?.deliveryMethod?.methodType),
    destinationCity: trimOrNull(fulfillmentOrder?.destination?.city),
    destinationCountryCode: trimOrNull(fulfillmentOrder?.destination?.countryCode),
    supportedActions: toArray<{ action?: string | null }>(fulfillmentOrder?.supportedActions)
      .map(action => trimOrNull(action?.action))
      .filter((action): action is string => Boolean(action)),
    holds: mapShopifyFulfillmentHolds(fulfillmentOrder?.fulfillmentHolds),
    lineItems: mapShopifyFulfillmentOrderLineItems(
      toArray<{
        id?: string | null
        remainingQuantity?: number | null
        totalQuantity?: number | null
        lineItem?: {
          id?: string | null
          sku?: string | null
          name?: string | null
          quantity?: number | null
        } | null
      }>(fulfillmentOrder?.lineItems?.nodes),
    ),
    moveCandidates: mapShopifyFulfillmentMoveCandidates(fulfillmentOrder?.locationsForMove),
  }
}

const mapShopifyFulfillmentOrders = (
  fulfillmentOrders: Array<{
    id?: string | null
    status?: string | null
    requestStatus?: string | null
    assignedLocation?: {
      name?: string | null
      location?: {
        id?: string | null
      } | null
    } | null
    lineItems?: {
      nodes?: Array<{
        id?: string | null
        remainingQuantity?: number | null
        totalQuantity?: number | null
        lineItem?: {
          id?: string | null
          sku?: string | null
          name?: string | null
          quantity?: number | null
        } | null
      }>
    } | null
  }>,
) =>
  fulfillmentOrders
    .map(fulfillmentOrder => {
      const id = trimOrNull(fulfillmentOrder?.id)
      if (!id) {
        return null
      }

      const lineItems = mapShopifyFulfillmentOrderLineItems(
        toArray<NonNullable<NonNullable<typeof fulfillmentOrder.lineItems>["nodes"]>[number]>(
          fulfillmentOrder?.lineItems?.nodes,
        ),
      )

      return {
        id,
        status: trimOrNull(fulfillmentOrder?.status),
        requestStatus: trimOrNull(fulfillmentOrder?.requestStatus),
        assignedLocationName: trimOrNull(fulfillmentOrder?.assignedLocation?.name),
        assignedLocationId: trimOrNull(fulfillmentOrder?.assignedLocation?.location?.id),
        lineItems,
      }
    })
    .filter(
      (fulfillmentOrder): fulfillmentOrder is ShopifyOrderFulfillmentOrderSnapshot =>
        fulfillmentOrder !== null,
    )

const mapShopifyReturnableFulfillments = (
  returnableFulfillments: Array<{
    id?: string | null
    fulfillment?: {
      id?: string | null
    } | null
    returnableFulfillmentLineItems?: {
      nodes?: Array<{
        quantity?: number | null
        fulfillmentLineItem?: {
          id?: string | null
          lineItem?: {
            id?: string | null
            sku?: string | null
            name?: string | null
            quantity?: number | null
          } | null
        } | null
      }>
    } | null
  }>,
) =>
  returnableFulfillments
    .map(returnableFulfillment => {
      const id = trimOrNull(returnableFulfillment?.id)
      if (!id) {
        return null
      }

      const lineItems = toArray<
        NonNullable<
          NonNullable<typeof returnableFulfillment.returnableFulfillmentLineItems>["nodes"]
        >[number]
      >(returnableFulfillment?.returnableFulfillmentLineItems?.nodes)
        .map(lineItem => {
          const fulfillmentLineItemId = trimOrNull(lineItem?.fulfillmentLineItem?.id)
          if (!fulfillmentLineItemId) {
            return null
          }

          return {
            fulfillmentLineItemId,
            orderLineItemId: trimOrNull(lineItem?.fulfillmentLineItem?.lineItem?.id),
            sku: trimOrNull(lineItem?.fulfillmentLineItem?.lineItem?.sku),
            name: trimOrNull(lineItem?.fulfillmentLineItem?.lineItem?.name) ?? "Unnamed item",
            quantity: toNumber(lineItem?.fulfillmentLineItem?.lineItem?.quantity),
            returnableQuantity: toNumber(lineItem?.quantity),
          }
        })
        .filter((lineItem): lineItem is ShopifyReturnableLineItemSnapshot => lineItem !== null)

      return {
        id,
        fulfillmentId: trimOrNull(returnableFulfillment?.fulfillment?.id),
        lineItems,
      }
    })
    .filter(
      (returnableFulfillment): returnableFulfillment is ShopifyReturnableFulfillmentSnapshot =>
        returnableFulfillment !== null,
    )

const mapShopifyLocations = (
  locations: Array<{
    id?: string | null
    name?: string | null
    fulfillsOnlineOrders?: boolean | null
    hasActiveInventory?: boolean | null
    isActive?: boolean | null
    address?: {
      formatted?: string[] | null
    } | null
  }>,
) =>
  locations
    .map(location => {
      const id = trimOrNull(location?.id)
      const name = trimOrNull(location?.name)
      if (!id || !name) {
        return null
      }

      const address = toArray<string>(location?.address?.formatted)
        .map(line => line.trim())
        .filter(Boolean)
        .join(", ")

      return {
        id,
        name,
        fulfillsOnlineOrders:
          typeof location?.fulfillsOnlineOrders === "boolean"
            ? location.fulfillsOnlineOrders
            : null,
        hasActiveInventory:
          typeof location?.hasActiveInventory === "boolean" ? location.hasActiveInventory : null,
        isActive: typeof location?.isActive === "boolean" ? location.isActive : null,
        address: address.length > 0 ? address : null,
      }
    })
    .filter((location): location is ShopifyLocationSnapshot => location !== null)

const mapShopifyCatalogCollections = (
  collections: Array<{
    id?: string | null
    title?: string | null
    handle?: string | null
    updatedAt?: string | null
    sortOrder?: string | null
    ruleSet?: {
      appliedDisjunctively?: boolean | null
      rules?: Array<{
        column?: string | null
        relation?: string | null
        condition?: string | null
      }> | null
    } | null
  }>,
) =>
  collections
    .map(collection => {
      const id = trimOrNull(collection?.id)
      const title = trimOrNull(collection?.title)
      if (!id || !title) {
        return null
      }

      return {
        id,
        title,
        handle: trimOrNull(collection?.handle),
        updatedAt: trimOrNull(collection?.updatedAt),
        sortOrder: trimOrNull(collection?.sortOrder),
        collectionType: collection?.ruleSet ? "smart" : "manual",
        appliedDisjunctively:
          typeof collection?.ruleSet?.appliedDisjunctively === "boolean"
            ? collection.ruleSet.appliedDisjunctively
            : null,
        rules: toArray<NonNullable<NonNullable<typeof collection.ruleSet>["rules"]>[number]>(
          collection?.ruleSet?.rules,
        )
          .map(rule => ({
            column: trimOrNull(rule?.column),
            relation: trimOrNull(rule?.relation),
            condition: trimOrNull(rule?.condition),
          }))
          .filter(rule => rule.column || rule.relation || rule.condition),
      }
    })
    .filter((collection): collection is ShopifyCatalogCollectionSnapshot => collection !== null)

const mapShopifyCatalogProducts = (
  products: Array<{
    id?: string | null
    title?: string | null
    handle?: string | null
    status?: string | null
    vendor?: string | null
    totalInventory?: number | null
  }>,
) =>
  products
    .map(product => {
      const id = trimOrNull(product?.id)
      const title = trimOrNull(product?.title)
      if (!id || !title) {
        return null
      }

      return {
        id,
        title,
        handle: trimOrNull(product?.handle),
        status: trimOrNull(product?.status),
        vendor: trimOrNull(product?.vendor),
        totalInventory: toNullableNumber(product?.totalInventory),
      }
    })
    .filter((product): product is ShopifyCatalogProductSnapshot => product !== null)

const mapShopifyCatalogVariants = (
  variants: Array<{
    id?: string | null
    sku?: string | null
    displayName?: string | null
    price?: string | null
    inventoryQuantity?: number | null
    product?: {
      id?: string | null
      title?: string | null
    } | null
  }>,
  fallbackCurrencyCode: string,
) =>
  variants
    .map(variant => {
      const id = trimOrNull(variant?.id)
      if (!id) {
        return null
      }

      return {
        id,
        sku: trimOrNull(variant?.sku),
        displayName:
          trimOrNull(variant?.displayName) ??
          trimOrNull(variant?.sku) ??
          trimOrNull(variant?.product?.title) ??
          id,
        productId: trimOrNull(variant?.product?.id),
        productTitle: trimOrNull(variant?.product?.title),
        inventoryQuantity: toNumber(variant?.inventoryQuantity),
        price: variant?.price ? toShopifyMoneyAmount(variant.price) : null,
        currencyCode: fallbackCurrencyCode,
      }
    })
    .filter((variant): variant is ShopifyCatalogVariantSnapshot => variant !== null)

const getInventoryLevelQuantity = (
  quantities:
    | Array<{
        name?: string | null
        quantity?: number | null
      }>
    | null
    | undefined,
  name: "available" | "committed" | "incoming" | "on_hand" | "reserved",
) => {
  const quantity = toArray<{
    name?: string | null
    quantity?: number | null
  }>(quantities).find(entry => trimOrNull(entry?.name) === name)

  return quantity && typeof quantity.quantity === "number" && Number.isFinite(quantity.quantity)
    ? quantity.quantity
    : null
}

const addNullableQuantity = (current: number | null, next: number | null) =>
  current === null && next === null ? null : toNumber(current) + toNumber(next)

const toShopifyMoneyString = (value: number) => {
  if (!Number.isFinite(value)) {
    return "0"
  }

  return value.toFixed(2)
}

const mapShopifyDraftOrderAttributes = (
  attributes: ShopifyDraftOrderAttributeInput[] | undefined,
  options?: {
    preserveExplicitEmpty?: boolean
  },
) => {
  const sourceAttributes = toArray<ShopifyDraftOrderAttributeInput>(attributes)
  const mappedAttributes = sourceAttributes
    .map(attribute => {
      const key = trimOrNull(attribute.key)
      const value = trimOrNull(attribute.value)
      if (!key || !value) {
        return null
      }

      return {
        key,
        value,
      }
    })
    .filter((attribute): attribute is { key: string; value: string } => attribute !== null)

  if (mappedAttributes.length > 0) {
    return mappedAttributes
  }

  return sourceAttributes.length === 0 && options?.preserveExplicitEmpty ? [] : undefined
}

const mapShopifyDraftOrderAddress = (address: ShopifyDraftOrderAddressInput | undefined) => {
  if (!address) {
    return undefined
  }

  const mappedAddress = {
    firstName: trimOrNull(address.firstName) ?? undefined,
    lastName: trimOrNull(address.lastName) ?? undefined,
    company: trimOrNull(address.company) ?? undefined,
    address1: trimOrNull(address.address1) ?? undefined,
    address2: trimOrNull(address.address2) ?? undefined,
    city: trimOrNull(address.city) ?? undefined,
    province: trimOrNull(address.province) ?? undefined,
    provinceCode: trimOrNull(address.provinceCode) ?? undefined,
    country: trimOrNull(address.country) ?? undefined,
    countryCode: trimOrNull(address.countryCode) ?? undefined,
    zip: trimOrNull(address.zip) ?? undefined,
    phone: trimOrNull(address.phone) ?? undefined,
  }

  return Object.values(mappedAddress).some(value => value !== undefined) ? mappedAddress : undefined
}

const mapShopifyDraftOrderAppliedDiscount = (
  appliedDiscount: ShopifyDraftOrderAppliedDiscountInput | undefined,
) => {
  if (!appliedDiscount || !Number.isFinite(appliedDiscount.value)) {
    return undefined
  }

  const normalizedAmount =
    typeof appliedDiscount.amount === "number" && Number.isFinite(appliedDiscount.amount)
      ? appliedDiscount.amount
      : appliedDiscount.valueType === "FIXED_AMOUNT"
        ? appliedDiscount.value
        : undefined

  return {
    value: toShopifyMoneyString(appliedDiscount.value),
    valueType: appliedDiscount.valueType,
    amount:
      typeof normalizedAmount === "number" ? toShopifyMoneyString(normalizedAmount) : undefined,
    title: trimOrNull(appliedDiscount.title) ?? undefined,
    description: trimOrNull(appliedDiscount.description) ?? undefined,
  }
}

const mapShopifyDraftOrderLineItems = (lineItems: ShopifyDraftOrderLineItemInput[] | undefined) => {
  const mappedLineItems = toArray<ShopifyDraftOrderLineItemInput>(lineItems)
    .map(lineItem => {
      const quantity = Math.max(1, Math.round(lineItem.quantity))
      const appliedDiscount = mapShopifyDraftOrderAppliedDiscount(lineItem.appliedDiscount)
      const customAttributes = mapShopifyDraftOrderAttributes(lineItem.customAttributes)

      if ("variantId" in lineItem) {
        const variantId = trimOrNull(lineItem.variantId)
        if (!variantId) {
          return null
        }

        return {
          variantId,
          quantity,
          appliedDiscount,
          customAttributes,
        }
      }

      const title = trimOrNull(lineItem.title)
      if (!title) {
        return null
      }

      const weight =
        lineItem.weight && Number.isFinite(lineItem.weight.value)
          ? {
              value: lineItem.weight.value,
              unit: lineItem.weight.unit,
            }
          : undefined

      return {
        title,
        originalUnitPrice: toShopifyMoneyString(lineItem.originalUnitPrice),
        quantity,
        appliedDiscount,
        customAttributes,
        weight,
      }
    })
    .filter((lineItem): lineItem is NonNullable<typeof lineItem> => lineItem !== null)

  return mappedLineItems.length > 0 ? mappedLineItems : undefined
}

const buildShopifyDraftOrderInput = (input: ShopifyDraftOrderInput) => {
  const tags = toArray<string>(input.tags)
    .map(tag => tag.trim())
    .filter(Boolean)

  const shippingLineTitle = trimOrNull(input.shippingLine?.title)
  const shippingLinePrice = input.shippingLine?.price

  return {
    lineItems: mapShopifyDraftOrderLineItems(input.lineItems),
    email: trimOrNull(input.email) ?? undefined,
    note: trimOrNull(input.note) ?? undefined,
    tags: tags.length > 0 ? tags : undefined,
    taxExempt: input.taxExempt ?? undefined,
    reserveInventoryUntil: trimOrNull(input.reserveInventoryUntil) ?? undefined,
    billingAddress: mapShopifyDraftOrderAddress(input.billingAddress),
    shippingAddress: mapShopifyDraftOrderAddress(input.shippingAddress),
    shippingLine:
      shippingLineTitle &&
      typeof shippingLinePrice === "number" &&
      Number.isFinite(shippingLinePrice)
        ? {
            title: shippingLineTitle,
            price: toShopifyMoneyString(shippingLinePrice),
          }
        : undefined,
    appliedDiscount: mapShopifyDraftOrderAppliedDiscount(input.appliedDiscount),
    customAttributes: mapShopifyDraftOrderAttributes(input.customAttributes),
  }
}

const buildShopifyDraftOrderUpdateInput = (input: ShopifyDraftOrderInput) => {
  const tags = mapExplicitStringArrayUpdate(input, "tags")
  const shippingLineTitle = trimOrNull(input.shippingLine?.title)
  const shippingLinePrice = input.shippingLine?.price
  const customAttributes =
    hasOwnKey(input, "customAttributes") && input.customAttributes !== undefined
      ? mapShopifyDraftOrderAttributes(input.customAttributes, {
          preserveExplicitEmpty: true,
        })
      : undefined

  return {
    lineItems: mapShopifyDraftOrderLineItems(input.lineItems),
    email: mapExplicitStringUpdate(input, "email"),
    note: mapExplicitStringUpdate(input, "note"),
    tags,
    taxExempt: input.taxExempt ?? undefined,
    reserveInventoryUntil: mapExplicitStringUpdate(input, "reserveInventoryUntil"),
    billingAddress: mapShopifyDraftOrderAddress(input.billingAddress),
    shippingAddress: mapShopifyDraftOrderAddress(input.shippingAddress),
    shippingLine:
      shippingLineTitle &&
      typeof shippingLinePrice === "number" &&
      Number.isFinite(shippingLinePrice)
        ? {
            title: shippingLineTitle,
            price: toShopifyMoneyString(shippingLinePrice),
          }
        : undefined,
    appliedDiscount: mapShopifyDraftOrderAppliedDiscount(input.appliedDiscount),
    customAttributes,
  }
}

const mapShopifyDraftOrderEmailInput = (
  email: ShopifyDraftOrderInvoiceSendInput["email"] | undefined,
) => {
  if (!email) {
    return undefined
  }

  const mappedEmail = {
    to: trimOrNull(email.to) ?? undefined,
    subject: trimOrNull(email.subject) ?? undefined,
    customMessage: trimOrNull(email.customMessage) ?? undefined,
  }

  return Object.values(mappedEmail).some(value => value !== undefined) ? mappedEmail : undefined
}

const buildShopifyOrderUpdateInput = (input: ShopifyOrderUpdateInput) => {
  const tags = mapExplicitStringArrayUpdate(input, "tags")
  const customAttributes =
    hasOwnKey(input, "customAttributes") && input.customAttributes !== undefined
      ? mapShopifyDraftOrderAttributes(input.customAttributes, {
          preserveExplicitEmpty: true,
        })
      : undefined

  return {
    id: input.orderId,
    customAttributes,
    email: mapExplicitStringUpdate(input, "email"),
    note: mapExplicitStringUpdate(input, "note"),
    phone: mapExplicitStringUpdate(input, "phone"),
    poNumber: mapExplicitStringUpdate(input, "poNumber"),
    shippingAddress: mapShopifyDraftOrderAddress(input.shippingAddress),
    tags,
  }
}

const mapFulfillmentOrderLineItemsInput = (
  lineItems: ShopifyFulfillmentOrderLineItemInput[] | undefined,
) => {
  const mappedLineItems = toArray<ShopifyFulfillmentOrderLineItemInput>(lineItems)
    .map(lineItem => {
      const id = trimOrNull(lineItem.id)
      if (!id) {
        return null
      }

      return {
        id,
        quantity: Math.max(1, Math.round(lineItem.quantity)),
      }
    })
    .filter((lineItem): lineItem is { id: string; quantity: number } => lineItem !== null)

  return mappedLineItems.length > 0 ? mappedLineItems : undefined
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

const resolveWindowTimeZone = (
  storeTimeZone: string,
  options: {
    timeBasis: StoreOverviewTimeBasis
    callerTimeZone?: string
  },
) => {
  if (options.timeBasis === "store") {
    return storeTimeZone
  }

  const callerTimeZone = options.callerTimeZone?.trim()
  if (!callerTimeZone) {
    throw new Error('callerTimeZone is required when timeBasis is "caller".')
  }
  if (!isValidTimeZone(callerTimeZone)) {
    throw new Error(`Invalid callerTimeZone "${callerTimeZone}".`)
  }
  return callerTimeZone
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

const loadOptionalShopifyInventoryUnits = async (client: ShopifyGraphQLClient) => {
  try {
    return {
      inventoryUnits: await fetchAllShopifyInventoryUnits(client),
      inventoryErrorMessage: undefined,
    }
  } catch (error) {
    return {
      inventoryUnits: undefined,
      inventoryErrorMessage:
        error instanceof Error ? error.message : "Failed to load Shopify inventory totals.",
    }
  }
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

const fetchAllProductVariantsWithCost = async (
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
      await client.request<ShopifyProductVariantsPage>(
        SHOPIFY_PRODUCT_VARIANTS_PAGE_WITH_COST_QUERY,
        {
          variables: {
            productId,
            after,
          },
        },
      )

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

const fetchAllSkuCandidatesWithCost = async (
  client: ShopifyGraphQLClient,
  requestedValue: string,
) => {
  const skuQuery = `sku:${JSON.stringify(requestedValue)}`
  const skuVariants: NonNullable<
    NonNullable<ShopifyVariantLookupPage["productVariants"]>["nodes"]
  > = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result: ShopifyGraphQLResponse<ShopifyVariantLookupPage> =
      await client.request<ShopifyVariantLookupPage>(SHOPIFY_VARIANT_BY_SKU_WITH_COST_QUERY, {
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
      ? grossMarginPct(averageUnitPrice, averageUnitCost)
      : null

  return {
    averageUnitPrice,
    averageUnitCost,
    currentMarginPct,
  }
}

const isShopifyProductCostAccessError = (error: unknown) =>
  error instanceof Error &&
  /(unitcost|inventoryitem|product costs|view product costs)/i.test(error.message)

const tryLoadShopifyVariantCosts = async (
  client: ShopifyGraphQLClient,
  selection: ShopifyVariantSelection,
) => {
  const selectedVariantKeys = new Set(selection.variants.map(getVariantKey).filter(Boolean))
  const selectedProductId = selection.variants[0]?.product?.id?.trim()
  const hasSingleResolvedProduct =
    typeof selectedProductId === "string" &&
    selectedProductId.length > 0 &&
    selection.variants.every(variant => variant?.product?.id?.trim() === selectedProductId)

  if (hasSingleResolvedProduct) {
    const productWithVariants = await fetchAllProductVariantsWithCost(client, {
      id: selectedProductId,
      title: selection.variants[0]?.product?.title ?? null,
    })
    const hydratedVariants = toArray<ShopifyProductVariantNode>(
      productWithVariants.variants?.nodes,
    ).filter(variant => selectedVariantKeys.has(getVariantKey(variant)))

    return hydratedVariants.length > 0 ? hydratedVariants : selection.variants
  }

  const hydratedVariants = await runInBatches(
    selection.resolvedSkus,
    SHOPIFY_VARIANT_FETCH_BATCH_SIZE,
    async sku => fetchAllSkuCandidatesWithCost(client, sku),
  )

  const flattenedVariants = hydratedVariants
    .flat()
    .filter(variant => selectedVariantKeys.has(getVariantKey(variant)))

  return flattenedVariants.length > 0 ? flattenedVariants : selection.variants
}

/** Loads a Shopify store overview with sales and optional inventory totals for a time window. */
export const loadShopifyStoreOverview = async (
  store: ShopifyStoreConfig,
  options: {
    timeBasis: StoreOverviewTimeBasis
    rangePreset?: StoreOverviewRangePreset
    startDate?: string
    endDate?: string
    callerTimeZone?: string
  },
): Promise<ShopifyStoreOverviewSnapshot> => {
  const client = await createShopifyClient(store)
  const [shopResult, inventoryResult] = await Promise.all([
    client.request<{
      shop?: { name?: string; currencyCode?: string; ianaTimezone?: string | null }
    }>(SHOPIFY_SHOP_QUERY),
    loadOptionalShopifyInventoryUnits(client),
  ])

  if (shopResult.errors) {
    throw new Error(formatShopifyErrors(shopResult.errors))
  }

  const shop = shopResult.data?.shop
  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const windowTimeZone = resolveWindowTimeZone(timeZone, options)
  const window =
    options.startDate && options.endDate
      ? resolveCustomStoreOverviewWindow(options.startDate, options.endDate, windowTimeZone)
      : resolveStoreOverviewWindow(options.rangePreset ?? "today", windowTimeZone)
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
    typeof inventoryResult.inventoryUnits === "number" && averageDailyUnits && averageDailyUnits > 0
      ? inventoryResult.inventoryUnits / averageDailyUnits
      : undefined
  const retrievedAtIso = new Date().toISOString()

  return {
    source: "shopify",
    retrievedAtIso,
    storeName: shop?.name ?? store.name,
    timezone: timeZone,
    windowTimeZone,
    currencyCode:
      shop?.currencyCode ??
      orders[0]?.currentTotalPriceSet?.shopMoney?.currencyCode ??
      DEFAULT_PLUGIN_CONFIG.currency,
    windowLabel: window.windowLabel,
    ordersCount: orders.length,
    unitsSold,
    revenue,
    inventoryUnits: inventoryResult.inventoryUnits,
    averageDailyUnits,
    inventoryDaysLeft,
    inventoryErrorMessage: inventoryResult.inventoryErrorMessage,
  }
}

/** Loads a Shopify store sales summary across multiple standard windows using one order crawl. */
export const loadShopifyStoreSalesSummary = async (
  store: ShopifyStoreConfig,
  options: {
    timeBasis: StoreOverviewTimeBasis
    windows: StoreOverviewRangePreset[]
    callerTimeZone?: string
  },
): Promise<ShopifyStoreSalesSummarySnapshot> => {
  const client = await createShopifyClient(store)
  const shop = await fetchShopifyShopMetadata(client)
  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const windowTimeZone = resolveWindowTimeZone(timeZone, options)
  const now = new Date()
  const windows = options.windows.map(rangePreset => ({
    rangePreset,
    ...resolveStoreOverviewWindow(rangePreset, windowTimeZone, now),
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
  const { inventoryUnits, inventoryErrorMessage } = await loadOptionalShopifyInventoryUnits(client)

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
    windowTimeZone,
    currencyCode,
    windows: summaryWindows,
    inventoryUnits,
    inventoryDaysLeft,
    inventoryErrorMessage,
  }
}

/** Queries Shopify products with one page of lightweight catalog summaries. */
export const queryShopifyCatalogProducts = async (
  store: ShopifyStoreConfig,
  input?: {
    query?: string
    first?: number
    after?: string
  },
): Promise<ShopifyCatalogProductsQuerySnapshot> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyCatalogProductsQuery>(SHOPIFY_CATALOG_PRODUCTS_QUERY, {
      variables: {
        first: Math.min(Math.max(Math.round(toNumber(input?.first, 25)), 1), 50),
        after: trimOrNull(input?.after),
        query: trimOrNull(input?.query),
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const page = result.data?.products

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: timeZone,
    query: trimOrNull(input?.query),
    pageInfo: {
      hasNextPage: Boolean(page?.pageInfo?.hasNextPage),
      endCursor: trimOrNull(page?.pageInfo?.endCursor),
    },
    products: mapShopifyCatalogProducts(
      toArray<NonNullable<NonNullable<ShopifyCatalogProductsQuery["products"]>["nodes"]>[number]>(
        page?.nodes,
      ),
    ),
  }
}

/** Queries Shopify collections with one page of lightweight collection summaries. */
export const queryShopifyCatalogCollections = async (
  store: ShopifyStoreConfig,
  input?: {
    query?: string
    first?: number
    after?: string
  },
): Promise<ShopifyCatalogCollectionsQuerySnapshot> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyCatalogCollectionsQuery>(SHOPIFY_CATALOG_COLLECTIONS_QUERY, {
      variables: {
        first: Math.min(Math.max(Math.round(toNumber(input?.first, 25)), 1), 50),
        after: trimOrNull(input?.after),
        query: trimOrNull(input?.query),
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const page = result.data?.collections

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: timeZone,
    query: trimOrNull(input?.query),
    pageInfo: {
      hasNextPage: Boolean(page?.pageInfo?.hasNextPage),
      endCursor: trimOrNull(page?.pageInfo?.endCursor),
    },
    collections: mapShopifyCatalogCollections(
      toArray<
        NonNullable<NonNullable<ShopifyCatalogCollectionsQuery["collections"]>["nodes"]>[number]
      >(page?.nodes),
    ),
  }
}

/** Queries one page of Shopify variant summaries. */
const queryShopifyCatalogVariantsPage = async (
  client: ShopifyGraphQLClient,
  input?: {
    query?: string
    first?: number
    after?: string
  },
) => {
  const result = await client.request<ShopifyCatalogVariantsQuery>(SHOPIFY_CATALOG_VARIANTS_QUERY, {
    variables: {
      first: Math.min(Math.max(Math.round(toNumber(input?.first, 25)), 1), 50),
      after: trimOrNull(input?.after),
      query: trimOrNull(input?.query),
    },
  })

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  return result.data?.productVariants
}

/** Queries Shopify variant summaries, optionally continuing through all remaining pages. */
export const queryShopifyCatalogVariants = async (
  store: ShopifyStoreConfig,
  input?: {
    query?: string
    first?: number
    allPages?: boolean
    after?: string
  },
): Promise<ShopifyCatalogVariantsQuerySnapshot> => {
  const client = await createShopifyClient(store)
  const query = trimOrNull(input?.query)
  const [shop, firstPage] = await Promise.all([
    fetchShopifyShopMetadata(client),
    queryShopifyCatalogVariantsPage(client, {
      query: query ?? undefined,
      first: input?.first,
      after: input?.after,
    }),
  ])
  const currencyCode = trimOrNull(shop?.currencyCode) ?? DEFAULT_PLUGIN_CONFIG.currency
  const variants = toArray<
    NonNullable<NonNullable<ShopifyCatalogVariantsQuery["productVariants"]>["nodes"]>[number]
  >(firstPage?.nodes)
  let hasNextPage = Boolean(firstPage?.pageInfo?.hasNextPage)
  let endCursor = trimOrNull(firstPage?.pageInfo?.endCursor)

  if (input?.allPages) {
    while (hasNextPage) {
      const page = await queryShopifyCatalogVariantsPage(client, {
        query: query ?? undefined,
        first: input?.first,
        after: endCursor ?? undefined,
      })
      variants.push(
        ...toArray<
          NonNullable<NonNullable<ShopifyCatalogVariantsQuery["productVariants"]>["nodes"]>[number]
        >(page?.nodes),
      )
      hasNextPage = Boolean(page?.pageInfo?.hasNextPage)
      endCursor = trimOrNull(page?.pageInfo?.endCursor)
    }
  }

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    query,
    pageInfo: {
      hasNextPage: input?.allPages ? false : hasNextPage,
      endCursor,
    },
    variants: mapShopifyCatalogVariants(variants, currencyCode),
  }
}

/** Queries Shopify locations with one page of lightweight location summaries. */
export const queryShopifyLocations = async (
  store: ShopifyStoreConfig,
  input?: {
    query?: string
    first?: number
    after?: string
    includeInactive?: boolean
  },
): Promise<ShopifyLocationsQuerySnapshot> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyLocationsQuery>(SHOPIFY_LOCATIONS_QUERY, {
      variables: {
        first: Math.min(Math.max(Math.round(toNumber(input?.first, 25)), 1), 50),
        after: trimOrNull(input?.after),
        query: trimOrNull(input?.query),
        includeInactive: Boolean(input?.includeInactive),
        includeLegacy: true,
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const page = result.data?.locations

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: timeZone,
    query: trimOrNull(input?.query),
    pageInfo: {
      hasNextPage: Boolean(page?.pageInfo?.hasNextPage),
      endCursor: trimOrNull(page?.pageInfo?.endCursor),
    },
    locations: mapShopifyLocations(
      toArray<NonNullable<NonNullable<ShopifyLocationsQuery["locations"]>["nodes"]>[number]>(
        page?.nodes,
      ),
    ),
  }
}

/** Queries Shopify draft orders with one page of operational draft-order summaries. */
export const queryShopifyDraftOrders = async (
  store: ShopifyStoreConfig,
  input?: ShopifyDraftOrdersQueryInput,
): Promise<ShopifyDraftOrdersQuerySnapshot> => {
  const client = await createShopifyClient(store)
  const [shop, draftOrderResult] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyDraftOrdersQuery>(SHOPIFY_DRAFT_ORDERS_QUERY, {
      variables: {
        first: Math.min(Math.max(Math.round(toNumber(input?.first, 25)), 1), 50),
        after: trimOrNull(input?.after),
        query: trimOrNull(input?.query),
        reverse: input?.reverse ?? true,
      },
    }),
  ])

  if (draftOrderResult.errors) {
    throw new Error(formatShopifyErrors(draftOrderResult.errors))
  }

  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const currencyCode = trimOrNull(shop?.currencyCode) ?? DEFAULT_PLUGIN_CONFIG.currency
  const page = draftOrderResult.data?.draftOrders

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: timeZone,
    query: trimOrNull(input?.query),
    pageInfo: {
      hasNextPage: Boolean(page?.pageInfo?.hasNextPage),
      endCursor: trimOrNull(page?.pageInfo?.endCursor),
    },
    draftOrders: mapShopifyDraftOrders(
      toArray<NonNullable<NonNullable<ShopifyDraftOrdersQuery["draftOrders"]>["nodes"]>[number]>(
        page?.nodes,
      ),
      currencyCode,
    ),
  }
}

/** Queries Shopify fulfillment orders with one page of operational fulfillment-order summaries. */
export const queryShopifyFulfillmentOrders = async (
  store: ShopifyStoreConfig,
  input?: ShopifyFulfillmentOrdersQueryInput,
): Promise<ShopifyFulfillmentOrdersQuerySnapshot> => {
  const client = await createShopifyClient(store)
  const [shop, fulfillmentOrderResult] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyFulfillmentOrdersQuery>(SHOPIFY_FULFILLMENT_ORDERS_QUERY, {
      variables: {
        first: Math.min(Math.max(Math.round(toNumber(input?.first, 25)), 1), 50),
        after: trimOrNull(input?.after),
        query: trimOrNull(input?.query),
        reverse: input?.reverse ?? true,
        includeClosed: Boolean(input?.includeClosed),
      },
    }),
  ])

  if (fulfillmentOrderResult.errors) {
    throw new Error(formatShopifyErrors(fulfillmentOrderResult.errors))
  }

  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const page = fulfillmentOrderResult.data?.fulfillmentOrders

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: timeZone,
    query: trimOrNull(input?.query),
    includeClosed: Boolean(input?.includeClosed),
    pageInfo: {
      hasNextPage: Boolean(page?.pageInfo?.hasNextPage),
      endCursor: trimOrNull(page?.pageInfo?.endCursor),
    },
    fulfillmentOrders: toArray<
      NonNullable<NonNullable<ShopifyFulfillmentOrdersQuery["fulfillmentOrders"]>["nodes"]>[number]
    >(page?.nodes)
      .map(fulfillmentOrder => mapShopifyFulfillmentOrderSummary(fulfillmentOrder))
      .filter(
        (fulfillmentOrder): fulfillmentOrder is ShopifyFulfillmentOrderSummarySnapshot =>
          fulfillmentOrder !== null,
      ),
  }
}

/** Queries Shopify orders with one page of operational order summaries. */
export const queryShopifyOrders = async (
  store: ShopifyStoreConfig,
  input?: {
    query?: string
    first?: number
    after?: string
    reverse?: boolean
  },
): Promise<ShopifyOrdersQuerySnapshot> => {
  const client = await createShopifyClient(store)
  const [shop, orderResult] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyOrderSummariesPage>(SHOPIFY_ORDER_SUMMARIES_QUERY, {
      variables: {
        first: Math.min(Math.max(Math.round(toNumber(input?.first, 25)), 1), 50),
        after: trimOrNull(input?.after),
        query: trimOrNull(input?.query),
        reverse: input?.reverse ?? true,
      },
    }),
  ])

  if (orderResult.errors) {
    throw new Error(formatShopifyErrors(orderResult.errors))
  }

  const timeZone = coerceShopTimeZone(shop?.ianaTimezone)
  const page = orderResult.data?.orders
  const orders = toArray<
    NonNullable<NonNullable<ShopifyOrderSummariesPage["orders"]>["nodes"]>[number]
  >(page?.nodes)
    .map(order => {
      const id = trimOrNull(order?.id)
      const createdAt = trimOrNull(order?.createdAt)
      if (!id || !createdAt) {
        return null
      }

      const currencyCode =
        trimOrNull(order?.currentTotalPriceSet?.shopMoney?.currencyCode) ??
        trimOrNull(shop?.currencyCode) ??
        DEFAULT_PLUGIN_CONFIG.currency

      return {
        id,
        name: trimOrNull(order?.name) ?? id,
        createdAt,
        displayFinancialStatus: trimOrNull(order?.displayFinancialStatus) ?? "unknown",
        displayFulfillmentStatus: trimOrNull(order?.displayFulfillmentStatus) ?? "unknown",
        unitsSold: toNumber(order?.currentSubtotalLineItemsQuantity),
        totalPrice: toShopifyMoneyAmount(order?.currentTotalPriceSet?.shopMoney?.amount),
        currencyCode,
        customerName: trimOrNull(order?.customer?.displayName),
        customerEmail: trimOrNull(order?.customer?.email) ?? trimOrNull(order?.email),
      }
    })
    .filter((order): order is ShopifyOrderSummarySnapshot => order !== null)

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: timeZone,
    query: trimOrNull(input?.query),
    pageInfo: {
      hasNextPage: Boolean(page?.pageInfo?.hasNextPage),
      endCursor: trimOrNull(page?.pageInfo?.endCursor),
    },
    orders,
  }
}

const collectPaginatedNodes = async <TNode>(
  initialNodes: TNode[],
  initialPageInfo: ShopifyConnectionPageInfo | null | undefined,
  loadPage: (after: string | null) => Promise<{
    nodes: TNode[]
    pageInfo: ShopifyConnectionPageInfo | null | undefined
  }>,
) => {
  const nodes = [...initialNodes]
  let hasNextPage = Boolean(initialPageInfo?.hasNextPage)
  let after = initialPageInfo?.endCursor ?? null

  while (hasNextPage) {
    const page = await loadPage(after)
    nodes.push(...page.nodes)
    hasNextPage = Boolean(page.pageInfo?.hasNextPage)
    after = page.pageInfo?.endCursor ?? null
  }

  return nodes
}

const loadShopifyOrderLineItems = async (
  client: ShopifyGraphQLClient,
  orderId: string,
  initialLineItems: ShopifyDetailedOrderLineItem[],
  initialPageInfo: ShopifyConnectionPageInfo | null | undefined,
) =>
  collectPaginatedNodes(initialLineItems, initialPageInfo, async after => {
    const result = await client.request<ShopifyOrderLineItemsPage>(
      SHOPIFY_ORDER_LINE_ITEMS_PAGE_QUERY,
      {
        variables: {
          orderId,
          after,
        },
      },
    )

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.order?.lineItems
    return {
      pageInfo: page?.pageInfo,
      nodes: toArray<ShopifyPaginatedOrderLineItem>(page?.nodes),
    }
  })

const loadShopifyOrderTransactions = async (
  client: ShopifyGraphQLClient,
  orderId: string,
  initialTransactions: ShopifyDetailedOrderTransaction[],
  initialPageInfo: ShopifyConnectionPageInfo | null | undefined,
) =>
  collectPaginatedNodes(initialTransactions, initialPageInfo, async after => {
    const result = await client.request<ShopifyOrderTransactionsPage>(
      SHOPIFY_ORDER_TRANSACTIONS_PAGE_QUERY,
      {
        variables: {
          orderId,
          after,
        },
      },
    )

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.order?.transactions
    return {
      pageInfo: page?.pageInfo,
      nodes: toArray<ShopifyPaginatedOrderTransaction>(page?.nodes),
    }
  })

const loadShopifyFulfillmentOrderLineItems = async (
  client: ShopifyGraphQLClient,
  fulfillmentOrderId: string,
  initialLineItems: ShopifyDetailedFulfillmentOrderLineItem[],
  initialPageInfo: ShopifyConnectionPageInfo | null | undefined,
) =>
  collectPaginatedNodes(initialLineItems, initialPageInfo, async after => {
    const result = await client.request<ShopifyFulfillmentOrderLineItemsPage>(
      SHOPIFY_FULFILLMENT_ORDER_LINE_ITEMS_PAGE_QUERY,
      {
        variables: {
          fulfillmentOrderId,
          after,
        },
      },
    )

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.fulfillmentOrder?.lineItems
    return {
      pageInfo: page?.pageInfo,
      nodes: toArray<ShopifyDetailedFulfillmentOrderLineItem>(page?.nodes),
    }
  })

const loadShopifyReturnableFulfillmentLineItems = async (
  client: ShopifyGraphQLClient,
  returnableFulfillmentId: string,
  initialLineItems: ShopifyDetailedReturnableFulfillmentLineItem[],
  initialPageInfo: ShopifyConnectionPageInfo | null | undefined,
) =>
  collectPaginatedNodes(initialLineItems, initialPageInfo, async after => {
    const result = await client.request<ShopifyReturnableFulfillmentLineItemsPage>(
      SHOPIFY_RETURNABLE_FULFILLMENT_LINE_ITEMS_PAGE_QUERY,
      {
        variables: {
          returnableFulfillmentId,
          after,
        },
      },
    )

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.returnableFulfillment?.returnableFulfillmentLineItems
    return {
      pageInfo: page?.pageInfo,
      nodes: toArray<ShopifyDetailedReturnableFulfillmentLineItem>(page?.nodes),
    }
  })

/** Queries returnable fulfillment line items for one Shopify order. */
export const queryShopifyReturnableFulfillments = async (
  store: ShopifyStoreConfig,
  orderId: string,
): Promise<ShopifyReturnableFulfillmentsSnapshot> => {
  const client = await createShopifyClient(store)
  const normalizedOrderId = trimOrNull(orderId)
  const shopMetadata = await fetchShopifyShopMetadata(client)
  if (!normalizedOrderId) {
    return {
      source: "shopify",
      retrievedAtIso: new Date().toISOString(),
      storeName: shopMetadata?.name ?? store.name,
      timezone: coerceShopTimeZone(shopMetadata?.ianaTimezone),
      orderId,
      returnableFulfillments: [],
    }
  }

  const shop = shopMetadata
  const returnableFulfillments: ShopifyReturnableFulfillmentNode[] = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result: ShopifyGraphQLResponse<ShopifyReturnableFulfillmentsQuery> =
      await client.request<ShopifyReturnableFulfillmentsQuery>(
        SHOPIFY_RETURNABLE_FULFILLMENTS_QUERY,
        {
          variables: {
            orderId: normalizedOrderId,
            after,
            first: 25,
            lineItemsFirst: 100,
          },
        },
      )

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page: ShopifyReturnableFulfillmentsQuery["returnableFulfillments"] | undefined =
      result.data?.returnableFulfillments

    for (const returnableFulfillment of toArray<ShopifyReturnableFulfillmentNode>(page?.nodes)) {
      const returnableFulfillmentId = trimOrNull(returnableFulfillment?.id)
      const initialLineItems = toArray<ShopifyDetailedReturnableFulfillmentLineItem>(
        returnableFulfillment?.returnableFulfillmentLineItems?.nodes,
      )
      const lineItems = returnableFulfillmentId
        ? await loadShopifyReturnableFulfillmentLineItems(
            client,
            returnableFulfillmentId,
            initialLineItems,
            returnableFulfillment?.returnableFulfillmentLineItems?.pageInfo,
          )
        : initialLineItems

      returnableFulfillments.push({
        ...returnableFulfillment,
        returnableFulfillmentLineItems: {
          nodes: lineItems,
        },
      })
    }

    hasNextPage = Boolean(page?.pageInfo?.hasNextPage)
    after = page?.pageInfo?.endCursor ?? null
  }

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: normalizedOrderId,
    returnableFulfillments: mapShopifyReturnableFulfillments(returnableFulfillments),
  }
}

const loadShopifyOrderFulfillmentOrders = async (client: ShopifyGraphQLClient, orderId: string) => {
  try {
    const fulfillmentOrders: ShopifyOrderDetailFulfillmentOrder[] = []
    let hasNextPage = true
    let after: string | null = null

    while (hasNextPage) {
      const result: ShopifyGraphQLResponse<ShopifyOrderFulfillmentOrdersQuery> =
        await client.request<ShopifyOrderFulfillmentOrdersQuery>(
          SHOPIFY_ORDER_FULFILLMENT_ORDERS_QUERY,
          {
            variables: {
              orderId,
              after,
            },
          },
        )

      if (result.errors) {
        throw new Error(formatShopifyErrors(result.errors))
      }

      const page:
        | NonNullable<ShopifyOrderFulfillmentOrdersQuery["order"]>["fulfillmentOrders"]
        | undefined = result.data?.order?.fulfillmentOrders

      for (const fulfillmentOrder of toArray<ShopifyOrderDetailFulfillmentOrder>(page?.nodes)) {
        const fulfillmentOrderId = trimOrNull(fulfillmentOrder?.id)
        const initialLineItems = toArray<ShopifyDetailedFulfillmentOrderLineItem>(
          fulfillmentOrder?.lineItems?.nodes,
        )
        const lineItems = fulfillmentOrderId
          ? await loadShopifyFulfillmentOrderLineItems(
              client,
              fulfillmentOrderId,
              initialLineItems,
              fulfillmentOrder?.lineItems?.pageInfo,
            )
          : initialLineItems

        fulfillmentOrders.push({
          ...fulfillmentOrder,
          lineItems: {
            nodes: lineItems,
          },
        })
      }

      hasNextPage = Boolean(page?.pageInfo?.hasNextPage)
      after = page?.pageInfo?.endCursor ?? null
    }

    return {
      fulfillmentOrders: mapShopifyFulfillmentOrders(fulfillmentOrders),
      fulfillmentOrdersErrorMessage: undefined,
    }
  } catch (error) {
    return {
      fulfillmentOrders: [],
      fulfillmentOrdersErrorMessage:
        error instanceof Error ? error.message : "Failed to load Shopify fulfillment orders.",
    }
  }
}

/** Loads one Shopify order with operational detail needed for fulfillment and refund workflows. */
export const getShopifyOrder = async (
  store: ShopifyStoreConfig,
  orderId: string,
): Promise<ShopifyOrderDetailSnapshot | null> => {
  const client = await createShopifyClient(store)
  const normalizedOrderId = trimOrNull(orderId)
  if (!normalizedOrderId) {
    return null
  }

  const [shop, orderResult] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyOrderDetailQuery>(SHOPIFY_ORDER_DETAIL_QUERY, {
      variables: {
        orderId: normalizedOrderId,
      },
    }),
  ])

  if (orderResult.errors) {
    throw new Error(formatShopifyErrors(orderResult.errors))
  }

  const order = orderResult.data?.order
  const resolvedOrderId = trimOrNull(order?.id)
  const createdAt = trimOrNull(order?.createdAt)
  if (!resolvedOrderId || !createdAt) {
    return null
  }

  const currencyCode =
    trimOrNull(order?.currentTotalPriceSet?.shopMoney?.currencyCode) ??
    trimOrNull(order?.totalRefundedSet?.shopMoney?.currencyCode) ??
    trimOrNull(shop?.currencyCode) ??
    DEFAULT_PLUGIN_CONFIG.currency
  const [lineItems, transactions, fulfillmentOrdersResult] = await Promise.all([
    loadShopifyOrderLineItems(
      client,
      resolvedOrderId,
      toArray<ShopifyDetailedOrderLineItem>(order?.lineItems?.nodes),
      order?.lineItems?.pageInfo,
    ),
    loadShopifyOrderTransactions(
      client,
      resolvedOrderId,
      toArray<ShopifyDetailedOrderTransaction>(order?.transactions?.nodes),
      order?.transactions?.pageInfo,
    ),
    loadShopifyOrderFulfillmentOrders(client, resolvedOrderId),
  ])
  const { fulfillmentOrders, fulfillmentOrdersErrorMessage } = fulfillmentOrdersResult

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: resolvedOrderId,
    name: trimOrNull(order?.name) ?? resolvedOrderId,
    createdAt,
    cancelledAt: trimOrNull(order?.cancelledAt),
    cancelReason: trimOrNull(order?.cancelReason),
    displayFinancialStatus: trimOrNull(order?.displayFinancialStatus) ?? "unknown",
    displayFulfillmentStatus: trimOrNull(order?.displayFulfillmentStatus) ?? "unknown",
    note: trimOrNull(order?.note),
    tags: toArray<string>(order?.tags)
      .map(tag => tag.trim())
      .filter(Boolean),
    unitsSold: toNumber(order?.currentSubtotalLineItemsQuantity),
    totalPrice: toShopifyMoneyAmount(order?.currentTotalPriceSet?.shopMoney?.amount),
    totalRefunded: toShopifyMoneyAmount(order?.totalRefundedSet?.shopMoney?.amount),
    currencyCode,
    customerName: trimOrNull(order?.customer?.displayName),
    customerEmail: trimOrNull(order?.customer?.email) ?? trimOrNull(order?.email),
    lineItems: mapShopifyOrderLineItems(lineItems),
    transactions: mapShopifyOrderTransactions(transactions, currencyCode),
    fulfillmentOrders,
    fulfillmentOrdersErrorMessage,
  }
}

/** Creates a Shopify draft order from explicit draft-order input. */
export const createShopifyDraftOrder = async (
  store: ShopifyStoreConfig,
  input: ShopifyDraftOrderCreateInput,
): Promise<ShopifyDraftOrderActionResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyDraftOrderCreateMutation>(SHOPIFY_DRAFT_ORDER_CREATE_MUTATION, {
      variables: {
        input: buildShopifyDraftOrderInput(input),
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.draftOrderCreate
  const currencyCode = trimOrNull(shop?.currencyCode) ?? DEFAULT_PLUGIN_CONFIG.currency

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    draftOrder: mapShopifyDraftOrderSummary(payload?.draftOrder, currencyCode),
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Updates a Shopify draft order using explicit draft-order input. */
export const updateShopifyDraftOrder = async (
  store: ShopifyStoreConfig,
  input: ShopifyDraftOrderUpdateInput,
): Promise<ShopifyDraftOrderActionResult> => {
  const client = await createShopifyClient(store)
  const { draftOrderId, ...draftOrderInput } = input
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyDraftOrderUpdateMutation>(SHOPIFY_DRAFT_ORDER_UPDATE_MUTATION, {
      variables: {
        id: draftOrderId,
        input: buildShopifyDraftOrderUpdateInput(draftOrderInput),
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.draftOrderUpdate
  const currencyCode = trimOrNull(shop?.currencyCode) ?? DEFAULT_PLUGIN_CONFIG.currency

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    draftOrder: mapShopifyDraftOrderSummary(payload?.draftOrder, currencyCode),
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Sends a Shopify draft-order invoice using explicit email input when provided. */
export const sendShopifyDraftOrderInvoice = async (
  store: ShopifyStoreConfig,
  input: ShopifyDraftOrderInvoiceSendInput,
): Promise<ShopifyDraftOrderActionResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyDraftOrderInvoiceSendMutation>(
      SHOPIFY_DRAFT_ORDER_INVOICE_SEND_MUTATION,
      {
        variables: {
          id: input.draftOrderId,
          emailInput: mapShopifyDraftOrderEmailInput(input.email),
        },
      },
    ),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.draftOrderInvoiceSend
  const currencyCode = trimOrNull(shop?.currencyCode) ?? DEFAULT_PLUGIN_CONFIG.currency

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    draftOrder: mapShopifyDraftOrderSummary(payload?.draftOrder, currencyCode),
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Completes a Shopify draft order and returns the resulting order linkage when available. */
export const completeShopifyDraftOrder = async (
  store: ShopifyStoreConfig,
  input: ShopifyDraftOrderCompleteInput,
): Promise<ShopifyDraftOrderActionResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyDraftOrderCompleteMutation>(SHOPIFY_DRAFT_ORDER_COMPLETE_MUTATION, {
      variables: {
        id: input.draftOrderId,
        paymentGatewayId: trimOrNull(input.paymentGatewayId) ?? undefined,
        sourceName: trimOrNull(input.sourceName) ?? undefined,
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.draftOrderComplete
  const currencyCode = trimOrNull(shop?.currencyCode) ?? DEFAULT_PLUGIN_CONFIG.currency

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    draftOrder: mapShopifyDraftOrderSummary(payload?.draftOrder, currencyCode),
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Places a Shopify fulfillment order on hold. */
export const holdShopifyFulfillmentOrder = async (
  store: ShopifyStoreConfig,
  input: ShopifyFulfillmentOrderHoldInput,
): Promise<ShopifyFulfillmentOrderActionResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyFulfillmentOrderHoldMutation>(SHOPIFY_FULFILLMENT_ORDER_HOLD_MUTATION, {
      variables: {
        id: input.fulfillmentOrderId,
        fulfillmentHold: {
          reason: input.reason,
          reasonNotes: trimOrNull(input.reasonNotes) ?? undefined,
          notifyMerchant: input.notifyMerchant ?? undefined,
          handle: trimOrNull(input.handle) ?? undefined,
          externalId: trimOrNull(input.externalId) ?? undefined,
          fulfillmentOrderLineItems: mapFulfillmentOrderLineItemsInput(
            input.fulfillmentOrderLineItems,
          ),
        },
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.fulfillmentOrderHold

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    fulfillmentOrder: mapShopifyFulfillmentOrderSummary(payload?.fulfillmentOrder),
    originalFulfillmentOrder: null,
    movedFulfillmentOrder: null,
    remainingFulfillmentOrder: mapShopifyFulfillmentOrderSummary(
      payload?.remainingFulfillmentOrder,
    ),
    fulfillmentHold:
      mapShopifyFulfillmentHolds(payload?.fulfillmentHold ? [payload.fulfillmentHold] : [])[0] ??
      null,
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Releases one or more holds from a Shopify fulfillment order. */
export const releaseHoldShopifyFulfillmentOrder = async (
  store: ShopifyStoreConfig,
  input: ShopifyFulfillmentOrderReleaseHoldInput,
): Promise<ShopifyFulfillmentOrderActionResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyFulfillmentOrderReleaseHoldMutation>(
      SHOPIFY_FULFILLMENT_ORDER_RELEASE_HOLD_MUTATION,
      {
        variables: {
          id: input.fulfillmentOrderId,
          holdIds:
            input.holdIds && input.holdIds.length > 0
              ? input.holdIds.map(holdId => holdId.trim()).filter(Boolean)
              : undefined,
          externalId: trimOrNull(input.externalId) ?? undefined,
        },
      },
    ),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.fulfillmentOrderReleaseHold

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    fulfillmentOrder: mapShopifyFulfillmentOrderSummary(payload?.fulfillmentOrder),
    originalFulfillmentOrder: null,
    movedFulfillmentOrder: null,
    remainingFulfillmentOrder: null,
    fulfillmentHold: null,
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Moves a Shopify fulfillment order to a new location. */
export const moveShopifyFulfillmentOrder = async (
  store: ShopifyStoreConfig,
  input: ShopifyFulfillmentOrderMoveInput,
): Promise<ShopifyFulfillmentOrderActionResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyFulfillmentOrderMoveMutation>(SHOPIFY_FULFILLMENT_ORDER_MOVE_MUTATION, {
      variables: {
        id: input.fulfillmentOrderId,
        newLocationId: input.newLocationId,
        fulfillmentOrderLineItems: mapFulfillmentOrderLineItemsInput(
          input.fulfillmentOrderLineItems,
        ),
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.fulfillmentOrderMove

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    fulfillmentOrder: null,
    originalFulfillmentOrder: mapShopifyFulfillmentOrderSummary(payload?.originalFulfillmentOrder),
    movedFulfillmentOrder: mapShopifyFulfillmentOrderSummary(payload?.movedFulfillmentOrder),
    remainingFulfillmentOrder: mapShopifyFulfillmentOrderSummary(
      payload?.remainingFulfillmentOrder,
    ),
    fulfillmentHold: null,
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Cancels a Shopify order using explicit cancellation input. */
export const cancelShopifyOrder = async (
  store: ShopifyStoreConfig,
  input: ShopifyOrderCancelInput,
): Promise<ShopifyOrderCancelResult> => {
  const client = await createShopifyClient(store)
  const shop = await fetchShopifyShopMetadata(client)
  const result = await client.request<ShopifyOrderCancelMutation>(SHOPIFY_ORDER_CANCEL_MUTATION, {
    variables: {
      orderId: input.orderId,
      notifyCustomer: input.notifyCustomer ?? undefined,
      refundMethod: {
        originalPaymentMethodsRefund: Boolean(input.refundMethod.originalPaymentMethodsRefund),
      },
      restock: Boolean(input.restock),
      reason: input.reason,
      staffNote: trimOrNull(input.staffNote) ?? undefined,
    },
  })

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.orderCancel

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: input.orderId,
    jobId: trimOrNull(payload?.job?.id),
    jobDone: typeof payload?.job?.done === "boolean" ? payload.job.done : null,
    orderCancelUserErrors: mapShopifyMutationUserErrors(payload?.orderCancelUserErrors),
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Captures payment on a Shopify order using an authorized parent transaction. */
export const captureShopifyOrder = async (
  store: ShopifyStoreConfig,
  input: ShopifyOrderCaptureInput,
): Promise<ShopifyOrderCaptureResult> => {
  const client = await createShopifyClient(store)
  const shop = await fetchShopifyShopMetadata(client)
  const result = await client.request<ShopifyOrderCaptureMutation>(SHOPIFY_ORDER_CAPTURE_MUTATION, {
    variables: {
      input: {
        id: input.orderId,
        parentTransactionId: input.parentTransactionId,
        amount: toShopifyMoneyString(input.amount),
        currency: trimOrNull(input.currency) ?? undefined,
        finalCapture: input.finalCapture ?? undefined,
      },
    },
  })

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.orderCapture
  const transaction = payload?.transaction
  const order = transaction?.order
  const currencyCode =
    trimOrNull(transaction?.amountSet?.presentmentMoney?.currencyCode) ??
    trimOrNull(order?.totalCapturable?.currencyCode) ??
    trimOrNull(input.currency) ??
    trimOrNull(shop?.currencyCode) ??
    DEFAULT_PLUGIN_CONFIG.currency

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: trimOrNull(order?.id) ?? input.orderId,
    transactionId: trimOrNull(transaction?.id),
    transactionKind: trimOrNull(transaction?.kind),
    transactionStatus: trimOrNull(transaction?.status),
    processedAt: trimOrNull(transaction?.processedAt),
    amount: toShopifyMoneyAmount(transaction?.amountSet?.presentmentMoney?.amount),
    currencyCode,
    parentTransactionId: trimOrNull(transaction?.parentTransaction?.id),
    capturable: typeof order?.capturable === "boolean" ? order.capturable : null,
    totalCapturable: toShopifyMoneyAmount(order?.totalCapturable?.amount),
    totalCapturableCurrencyCode: trimOrNull(order?.totalCapturable?.currencyCode) ?? currencyCode,
    multiCapturable:
      typeof transaction?.multiCapturable === "boolean" ? transaction.multiCapturable : null,
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Updates mutable Shopify order fields such as note, tags, contact, and shipping address. */
export const updateShopifyOrder = async (
  store: ShopifyStoreConfig,
  input: ShopifyOrderUpdateInput,
): Promise<ShopifyOrderUpdateResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyOrderUpdateMutation>(SHOPIFY_ORDER_UPDATE_MUTATION, {
      variables: {
        input: buildShopifyOrderUpdateInput(input),
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.orderUpdate
  const order = payload?.order
  const currencyCode =
    trimOrNull(order?.currentTotalPriceSet?.shopMoney?.currencyCode) ??
    trimOrNull(shop?.currencyCode) ??
    DEFAULT_PLUGIN_CONFIG.currency

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: trimOrNull(order?.id) ?? input.orderId,
    name: trimOrNull(order?.name),
    displayFinancialStatus: trimOrNull(order?.displayFinancialStatus),
    displayFulfillmentStatus: trimOrNull(order?.displayFulfillmentStatus),
    note: trimOrNull(order?.note),
    email: trimOrNull(order?.email),
    phone: trimOrNull(order?.phone),
    poNumber: trimOrNull(order?.poNumber),
    tags: toArray<string>(order?.tags)
      .map(tag => tag.trim())
      .filter(Boolean),
    customAttributes: mapShopifyOrderUpdateAttributes(order?.customAttributes),
    shippingAddress: mapShopifyOrderUpdateAddress(order?.shippingAddress),
    totalPrice: toShopifyMoneyAmount(order?.currentTotalPriceSet?.shopMoney?.amount),
    currencyCode,
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Begins a Shopify order-edit session and returns the calculated order context. */
export const beginShopifyOrderEdit = async (
  store: ShopifyStoreConfig,
  input: ShopifyOrderEditBeginInput,
): Promise<ShopifyOrderEditBeginResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyOrderEditBeginMutation>(SHOPIFY_ORDER_EDIT_BEGIN_MUTATION, {
      variables: {
        id: input.orderId,
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.orderEditBegin
  const calculatedOrder = payload?.calculatedOrder
  const context = buildShopifyOrderEditContext(
    calculatedOrder,
    trimOrNull(shop?.currencyCode) ?? DEFAULT_PLUGIN_CONFIG.currency,
    input.orderId,
  )

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: context.orderId ?? input.orderId,
    orderName: context.orderName,
    orderEditSessionId: trimOrNull(payload?.orderEditSession?.id),
    calculatedOrderId: context.calculatedOrderId,
    subtotalLineItemsQuantity: context.subtotalLineItemsQuantity,
    subtotalPrice: context.subtotalPrice,
    totalOutstanding: context.totalOutstanding,
    currencyCode: context.currencyCode,
    lineItems: context.lineItems,
    stagedChangeTypes: context.stagedChangeTypes,
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Sets the staged quantity for one line item in an existing Shopify order-edit session. */
export const setShopifyOrderEditLineItemQuantity = async (
  store: ShopifyStoreConfig,
  input: ShopifyOrderEditSetQuantityInput,
): Promise<ShopifyOrderEditSetQuantityResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyOrderEditSetQuantityMutation>(SHOPIFY_ORDER_EDIT_SET_QUANTITY_MUTATION, {
      variables: {
        id: input.editId,
        lineItemId: input.lineItemId,
        quantity: Math.max(0, Math.round(input.quantity)),
        restock: typeof input.restock === "boolean" ? input.restock : undefined,
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.orderEditSetQuantity
  const context = buildShopifyOrderEditContext(
    payload?.calculatedOrder,
    trimOrNull(shop?.currencyCode) ?? DEFAULT_PLUGIN_CONFIG.currency,
  )

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: context.orderId,
    orderName: context.orderName,
    orderEditSessionId: trimOrNull(payload?.orderEditSession?.id),
    calculatedOrderId: context.calculatedOrderId,
    editedLineItem:
      mapShopifyCalculatedOrderLineItems(
        payload?.calculatedLineItem ? [payload.calculatedLineItem] : [],
      )[0] ?? null,
    subtotalLineItemsQuantity: context.subtotalLineItemsQuantity,
    subtotalPrice: context.subtotalPrice,
    totalOutstanding: context.totalOutstanding,
    currencyCode: context.currencyCode,
    lineItems: context.lineItems,
    stagedChangeTypes: context.stagedChangeTypes,
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Commits an existing Shopify order-edit session. */
export const commitShopifyOrderEdit = async (
  store: ShopifyStoreConfig,
  input: ShopifyOrderEditCommitInput,
): Promise<ShopifyOrderEditCommitResult> => {
  const client = await createShopifyClient(store)
  const [shop, result] = await Promise.all([
    fetchShopifyShopMetadata(client),
    client.request<ShopifyOrderEditCommitMutation>(SHOPIFY_ORDER_EDIT_COMMIT_MUTATION, {
      variables: {
        id: input.editId,
        notifyCustomer:
          typeof input.notifyCustomer === "boolean" ? input.notifyCustomer : undefined,
        staffNote: trimOrNull(input.staffNote) ?? undefined,
      },
    }),
  ])

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.orderEditCommit
  const order = payload?.order
  const currencyCode =
    trimOrNull(order?.currentTotalPriceSet?.shopMoney?.currencyCode) ??
    trimOrNull(shop?.currencyCode) ??
    DEFAULT_PLUGIN_CONFIG.currency

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: trimOrNull(order?.id),
    orderName: trimOrNull(order?.name),
    displayFinancialStatus: trimOrNull(order?.displayFinancialStatus),
    displayFulfillmentStatus: trimOrNull(order?.displayFulfillmentStatus),
    totalPrice: toShopifyMoneyAmount(order?.currentTotalPriceSet?.shopMoney?.amount),
    currencyCode,
    successMessages: toArray<string>(payload?.successMessages)
      .map(message => message.trim())
      .filter(Boolean),
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Creates a Shopify fulfillment using explicit fulfillment-order input. */
export const createShopifyFulfillment = async (
  store: ShopifyStoreConfig,
  input: ShopifyFulfillmentCreateInput,
): Promise<ShopifyFulfillmentCreateResult> => {
  const client = await createShopifyClient(store)
  const shop = await fetchShopifyShopMetadata(client)
  const trackingInfo = input.trackingInfo
    ? {
        company: trimOrNull(input.trackingInfo.company) ?? undefined,
        number: trimOrNull(input.trackingInfo.number) ?? undefined,
        url: trimOrNull(input.trackingInfo.url) ?? undefined,
      }
    : undefined
  const originAddress = input.originAddress
    ? {
        address1: trimOrNull(input.originAddress.address1) ?? undefined,
        address2: trimOrNull(input.originAddress.address2) ?? undefined,
        city: trimOrNull(input.originAddress.city) ?? undefined,
        provinceCode: trimOrNull(input.originAddress.provinceCode) ?? undefined,
        countryCode: trimOrNull(input.originAddress.countryCode) ?? undefined,
        zip: trimOrNull(input.originAddress.zip) ?? undefined,
      }
    : undefined

  const result = await client.request<ShopifyFulfillmentCreateMutation>(
    SHOPIFY_FULFILLMENT_CREATE_MUTATION,
    {
      variables: {
        fulfillment: {
          notifyCustomer: Boolean(input.notifyCustomer),
          lineItemsByFulfillmentOrder: input.lineItemsByFulfillmentOrder.map(fulfillmentOrder => ({
            fulfillmentOrderId: fulfillmentOrder.fulfillmentOrderId,
            fulfillmentOrderLineItems:
              fulfillmentOrder.fulfillmentOrderLineItems &&
              fulfillmentOrder.fulfillmentOrderLineItems.length > 0
                ? fulfillmentOrder.fulfillmentOrderLineItems.map(lineItem => ({
                    id: lineItem.id,
                    quantity: Math.max(1, Math.round(lineItem.quantity)),
                  }))
                : undefined,
          })),
          trackingInfo:
            trackingInfo &&
            Object.values(trackingInfo).some(value => typeof value === "string" && value.length > 0)
              ? trackingInfo
              : undefined,
          originAddress:
            originAddress &&
            Object.values(originAddress).some(
              value => typeof value === "string" && value.length > 0,
            )
              ? originAddress
              : undefined,
        },
        message: trimOrNull(input.message),
      },
    },
  )

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.fulfillmentCreate

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    fulfillmentId: trimOrNull(payload?.fulfillment?.id),
    status: trimOrNull(payload?.fulfillment?.status),
    trackingInfo: toArray<{
      company?: string | null
      number?: string | null
      url?: string | null
    }>(payload?.fulfillment?.trackingInfo)
      .map(info => ({
        company: trimOrNull(info?.company),
        number: trimOrNull(info?.number),
        url: trimOrNull(info?.url),
      }))
      .filter(info => info.company || info.number || info.url),
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Creates a Shopify return using explicit return input. */
export const createShopifyReturn = async (
  store: ShopifyStoreConfig,
  input: ShopifyReturnCreateInput,
): Promise<ShopifyReturnCreateResult> => {
  const client = await createShopifyClient(store)
  const shop = await fetchShopifyShopMetadata(client)
  const result = await client.request<ShopifyReturnCreateMutation>(SHOPIFY_RETURN_CREATE_MUTATION, {
    variables: {
      returnInput: {
        orderId: input.orderId,
        notifyCustomer: input.notifyCustomer ?? undefined,
        requestedAt: trimOrNull(input.requestedAt) ?? undefined,
        returnLineItems: input.returnLineItems.map(lineItem => ({
          fulfillmentLineItemId: lineItem.fulfillmentLineItemId,
          quantity: Math.max(1, Math.round(lineItem.quantity)),
          returnReason: trimOrNull(lineItem.returnReason) ?? undefined,
          returnReasonNote: trimOrNull(lineItem.returnReasonNote) ?? undefined,
          returnReasonDefinitionId: trimOrNull(lineItem.returnReasonDefinitionId) ?? undefined,
        })),
      },
    },
  })

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.returnCreate

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: trimOrNull(payload?.return?.order?.id) ?? input.orderId,
    returnId: trimOrNull(payload?.return?.id),
    status: trimOrNull(payload?.return?.status),
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
  }
}

/** Creates a Shopify refund using explicit refund input. */
export const createShopifyRefund = async (
  store: ShopifyStoreConfig,
  input: ShopifyRefundCreateInput,
): Promise<ShopifyRefundCreateResult> => {
  const client = await createShopifyClient(store)
  const shop = await fetchShopifyShopMetadata(client)
  const normalizedIdempotencyKey = trimOrNull(input.idempotencyKey)
  const variables = {
    input: {
      orderId: input.orderId,
      notify: Boolean(input.notify),
      note: trimOrNull(input.note) ?? undefined,
      currency: trimOrNull(input.currency) ?? undefined,
      allowOverRefunding: input.allowOverRefunding ?? undefined,
      discrepancyReason: trimOrNull(input.discrepancyReason) ?? undefined,
      shipping: input.shipping
        ? {
            amount: toShopifyMoneyString(input.shipping.amount),
          }
        : undefined,
      refundLineItems: input.refundLineItems?.map(lineItem => ({
        lineItemId: lineItem.lineItemId,
        quantity: Math.max(1, Math.round(lineItem.quantity)),
        restockType: trimOrNull(lineItem.restockType) ?? undefined,
        locationId: trimOrNull(lineItem.locationId) ?? undefined,
      })),
      transactions: input.transactions?.map(transaction => ({
        amount: toShopifyMoneyString(transaction.amount),
        gateway: transaction.gateway,
        kind: transaction.kind ?? "REFUND",
        orderId: trimOrNull(transaction.orderId) ?? input.orderId,
        parentId: trimOrNull(transaction.parentId) ?? undefined,
      })),
    },
    idempotencyKey: normalizedIdempotencyKey ?? undefined,
  }
  const result = await client.request<ShopifyRefundCreateMutation>(
    normalizedIdempotencyKey
      ? SHOPIFY_REFUND_CREATE_IDEMPOTENT_MUTATION
      : SHOPIFY_REFUND_CREATE_MUTATION,
    {
      variables,
    },
  )

  if (result.errors) {
    throw new Error(formatShopifyErrors(result.errors))
  }

  const payload = result.data?.refundCreate
  const currencyCode =
    trimOrNull(payload?.refund?.totalRefundedSet?.shopMoney?.currencyCode) ??
    trimOrNull(input.currency) ??
    trimOrNull(shop?.currencyCode) ??
    DEFAULT_PLUGIN_CONFIG.currency

  return {
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    orderId: trimOrNull(payload?.order?.id) ?? input.orderId,
    refundId: trimOrNull(payload?.refund?.id),
    note: trimOrNull(payload?.refund?.note),
    createdAt: trimOrNull(payload?.refund?.createdAt),
    totalRefunded: toShopifyMoneyAmount(payload?.refund?.totalRefundedSet?.shopMoney?.amount),
    currencyCode,
    transactions: mapShopifyOrderTransactions(
      toArray<
        NonNullable<
          NonNullable<
            NonNullable<
              NonNullable<ShopifyRefundCreateMutation["refundCreate"]>["refund"]
            >["transactions"]
          >["nodes"]
        >[number]
      >(payload?.refund?.transactions?.nodes),
      currencyCode,
    ),
    userErrors: mapShopifyMutationUserErrors(payload?.userErrors),
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

const loadAllShopifyInventoryLevelsForItem = async (
  client: ShopifyGraphQLClient,
  inventoryItemId: string,
) => {
  const levels: NonNullable<
    NonNullable<
      NonNullable<ShopifyInventoryItemLevelsQuery["inventoryItem"]>["inventoryLevels"]
    >["nodes"]
  > = []
  let hasNextPage = true
  let after: string | null = null

  while (hasNextPage) {
    const result: ShopifyGraphQLResponse<ShopifyInventoryItemLevelsQuery> =
      await client.request<ShopifyInventoryItemLevelsQuery>(SHOPIFY_INVENTORY_ITEM_LEVELS_QUERY, {
        variables: {
          inventoryItemId,
          after,
        },
      })

    if (result.errors) {
      throw new Error(formatShopifyErrors(result.errors))
    }

    const page = result.data?.inventoryItem?.inventoryLevels
    levels.push(
      ...toArray<
        NonNullable<
          NonNullable<
            NonNullable<ShopifyInventoryItemLevelsQuery["inventoryItem"]>["inventoryLevels"]
          >["nodes"]
        >[number]
      >(page?.nodes),
    )
    hasNextPage = Boolean(page?.pageInfo?.hasNextPage)
    after = page?.pageInfo?.endCursor ?? null
  }

  return levels
}

/** Resolves per-location inventory levels for a product reference using an existing Shopify client. */
export const loadShopifyInventoryLevelsFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  productRef: string,
  locale: string,
  options?: {
    locationIds?: string[]
  },
): Promise<FlowResolution<ShopifyInventoryLevelsSnapshot>> => {
  const selection = await resolveShopifyVariantSelection(client, productRef)
  if (selection.kind !== "ready") {
    return selection
  }

  const shop = await fetchShopifyShopMetadata(client)
  const inventoryItemIds = unique(
    selection.value.variants
      .map(variant => trimOrNull(variant?.inventoryItem?.id))
      .filter((inventoryItemId): inventoryItemId is string => Boolean(inventoryItemId)),
  )

  if (inventoryItemIds.length === 0) {
    throw new Error("Shopify inventory item ids were unavailable for the selected product.")
  }

  const locationFilter = new Set(
    toArray<string>(options?.locationIds)
      .map(locationId => locationId.trim())
      .filter(Boolean),
  )
  const levelsByItem = await runInBatches(
    inventoryItemIds,
    SHOPIFY_VARIANT_FETCH_BATCH_SIZE,
    inventoryItemId => loadAllShopifyInventoryLevelsForItem(client, inventoryItemId),
  )
  const aggregatedLevels = new Map<string, ShopifyInventoryLevelSnapshot>()

  for (const level of levelsByItem.flat()) {
    const locationId = trimOrNull(level?.location?.id)
    if (locationFilter.size > 0 && (!locationId || !locationFilter.has(locationId))) {
      continue
    }

    const locationName = trimOrNull(level?.location?.name)
    const key = locationId ?? locationName ?? trimOrNull(level?.id)
    if (!key) {
      continue
    }

    const current: ShopifyInventoryLevelSnapshot = aggregatedLevels.get(key) ?? {
      locationId,
      locationName,
      fulfillsOnlineOrders:
        typeof level?.location?.fulfillsOnlineOrders === "boolean"
          ? level.location.fulfillsOnlineOrders
          : null,
      hasActiveInventory:
        typeof level?.location?.hasActiveInventory === "boolean"
          ? level.location.hasActiveInventory
          : null,
      isActive: typeof level?.location?.isActive === "boolean" ? level.location.isActive : null,
      available: null,
      committed: null,
      incoming: null,
      onHand: null,
      reserved: null,
    }

    current.available = addNullableQuantity(
      current.available,
      getInventoryLevelQuantity(level?.quantities, "available"),
    )
    current.committed = addNullableQuantity(
      current.committed,
      getInventoryLevelQuantity(level?.quantities, "committed"),
    )
    current.incoming = addNullableQuantity(
      current.incoming,
      getInventoryLevelQuantity(level?.quantities, "incoming"),
    )
    current.onHand = addNullableQuantity(
      current.onHand,
      getInventoryLevelQuantity(level?.quantities, "on_hand"),
    )
    current.reserved = addNullableQuantity(
      current.reserved,
      getInventoryLevelQuantity(level?.quantities, "reserved"),
    )
    aggregatedLevels.set(key, current)
  }

  const firstVariant = selection.value.variants[0]

  return ready({
    source: "shopify",
    retrievedAtIso: new Date().toISOString(),
    locale,
    storeName: shop?.name ?? store.name,
    timezone: coerceShopTimeZone(shop?.ianaTimezone),
    productName:
      firstVariant?.product?.title ??
      firstVariant?.displayName ??
      firstVariant?.sku ??
      selection.value.resolvedSkus[0] ??
      productRef,
    resolvedSkus: selection.value.resolvedSkus,
    locationLevels: [...aggregatedLevels.values()].sort((left, right) => {
      const leftLabel = left.locationName ?? left.locationId ?? ""
      const rightLabel = right.locationName ?? right.locationId ?? ""
      return leftLabel.localeCompare(rightLabel)
    }),
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

/** Resolves per-location inventory levels for a product reference by creating a Shopify client on demand. */
export const loadShopifyInventoryLevels = async (
  store: ShopifyStoreConfig,
  productRef: string,
  locale: string,
  options?: {
    locationIds?: string[]
  },
): Promise<FlowResolution<ShopifyInventoryLevelsSnapshot>> => {
  const client = await createShopifyClient(store)
  return loadShopifyInventoryLevelsFromClient(client, store, productRef, locale, options)
}

/** Loads inventory and pricing details for a product reference using an existing Shopify client. */
export const loadShopifyProductSnapshotFromClient = async (
  client: ShopifyGraphQLClient,
  store: ShopifyStoreConfig,
  productRef: string,
  locale: string,
  options?: {
    includeCosts?: boolean
  },
): Promise<FlowResolution<ShopifyProductSnapshot>> => {
  const selection = await resolveShopifyVariantSelection(client, productRef)
  if (selection.kind !== "ready") {
    return selection
  }
  let variants = selection.value.variants
  if (options?.includeCosts !== false) {
    try {
      variants = await tryLoadShopifyVariantCosts(client, selection.value)
    } catch (error) {
      if (!isShopifyProductCostAccessError(error)) {
        throw error
      }
    }
  }
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

/** Loads product decision inputs from Shopify, including sales, inventory cover, and pricing. */
export const loadShopifyProductActionSnapshot = async (
  store: ShopifyStoreConfig,
  productRef: string,
  lookbackDays: number,
  locale: string,
  options?: {
    includePricing?: boolean
  },
): Promise<FlowResolution<ShopifyProductActionSnapshot>> => {
  const client = await createShopifyClient(store)
  const restockSnapshot = await loadShopifyRestockSnapshotFromClient(
    client,
    store,
    productRef,
    lookbackDays,
    locale,
  )
  if (restockSnapshot.kind !== "ready") {
    return restockSnapshot
  }

  const inventoryDaysLeft =
    restockSnapshot.value.dailySalesUnits > 0
      ? restockSnapshot.value.onHandUnits / restockSnapshot.value.dailySalesUnits
      : Number.POSITIVE_INFINITY

  if (options?.includePricing === false) {
    return ready({
      ...restockSnapshot.value,
      currencyCode: null,
      inventoryDaysLeft,
      averageUnitPrice: 0,
      averageUnitCost: null,
      currentMarginPct: null,
    })
  }

  const productSnapshot = await loadShopifyProductSnapshotFromClient(
    client,
    store,
    restockSnapshot.value.sku,
    locale,
  )
  if (productSnapshot.kind !== "ready") {
    return productSnapshot
  }

  return ready({
    ...restockSnapshot.value,
    currencyCode: productSnapshot.value.currencyCode,
    inventoryDaysLeft,
    averageUnitPrice: productSnapshot.value.averageUnitPrice,
    averageUnitCost: productSnapshot.value.averageUnitCost,
    currentMarginPct: productSnapshot.value.currentMarginPct,
  })
}
