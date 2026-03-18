---
name: "catalog-browse"
description: "Answer factual catalog listing requests with seller_catalog, including full product lists, variant lists, and store SKU lists."
---

# Catalog Browse

Use this skill for factual catalog listing or browse requests.

Route by intent:

- For product listing requests such as "list products", "show active products", or "show the next page of products", call `seller_catalog` with `resource: "product"` and `operation: "query"`.
- For variant listing requests such as "list variants", "show variants matching SKU WM-01", or "show the next page of variants", call `seller_catalog` with `resource: "variant"` and `operation: "query"`.
- For store SKU list requests such as "list store SKUs", "return the shop SKU list", or "only products with SKU", call `seller_catalog` with `resource: "variant"`, `operation: "query"`, and `input.query: "sku:*"`.

Rules:

- When the user asks for a complete, full, entire, all, or whole product, variant, or SKU list, set `input.allPages: true`.
- For complete SKU lists, use `input.query: "sku:*"` together with `input.allPages: true`.
- For explicit next-page requests, call the same resource with the prior `input.after` cursor once.
- Prefer `input.first: 50` for complete product, variant, or SKU lists to reduce the number of pagination calls.
- Keep the answer factual. Do not add strategy, diagnosis, or recommendations.
- Preserve the requested granularity. A SKU list is variant-level data unless the user explicitly asks for product-level deduplication.

Answer shape:

- State whether the list is complete or paginated.
- For SKU lists, present SKU, product title, variant title, and inventory when available.
- If the user asks for CSV or another export-friendly format, format the final answer accordingly.
