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
        sku?: string | null
        name?: string | null
        quantity?: number | null
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
