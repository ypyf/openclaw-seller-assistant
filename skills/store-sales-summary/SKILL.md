---
name: "store-sales-summary"
description: "Answer factual store-level sales questions with seller_store_overview, including single-window store totals, fixed multi-window summaries, and factual comparisons between store periods."
---

# Store Sales Summary

Use this skill for factual store-level sales requests. Do not use it for diagnosis, judgment, or next-step advice.

Route by intent:

- For single-window factual requests such as "how much did my store sell today", "show store overview for the last 7 days", or "show store overview from 2026-03-01 to 2026-03-07", call `seller_store_overview` in single-window mode with `rangePreset` or `startDate` and `endDate`.
- For fixed multi-window summary requests such as "show a store sales summary" or "how did the store sell today, yesterday, last 7 days, and last year", call `seller_store_overview` with `windows`. Use `windows: []` for the default full summary window set, or pass specific supported windows when the user names them.
- For factual comparisons between two explicit custom periods, call `seller_store_overview` separately for each period with `startDate` and `endDate`, then present the comparison factually without adding diagnosis or advice.

Rules:

- Do not call `seller_sales_query` for store-total questions. That tool is product-level only.
- Do not silently remap calendar periods that are not represented by supported presets. If the user wants a comparison like month-over-month and does not provide exact dates, ask for the date ranges.
- Do not present overlapping rolling windows as a non-overlapping baseline comparison. If the user asks for both values, report the numbers factually and note the overlap when it matters.
- Do not add diagnosis, causal claims, or next-step advice. Those belong to `store-analysis`.
- Keep multi-window summary output in plain text. Do not reformat it as a table, relabel it, or translate its window labels.
