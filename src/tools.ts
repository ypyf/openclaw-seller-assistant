import type { AgentToolResult } from "@mariozechner/pi-agent-core"
import { Type, type Static, type TSchema } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import {
  DEFAULT_PLUGIN_CONFIG,
  findConfiguredStore,
  getStoreOperationNumber,
  type PluginConfig,
} from "./config.ts"
import {
  beginShopifyOrderEdit,
  cancelShopifyOrder,
  captureShopifyOrder,
  completeShopifyDraftOrder,
  createShopifyDraftOrder,
  createShopifyFulfillment,
  createShopifyRefund,
  createShopifyReturn,
  getShopifyOrder,
  holdShopifyFulfillmentOrder,
  loadShopifyInventorySnapshot,
  loadShopifyProductActionSnapshot,
  moveShopifyFulfillmentOrder,
  queryShopifyCatalogProducts,
  queryShopifyCatalogVariants,
  queryShopifyDraftOrders,
  queryShopifyFulfillmentOrders,
  queryShopifyReturnableFulfillments,
  queryShopifyOrders,
  releaseHoldShopifyFulfillmentOrder,
  sendShopifyDraftOrderInvoice,
  loadShopifyStoreSalesSummary,
  loadShopifyStoreOverview,
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
  type ShopifyRefundCreateResult,
  type ShopifyReturnCreateResult,
  type ShopifyReturnableFulfillmentsSnapshot,
  type ShopifyProductActionSnapshot,
  type ShopifySalesSnapshot,
  type ShopifyStoreSalesSummarySnapshot,
  type ShopifyStoreOverviewSnapshot,
  updateShopifyDraftOrder,
  updateShopifyOrder,
  type StoreOverviewTimeBasis,
  type StoreOverviewRangePreset,
  loadShopifySalesSnapshot,
} from "./services/shopify.ts"
import {
  currency,
  formatDateTime,
  isValidTimeZone,
  percentage,
  textResult,
  textResultWithDetails,
  toNumber,
} from "./utils.ts"

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

const escapeRegExp = (value: string) => value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")

const toCaseInsensitivePattern = (value: string) =>
  Array.from(escapeRegExp(value))
    .map(character => {
      const lowerCharacter = character.toLowerCase()
      const upperCharacter = character.toUpperCase()
      return lowerCharacter === upperCharacter ? character : `[${lowerCharacter}${upperCharacter}]`
    })
    .join("")

const STORE_OVERVIEW_RANGE_PRESET_INPUT_PATTERN = `^(?:${STORE_SALES_SUMMARY_WINDOW_ORDER.map(toCaseInsensitivePattern).join("|")})$`

const StoreOverviewRangePresetInputSchema = Type.String({
  pattern: STORE_OVERVIEW_RANGE_PRESET_INPUT_PATTERN,
})

const StoreOverviewTimeBasisSchema = Type.Union([Type.Literal("caller"), Type.Literal("store")])

const SellerAnalyticsParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store.",
      }),
    ),
    resource: Type.Literal("store_sales", {
      description: 'Analytics resource family. Use "store_sales" for store-level sales facts.',
    }),
    operation: Type.Union([Type.Literal("overview"), Type.Literal("summary")], {
      description:
        'Use "overview" for one store window and "summary" for supported multi-window store sales summaries.',
    }),
    timeBasis: StoreOverviewTimeBasisSchema,
    callerTimeZone: Type.Optional(
      Type.String({
        description:
          'Required when "timeBasis" is "caller". Pass the caller IANA timezone such as "Asia/Shanghai" or "America/New_York".',
      }),
    ),
    rangePreset: Type.Optional(StoreOverviewRangePresetInputSchema),
    startDate: Type.Optional(
      Type.String({
        description:
          'Optional custom start date in "YYYY-MM-DD". Use explicit dates only when the user gave calendar dates.',
      }),
    ),
    endDate: Type.Optional(
      Type.String({
        description:
          'Optional custom end date in "YYYY-MM-DD". Use explicit dates only when the user gave calendar dates.',
      }),
    ),
    windows: Type.Optional(
      Type.Array(StoreOverviewRangePresetInputSchema, {
        description:
          'Optional supported summary windows for "operation": "summary". Pass an empty array to request the default full summary window set.',
      }),
    ),
  },
  { additionalProperties: false },
)

const SellerInventoryParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    resource: Type.Literal("product", {
      description: 'Inventory resource family. Use "product" for product-level inventory lookup.',
    }),
    operation: Type.Literal("query", {
      description: 'Use "query" to look up current Shopify inventory facts.',
    }),
    productRef: Type.String({
      description:
        "Exact SKU, full product title, or product title keywords to search in Shopify before returning on-hand inventory.",
    }),
  },
  { additionalProperties: false },
)

const SellerOrdersProductSalesInputSchema = Type.Object(
  {
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

const SellerOrdersOrderQueryInputSchema = Type.Object(
  {
    query: Type.Optional(
      Type.String({
        description:
          'Optional Shopify order search query string such as "financial_status:paid fulfillment_status:unfulfilled". Omit it to load the most recent orders.',
      }),
    ),
    first: Type.Optional(
      Type.Number({
        description: "Optional page size from 1 to 50. Defaults to 25.",
      }),
    ),
    after: Type.Optional(
      Type.String({
        description: "Optional pagination cursor returned by the previous order query call.",
      }),
    ),
    reverse: Type.Optional(
      Type.Boolean({
        description:
          "Optional sort direction flag for created_at order sorting. Defaults to true for newest first.",
      }),
    ),
  },
  { additionalProperties: false },
)

const SellerOrdersOrderGetInputSchema = Type.Object(
  {
    orderId: Type.String({
      description:
        'Shopify order GID such as "gid://shopify/Order/123". Use `resource: "order"` and `operation: "query"` first when you need to discover ids.',
    }),
  },
  { additionalProperties: false },
)

const SellerOrdersOrderCancelInputSchema = Type.Object(
  {
    orderId: Type.String({
      description: 'Shopify order GID such as "gid://shopify/Order/123".',
    }),
    notifyCustomer: Type.Optional(Type.Boolean()),
    refundMethod: Type.Object(
      {
        originalPaymentMethodsRefund: Type.Boolean({
          description:
            "Set true to refund the original payment methods during cancellation, or false to cancel without refunding payments.",
        }),
      },
      { additionalProperties: false },
    ),
    restock: Type.Boolean({
      description:
        "Set true to restock the cancelled line items, or false to leave inventory unchanged.",
    }),
    reason: Type.Union([
      Type.Literal("CUSTOMER"),
      Type.Literal("DECLINED"),
      Type.Literal("FRAUD"),
      Type.Literal("INVENTORY"),
      Type.Literal("OTHER"),
      Type.Literal("STAFF"),
    ]),
    staffNote: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)

const SellerOrdersOrderCaptureInputSchema = Type.Object(
  {
    orderId: Type.String({
      description: 'Shopify order GID such as "gid://shopify/Order/123".',
    }),
    parentTransactionId: Type.String({
      description:
        'Authorized Shopify order transaction GID such as "gid://shopify/OrderTransaction/123".',
    }),
    amount: Type.Number({
      description: "Capture amount in the presentment currency.",
    }),
    currency: Type.Optional(
      Type.String({
        description: 'Optional presentment currency code such as "USD".',
      }),
    ),
    finalCapture: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
)

const SellerOrdersFulfillmentCreateInputSchema = Type.Object(
  {
    notifyCustomer: Type.Optional(Type.Boolean()),
    message: Type.Optional(Type.String()),
    trackingInfo: Type.Optional(
      Type.Object(
        {
          company: Type.Optional(Type.String()),
          number: Type.Optional(Type.String()),
          url: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    originAddress: Type.Optional(
      Type.Object(
        {
          address1: Type.Optional(Type.String()),
          address2: Type.Optional(Type.String()),
          city: Type.Optional(Type.String()),
          provinceCode: Type.Optional(Type.String()),
          countryCode: Type.Optional(Type.String()),
          zip: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    lineItemsByFulfillmentOrder: Type.Array(
      Type.Object(
        {
          fulfillmentOrderId: Type.String({
            description:
              'Shopify fulfillment-order GID such as "gid://shopify/FulfillmentOrder/123".',
          }),
          fulfillmentOrderLineItems: Type.Optional(
            Type.Array(
              Type.Object(
                {
                  id: Type.String({
                    description:
                      'Shopify fulfillment-order line-item GID such as "gid://shopify/FulfillmentOrderLineItem/123".',
                  }),
                  quantity: Type.Number({
                    description: "Quantity to fulfill for this fulfillment-order line item.",
                  }),
                },
                { additionalProperties: false },
              ),
            ),
          ),
        },
        { additionalProperties: false },
      ),
      {
        description:
          "One or more fulfillment orders to fulfill. Omit fulfillmentOrderLineItems to fulfill all remaining quantities on that fulfillment order.",
      },
    ),
  },
  { additionalProperties: false },
)

const SellerOrdersReturnQueryInputSchema = Type.Object(
  {
    orderId: Type.String({
      description:
        'Shopify order GID such as "gid://shopify/Order/123". Use this to load returnable fulfillment line items before `resource: "return"` and `operation: "create"`.',
    }),
  },
  { additionalProperties: false },
)

const SellerOrdersReturnCreateInputSchema = Type.Object(
  {
    orderId: Type.String({
      description: 'Shopify order GID such as "gid://shopify/Order/123".',
    }),
    notifyCustomer: Type.Optional(Type.Boolean()),
    requestedAt: Type.Optional(
      Type.String({
        description:
          'Optional ISO timestamp such as "2026-03-18T10:00:00Z" for the return request time.',
      }),
    ),
    returnLineItems: Type.Array(
      Type.Object(
        {
          fulfillmentLineItemId: Type.String({
            description:
              'Shopify fulfillment line-item GID such as "gid://shopify/FulfillmentLineItem/123". Load candidates first with `resource: "return"` and `operation: "query"`.',
          }),
          quantity: Type.Number({
            description: "Quantity to include on this return line item.",
          }),
          returnReason: Type.Optional(
            Type.String({
              description:
                'Optional Shopify return reason enum such as "SIZE_TOO_SMALL", "WRONG_ITEM", or "UNKNOWN".',
            }),
          ),
          returnReasonNote: Type.Optional(Type.String()),
          returnReasonDefinitionId: Type.Optional(
            Type.String({
              description:
                'Optional Shopify return reason definition GID such as "gid://shopify/ReturnReasonDefinition/123".',
            }),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
)

const SellerOrdersRefundCreateInputSchema = Type.Object(
  {
    orderId: Type.String({
      description: 'Shopify order GID such as "gid://shopify/Order/123".',
    }),
    notify: Type.Optional(Type.Boolean()),
    note: Type.Optional(Type.String()),
    currency: Type.Optional(Type.String()),
    allowOverRefunding: Type.Optional(Type.Boolean()),
    discrepancyReason: Type.Optional(Type.String()),
    idempotencyKey: Type.Optional(Type.String()),
    shipping: Type.Optional(
      Type.Object(
        {
          amount: Type.Number({
            description: "Shipping refund amount in the order currency.",
          }),
        },
        { additionalProperties: false },
      ),
    ),
    refundLineItems: Type.Optional(
      Type.Array(
        Type.Object(
          {
            lineItemId: Type.String({
              description: 'Shopify order line-item GID such as "gid://shopify/LineItem/123".',
            }),
            quantity: Type.Number({
              description: "Quantity to refund for this line item.",
            }),
            restockType: Type.Optional(
              Type.Union([
                Type.Literal("NO_RESTOCK"),
                Type.Literal("CANCEL"),
                Type.Literal("RETURN"),
              ]),
            ),
            locationId: Type.Optional(
              Type.String({
                description:
                  'Optional Shopify location GID used when restocking a returned item, such as "gid://shopify/Location/123".',
              }),
            ),
          },
          { additionalProperties: false },
        ),
      ),
    ),
    transactions: Type.Optional(
      Type.Array(
        Type.Object(
          {
            amount: Type.Number({
              description: "Refund transaction amount in the refund currency.",
            }),
            gateway: Type.String({
              description:
                'Gateway handle such as "shopify_payments" used for the refund transaction.',
            }),
            kind: Type.Optional(Type.Literal("REFUND")),
            orderId: Type.Optional(Type.String()),
            parentId: Type.Optional(
              Type.String({
                description:
                  'Optional parent transaction GID such as "gid://shopify/OrderTransaction/123".',
              }),
            ),
          },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  { additionalProperties: false },
)

const DraftOrderDiscountValueTypeSchema = Type.Union([
  Type.Literal("FIXED_AMOUNT"),
  Type.Literal("PERCENTAGE"),
])

const DraftOrderWeightUnitSchema = Type.Union([
  Type.Literal("GRAMS"),
  Type.Literal("KILOGRAMS"),
  Type.Literal("OUNCES"),
  Type.Literal("POUNDS"),
])

const DraftOrderCustomAttributeInputSchema = Type.Object(
  {
    key: Type.String({
      description: "Custom attribute key.",
    }),
    value: Type.String({
      description: "Custom attribute value.",
    }),
  },
  { additionalProperties: false },
)

const DraftOrderAddressInputSchema = Type.Object(
  {
    firstName: Type.Optional(Type.String()),
    lastName: Type.Optional(Type.String()),
    company: Type.Optional(Type.String()),
    address1: Type.Optional(Type.String()),
    address2: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    province: Type.Optional(Type.String()),
    provinceCode: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    countryCode: Type.Optional(Type.String()),
    zip: Type.Optional(Type.String()),
    phone: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)

const DraftOrderAppliedDiscountInputSchema = Type.Object(
  {
    value: Type.Number({
      description:
        "Discount value. Use the monetary value for fixed discounts or the percentage number for percentage discounts.",
    }),
    valueType: DraftOrderDiscountValueTypeSchema,
    amount: Type.Optional(
      Type.Number({
        description: 'Optional discount amount. For "FIXED_AMOUNT", omit it to reuse "value".',
      }),
    ),
    title: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)

const DraftOrderLineItemVariantInputSchema = Type.Object(
  {
    variantId: Type.String({
      description: 'Shopify product-variant GID such as "gid://shopify/ProductVariant/123".',
    }),
    quantity: Type.Number({
      description: "Quantity to include on the draft order line item.",
    }),
    appliedDiscount: Type.Optional(DraftOrderAppliedDiscountInputSchema),
    customAttributes: Type.Optional(Type.Array(DraftOrderCustomAttributeInputSchema)),
  },
  { additionalProperties: false },
)

const DraftOrderLineItemCustomInputSchema = Type.Object(
  {
    title: Type.String({
      description: "Title for a custom draft-order line item.",
    }),
    originalUnitPrice: Type.Number({
      description: "Unit price for a custom draft-order line item.",
    }),
    quantity: Type.Number({
      description: "Quantity to include on the draft order line item.",
    }),
    appliedDiscount: Type.Optional(DraftOrderAppliedDiscountInputSchema),
    customAttributes: Type.Optional(Type.Array(DraftOrderCustomAttributeInputSchema)),
    weight: Type.Optional(
      Type.Object(
        {
          value: Type.Number(),
          unit: DraftOrderWeightUnitSchema,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
)

const DraftOrderLineItemInputSchema = Type.Union([
  DraftOrderLineItemVariantInputSchema,
  DraftOrderLineItemCustomInputSchema,
])

const DraftOrderShippingLineInputSchema = Type.Object(
  {
    title: Type.String({
      description: "Shipping-line title such as Standard or Express.",
    }),
    price: Type.Number({
      description: "Shipping price to apply to the draft order.",
    }),
  },
  { additionalProperties: false },
)

const SellerOrdersDraftOrderQueryInputSchema = Type.Object(
  {
    query: Type.Optional(
      Type.String({
        description:
          'Optional Shopify draft-order search query string such as "status:open" or "email:buyer@example.com". Omit it to load recent draft orders.',
      }),
    ),
    first: Type.Optional(
      Type.Number({
        description: "Optional page size from 1 to 50. Defaults to 25.",
      }),
    ),
    after: Type.Optional(
      Type.String({
        description: "Optional pagination cursor returned by the previous draft-order query call.",
      }),
    ),
    reverse: Type.Optional(
      Type.Boolean({
        description:
          "Optional sort direction flag for updated-at sorting. Defaults to true for most recently updated first.",
      }),
    ),
  },
  { additionalProperties: false },
)

const SellerOrdersDraftOrderCreateInputSchema = Type.Object(
  {
    lineItems: Type.Array(DraftOrderLineItemInputSchema, {
      description: "One or more variant or custom line items to include on the draft order.",
    }),
    email: Type.Optional(Type.String()),
    note: Type.Optional(Type.String()),
    tags: Type.Optional(Type.Array(Type.String())),
    taxExempt: Type.Optional(Type.Boolean()),
    reserveInventoryUntil: Type.Optional(
      Type.String({
        description:
          'Optional ISO timestamp such as "2026-03-18T10:00:00Z" to reserve inventory until a specific time.',
      }),
    ),
    billingAddress: Type.Optional(DraftOrderAddressInputSchema),
    shippingAddress: Type.Optional(DraftOrderAddressInputSchema),
    shippingLine: Type.Optional(DraftOrderShippingLineInputSchema),
    appliedDiscount: Type.Optional(DraftOrderAppliedDiscountInputSchema),
    customAttributes: Type.Optional(Type.Array(DraftOrderCustomAttributeInputSchema)),
  },
  { additionalProperties: false },
)

const SellerOrdersDraftOrderUpdateInputSchema = Type.Object(
  {
    draftOrderId: Type.String({
      description: 'Shopify draft-order GID such as "gid://shopify/DraftOrder/123".',
    }),
    lineItems: Type.Optional(Type.Array(DraftOrderLineItemInputSchema)),
    email: Type.Optional(Type.String()),
    note: Type.Optional(Type.String()),
    tags: Type.Optional(Type.Array(Type.String())),
    taxExempt: Type.Optional(Type.Boolean()),
    reserveInventoryUntil: Type.Optional(Type.String()),
    billingAddress: Type.Optional(DraftOrderAddressInputSchema),
    shippingAddress: Type.Optional(DraftOrderAddressInputSchema),
    shippingLine: Type.Optional(DraftOrderShippingLineInputSchema),
    appliedDiscount: Type.Optional(DraftOrderAppliedDiscountInputSchema),
    customAttributes: Type.Optional(Type.Array(DraftOrderCustomAttributeInputSchema)),
  },
  { additionalProperties: false },
)

const SellerOrdersDraftOrderInvoiceSendInputSchema = Type.Object(
  {
    draftOrderId: Type.String({
      description: 'Shopify draft-order GID such as "gid://shopify/DraftOrder/123".',
    }),
    email: Type.Optional(
      Type.Object(
        {
          to: Type.Optional(Type.String()),
          subject: Type.Optional(Type.String()),
          customMessage: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
)

const SellerOrdersDraftOrderCompleteInputSchema = Type.Object(
  {
    draftOrderId: Type.String({
      description: 'Shopify draft-order GID such as "gid://shopify/DraftOrder/123".',
    }),
    paymentGatewayId: Type.Optional(
      Type.String({
        description:
          'Optional Shopify payment-gateway GID such as "gid://shopify/PaymentGateway/123".',
      }),
    ),
    sourceName: Type.Optional(
      Type.String({
        description:
          'Optional source name used when completing the draft order, such as "openclaw".',
      }),
    ),
  },
  { additionalProperties: false },
)

const SellerOrdersOrderUpdateInputSchema = Type.Object(
  {
    orderId: Type.String({
      description: 'Shopify order GID such as "gid://shopify/Order/123".',
    }),
    customAttributes: Type.Optional(Type.Array(DraftOrderCustomAttributeInputSchema)),
    email: Type.Optional(Type.String()),
    note: Type.Optional(Type.String()),
    phone: Type.Optional(Type.String()),
    poNumber: Type.Optional(Type.String()),
    shippingAddress: Type.Optional(DraftOrderAddressInputSchema),
    tags: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
)

const SellerOrdersOrderEditBeginInputSchema = Type.Object(
  {
    orderId: Type.String({
      description:
        'Shopify order GID such as "gid://shopify/Order/123". Use this to start an order-edit session and receive a calculated order id.',
    }),
  },
  { additionalProperties: false },
)

const FulfillmentOrderLineItemInputSchema = Type.Object(
  {
    id: Type.String({
      description:
        'Shopify fulfillment-order line-item GID such as "gid://shopify/FulfillmentOrderLineItem/123".',
    }),
    quantity: Type.Number({
      description: "Quantity to target on this fulfillment-order line item.",
    }),
  },
  { additionalProperties: false },
)

const FulfillmentOrderHoldReasonSchema = Type.Union([
  Type.Literal("AWAITING_PAYMENT"),
  Type.Literal("HIGH_RISK_OF_FRAUD"),
  Type.Literal("INCORRECT_ADDRESS"),
  Type.Literal("INVENTORY_OUT_OF_STOCK"),
  Type.Literal("OTHER"),
])

const SellerOrdersFulfillmentOrderQueryInputSchema = Type.Object(
  {
    query: Type.Optional(
      Type.String({
        description:
          'Optional Shopify fulfillment-order search query string such as "status:open" or "assigned_location_id:gid://shopify/Location/1". Omit it to load recent fulfillment orders.',
      }),
    ),
    first: Type.Optional(
      Type.Number({
        description: "Optional page size from 1 to 50. Defaults to 25.",
      }),
    ),
    after: Type.Optional(
      Type.String({
        description:
          "Optional pagination cursor returned by the previous fulfillment-order query call.",
      }),
    ),
    reverse: Type.Optional(
      Type.Boolean({
        description:
          "Optional sort direction flag for updated-at sorting. Defaults to true for most recently updated first.",
      }),
    ),
    includeClosed: Type.Optional(
      Type.Boolean({
        description:
          "Optional flag to include closed fulfillment orders in query results. Defaults to false.",
      }),
    ),
  },
  { additionalProperties: false },
)

const SellerOrdersFulfillmentOrderHoldInputSchema = Type.Object(
  {
    fulfillmentOrderId: Type.String({
      description: 'Shopify fulfillment-order GID such as "gid://shopify/FulfillmentOrder/123".',
    }),
    reason: FulfillmentOrderHoldReasonSchema,
    reasonNotes: Type.Optional(Type.String()),
    notifyMerchant: Type.Optional(Type.Boolean()),
    handle: Type.Optional(Type.String()),
    externalId: Type.Optional(Type.String()),
    fulfillmentOrderLineItems: Type.Optional(Type.Array(FulfillmentOrderLineItemInputSchema)),
  },
  { additionalProperties: false },
)

const SellerOrdersFulfillmentOrderReleaseHoldInputSchema = Type.Object(
  {
    fulfillmentOrderId: Type.String({
      description: 'Shopify fulfillment-order GID such as "gid://shopify/FulfillmentOrder/123".',
    }),
    holdIds: Type.Optional(
      Type.Array(
        Type.String({
          description: 'Shopify fulfillment-hold GID such as "gid://shopify/FulfillmentHold/123".',
        }),
      ),
    ),
    externalId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)

const SellerOrdersFulfillmentOrderMoveInputSchema = Type.Object(
  {
    fulfillmentOrderId: Type.String({
      description: 'Shopify fulfillment-order GID such as "gid://shopify/FulfillmentOrder/123".',
    }),
    newLocationId: Type.String({
      description: 'Shopify location GID such as "gid://shopify/Location/456".',
    }),
    fulfillmentOrderLineItems: Type.Optional(Type.Array(FulfillmentOrderLineItemInputSchema)),
  },
  { additionalProperties: false },
)

const SellerOrdersParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    resource: Type.String({
      description:
        'Orders resource family. Use "product_sales", "draft_order", "fulfillment_order", "order", "order_edit", "fulfillment", "return", or "refund".',
      enum: [
        "product_sales",
        "draft_order",
        "fulfillment_order",
        "order",
        "order_edit",
        "fulfillment",
        "return",
        "refund",
      ],
    }),
    operation: Type.String({
      description:
        'Orders operation. Supported values include "query", "create", "update", "invoice_send", "complete", "hold", "release_hold", "move", "get", "cancel", "capture", and "begin" depending on the resource.',
      enum: [
        "query",
        "create",
        "update",
        "invoice_send",
        "complete",
        "hold",
        "release_hold",
        "move",
        "get",
        "cancel",
        "capture",
        "begin",
      ],
    }),
    input: Type.Object(
      {},
      {
        additionalProperties: true,
        description: "Resource- and operation-specific input payload.",
      },
    ),
  },
  { additionalProperties: false },
)

const SellerCatalogInputSchema = Type.Object(
  {
    productRef: Type.Optional(
      Type.String({
        description:
          "Exact SKU, full product title, or product title keywords to search in Shopify before loading product facts.",
      }),
    ),
    salesLookbackDays: Type.Optional(
      Type.Number({
        description:
          "Optional sales lookback window for Shopify data loading. If omitted, use store operations.salesLookbackDays or the built-in 30-day default.",
      }),
    ),
    query: Type.Optional(
      Type.String({
        description:
          'Optional Shopify search query string such as "status:active", "vendor:Acme", or "sku:WM-01". For complete SKU lists backed by Shopify SKU existence filtering, use `query: "sku:*"` together with `allPages: true`.',
      }),
    ),
    first: Type.Optional(
      Type.Number({
        description: "Optional page size from 1 to 50. Defaults to 25.",
      }),
    ),
    allPages: Type.Optional(
      Type.Boolean({
        description:
          "Optional full-pagination flag. Set true when the user asks for a complete variant or SKU list instead of a single page.",
      }),
    ),
    after: Type.Optional(
      Type.String({
        description:
          "Optional pagination cursor returned by the previous product or variant query call. When `allPages` is true, continue from this cursor through the end of the result set.",
      }),
    ),
  },
  { additionalProperties: false },
)

const SellerCatalogParamsSchema = Type.Object(
  {
    storeId: Type.Optional(
      Type.String({
        description:
          "Optional configured store id. If omitted, use defaultStoreId or the first configured store when loading Shopify data.",
      }),
    ),
    resource: Type.String({
      description:
        'Catalog resource family. Use "product_facts" for one product fact bundle, "product" for product browse/list queries, and "variant" for variant browse/list queries.',
      enum: ["product_facts", "product", "variant"],
    }),
    operation: Type.String({
      description:
        'Use "query" to load product facts or to list products or variants without adding strategy text.',
      enum: ["query"],
    }),
    input: SellerCatalogInputSchema,
  },
  { additionalProperties: false },
)

type SellerAnalyticsParams = Static<typeof SellerAnalyticsParamsSchema>
type SellerInventoryParams = Static<typeof SellerInventoryParamsSchema>
type SellerOrdersParams = Static<typeof SellerOrdersParamsSchema>
type SellerCatalogParams = Static<typeof SellerCatalogParamsSchema>

const normalizeToolString = (value: string | undefined) => {
  const trimmedValue = value?.trim()
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : undefined
}

const getCatalogProductFactsInput = (input: SellerCatalogParams["input"]) => {
  const productRef = normalizeToolString(input.productRef)
  if (!productRef) {
    return undefined
  }

  return {
    productRef,
    salesLookbackDays: input.salesLookbackDays,
  }
}

const getCatalogProductsQueryInput = (input: SellerCatalogParams["input"]) => {
  const query = normalizeToolString(input.query)
  const after = normalizeToolString(input.after)

  return {
    ...(query ? { query } : {}),
    ...(typeof input.first === "number" ? { first: input.first } : {}),
    ...(after ? { after } : {}),
  }
}

const getCatalogVariantsQueryInput = (input: SellerCatalogParams["input"]) => {
  const query = normalizeToolString(input.query)
  const after = normalizeToolString(input.after)

  return {
    ...(query ? { query } : {}),
    ...(typeof input.first === "number" ? { first: input.first } : {}),
    ...(typeof input.allPages === "boolean" ? { allPages: input.allPages } : {}),
    ...(after ? { after } : {}),
  }
}

const validateToolInput = <Schema extends TSchema>(
  schema: Schema,
  input: unknown,
): Static<Schema> | undefined => (Value.Check(schema, input) ? input : undefined)

const invalidSellerOrdersInput = (resource: string, operation: string) =>
  textResult(`seller_orders ${resource} ${operation} input is invalid.`)

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

const normalizeStoreOverviewRangePreset = (value: string | undefined) => {
  if (!value) {
    return undefined
  }

  switch (value.toLowerCase()) {
    case "today":
      return "today"
    case "yesterday":
      return "yesterday"
    case "last_7_days":
      return "last_7_days"
    case "last_30_days":
      return "last_30_days"
    case "last_60_days":
      return "last_60_days"
    case "last_90_days":
      return "last_90_days"
    case "last_180_days":
      return "last_180_days"
    case "last_365_days":
      return "last_365_days"
    default:
      return undefined
  }
}

const normalizeStoreOverviewRangePresets = (values: string[] | undefined) => {
  if (!values) {
    return undefined
  }

  return values.reduce<StoreOverviewRangePreset[]>((result, value) => {
    const normalizedValue = normalizeStoreOverviewRangePreset(value)
    if (normalizedValue) {
      result.push(normalizedValue)
    }
    return result
  }, [])
}

const normalizeToolTimeZone = (value: string | undefined) => {
  const trimmedValue = value?.trim()
  return trimmedValue && trimmedValue.length > 0 ? trimmedValue : undefined
}

const isStoreOverviewTimeBasis = (value: unknown): value is StoreOverviewTimeBasis =>
  value === "caller" || value === "store"

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
  queryShopifyCatalogProducts: typeof queryShopifyCatalogProducts
  queryShopifyCatalogVariants: typeof queryShopifyCatalogVariants
  queryShopifyDraftOrders: typeof queryShopifyDraftOrders
  queryShopifyFulfillmentOrders: typeof queryShopifyFulfillmentOrders
  queryShopifyOrders: typeof queryShopifyOrders
  queryShopifyReturnableFulfillments: typeof queryShopifyReturnableFulfillments
  getShopifyOrder: typeof getShopifyOrder
  createShopifyDraftOrder: typeof createShopifyDraftOrder
  updateShopifyDraftOrder: typeof updateShopifyDraftOrder
  updateShopifyOrder: typeof updateShopifyOrder
  sendShopifyDraftOrderInvoice: typeof sendShopifyDraftOrderInvoice
  completeShopifyDraftOrder: typeof completeShopifyDraftOrder
  holdShopifyFulfillmentOrder: typeof holdShopifyFulfillmentOrder
  releaseHoldShopifyFulfillmentOrder: typeof releaseHoldShopifyFulfillmentOrder
  moveShopifyFulfillmentOrder: typeof moveShopifyFulfillmentOrder
  cancelShopifyOrder: typeof cancelShopifyOrder
  captureShopifyOrder: typeof captureShopifyOrder
  beginShopifyOrderEdit: typeof beginShopifyOrderEdit
  createShopifyFulfillment: typeof createShopifyFulfillment
  createShopifyReturn: typeof createShopifyReturn
  createShopifyRefund: typeof createShopifyRefund
}

const DEFAULT_SELLER_TOOL_DEPENDENCIES: SellerToolDependencies = {
  loadShopifyStoreOverview,
  loadShopifyStoreSalesSummary,
  loadShopifyInventorySnapshot,
  loadShopifySalesSnapshot,
  loadShopifyProductActionSnapshot,
  queryShopifyCatalogProducts,
  queryShopifyCatalogVariants,
  queryShopifyDraftOrders,
  queryShopifyFulfillmentOrders,
  queryShopifyOrders,
  queryShopifyReturnableFulfillments,
  getShopifyOrder,
  createShopifyDraftOrder,
  updateShopifyDraftOrder,
  updateShopifyOrder,
  sendShopifyDraftOrderInvoice,
  completeShopifyDraftOrder,
  holdShopifyFulfillmentOrder,
  releaseHoldShopifyFulfillmentOrder,
  moveShopifyFulfillmentOrder,
  cancelShopifyOrder,
  captureShopifyOrder,
  beginShopifyOrderEdit,
  createShopifyFulfillment,
  createShopifyReturn,
  createShopifyRefund,
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

const formatOrderQuery = (input: ShopifyOrdersQuerySnapshot, options: { locale: string }) => {
  const headerLines = [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Query: ${input.query ?? "recent orders"}`,
    `Returned orders: ${input.orders.length}`,
    `Has next page: ${input.pageInfo.hasNextPage ? "yes" : "no"}`,
    input.pageInfo.endCursor ? `End cursor: ${input.pageInfo.endCursor}` : null,
  ].filter(Boolean)

  const orderLines =
    input.orders.length > 0
      ? input.orders.map(order =>
          [
            `- ${order.name}`,
            order.id,
            `${order.displayFinancialStatus}/${order.displayFulfillmentStatus}`,
            currency(order.totalPrice, order.currencyCode, options.locale),
            `${Math.round(order.unitsSold)} units`,
            order.customerName ?? order.customerEmail ?? "customer unavailable",
          ].join(" | "),
        )
      : ["Orders: none"]

  return [...headerLines, "", ...orderLines].join("\n")
}

const formatDraftOrderQuery = (
  input: ShopifyDraftOrdersQuerySnapshot,
  options: { locale: string },
) => {
  const headerLines = [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Query: ${input.query ?? "recent draft orders"}`,
    `Returned draft orders: ${input.draftOrders.length}`,
    `Has next page: ${input.pageInfo.hasNextPage ? "yes" : "no"}`,
    input.pageInfo.endCursor ? `End cursor: ${input.pageInfo.endCursor}` : null,
  ].filter(Boolean)

  const draftOrderLines =
    input.draftOrders.length > 0
      ? input.draftOrders.map(draftOrder =>
          [
            `- ${draftOrder.name}`,
            draftOrder.id,
            draftOrder.status ?? "unknown-status",
            draftOrder.ready === null ? "ready unknown" : draftOrder.ready ? "ready" : "not ready",
            currency(draftOrder.totalPrice, draftOrder.currencyCode, options.locale),
            draftOrder.email ?? "email unavailable",
            draftOrder.invoiceSentAt ? "invoice sent" : "invoice not sent",
          ].join(" | "),
        )
      : ["Draft orders: none"]

  return [...headerLines, "", ...draftOrderLines].join("\n")
}

const formatDraftOrderAction = (
  input: ShopifyDraftOrderActionResult,
  options: { locale: string },
) => {
  const draftOrder = input.draftOrder

  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    draftOrder ? `Draft order: ${draftOrder.name}` : "Draft order: unavailable",
    draftOrder ? `Draft order ID: ${draftOrder.id}` : null,
    draftOrder?.status ? `Status: ${draftOrder.status}` : null,
    draftOrder?.ready === null ? null : `Ready: ${draftOrder?.ready ? "yes" : "no"}`,
    draftOrder
      ? `Total: ${currency(draftOrder.totalPrice, draftOrder.currencyCode, options.locale)}`
      : null,
    draftOrder?.email ? `Email: ${draftOrder.email}` : null,
    draftOrder?.createdAt
      ? `Created at: ${formatDateTime(draftOrder.createdAt, options.locale, input.timezone)}`
      : null,
    draftOrder?.updatedAt
      ? `Updated at: ${formatDateTime(draftOrder.updatedAt, options.locale, input.timezone)}`
      : null,
    draftOrder?.reserveInventoryUntil
      ? `Reserve inventory until: ${formatDateTime(
          draftOrder.reserveInventoryUntil,
          options.locale,
          input.timezone,
        )}`
      : null,
    draftOrder?.invoiceSentAt
      ? `Invoice sent at: ${formatDateTime(draftOrder.invoiceSentAt, options.locale, input.timezone)}`
      : null,
    draftOrder?.invoiceUrl ? `Invoice URL: ${draftOrder.invoiceUrl}` : null,
    draftOrder?.note ? `Note: ${draftOrder.note}` : null,
    draftOrder && draftOrder.tags.length > 0 ? `Tags: ${draftOrder.tags.join(", ")}` : null,
    draftOrder?.taxExempt === null ? null : `Tax exempt: ${draftOrder?.taxExempt ? "yes" : "no"}`,
    draftOrder?.orderId ? `Completed order ID: ${draftOrder.orderId}` : null,
    draftOrder?.orderName ? `Completed order: ${draftOrder.orderName}` : null,
    "",
    "User errors:",
    ...formatMutationUserErrors(input.userErrors),
  ]
    .filter(Boolean)
    .join("\n")
}

const formatFulfillmentOrderSummaryBlock = (
  fulfillmentOrder: NonNullable<ShopifyFulfillmentOrderActionResult["fulfillmentOrder"]>,
) => {
  const header = [
    `- ${fulfillmentOrder.id}`,
    fulfillmentOrder.orderName ?? fulfillmentOrder.orderId ?? "order unavailable",
    `${fulfillmentOrder.status ?? "unknown-status"}/${fulfillmentOrder.requestStatus ?? "unknown-request-status"}`,
    fulfillmentOrder.assignedLocationName ??
      fulfillmentOrder.assignedLocationId ??
      "location unavailable",
  ].join(" | ")

  const detailLines = [
    `  Delivery: ${fulfillmentOrder.deliveryMethodType ?? "unknown"} | Destination: ${
      fulfillmentOrder.destinationCity || fulfillmentOrder.destinationCountryCode
        ? [fulfillmentOrder.destinationCity, fulfillmentOrder.destinationCountryCode]
            .filter(Boolean)
            .join(", ")
        : "unavailable"
    }`,
    `  Supported actions: ${
      fulfillmentOrder.supportedActions.length > 0
        ? fulfillmentOrder.supportedActions.join(", ")
        : "none"
    }`,
    `  Holds: ${
      fulfillmentOrder.holds.length > 0
        ? fulfillmentOrder.holds
            .map(hold =>
              [
                hold.id ?? "hold id unavailable",
                hold.reason ?? "unknown-reason",
                hold.reasonNotes ?? "no-notes",
                hold.handle ?? "no-handle",
              ].join(" | "),
            )
            .join("; ")
        : "none"
    }`,
    `  Move candidates: ${
      fulfillmentOrder.moveCandidates.length > 0
        ? fulfillmentOrder.moveCandidates
            .map(candidate =>
              [
                candidate.locationName ?? candidate.locationId ?? "location unavailable",
                `movable ${
                  candidate.movable === null ? "unknown" : candidate.movable ? "yes" : "no"
                }`,
                candidate.availableLineItemsCount !== null
                  ? `available ${Math.round(candidate.availableLineItemsCount)}`
                  : null,
                candidate.unavailableLineItemsCount !== null
                  ? `unavailable ${Math.round(candidate.unavailableLineItemsCount)}`
                  : null,
                candidate.message ?? null,
              ]
                .filter(Boolean)
                .join(" | "),
            )
            .join("; ")
        : "none"
    }`,
    `  Line items: ${
      fulfillmentOrder.lineItems.length > 0
        ? fulfillmentOrder.lineItems
            .map(lineItem =>
              [
                lineItem.name,
                lineItem.id,
                lineItem.sku ?? "no-sku",
                `remaining ${Math.round(lineItem.remainingQuantity)}`,
                `total ${Math.round(lineItem.totalQuantity)}`,
              ].join(" | "),
            )
            .join("; ")
        : "none"
    }`,
  ]

  return [header, ...detailLines]
}

const formatFulfillmentOrderQuery = (
  input: ShopifyFulfillmentOrdersQuerySnapshot,
  options: { locale: string },
) => {
  const headerLines = [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Query: ${input.query ?? "recent fulfillment orders"}`,
    `Include closed: ${input.includeClosed ? "yes" : "no"}`,
    `Returned fulfillment orders: ${input.fulfillmentOrders.length}`,
    `Has next page: ${input.pageInfo.hasNextPage ? "yes" : "no"}`,
    input.pageInfo.endCursor ? `End cursor: ${input.pageInfo.endCursor}` : null,
  ].filter(Boolean)

  const fulfillmentOrderLines =
    input.fulfillmentOrders.length > 0
      ? input.fulfillmentOrders.flatMap(fulfillmentOrder =>
          formatFulfillmentOrderSummaryBlock(fulfillmentOrder),
        )
      : ["Fulfillment orders: none"]

  return [...headerLines, "", ...fulfillmentOrderLines].join("\n")
}

const formatFulfillmentOrderAction = (
  input: ShopifyFulfillmentOrderActionResult,
  options: { locale: string },
) => {
  const section = (
    label: string,
    fulfillmentOrder: ShopifyFulfillmentOrderActionResult["fulfillmentOrder"],
  ) =>
    fulfillmentOrder ? [label, ...formatFulfillmentOrderSummaryBlock(fulfillmentOrder), ""] : []

  const holdLines = input.fulfillmentHold
    ? [
        "Created hold:",
        `- ${input.fulfillmentHold.id ?? "hold id unavailable"} | ${
          input.fulfillmentHold.reason ?? "unknown-reason"
        } | ${input.fulfillmentHold.reasonNotes ?? "no-notes"} | ${
          input.fulfillmentHold.handle ?? "no-handle"
        }`,
        "",
      ]
    : []

  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    "",
    ...section("Fulfillment order:", input.fulfillmentOrder),
    ...section("Original fulfillment order:", input.originalFulfillmentOrder),
    ...section("Moved fulfillment order:", input.movedFulfillmentOrder),
    ...section("Remaining fulfillment order:", input.remainingFulfillmentOrder),
    ...holdLines,
    "User errors:",
    ...formatMutationUserErrors(input.userErrors),
  ]
    .filter(Boolean)
    .join("\n")
}

const formatOrderDetail = (input: ShopifyOrderDetailSnapshot, options: { locale: string }) => {
  const lineItemLines =
    input.lineItems.length > 0
      ? input.lineItems.map(lineItem =>
          [
            `- ${lineItem.name}`,
            lineItem.id,
            lineItem.sku ?? "no-sku",
            `qty ${Math.round(lineItem.quantity)}`,
            `refundable ${Math.round(lineItem.refundableQuantity)}`,
            `unfulfilled ${Math.round(lineItem.unfulfilledQuantity)}`,
          ].join(" | "),
        )
      : ["- none"]

  const transactionLines =
    input.transactions.length > 0
      ? input.transactions.map(transaction =>
          [
            `- ${transaction.id}`,
            transaction.kind ?? "unknown-kind",
            transaction.status ?? "unknown-status",
            transaction.gateway ?? "unknown-gateway",
            currency(transaction.amount, transaction.currencyCode, options.locale),
            transaction.processedAt
              ? formatDateTime(transaction.processedAt, options.locale, input.timezone)
              : "processed time unavailable",
          ].join(" | "),
        )
      : ["- none"]

  const fulfillmentOrderLines =
    input.fulfillmentOrders.length > 0
      ? input.fulfillmentOrders.flatMap(fulfillmentOrder => {
          const header = [
            `- ${fulfillmentOrder.id}`,
            fulfillmentOrder.status ?? "unknown-status",
            fulfillmentOrder.requestStatus ?? "unknown-request-status",
            fulfillmentOrder.assignedLocationName ??
              fulfillmentOrder.assignedLocationId ??
              "location unavailable",
          ].join(" | ")
          const lineItems =
            fulfillmentOrder.lineItems.length > 0
              ? fulfillmentOrder.lineItems.map(lineItem =>
                  [
                    `  - ${lineItem.name}`,
                    lineItem.id,
                    lineItem.sku ?? "no-sku",
                    `remaining ${Math.round(lineItem.remainingQuantity)}`,
                    `total ${Math.round(lineItem.totalQuantity)}`,
                    lineItem.orderLineItemId ?? "order line item unavailable",
                  ].join(" | "),
                )
              : ["  - none"]

          return [header, ...lineItems]
        })
      : input.fulfillmentOrdersErrorMessage
        ? [`- unavailable (${input.fulfillmentOrdersErrorMessage})`]
        : ["- none"]

  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Order: ${input.name}`,
    `Order ID: ${input.orderId}`,
    `Created at: ${formatDateTime(input.createdAt, options.locale, input.timezone)}`,
    `Financial status: ${input.displayFinancialStatus}`,
    `Fulfillment status: ${input.displayFulfillmentStatus}`,
    `Total: ${currency(input.totalPrice, input.currencyCode, options.locale)}`,
    `Total refunded: ${currency(input.totalRefunded, input.currencyCode, options.locale)}`,
    input.customerName ? `Customer: ${input.customerName}` : null,
    input.customerEmail ? `Customer email: ${input.customerEmail}` : null,
    input.note ? `Note: ${input.note}` : null,
    input.tags.length > 0 ? `Tags: ${input.tags.join(", ")}` : null,
    input.cancelledAt
      ? `Cancelled at: ${formatDateTime(input.cancelledAt, options.locale, input.timezone)}`
      : null,
    input.cancelReason ? `Cancel reason: ${input.cancelReason}` : null,
    "",
    "Line items:",
    ...lineItemLines,
    "",
    "Transactions:",
    ...transactionLines,
    "",
    "Fulfillment orders:",
    ...fulfillmentOrderLines,
  ]
    .filter(Boolean)
    .join("\n")
}

const formatReturnQuery = (
  input: ShopifyReturnableFulfillmentsSnapshot,
  options: { locale: string },
) => {
  const returnableFulfillmentLines =
    input.returnableFulfillments.length > 0
      ? input.returnableFulfillments.flatMap(returnableFulfillment => {
          const header = [
            `- ${returnableFulfillment.id}`,
            returnableFulfillment.fulfillmentId ?? "fulfillment unavailable",
          ].join(" | ")
          const lineItems =
            returnableFulfillment.lineItems.length > 0
              ? returnableFulfillment.lineItems.map(lineItem =>
                  [
                    `  - ${lineItem.name}`,
                    lineItem.fulfillmentLineItemId,
                    lineItem.sku ?? "no-sku",
                    `returnable ${Math.round(lineItem.returnableQuantity)}`,
                    `order qty ${Math.round(lineItem.quantity)}`,
                    lineItem.orderLineItemId ?? "order line item unavailable",
                  ].join(" | "),
                )
              : ["  - none"]

          return [header, ...lineItems]
        })
      : ["- none"]

  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Order ID: ${input.orderId}`,
    `Returnable fulfillments: ${input.returnableFulfillments.length}`,
    "",
    "Returnable fulfillment line items:",
    ...returnableFulfillmentLines,
  ]
    .filter(Boolean)
    .join("\n")
}

const formatMutationUserErrors = (
  errors: Array<{ field: string | null; message: string; code?: string | null }>,
) =>
  errors.length > 0
    ? errors.map(
        error =>
          `- ${error.field ? `${error.field}: ` : ""}${error.code ? `[${error.code}] ` : ""}${error.message}`,
      )
    : ["- none"]

const formatOrderUpdateAddress = (address: ShopifyOrderUpdateResult["shippingAddress"]) => {
  if (!address) {
    return null
  }

  const name = [address.firstName, address.lastName].filter(Boolean).join(" ")
  const locality = [address.city, address.provinceCode ?? address.province, address.zip]
    .filter(Boolean)
    .join(", ")
  const parts = [
    name || null,
    address.company,
    address.address1,
    address.address2,
    locality || null,
    address.countryCode ?? address.country,
    address.phone,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(" | ") : null
}

const formatOrderUpdate = (input: ShopifyOrderUpdateResult, options: { locale: string }) =>
  [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    input.name ? `Order: ${input.name}` : null,
    `Order ID: ${input.orderId}`,
    input.displayFinancialStatus ? `Financial status: ${input.displayFinancialStatus}` : null,
    input.displayFulfillmentStatus ? `Fulfillment status: ${input.displayFulfillmentStatus}` : null,
    `Total: ${currency(input.totalPrice, input.currencyCode, options.locale)}`,
    input.email ? `Email: ${input.email}` : null,
    input.phone ? `Phone: ${input.phone}` : null,
    input.poNumber ? `PO number: ${input.poNumber}` : null,
    input.note ? `Note: ${input.note}` : null,
    input.tags.length > 0 ? `Tags: ${input.tags.join(", ")}` : null,
    input.customAttributes.length > 0
      ? `Custom attributes: ${input.customAttributes.map(attribute => `${attribute.key}=${attribute.value}`).join(", ")}`
      : null,
    formatOrderUpdateAddress(input.shippingAddress)
      ? `Shipping address: ${formatOrderUpdateAddress(input.shippingAddress)}`
      : null,
    "",
    "User errors:",
    ...formatMutationUserErrors(input.userErrors),
  ]
    .filter(Boolean)
    .join("\n")

const formatOrderCancel = (input: ShopifyOrderCancelResult, options: { locale: string }) =>
  [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Order ID: ${input.orderId}`,
    input.jobId ? `Cancellation job ID: ${input.jobId}` : "Cancellation job ID: unavailable",
    input.jobDone === null ? null : `Cancellation job done: ${input.jobDone ? "yes" : "no"}`,
    "",
    "Order cancel user errors:",
    ...formatMutationUserErrors(input.orderCancelUserErrors),
    "",
    "User errors:",
    ...formatMutationUserErrors(input.userErrors),
  ]
    .filter(Boolean)
    .join("\n")

const formatOrderCapture = (input: ShopifyOrderCaptureResult, options: { locale: string }) =>
  [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Order ID: ${input.orderId}`,
    input.transactionId
      ? `Capture transaction ID: ${input.transactionId}`
      : "Capture transaction ID: unavailable",
    input.transactionKind ? `Transaction kind: ${input.transactionKind}` : null,
    input.transactionStatus ? `Transaction status: ${input.transactionStatus}` : null,
    `Captured amount: ${currency(input.amount, input.currencyCode, options.locale)}`,
    input.parentTransactionId ? `Parent transaction ID: ${input.parentTransactionId}` : null,
    input.processedAt
      ? `Processed at: ${formatDateTime(input.processedAt, options.locale, input.timezone)}`
      : null,
    input.capturable === null ? null : `Order capturable: ${input.capturable ? "yes" : "no"}`,
    `Total capturable remaining: ${currency(
      input.totalCapturable,
      input.totalCapturableCurrencyCode,
      options.locale,
    )}`,
    input.multiCapturable === null
      ? null
      : `Supports multiple captures: ${input.multiCapturable ? "yes" : "no"}`,
    "",
    "User errors:",
    ...formatMutationUserErrors(input.userErrors),
  ]
    .filter(Boolean)
    .join("\n")

const formatOrderEditBegin = (input: ShopifyOrderEditBeginResult, options: { locale: string }) => {
  const lineItemLines =
    input.lineItems.length > 0
      ? input.lineItems.map(lineItem =>
          [
            `- ${lineItem.title}`,
            lineItem.id,
            lineItem.sku ?? "no-sku",
            `qty ${Math.round(lineItem.quantity)}`,
          ].join(" | "),
        )
      : ["- none"]

  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    input.orderName ? `Order: ${input.orderName}` : null,
    `Order ID: ${input.orderId}`,
    input.orderEditSessionId
      ? `Order edit session ID: ${input.orderEditSessionId}`
      : "Order edit session ID: unavailable",
    input.calculatedOrderId
      ? `Calculated order ID: ${input.calculatedOrderId}`
      : "Calculated order ID: unavailable",
    `Subtotal line-item quantity: ${Math.round(input.subtotalLineItemsQuantity)}`,
    `Subtotal: ${currency(input.subtotalPrice, input.currencyCode, options.locale)}`,
    `Total outstanding: ${currency(input.totalOutstanding, input.currencyCode, options.locale)}`,
    `Staged changes: ${
      input.stagedChangeTypes.length > 0 ? input.stagedChangeTypes.join(", ") : "none"
    }`,
    "",
    "Calculated order line items:",
    ...lineItemLines,
    "",
    "User errors:",
    ...formatMutationUserErrors(input.userErrors),
  ]
    .filter(Boolean)
    .join("\n")
}

const formatFulfillmentCreate = (
  input: ShopifyFulfillmentCreateResult,
  options: { locale: string },
) => {
  const trackingLines =
    input.trackingInfo.length > 0
      ? input.trackingInfo.map(tracking =>
          [
            `- ${tracking.company ?? "carrier unavailable"}`,
            tracking.number ?? "tracking number unavailable",
            tracking.url ?? "tracking url unavailable",
          ].join(" | "),
        )
      : ["- none"]

  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    input.fulfillmentId ? `Fulfillment ID: ${input.fulfillmentId}` : "Fulfillment ID: unavailable",
    input.status ? `Status: ${input.status}` : null,
    "",
    "Tracking:",
    ...trackingLines,
    "",
    "User errors:",
    ...formatMutationUserErrors(input.userErrors),
  ]
    .filter(Boolean)
    .join("\n")
}

const formatReturnCreate = (input: ShopifyReturnCreateResult, options: { locale: string }) =>
  [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Order ID: ${input.orderId}`,
    input.returnId ? `Return ID: ${input.returnId}` : "Return ID: unavailable",
    input.status ? `Return status: ${input.status}` : null,
    "",
    "User errors:",
    ...formatMutationUserErrors(input.userErrors),
  ]
    .filter(Boolean)
    .join("\n")

const formatRefundCreate = (input: ShopifyRefundCreateResult, options: { locale: string }) => {
  const transactionLines =
    input.transactions.length > 0
      ? input.transactions.map(transaction =>
          [
            `- ${transaction.id}`,
            transaction.kind ?? "unknown-kind",
            transaction.status ?? "unknown-status",
            transaction.gateway ?? "unknown-gateway",
            currency(transaction.amount, transaction.currencyCode, options.locale),
          ].join(" | "),
        )
      : ["- none"]

  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Order ID: ${input.orderId}`,
    input.refundId ? `Refund ID: ${input.refundId}` : "Refund ID: unavailable",
    `Total refunded: ${currency(input.totalRefunded, input.currencyCode, options.locale)}`,
    input.note ? `Note: ${input.note}` : null,
    input.createdAt
      ? `Refund created at: ${formatDateTime(input.createdAt, options.locale, input.timezone)}`
      : null,
    "",
    "Refund transactions:",
    ...transactionLines,
    "",
    "User errors:",
    ...formatMutationUserErrors(input.userErrors),
  ]
    .filter(Boolean)
    .join("\n")
}

const formatProductFacts = (
  input: ShopifyProductActionSnapshot,
  options: { locale: string; fallbackCurrency: string },
) => {
  const currencyCode = input.currencyCode ?? options.fallbackCurrency

  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, input.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Product: ${input.productName}`,
    `SKU: ${input.sku}`,
    `Sales lookback: last ${input.lookbackDays} days`,
    `Average daily sales: ${input.dailySalesUnits.toFixed(2)}`,
    `Estimated units sold: ${Math.round(input.unitsSold)}`,
    `On-hand units: ${Math.round(input.onHandUnits)}`,
    `Inventory cover: ${formatInventoryCover(input.inventoryDaysLeft)}`,
    input.averageUnitPrice > 0
      ? `Average unit price: ${currency(input.averageUnitPrice, currencyCode, options.locale)}`
      : "Average unit price: unavailable",
    input.averageUnitCost !== null
      ? `Average unit cost: ${currency(input.averageUnitCost, currencyCode, options.locale)}`
      : "Average unit cost: unavailable",
    `Current margin: ${formatMarginValue(input.currentMarginPct)}`,
  ]
    .filter(Boolean)
    .join("\n")
}

const formatCatalogProductsQuery = (
  input: ShopifyCatalogProductsQuerySnapshot,
  options: { locale: string },
) => {
  const headerLines = [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Query: ${input.query ?? "catalog products"}`,
    `Returned products: ${input.products.length}`,
    `Has next page: ${input.pageInfo.hasNextPage ? "yes" : "no"}`,
    input.pageInfo.endCursor ? `End cursor: ${input.pageInfo.endCursor}` : null,
  ].filter(Boolean)

  const productLines =
    input.products.length > 0
      ? input.products.map(product =>
          [
            `- ${product.title}`,
            product.handle ?? "no-handle",
            product.status ?? "unknown-status",
            product.vendor ?? "no-vendor",
            product.totalInventory !== null
              ? `inventory ${Math.round(product.totalInventory)}`
              : "inventory unavailable",
            product.id,
          ].join(" | "),
        )
      : ["Products: none"]

  return [...headerLines, "", ...productLines].join("\n")
}

const formatCatalogVariantsQuery = (
  input: ShopifyCatalogVariantsQuerySnapshot,
  options: { locale: string },
) => {
  const headerLines = [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Query: ${input.query ?? "catalog variants"}`,
    `Returned variants: ${input.variants.length}`,
    `Has next page: ${input.pageInfo.hasNextPage ? "yes" : "no"}`,
    input.pageInfo.endCursor ? `End cursor: ${input.pageInfo.endCursor}` : null,
  ].filter(Boolean)

  const variantLines =
    input.variants.length > 0
      ? input.variants.map(variant =>
          [
            `- ${variant.sku ?? "no-sku"}`,
            variant.productTitle ?? "unknown-product",
            variant.displayName,
            variant.price !== null
              ? currency(variant.price, variant.currencyCode, options.locale)
              : "price unavailable",
            `inventory ${Math.round(variant.inventoryQuantity)}`,
            variant.id,
          ].join(" | "),
        )
      : ["Variants: none"]

  return [...headerLines, "", ...variantLines].join("\n")
}

const formatInventoryCover = (value: number) =>
  Number.isFinite(value) ? `${value.toFixed(1)} days` : "n/a (no recent sales detected)"

const formatMarginValue = (value: number | null) =>
  typeof value === "number" ? percentage(value) : "unavailable"

const formatStoreOverview = (input: ShopifyStoreOverviewSnapshot, options: { locale: string }) => {
  return [
    `Source: ${input.source}`,
    `Retrieved at: ${formatDateTime(input.retrievedAtIso, options.locale, input.timezone)}`,
    `Store: ${input.storeName}`,
    `Window: ${input.windowLabel}`,
    `Revenue: ${currency(input.revenue, input.currencyCode, options.locale)}`,
    input.timezone ? `Store timezone: ${input.timezone}` : "Store timezone: n/a",
    input.windowTimeZone !== input.timezone ? `Window timezone: ${input.windowTimeZone}` : null,
    `Orders: ${input.ordersCount}`,
    `Units sold: ${Math.round(input.unitsSold)}`,
    typeof input.averageDailyUnits === "number"
      ? `Average daily units: ${input.averageDailyUnits.toFixed(2)}`
      : null,
    typeof input.inventoryUnits === "number"
      ? `Inventory units: ${Math.round(input.inventoryUnits)}`
      : input.inventoryErrorMessage
        ? `Inventory: unavailable (${input.inventoryErrorMessage})`
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
  windowTimeZone?: string
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
    input.windowTimeZone && input.windowTimeZone !== input.timezone
      ? `Window timezone: ${input.windowTimeZone}`
      : null,
    "",
    ...summaryLines,
    inventoryLines.length > 0 ? "" : null,
    ...inventoryLines,
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
    name: "seller_analytics",
    label: "Seller Analytics",
    description:
      'Load store-level sales facts by domain. Use `resource: "store_sales"` with `operation: "overview"` for one time window or `operation: "summary"` for supported multi-window summaries. Always set "timeBasis": use "caller" for the user-local calendar and pass "callerTimeZone", or use "store" when the user explicitly wants the store-local calendar.',
    parameters: SellerAnalyticsParamsSchema,
    async execute(_id: string, params: SellerAnalyticsParams) {
      const store = findConfiguredStore(pluginConfig, params.storeId)
      if (!store) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_analytics.",
        )
      }

      const rangePreset = normalizeStoreOverviewRangePreset(params.rangePreset)
      const windows = normalizeStoreOverviewRangePresets(params.windows)
      const callerTimeZone = normalizeToolTimeZone(params.callerTimeZone)
      const hasWindows = windows !== undefined
      const hasCustomRange = Boolean(params.startDate || params.endDate)

      if (!isStoreOverviewTimeBasis(params.timeBasis)) {
        return textResult('Pass "timeBasis" as either "caller" or "store" for seller_analytics.')
      }

      if (params.timeBasis === "caller" && !callerTimeZone) {
        return textResult(
          'Pass "callerTimeZone" with a valid IANA timezone such as "Asia/Shanghai" when "timeBasis" is "caller".',
        )
      }

      if (params.timeBasis === "caller" && callerTimeZone && !isValidTimeZone(callerTimeZone)) {
        return textResult(
          'Use a valid IANA timezone such as "Asia/Shanghai" or "America/New_York" for "callerTimeZone".',
        )
      }

      if (params.timeBasis === "store" && callerTimeZone) {
        return textResult('Do not pass "callerTimeZone" when "timeBasis" is "store".')
      }

      if (params.operation === "summary" && rangePreset) {
        return textResult(
          'Use `operation: "overview"` with "rangePreset" in seller_analytics. `operation: "summary"` supports only "windows".',
        )
      }

      if (params.operation === "summary" && hasCustomRange) {
        return textResult(
          'Use `operation: "overview"` with "startDate"/"endDate" in seller_analytics. `operation: "summary"` supports only "windows".',
        )
      }

      if (hasCustomRange && (!params.startDate || !params.endDate)) {
        return textResult(
          'Ask the user for both "startDate" and "endDate" in YYYY-MM-DD format, or use a range preset such as today, yesterday, last_7_days, last_30_days, last_60_days, last_90_days, last_180_days, or last_365_days.',
        )
      }

      if (params.operation === "overview" && hasWindows) {
        return textResult(
          'Use `operation: "summary"` for multi-window store sales summaries in seller_analytics.',
        )
      }

      if (params.operation === "summary") {
        const requestedWindows = resolveStoreSalesSummaryWindows(windows)
        const summary = await dependencies.loadShopifyStoreSalesSummary(store, {
          timeBasis: params.timeBasis,
          windows: requestedWindows,
          callerTimeZone,
        })

        return textResultWithDetails(
          formatStoreSalesSummary({
            storeName: summary.storeName,
            timezone: summary.timezone,
            windowTimeZone: summary.windowTimeZone,
            locale: pluginConfig.locale,
            currencyCode: summary.currencyCode,
            lines: summary.windows,
            inventoryUnits: summary.inventoryUnits,
            inventoryDaysLeft: summary.inventoryDaysLeft,
            inventoryErrorMessage: summary.inventoryErrorMessage,
          }),
          {
            status: "ok",
            domain: "analytics",
            resource: params.resource,
            operation: params.operation,
            data: summary,
          },
        )
      }

      if (hasCustomRange && rangePreset) {
        return textResult(
          'Use either "rangePreset" or "startDate"/"endDate" for seller_analytics `operation: "overview"`.',
        )
      }

      let snapshot: ShopifyStoreOverviewSnapshot
      try {
        snapshot = await dependencies.loadShopifyStoreOverview(store, {
          timeBasis: params.timeBasis,
          rangePreset,
          callerTimeZone,
          startDate: params.startDate,
          endDate: params.endDate,
        })
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Custom store overview")) {
          return textResult(error.message)
        }
        throw error
      }
      return textResultWithDetails(
        formatStoreOverview(snapshot, {
          locale: pluginConfig.locale,
        }),
        {
          status: "ok",
          domain: "analytics",
          resource: params.resource,
          operation: params.operation,
          data: snapshot,
        },
      )
    },
  })

  api.registerTool({
    name: "seller_inventory",
    label: "Seller Inventory",
    description:
      'Look up current Shopify inventory by domain. Use `resource: "product"` and `operation: "query"` to return on-hand inventory for an exact SKU or product title search. Try the tool before asking for an exact SKU.',
    parameters: SellerInventoryParamsSchema,
    async execute(_id: string, params: SellerInventoryParams) {
      const store = findConfiguredStore(pluginConfig, params.storeId)
      if (!store) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_inventory.",
        )
      }

      const snapshot = await dependencies.loadShopifyInventorySnapshot(
        store,
        params.productRef,
        pluginConfig.locale,
      )
      if (snapshot.kind !== "ready") {
        return textResult(snapshot.message)
      }
      return textResultWithDetails(formatInventoryLookup(snapshot.value), {
        status: "ok",
        domain: "inventory",
        resource: params.resource,
        operation: params.operation,
        data: snapshot.value,
      })
    },
  })

  api.registerTool({
    name: "seller_orders",
    label: "Seller Orders",
    description:
      'Work with Shopify order-domain facts and actions by domain. Use `resource: "product_sales"` for product-level sales facts, `resource: "draft_order"` for draft-order query/create/update/invoice_send/complete, `resource: "fulfillment_order"` for fulfillment-order query/hold/release_hold/move, `resource: "order"` for order query/get/update/cancel/capture, `resource: "order_edit"` for order-edit session begin, `resource: "fulfillment"` for fulfillment creation, `resource: "return"` for returnable-item query and return creation, and `resource: "refund"` for refund creation.',
    parameters: SellerOrdersParamsSchema,
    async execute(_id: string, params: SellerOrdersParams) {
      const store = findConfiguredStore(pluginConfig, params.storeId)
      if (!store) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_orders.",
        )
      }

      if (params.resource === "product_sales" && params.operation === "query") {
        const input = validateToolInput(SellerOrdersProductSalesInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const salesLookbackDays = resolveSalesLookbackDays(input.salesLookbackDays, store)
        const snapshot = await dependencies.loadShopifySalesSnapshot(
          store,
          input.productRef,
          salesLookbackDays,
          pluginConfig.locale,
        )
        if (snapshot.kind !== "ready") {
          return textResult(snapshot.message)
        }
        return textResultWithDetails(formatSalesLookup(snapshot.value), {
          status: "ok",
          domain: "orders",
          resource: params.resource,
          operation: params.operation,
          data: snapshot.value,
        })
      }

      if (params.resource === "draft_order" && params.operation === "query") {
        const input = validateToolInput(SellerOrdersDraftOrderQueryInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const snapshot = await dependencies.queryShopifyDraftOrders(store, input)
        return textResultWithDetails(
          formatDraftOrderQuery(snapshot, {
            locale: pluginConfig.locale,
          }),
          {
            status: "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: snapshot,
          },
        )
      }

      if (params.resource === "draft_order" && params.operation === "create") {
        const input = validateToolInput(SellerOrdersDraftOrderCreateInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.createShopifyDraftOrder(store, input)

        return textResultWithDetails(
          formatDraftOrderAction(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "draft_order" && params.operation === "update") {
        const input = validateToolInput(SellerOrdersDraftOrderUpdateInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.updateShopifyDraftOrder(store, input)

        return textResultWithDetails(
          formatDraftOrderAction(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "draft_order" && params.operation === "invoice_send") {
        const input = validateToolInput(SellerOrdersDraftOrderInvoiceSendInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.sendShopifyDraftOrderInvoice(store, input)

        return textResultWithDetails(
          formatDraftOrderAction(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "draft_order" && params.operation === "complete") {
        const input = validateToolInput(SellerOrdersDraftOrderCompleteInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.completeShopifyDraftOrder(store, input)

        return textResultWithDetails(
          formatDraftOrderAction(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "fulfillment_order" && params.operation === "query") {
        const input = validateToolInput(SellerOrdersFulfillmentOrderQueryInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const snapshot = await dependencies.queryShopifyFulfillmentOrders(store, input)

        return textResultWithDetails(
          formatFulfillmentOrderQuery(snapshot, {
            locale: pluginConfig.locale,
          }),
          {
            status: "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: snapshot,
          },
        )
      }

      if (params.resource === "fulfillment_order" && params.operation === "hold") {
        const input = validateToolInput(SellerOrdersFulfillmentOrderHoldInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.holdShopifyFulfillmentOrder(store, input)

        return textResultWithDetails(
          formatFulfillmentOrderAction(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "fulfillment_order" && params.operation === "release_hold") {
        const input = validateToolInput(
          SellerOrdersFulfillmentOrderReleaseHoldInputSchema,
          params.input,
        )
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.releaseHoldShopifyFulfillmentOrder(store, input)

        return textResultWithDetails(
          formatFulfillmentOrderAction(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "fulfillment_order" && params.operation === "move") {
        const input = validateToolInput(SellerOrdersFulfillmentOrderMoveInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.moveShopifyFulfillmentOrder(store, input)

        return textResultWithDetails(
          formatFulfillmentOrderAction(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "order" && params.operation === "query") {
        const input = validateToolInput(SellerOrdersOrderQueryInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const snapshot = await dependencies.queryShopifyOrders(store, input)
        return textResultWithDetails(
          formatOrderQuery(snapshot, {
            locale: pluginConfig.locale,
          }),
          {
            status: "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: snapshot,
          },
        )
      }

      if (params.resource === "order" && params.operation === "get") {
        const input = validateToolInput(SellerOrdersOrderGetInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const snapshot = await dependencies.getShopifyOrder(store, input.orderId)
        if (!snapshot) {
          return textResult(
            `No Shopify order was found for "${input.orderId}". Confirm the order id and try again.`,
          )
        }

        return textResultWithDetails(
          formatOrderDetail(snapshot, {
            locale: pluginConfig.locale,
          }),
          {
            status: "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: snapshot,
          },
        )
      }

      if (params.resource === "order" && params.operation === "update") {
        const input = validateToolInput(SellerOrdersOrderUpdateInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.updateShopifyOrder(store, input)

        return textResultWithDetails(
          formatOrderUpdate(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "order" && params.operation === "cancel") {
        const input = validateToolInput(SellerOrdersOrderCancelInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.cancelShopifyOrder(store, input)

        return textResultWithDetails(
          formatOrderCancel(result, {
            locale: pluginConfig.locale,
          }),
          {
            status:
              result.orderCancelUserErrors.length > 0 || result.userErrors.length > 0
                ? "error"
                : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "order" && params.operation === "capture") {
        const input = validateToolInput(SellerOrdersOrderCaptureInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.captureShopifyOrder(store, input)

        return textResultWithDetails(
          formatOrderCapture(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "order_edit" && params.operation === "begin") {
        const input = validateToolInput(SellerOrdersOrderEditBeginInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.beginShopifyOrderEdit(store, input)

        return textResultWithDetails(
          formatOrderEditBegin(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "fulfillment" && params.operation === "create") {
        const input = validateToolInput(SellerOrdersFulfillmentCreateInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.createShopifyFulfillment(store, input)

        return textResultWithDetails(
          formatFulfillmentCreate(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "return" && params.operation === "query") {
        const input = validateToolInput(SellerOrdersReturnQueryInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const snapshot = await dependencies.queryShopifyReturnableFulfillments(store, input.orderId)

        return textResultWithDetails(
          formatReturnQuery(snapshot, {
            locale: pluginConfig.locale,
          }),
          {
            status: "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: snapshot,
          },
        )
      }

      if (params.resource === "return" && params.operation === "create") {
        const input = validateToolInput(SellerOrdersReturnCreateInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.createShopifyReturn(store, input)

        return textResultWithDetails(
          formatReturnCreate(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      if (params.resource === "refund" && params.operation === "create") {
        const input = validateToolInput(SellerOrdersRefundCreateInputSchema, params.input)
        if (!input) {
          return invalidSellerOrdersInput(params.resource, params.operation)
        }

        const result = await dependencies.createShopifyRefund(store, input)

        return textResultWithDetails(
          formatRefundCreate(result, {
            locale: pluginConfig.locale,
          }),
          {
            status: result.userErrors.length > 0 ? "error" : "ok",
            domain: "orders",
            resource: params.resource,
            operation: params.operation,
            data: result,
          },
        )
      }

      return textResult("Unsupported seller_orders resource/operation combination.")
    },
  })

  api.registerTool({
    name: "seller_catalog",
    label: "Seller Catalog",
    description:
      'Work with Shopify catalog facts by domain. Use `resource: "product_facts"` for one product fact bundle with inventory, sales, price, cost, and margin facts, `resource: "product"` for product browse/list queries, and `resource: "variant"` for variant browse/list queries. Variant queries support `input.allPages: true` for complete result sets such as full Shopify SKU listings with `query: "sku:*"`. This tool returns data only and does not make decisions.',
    parameters: SellerCatalogParamsSchema,
    async execute(_id: string, params: SellerCatalogParams) {
      const store = findConfiguredStore(pluginConfig, params.storeId)
      if (!store) {
        throw new Error(
          "Ask the user to configure a store in plugins.entries.seller-assistant.config before running seller_catalog.",
        )
      }

      if (params.resource === "product_facts" && params.operation === "query") {
        const input = getCatalogProductFactsInput(params.input)
        if (!input) {
          return textResult("seller_catalog product facts queries require `input.productRef`.")
        }

        const salesLookbackDays = resolveSalesLookbackDays(input.salesLookbackDays, store)
        const snapshot = await dependencies.loadShopifyProductActionSnapshot(
          store,
          input.productRef,
          salesLookbackDays,
          pluginConfig.locale,
        )
        if (snapshot.kind !== "ready") {
          return textResult(snapshot.message)
        }

        return textResultWithDetails(
          formatProductFacts(snapshot.value, {
            locale: pluginConfig.locale,
            fallbackCurrency: pluginConfig.currency,
          }),
          {
            status: "ok",
            domain: "catalog",
            resource: params.resource,
            operation: params.operation,
            data: snapshot.value,
          },
        )
      }

      if (params.resource === "product" && params.operation === "query") {
        const snapshot = await dependencies.queryShopifyCatalogProducts(
          store,
          getCatalogProductsQueryInput(params.input),
        )

        return textResultWithDetails(
          formatCatalogProductsQuery(snapshot, {
            locale: pluginConfig.locale,
          }),
          {
            status: "ok",
            domain: "catalog",
            resource: params.resource,
            operation: params.operation,
            data: snapshot,
          },
        )
      }

      if (params.resource === "variant" && params.operation === "query") {
        const snapshot = await dependencies.queryShopifyCatalogVariants(
          store,
          getCatalogVariantsQueryInput(params.input),
        )

        return textResultWithDetails(
          formatCatalogVariantsQuery(snapshot, {
            locale: pluginConfig.locale,
          }),
          {
            status: "ok",
            domain: "catalog",
            resource: params.resource,
            operation: params.operation,
            data: snapshot,
          },
        )
      }

      return textResult("Unsupported seller_catalog resource/operation combination.")
    },
  })
}
