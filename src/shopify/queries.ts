export const SHOPIFY_SHOP_QUERY = `
  query SellerHealthShop {
    shop {
      name
      currencyCode
      ianaTimezone
    }
  }
`

export const SHOPIFY_ORDERS_PAGE_QUERY = `
  query SellerHealthOrdersPage($ordersQuery: String!, $after: String) {
    orders(first: 250, after: $after, query: $ordersQuery, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        createdAt
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

export const SHOPIFY_ORDER_SUMMARIES_QUERY = `
  query SellerOrderSummaries($first: Int!, $after: String, $query: String, $reverse: Boolean!) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: $reverse) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        email
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        currentSubtotalLineItemsQuantity
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          displayName
          email
        }
      }
    }
  }
`

const SHOPIFY_FULFILLMENT_HOLD_FIELDS = `
  id
  reason
  reasonNotes
  handle
`

const SHOPIFY_FULFILLMENT_ORDER_LINE_ITEM_FIELDS = `
  id
  remainingQuantity
  totalQuantity
  lineItem {
    id
    sku
    name
    quantity
  }
`

const SHOPIFY_FULFILLMENT_ORDER_MOVE_CANDIDATE_FIELDS = `
  location {
    id
    name
  }
  message
  movable
  availableLineItemsCount {
    count
  }
  unavailableLineItemsCount {
    count
  }
`

const SHOPIFY_FULFILLMENT_ORDER_SUMMARY_FIELDS = `
  id
  createdAt
  updatedAt
  status
  requestStatus
  orderId
  orderName
  fulfillAt
  fulfillBy
  assignedLocation {
    name
    location {
      id
    }
  }
  deliveryMethod {
    methodType
  }
  destination {
    city
    countryCode
  }
  fulfillmentHolds {
    ${SHOPIFY_FULFILLMENT_HOLD_FIELDS}
  }
  supportedActions {
    action
  }
  lineItems(first: 50) {
    nodes {
      ${SHOPIFY_FULFILLMENT_ORDER_LINE_ITEM_FIELDS}
    }
  }
  locationsForMove(first: 10) {
    edges {
      node {
        ${SHOPIFY_FULFILLMENT_ORDER_MOVE_CANDIDATE_FIELDS}
      }
    }
  }
`

const SHOPIFY_ORDER_LINE_ITEM_FIELDS = `
  id
  sku
  name
  quantity
  refundableQuantity
  unfulfilledQuantity
`

const SHOPIFY_ORDER_TRANSACTION_FIELDS = `
  id
  kind
  status
  gateway
  processedAt
  amountSet {
    shopMoney {
      amount
      currencyCode
    }
  }
`

const SHOPIFY_ORDER_FULFILLMENT_ORDER_FIELDS = `
  id
  status
  requestStatus
  assignedLocation {
    name
    location {
      id
    }
  }
`

const SHOPIFY_RETURNABLE_FULFILLMENT_LINE_ITEM_FIELDS = `
  quantity
  fulfillmentLineItem {
    id
    lineItem {
      id
      sku
      name
      quantity
    }
  }
`

const SHOPIFY_DRAFT_ORDER_SUMMARY_FIELDS = `
  id
  name
  status
  ready
  createdAt
  updatedAt
  invoiceUrl
  invoiceSentAt
  reserveInventoryUntil
  email
  note
  tags
  taxExempt
  totalPriceSet {
    presentmentMoney {
      amount
      currencyCode
    }
  }
  order {
    id
    name
  }
`

export const SHOPIFY_DRAFT_ORDERS_QUERY = `
  query SellerDraftOrders($first: Int!, $after: String, $query: String, $reverse: Boolean!) {
    draftOrders(first: $first, after: $after, query: $query, reverse: $reverse, sortKey: UPDATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${SHOPIFY_DRAFT_ORDER_SUMMARY_FIELDS}
      }
    }
  }
`

export const SHOPIFY_FULFILLMENT_ORDERS_QUERY = `
  query SellerFulfillmentOrders(
    $first: Int!
    $after: String
    $query: String
    $reverse: Boolean!
    $includeClosed: Boolean!
  ) {
    fulfillmentOrders(
      first: $first
      after: $after
      query: $query
      reverse: $reverse
      includeClosed: $includeClosed
      sortKey: UPDATED_AT
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ${SHOPIFY_FULFILLMENT_ORDER_SUMMARY_FIELDS}
      }
    }
  }
`

export const SHOPIFY_ORDER_DETAIL_QUERY = `
  query SellerOrderDetail($orderId: ID!) {
    order(id: $orderId) {
      id
      name
      email
      createdAt
      cancelledAt
      cancelReason
      displayFinancialStatus
      displayFulfillmentStatus
      note
      tags
      currentSubtotalLineItemsQuantity
      currentTotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalRefundedSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      customer {
        displayName
        email
      }
      lineItems(first: 100) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${SHOPIFY_ORDER_LINE_ITEM_FIELDS}
        }
      }
      transactions(first: 100) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${SHOPIFY_ORDER_TRANSACTION_FIELDS}
        }
      }
    }
  }
`

export const SHOPIFY_ORDER_FULFILLMENT_ORDERS_QUERY = `
  query SellerOrderFulfillmentOrders($orderId: ID!, $after: String) {
    order(id: $orderId) {
      fulfillmentOrders(first: 50, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${SHOPIFY_ORDER_FULFILLMENT_ORDER_FIELDS}
          lineItems(first: 100) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              ${SHOPIFY_FULFILLMENT_ORDER_LINE_ITEM_FIELDS}
            }
          }
        }
      }
    }
  }
`

export const SHOPIFY_RETURNABLE_FULFILLMENTS_QUERY = `
  query SellerReturnableFulfillments(
    $orderId: ID!
    $after: String
    $first: Int!
    $lineItemsFirst: Int!
  ) {
    returnableFulfillments(orderId: $orderId, first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        fulfillment {
          id
        }
        returnableFulfillmentLineItems(first: $lineItemsFirst) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ${SHOPIFY_RETURNABLE_FULFILLMENT_LINE_ITEM_FIELDS}
          }
        }
      }
    }
  }
`

export const SHOPIFY_ORDER_TRANSACTIONS_PAGE_QUERY = `
  query SellerOrderTransactionsPage($orderId: ID!, $after: String) {
    order(id: $orderId) {
      transactions(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${SHOPIFY_ORDER_TRANSACTION_FIELDS}
        }
      }
    }
  }
`

export const SHOPIFY_FULFILLMENT_ORDER_LINE_ITEMS_PAGE_QUERY = `
  query SellerFulfillmentOrderLineItemsPage($fulfillmentOrderId: ID!, $after: String) {
    fulfillmentOrder(id: $fulfillmentOrderId) {
      lineItems(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${SHOPIFY_FULFILLMENT_ORDER_LINE_ITEM_FIELDS}
        }
      }
    }
  }
`

export const SHOPIFY_RETURNABLE_FULFILLMENT_LINE_ITEMS_PAGE_QUERY = `
  query SellerReturnableFulfillmentLineItemsPage($returnableFulfillmentId: ID!, $after: String) {
    returnableFulfillment(id: $returnableFulfillmentId) {
      returnableFulfillmentLineItems(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${SHOPIFY_RETURNABLE_FULFILLMENT_LINE_ITEM_FIELDS}
        }
      }
    }
  }
`

export const SHOPIFY_ORDER_CANCEL_MUTATION = `
  mutation SellerOrderCancel(
    $orderId: ID!
    $notifyCustomer: Boolean
    $refundMethod: OrderCancelRefundMethodInput!
    $restock: Boolean!
    $reason: OrderCancelReason!
    $staffNote: String
  ) {
    orderCancel(
      orderId: $orderId
      notifyCustomer: $notifyCustomer
      refundMethod: $refundMethod
      restock: $restock
      reason: $reason
      staffNote: $staffNote
    ) {
      job {
        id
        done
      }
      orderCancelUserErrors {
        code
        field
        message
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_ORDER_CAPTURE_MUTATION = `
  mutation SellerOrderCapture($input: OrderCaptureInput!) {
    orderCapture(input: $input) {
      transaction {
        id
        kind
        status
        processedAt
        amountSet {
          presentmentMoney {
            amount
            currencyCode
          }
        }
        parentTransaction {
          id
        }
        multiCapturable
        order {
          id
          capturable
          totalCapturable {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

const SHOPIFY_ORDER_MAILING_ADDRESS_FIELDS = `
  firstName
  lastName
  company
  address1
  address2
  city
  province
  provinceCode
  country
  countryCodeV2
  zip
  phone
`

const SHOPIFY_ORDER_UPDATE_FIELDS = `
  id
  name
  displayFinancialStatus
  displayFulfillmentStatus
  email
  phone
  note
  poNumber
  tags
  customAttributes {
    key
    value
  }
  shippingAddress {
    ${SHOPIFY_ORDER_MAILING_ADDRESS_FIELDS}
  }
  currentTotalPriceSet {
    shopMoney {
      amount
      currencyCode
    }
  }
`

export const SHOPIFY_ORDER_UPDATE_MUTATION = `
  mutation SellerOrderUpdate($input: OrderInput!) {
    orderUpdate(input: $input) {
      order {
        ${SHOPIFY_ORDER_UPDATE_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`

const SHOPIFY_CALCULATED_ORDER_LINE_ITEM_FIELDS = `
  id
  sku
  title
  quantity
`

const SHOPIFY_CALCULATED_ORDER_FIELDS = `
  id
  originalOrder {
    id
    name
  }
  subtotalLineItemsQuantity
  subtotalPriceSet {
    presentmentMoney {
      amount
      currencyCode
    }
  }
  totalOutstandingSet {
    presentmentMoney {
      amount
      currencyCode
    }
  }
  lineItems(first: 50) {
    nodes {
      ${SHOPIFY_CALCULATED_ORDER_LINE_ITEM_FIELDS}
    }
  }
  stagedChanges(first: 50) {
    nodes {
      __typename
    }
  }
`

export const SHOPIFY_ORDER_EDIT_BEGIN_MUTATION = `
  mutation SellerOrderEditBegin($id: ID!) {
    orderEditBegin(id: $id) {
      calculatedOrder {
        ${SHOPIFY_CALCULATED_ORDER_FIELDS}
      }
      orderEditSession {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_ORDER_EDIT_SET_QUANTITY_MUTATION = `
  mutation SellerOrderEditSetQuantity(
    $id: ID!
    $lineItemId: ID!
    $quantity: Int!
    $restock: Boolean
  ) {
    orderEditSetQuantity(
      id: $id
      lineItemId: $lineItemId
      quantity: $quantity
      restock: $restock
    ) {
      calculatedLineItem {
        ${SHOPIFY_CALCULATED_ORDER_LINE_ITEM_FIELDS}
      }
      calculatedOrder {
        ${SHOPIFY_CALCULATED_ORDER_FIELDS}
      }
      orderEditSession {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_ORDER_EDIT_COMMIT_MUTATION = `
  mutation SellerOrderEditCommit($id: ID!, $notifyCustomer: Boolean, $staffNote: String) {
    orderEditCommit(id: $id, notifyCustomer: $notifyCustomer, staffNote: $staffNote) {
      order {
        id
        name
        displayFinancialStatus
        displayFulfillmentStatus
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
      successMessages
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_DRAFT_ORDER_CREATE_MUTATION = `
  mutation SellerDraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        ${SHOPIFY_DRAFT_ORDER_SUMMARY_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_DRAFT_ORDER_UPDATE_MUTATION = `
  mutation SellerDraftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
    draftOrderUpdate(id: $id, input: $input) {
      draftOrder {
        ${SHOPIFY_DRAFT_ORDER_SUMMARY_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_DRAFT_ORDER_INVOICE_SEND_MUTATION = `
  mutation SellerDraftOrderInvoiceSend($id: ID!, $emailInput: EmailInput) {
    draftOrderInvoiceSend(id: $id, emailInput: $emailInput) {
      draftOrder {
        ${SHOPIFY_DRAFT_ORDER_SUMMARY_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_DRAFT_ORDER_COMPLETE_MUTATION = `
  mutation SellerDraftOrderComplete(
    $id: ID!
    $paymentGatewayId: ID
    $sourceName: String
  ) {
    draftOrderComplete(
      id: $id
      paymentGatewayId: $paymentGatewayId
      sourceName: $sourceName
    ) {
      draftOrder {
        ${SHOPIFY_DRAFT_ORDER_SUMMARY_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_FULFILLMENT_ORDER_HOLD_MUTATION = `
  mutation SellerFulfillmentOrderHold($id: ID!, $fulfillmentHold: FulfillmentOrderHoldInput!) {
    fulfillmentOrderHold(id: $id, fulfillmentHold: $fulfillmentHold) {
      fulfillmentHold {
        ${SHOPIFY_FULFILLMENT_HOLD_FIELDS}
      }
      fulfillmentOrder {
        ${SHOPIFY_FULFILLMENT_ORDER_SUMMARY_FIELDS}
      }
      remainingFulfillmentOrder {
        ${SHOPIFY_FULFILLMENT_ORDER_SUMMARY_FIELDS}
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`

export const SHOPIFY_FULFILLMENT_ORDER_RELEASE_HOLD_MUTATION = `
  mutation SellerFulfillmentOrderReleaseHold(
    $id: ID!
    $holdIds: [ID!]
    $externalId: String
  ) {
    fulfillmentOrderReleaseHold(id: $id, holdIds: $holdIds, externalId: $externalId) {
      fulfillmentOrder {
        ${SHOPIFY_FULFILLMENT_ORDER_SUMMARY_FIELDS}
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`

export const SHOPIFY_FULFILLMENT_ORDER_MOVE_MUTATION = `
  mutation SellerFulfillmentOrderMove(
    $id: ID!
    $newLocationId: ID!
    $fulfillmentOrderLineItems: [FulfillmentOrderLineItemInput!]
  ) {
    fulfillmentOrderMove(
      id: $id
      newLocationId: $newLocationId
      fulfillmentOrderLineItems: $fulfillmentOrderLineItems
    ) {
      movedFulfillmentOrder {
        ${SHOPIFY_FULFILLMENT_ORDER_SUMMARY_FIELDS}
      }
      originalFulfillmentOrder {
        ${SHOPIFY_FULFILLMENT_ORDER_SUMMARY_FIELDS}
      }
      remainingFulfillmentOrder {
        ${SHOPIFY_FULFILLMENT_ORDER_SUMMARY_FIELDS}
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_FULFILLMENT_CREATE_MUTATION = `
  mutation SellerFulfillmentCreate($fulfillment: FulfillmentInput!, $message: String) {
    fulfillmentCreate(fulfillment: $fulfillment, message: $message) {
      fulfillment {
        id
        status
        trackingInfo {
          company
          number
          url
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_RETURN_CREATE_MUTATION = `
  mutation SellerReturnCreate($returnInput: ReturnInput!) {
    returnCreate(returnInput: $returnInput) {
      return {
        id
        status
        order {
          id
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_REFUND_CREATE_MUTATION = `
  mutation SellerRefundCreate($input: RefundInput!) {
    refundCreate(input: $input) {
      order {
        id
      }
      refund {
        id
        note
        createdAt
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        transactions(first: 20) {
          nodes {
            id
            kind
            status
            gateway
            processedAt
            amountSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_REFUND_CREATE_IDEMPOTENT_MUTATION = `
  mutation SellerRefundCreate($input: RefundInput!, $idempotencyKey: String!) {
    refundCreate(input: $input) @idempotent(key: $idempotencyKey) {
      order {
        id
      }
      refund {
        id
        note
        createdAt
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        transactions(first: 20) {
          nodes {
            id
            kind
            status
            gateway
            processedAt
            amountSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

export const SHOPIFY_VARIANTS_PAGE_QUERY = `
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

export const SHOPIFY_VARIANT_BY_SKU_QUERY = `
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
          id
        }
        product {
          id
          title
        }
      }
    }
  }
`

export const SHOPIFY_VARIANT_BY_SKU_WITH_COST_QUERY = `
  query SellerVariantBySkuWithCost($skuQuery: String!, $after: String) {
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
          id
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

export const SHOPIFY_ORDERS_WITH_LINE_ITEMS_PAGE_QUERY = `
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

export const SHOPIFY_ORDER_LINE_ITEMS_PAGE_QUERY = `
  query SellerOrderLineItemsPage($orderId: ID!, $after: String) {
    order(id: $orderId) {
      lineItems(first: 250, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${SHOPIFY_ORDER_LINE_ITEM_FIELDS}
        }
      }
    }
  }
`

export const SHOPIFY_PRODUCTS_BY_TITLE_QUERY = `
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

export const SHOPIFY_CATALOG_PRODUCTS_QUERY = `
  query SellerCatalogProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        vendor
        totalInventory
      }
    }
  }
`

export const SHOPIFY_CATALOG_COLLECTIONS_QUERY = `
  query SellerCatalogCollections($first: Int!, $after: String, $query: String) {
    collections(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        updatedAt
        sortOrder
        ruleSet {
          appliedDisjunctively
          rules {
            column
            relation
            condition
          }
        }
      }
    }
  }
`

export const SHOPIFY_CATALOG_VARIANTS_QUERY = `
  query SellerCatalogVariants($first: Int!, $after: String, $query: String) {
    productVariants(first: $first, after: $after, query: $query) {
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
        product {
          id
          title
        }
      }
    }
  }
`

export const SHOPIFY_PRODUCT_VARIANTS_PAGE_QUERY = `
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
            id
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

export const SHOPIFY_PRODUCT_VARIANTS_PAGE_WITH_COST_QUERY = `
  query SellerProductVariantsPageWithCost($productId: ID!, $after: String) {
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
            id
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

export const SHOPIFY_LOCALES_QUERY = `
  query SellerHealthLocales {
    shopLocales(first: 10) {
      nodes {
        locale
        primary
      }
    }
  }
`

export const SHOPIFY_LOCATIONS_QUERY = `
  query SellerLocations(
    $first: Int!
    $after: String
    $query: String
    $includeInactive: Boolean!
    $includeLegacy: Boolean!
  ) {
    locations(
      first: $first
      after: $after
      query: $query
      includeInactive: $includeInactive
      includeLegacy: $includeLegacy
      sortKey: NAME
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        fulfillsOnlineOrders
        hasActiveInventory
        isActive
        address {
          formatted
        }
      }
    }
  }
`

export const SHOPIFY_INVENTORY_ITEM_LEVELS_QUERY = `
  query SellerInventoryItemLevels($inventoryItemId: ID!, $after: String) {
    inventoryItem(id: $inventoryItemId) {
      id
      inventoryLevels(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          location {
            id
            name
            fulfillsOnlineOrders
            hasActiveInventory
            isActive
          }
          quantities(names: ["available", "committed", "incoming", "on_hand", "reserved"]) {
            name
            quantity
          }
        }
      }
    }
  }
`
