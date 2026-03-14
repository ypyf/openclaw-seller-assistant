---
name: "sales-query"
description: "Check recent product sales with the seller_sales_lookup tool. Use when the user asks how much a SKU or product sold recently. Do not use this for store-level totals."
---

# Sales Query

Prefer `seller_sales_lookup` first for product-level sales questions. If the user asks for store-level totals such as today's store sales or yesterday's revenue, use `seller_store_overview` instead.

If the tool says more input is needed or the product match is ambiguous, ask the user to fill the gap before answering.

Summarize the result plainly in seller-facing language. Do not turn it into restock or campaign advice unless the user asks for that next.
