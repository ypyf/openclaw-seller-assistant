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
          sku
          name
          quantity
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
