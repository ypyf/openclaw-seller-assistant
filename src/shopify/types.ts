export type ShopifyOrdersPage = {
  orders?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      createdAt?: string | null
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

export type ShopifyOrderSummariesPage = {
  orders?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      id?: string | null
      name?: string | null
      email?: string | null
      createdAt?: string | null
      displayFinancialStatus?: string | null
      displayFulfillmentStatus?: string | null
      currentSubtotalLineItemsQuantity?: number | null
      currentTotalPriceSet?: {
        shopMoney?: {
          amount?: string | null
          currencyCode?: string | null
        } | null
      } | null
      customer?: {
        displayName?: string | null
        email?: string | null
      } | null
    }>
  }
}

export type ShopifyDraftOrderNode = {
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

export type ShopifyDraftOrdersQuery = {
  draftOrders?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: ShopifyDraftOrderNode[]
  }
}

export type ShopifyFulfillmentHoldNode = {
  id?: string | null
  reason?: string | null
  reasonNotes?: string | null
  handle?: string | null
}

export type ShopifyFulfillmentOrderNode = {
  id?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  status?: string | null
  requestStatus?: string | null
  orderId?: string | null
  orderName?: string | null
  fulfillAt?: string | null
  fulfillBy?: string | null
  assignedLocation?: {
    name?: string | null
    location?: {
      id?: string | null
    } | null
  } | null
  deliveryMethod?: {
    methodType?: string | null
  } | null
  destination?: {
    city?: string | null
    countryCode?: string | null
  } | null
  fulfillmentHolds?: ShopifyFulfillmentHoldNode[] | null
  supportedActions?: Array<{
    action?: string | null
  }> | null
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
  locationsForMove?: {
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
  } | null
}

export type ShopifyFulfillmentOrdersQuery = {
  fulfillmentOrders?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: ShopifyFulfillmentOrderNode[]
  }
}

export type ShopifyOrderDetailQuery = {
  order?: {
    id?: string | null
    name?: string | null
    email?: string | null
    createdAt?: string | null
    cancelledAt?: string | null
    cancelReason?: string | null
    displayFinancialStatus?: string | null
    displayFulfillmentStatus?: string | null
    note?: string | null
    tags?: string[] | null
    currentSubtotalLineItemsQuantity?: number | null
    currentTotalPriceSet?: {
      shopMoney?: {
        amount?: string | null
        currencyCode?: string | null
      } | null
    } | null
    totalRefundedSet?: {
      shopMoney?: {
        amount?: string | null
        currencyCode?: string | null
      } | null
    } | null
    customer?: {
      displayName?: string | null
      email?: string | null
    } | null
    lineItems?: {
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
      nodes?: Array<{
        id?: string | null
        sku?: string | null
        name?: string | null
        quantity?: number | null
        refundableQuantity?: number | null
        unfulfilledQuantity?: number | null
      }>
    } | null
    transactions?: {
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
      nodes?: Array<{
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
      }>
    } | null
  } | null
}

export type ShopifyOrderFulfillmentOrdersQuery = {
  order?: {
    fulfillmentOrders?: {
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
      nodes?: Array<{
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
          pageInfo?: {
            hasNextPage?: boolean
            endCursor?: string | null
          }
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
      }>
    } | null
  } | null
}

export type ShopifyReturnableFulfillmentsQuery = {
  returnableFulfillments?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      id?: string | null
      fulfillment?: {
        id?: string | null
      } | null
      returnableFulfillmentLineItems?: {
        pageInfo?: {
          hasNextPage?: boolean
          endCursor?: string | null
        }
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
    }>
  } | null
}

export type ShopifyMutationUserError = {
  field?: string[] | null
  message?: string | null
  code?: string | null
}

export type ShopifyOrderCancelMutation = {
  orderCancel?: {
    job?: {
      id?: string | null
      done?: boolean | null
    } | null
    orderCancelUserErrors?: ShopifyMutationUserError[] | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyOrderCaptureMutation = {
  orderCapture?: {
    transaction?: {
      id?: string | null
      kind?: string | null
      status?: string | null
      processedAt?: string | null
      amountSet?: {
        presentmentMoney?: {
          amount?: string | null
          currencyCode?: string | null
        } | null
      } | null
      parentTransaction?: {
        id?: string | null
      } | null
      multiCapturable?: boolean | null
      order?: {
        id?: string | null
        capturable?: boolean | null
        totalCapturable?: {
          amount?: string | null
          currencyCode?: string | null
        } | null
      } | null
    } | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyOrderUpdateMutation = {
  orderUpdate?: {
    order?: {
      id?: string | null
      name?: string | null
      displayFinancialStatus?: string | null
      displayFulfillmentStatus?: string | null
      email?: string | null
      phone?: string | null
      note?: string | null
      poNumber?: string | null
      tags?: string[] | null
      customAttributes?: Array<{
        key?: string | null
        value?: string | null
      }> | null
      shippingAddress?: {
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
      } | null
      currentTotalPriceSet?: {
        shopMoney?: {
          amount?: string | null
          currencyCode?: string | null
        } | null
      } | null
    } | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyOrderEditBeginMutation = {
  orderEditBegin?: {
    calculatedOrder?: {
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
    } | null
    orderEditSession?: {
      id?: string | null
    } | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyDraftOrderMutationPayload = {
  draftOrder?: ShopifyDraftOrderNode | null
  userErrors?: ShopifyMutationUserError[] | null
}

export type ShopifyDraftOrderCreateMutation = {
  draftOrderCreate?: ShopifyDraftOrderMutationPayload | null
}

export type ShopifyDraftOrderUpdateMutation = {
  draftOrderUpdate?: ShopifyDraftOrderMutationPayload | null
}

export type ShopifyDraftOrderInvoiceSendMutation = {
  draftOrderInvoiceSend?: ShopifyDraftOrderMutationPayload | null
}

export type ShopifyDraftOrderCompleteMutation = {
  draftOrderComplete?: ShopifyDraftOrderMutationPayload | null
}

export type ShopifyFulfillmentOrderHoldMutation = {
  fulfillmentOrderHold?: {
    fulfillmentHold?: ShopifyFulfillmentHoldNode | null
    fulfillmentOrder?: ShopifyFulfillmentOrderNode | null
    remainingFulfillmentOrder?: ShopifyFulfillmentOrderNode | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyFulfillmentOrderReleaseHoldMutation = {
  fulfillmentOrderReleaseHold?: {
    fulfillmentOrder?: ShopifyFulfillmentOrderNode | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyFulfillmentOrderMoveMutation = {
  fulfillmentOrderMove?: {
    movedFulfillmentOrder?: ShopifyFulfillmentOrderNode | null
    originalFulfillmentOrder?: ShopifyFulfillmentOrderNode | null
    remainingFulfillmentOrder?: ShopifyFulfillmentOrderNode | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyReturnCreateMutation = {
  returnCreate?: {
    return?: {
      id?: string | null
      status?: string | null
      order?: {
        id?: string | null
      } | null
    } | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyFulfillmentCreateMutation = {
  fulfillmentCreate?: {
    fulfillment?: {
      id?: string | null
      status?: string | null
      trackingInfo?: Array<{
        company?: string | null
        number?: string | null
        url?: string | null
      }> | null
    } | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyRefundCreateMutation = {
  refundCreate?: {
    order?: {
      id?: string | null
    } | null
    refund?: {
      id?: string | null
      note?: string | null
      createdAt?: string | null
      totalRefundedSet?: {
        shopMoney?: {
          amount?: string | null
          currencyCode?: string | null
        } | null
      } | null
      transactions?: {
        nodes?: Array<{
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
        }>
      } | null
    } | null
    userErrors?: ShopifyMutationUserError[] | null
  } | null
}

export type ShopifyVariantsPage = {
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

export type ShopifyOrderTransactionsPage = {
  order?: {
    transactions?: {
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
      nodes?: Array<{
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
      }>
    } | null
  } | null
}

export type ShopifyFulfillmentOrderLineItemsPage = {
  fulfillmentOrder?: {
    lineItems?: {
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
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
  } | null
}

export type ShopifyReturnableFulfillmentLineItemsPage = {
  returnableFulfillment?: {
    returnableFulfillmentLineItems?: {
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
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
  } | null
}

export type ShopifyVariantLookupPage = {
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

export type ShopifyOrdersWithLineItemsPage = {
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

export type ShopifyOrderLineItemsPage = {
  order?: {
    lineItems?: {
      pageInfo?: {
        hasNextPage?: boolean
        endCursor?: string | null
      }
      nodes?: Array<{
        id?: string | null
        sku?: string | null
        name?: string | null
        quantity?: number | null
        refundableQuantity?: number | null
        unfulfilledQuantity?: number | null
      }>
    }
  }
}

export type ShopifyProductsByTitlePage = {
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

export type ShopifyCatalogProductsQuery = {
  products?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      id?: string | null
      title?: string | null
      handle?: string | null
      status?: string | null
      vendor?: string | null
      totalInventory?: number | null
    }>
  }
}

export type ShopifyCatalogVariantsQuery = {
  productVariants?: {
    pageInfo?: {
      hasNextPage?: boolean
      endCursor?: string | null
    }
    nodes?: Array<{
      id?: string | null
      sku?: string | null
      displayName?: string | null
      price?: string | null
      inventoryQuantity?: number | null
      product?: {
        id?: string | null
        title?: string | null
      } | null
    }>
  }
}

export type ShopifyProductVariantsPage = {
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

export type ShopifyProductByTitle = NonNullable<
  NonNullable<ShopifyProductsByTitlePage["products"]>["nodes"]
>[number]

export type ShopifyProductVariantNode = NonNullable<
  NonNullable<NonNullable<ShopifyProductVariantsPage["product"]>["variants"]>["nodes"]
>[number]

export type ShopifyProductWithVariants = ShopifyProductByTitle & {
  variants?: {
    nodes?: ShopifyProductVariantNode[]
  }
}

export type ShopifyResolvedVariant =
  | NonNullable<NonNullable<ShopifyVariantLookupPage["productVariants"]>["nodes"]>[number]
  | ShopifyProductVariantNode

export type ShopifyResolvedCandidate = {
  variant: ShopifyResolvedVariant
  productKey: string
}

export type ShopifyVariantSelection = {
  variants: ShopifyResolvedVariant[]
  resolvedSku: string
  resolvedSkus: string[]
  matchNames: string[]
}

export type ShopifyOrderWithLineItems = NonNullable<
  NonNullable<ShopifyOrdersWithLineItemsPage["orders"]>["nodes"]
>[number]

export type ShopifyInitialOrderLineItem = NonNullable<
  NonNullable<ShopifyOrderWithLineItems["lineItems"]>["nodes"]
>[number]

export type ShopifyPaginatedOrderLineItem = NonNullable<
  NonNullable<NonNullable<ShopifyOrderLineItemsPage["order"]>["lineItems"]>["nodes"]
>[number]

export type ShopifyDetailedOrderLineItem = NonNullable<
  NonNullable<NonNullable<ShopifyOrderDetailQuery["order"]>["lineItems"]>["nodes"]
>[number]

export type ShopifyDetailedOrderTransaction = NonNullable<
  NonNullable<NonNullable<ShopifyOrderDetailQuery["order"]>["transactions"]>["nodes"]
>[number]

export type ShopifyPaginatedOrderTransaction = NonNullable<
  NonNullable<NonNullable<ShopifyOrderTransactionsPage["order"]>["transactions"]>["nodes"]
>[number]

export type ShopifyOrderDetailFulfillmentOrder = NonNullable<
  NonNullable<
    NonNullable<ShopifyOrderFulfillmentOrdersQuery["order"]>["fulfillmentOrders"]
  >["nodes"]
>[number]

export type ShopifyDetailedFulfillmentOrderLineItem = NonNullable<
  NonNullable<
    NonNullable<ShopifyFulfillmentOrderLineItemsPage["fulfillmentOrder"]>["lineItems"]
  >["nodes"]
>[number]

export type ShopifyReturnableFulfillmentNode = NonNullable<
  NonNullable<ShopifyReturnableFulfillmentsQuery["returnableFulfillments"]>["nodes"]
>[number]

export type ShopifyDetailedReturnableFulfillmentLineItem = NonNullable<
  NonNullable<
    NonNullable<
      ShopifyReturnableFulfillmentLineItemsPage["returnableFulfillment"]
    >["returnableFulfillmentLineItems"]
  >["nodes"]
>[number]

export type ShopifyGraphQLClient = {
  request: <TData>(
    operation: string,
    options?: {
      variables?: Record<string, unknown>
    },
  ) => Promise<{
    data?: TData
    errors?: unknown
  }>
}

export type ShopifyGraphQLResponse<TData> = {
  data?: TData
  errors?: unknown
}
