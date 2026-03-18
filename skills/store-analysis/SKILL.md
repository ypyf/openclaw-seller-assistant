---
name: "store-analysis"
description: "Analyze store-level sales performance with seller_store_overview when the user asks for diagnosis, judgment, risk review, change analysis, or next-step advice."
---

# Store Analysis

Use this skill when the user wants analysis or next-step advice about store-level sales performance.

Route by intent:

- For single-period diagnosis requests such as "how does this look", "is this normal", "what's the problem", or "what should we do next", call `seller_store_overview` in single-window mode with `rangePreset` or `startDate` and `endDate`, then give a short analysis.
- For comparison-based diagnosis requests that can be expressed as supported standard windows without creating a misleading overlap, such as "how does today compare with yesterday?", call `seller_store_overview` with `windows` first, then analyze the returned facts.
- For comparison-based diagnosis requests that need explicit non-overlapping periods, such as comparisons between two custom date ranges or calendar periods that are not directly represented by the standard `windows`, call `seller_store_overview` separately for each period with `startDate` and `endDate`, then compare the results in your analysis.

Rules:

- Always set `timeBasis`. Default to `timeBasis: "caller"` with `callerTimeZone`; switch to `timeBasis: "store"` only when the user explicitly wants the store-local calendar.
- Relative windows use `rangePreset` or `windows`. Explicit calendar dates use `startDate` and `endDate`.
- Do not call `seller_sales_query` for store-total questions. That tool is product-level only.
- Do not treat overlapping rolling windows as a clean baseline for change analysis. For example, do not judge `today` against `last_7_days` as if the 7-day window excludes today.
- If the user names a calendar comparison period but does not provide dates and the period is not directly representable by supported presets, ask for exact dates instead of silently remapping it.
- Do not invent traffic, conversion, ad-spend, or marketing-attribution data if the tool does not provide them.
- Respond in this order: restate the key facts and time window, give a concise judgment, then give practical next steps.
