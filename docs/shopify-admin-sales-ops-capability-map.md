# Shopify Admin Sales/Ops Capability Map

## Purpose

This document exists to keep one durable inventory of:

1. the seller-ops primitives this repo should eventually cover through Shopify Admin API surfaces
2. the rough grouped-tool boundary each surface belongs to
3. the current implementation status in this repo

It should stay concrete and repo-relevant, with emphasis on implementable seller-ops coverage, grouped-tool ownership, and current repo status.

## Boundary

Design rules for this repo:

- Tools expose mechanism only: query, inspect, create, update, cancel, capture, fulfill, refund, export.
- Skills and agent orchestration own strategy: diagnosis, prioritization, replenishment advice, markdown advice, campaign planning, and multi-step workflows.
- Skills can also own pagination, combined filtering, comparisons, summarization, and other low-risk query composition.
- Prefer GraphQL Admin API for new coverage.
- Prefer a small set of grouped domain tools over many phrasing-specific tools.

## Primitive Completeness Goal

This repo should aim for high coverage of seller-ops primitives inside its grouped-tool boundary.

- Goal: expose the stable read/write primitives required for seller operations.
- Coverage target: the seller-ops subset of Shopify Admin GraphQL, expressed through grouped domain tools.
- Interface shape: explicit read/write primitives with structured inputs and predictable outputs.
- Interpretation rule: if a workflow only needs pagination, combined filtering, comparison, or summarization, skills can usually compose it from existing tools.
- Gap rule: if a workflow needs a missing tool-native read or mutation primitive, that is a real product gap and should be tracked here.

## Current Public Tool Surface

Current tools:

- `seller_analytics`
- `seller_inventory`
- `seller_orders`
- `seller_catalog`

Likely future grouped tool, if customer-facing seller workflows become necessary:

- `seller_customers`

## Recommended Domain Ownership

This is the intended rough boundary by grouped tool.

| Grouped tool       | Domain it should own                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| `seller_catalog`   | Products, variants, collections, publishing, contextual pricing, price lists           |
| `seller_inventory` | Inventory items, inventory levels, locations, inventory adjustments and moves          |
| `seller_orders`    | Orders, draft orders, order edits, fulfillments, returns, refunds                      |
| `seller_customers` | Customers, segments, companies, company locations, gift cards                          |
| `seller_analytics` | Store summaries, ShopifyQL, bulk operations, abandoned checkouts, marketing activities |

## Current Repo Coverage

| Tool               | Current implemented capability                                                                                                                                                                                                                                                                        | Important missing pieces                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `seller_analytics` | Store sales overview and fixed multi-window summaries                                                                                                                                                                                                                                                 | ShopifyQL, abandoned checkouts, marketing analytics, bulk export/job flows                  |
| `seller_inventory` | Product-level inventory lookup; location browse/list queries; per-location inventory level reads                                                                                                                                                                                                      | Inventory mutations                                                                         |
| `seller_orders`    | Product sales facts; draft-order query/create/update/invoice_send/complete; fulfillment-order query/hold/release_hold/move; order query/get/update/cancel/capture; order-edit session begin/set_quantity/commit; fulfillment creation; returnable-fulfillment query; return creation; refund creation | Order create; broader order-edit mutations; richer fulfillment and return lifecycle actions |
| `seller_catalog`   | Product fact bundles plus paginated product, variant, and collection browse/list queries                                                                                                                                                                                                              | Catalog mutations, publishing, price lists, contextual pricing, bulk export                 |

## Must-Implement Seller-Ops Primitives

This is the high-value capability checklist for in-scope seller operations. Keep it at the level of Admin API families and important mutations/queries, with nested fields added when they materially change capability shape.

| Domain                 | Shopify Admin API surfaces to cover                                                                                | Intended grouped tool                                 | Current status |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------- |
| Store context          | `Shop`, `Location`, `locations`                                                                                    | `seller_inventory` and `seller_analytics`             | Partial        |
| Catalog browse         | `Product`, `products`, `productVariants`, `collections`                                                            | `seller_catalog`                                      | Partial        |
| Catalog mutation       | `productCreate`, `productSet`, `productVariantsBulkUpdate`, publishing actions                                     | `seller_catalog`                                      | Missing        |
| Pricing and markets    | `PriceList`, `priceLists`, price-list create/update and fixed-price mutations                                      | `seller_catalog`                                      | Missing        |
| Inventory read         | `InventoryItem`, `InventoryLevel`, per-location availability                                                       | `seller_inventory`                                    | Partial        |
| Inventory mutation     | `inventoryAdjustQuantities`, `inventorySetQuantities`, `inventoryMoveQuantities`                                   | `seller_inventory`                                    | Missing        |
| Order read             | `Order`, `orders`, order detail and operational inspection                                                         | `seller_orders`                                       | Partial        |
| Order mutation         | `orderCreate`, `orderUpdate`, `orderCancel`, `orderCapture`                                                        | `seller_orders`                                       | Partial        |
| Order edits            | `orderEditBegin`, staged quantity updates, and commit                                                              | `seller_orders`                                       | Partial        |
| Draft orders           | `DraftOrder`, `draftOrders`, `draftOrderCreate`, `draftOrderUpdate`, `draftOrderInvoiceSend`, `draftOrderComplete` | `seller_orders`                                       | Partial        |
| Fulfillment orders     | `FulfillmentOrder`, `fulfillmentOrders`, hold/release/move/request actions                                         | `seller_orders`                                       | Partial        |
| Fulfillments           | `fulfillmentCreate` and follow-on fulfillment updates                                                              | `seller_orders`                                       | Partial        |
| Returns                | `returnableFulfillments`, `returnCreate`, `returnRequest`, return approval/cancel/close actions                    | `seller_orders`                                       | Partial        |
| Refunds                | `refundCreate` and refund inspection context                                                                       | `seller_orders`                                       | Partial        |
| Customers              | `Customer`, `customers`, `customerSet`, `customerDelete`                                                           | `seller_customers`                                    | Missing        |
| Segments               | `segments`, `customerSegmentMembersQueryCreate`                                                                    | `seller_customers`                                    | Missing        |
| B2B                    | `Company`, company queries, `companyCreate`, `companyLocationCreate`                                               | `seller_customers`                                    | Missing        |
| Gift cards             | `GiftCard`, `giftCardCreate`, `giftCardUpdate`, `giftCardDeactivate`                                               | `seller_customers`                                    | Missing        |
| Discounts              | `DiscountNode`, `discountNodes`, discount create/update mutations                                                  | `seller_catalog` or dedicated future domain if needed | Missing        |
| Recovery and marketing | `abandonedCheckouts`, `marketingActivity`                                                                          | `seller_analytics`                                    | Missing        |
| Analytics and export   | `shopifyqlQuery`, `bulkOperationRunQuery`, `bulkOperationRunMutation`                                              | `seller_analytics`                                    | Missing        |

## Near-Term Priorities

These are the highest-value next steps for the current repo.

1. Deepen `seller_orders`
   Add broader order-edit mutations, order create, and richer fulfillment/return actions.
2. Deepen `seller_inventory`
   Add write-side inventory mutation coverage on top of the new location-aware reads.
3. Deepen `seller_catalog`
   Add broader catalog reads and publishing/pricing surfaces before catalog mutation/export work.
4. Deepen `seller_analytics`
   Add Shopify-native analytics/export primitives only when they materially improve operator workflows.

## Tool-Shape Rules

Preferred shapes inside grouped tools:

- `query`
  Filtered lists, counts, cursors, lightweight summaries.
- `get`
  One fully expanded resource by id.
- explicit mutations such as `create`, `update`, `cancel`, `capture`, `move`
  Structured inputs and raw returned facts.

Rules:

- Group by domain, with sentence-level phrasing handled in skills.
- Keep `resource`, `operation`, and `input` dispatch explicit.
- Return facts, ids, state, warnings, and `userErrors`.
- Keep recommendations such as "should", "best", or threshold-based judgments in skills and orchestration.
- Prefer extending an existing domain tool over introducing a new phrasing-specific tool.

## Shopify Access Notes

These access constraints matter for most of the capability map above.

| Area                                   | Why it matters                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `read_orders` and `read_all_orders`    | Order queries and long lookbacks depend on order access                                    |
| Protected customer data access         | Order and customer queries can fail even with HTTP `200`                                   |
| `write_orders`                         | Needed for direct order mutations such as `orderUpdate`, `orderCancel`, and `orderCapture` |
| `write_order_edits`                    | Needed for `orderEditBegin` and follow-on order-edit mutations                             |
| Fulfillment-order scopes               | Needed for fulfillment-order query and action coverage                                     |
| `write_returns`                        | Needed for return lifecycle coverage                                                       |
| `read_products` / `write_products`     | Needed for catalog and inventory expansion                                                 |
| `read_locations`                       | Needed before location-aware inventory and fulfillment flows are complete                  |
| GraphQL throttling and bulk operations | Important once query breadth and export scale increase                                     |

## Maintenance Rules For This Document

Keep this file focused on:

- must-have seller-ops primitive families
- grouped-tool ownership
- current repo status
- near-term implementation priorities

## References

- Shopify Admin GraphQL API: <https://shopify.dev/docs/api/admin-graphql>
- GraphQL queries and mutations basics: <https://shopify.dev/docs/apps/build/graphql/basics/queries>, <https://shopify.dev/docs/apps/build/graphql/basics/mutations>
- Orders and draft orders: <https://shopify.dev/docs/api/admin-graphql/latest/objects/Order>, <https://shopify.dev/docs/api/admin-graphql/latest/objects/DraftOrder>
