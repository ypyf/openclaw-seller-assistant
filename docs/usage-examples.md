# Usage Examples

These examples are business-facing requests. The agent can satisfy them by searching provider docs, generating a read-only script, executing it, and summarizing the result.

## Store Sales

- "How much did my store sell today?"
- "How much did my store sell yesterday?"
- "Show store overview for my default Shopify profile over the last 7 days."
- "Show store overview for profile shopify-main from 2026-03-01 to 2026-03-07."
- "How did my store perform this week compared with last week?"
- "Check store health for my default Shopify profile."

## Inventory and Catalog

- "Check inventory for SKU WM-01 in my default Shopify profile."
- "How much inventory does Short sleeve t-shirt have right now?"
- "Which SKUs are low on stock?"
- "List active products from vendor Acme."
- "List variants matching SKU WM-01."
- "List every SKU in my default Shopify profile."
- "Show the next page of products in my default Shopify profile."

## Orders and Fulfillment

- "Show the latest paid unfulfilled orders in my default Shopify profile."
- "List recent orders for buyer@example.com."
- "Show fulfillment orders assigned to Main Warehouse."
- "Show returnable line items for order #1001."
- "Summarize payment and fulfillment status for the last 10 orders."
- "Which orders are still awaiting fulfillment?"

## Draft Orders and Operational Review

- "List open draft orders in my default Shopify profile."
- "Show recent draft orders for buyer@example.com."
- "Which draft orders are ready to invoice?"
- "Inspect the latest draft order for buyer@example.com and summarize its status."

## Product and Store Analysis

- "How much did SKU WM-01 sell over the last 21 days?"
- "Compare inventory and recent sales for SKU WM-01."
- "Which products look overstocked based on current inventory and recent demand?"
- "Show me products with inventory on hand but no recent sales."

## Explicit Runtime Requests

- "Search Shopify docs for Admin GraphQL order queries."
- "Look up Shopify docs for fulfillment order pagination."
- "Using my default Shopify profile, generate a read-only GraphQL query for open fulfillment orders and summarize the result."
- "Refresh the Shopify docs cache and search for protected customer data requirements."
