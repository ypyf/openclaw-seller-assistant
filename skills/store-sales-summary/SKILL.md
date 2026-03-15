---
name: "store-sales-summary"
description: "Summarize store sales with seller_store_sales_summary when the user asks for a store sales summary, sales overview, or how a store sold today, yesterday, last 7 days, last 30 days, last 60 days, last 90 days, last 180 days, or last year."
---

# Store Sales Summary

Use this skill for factual store sales summary requests such as:

- "How did the store sell today, yesterday, last 7 days, last 30 days, last 60 days, last 90 days, last 180 days, and last year?"
- "Show a store sales summary."
- "Give me the recent store sales overview."

Do not use this skill for diagnostic questions such as "is this normal", "what's wrong", or "what should we do next". Those belong to `store-analysis`.

Use `seller_store_sales_summary` first. Treat the tool output as the final answer shape and keep it in the tool's plain-text format.

Rules:

- Do not reformat the tool output as a table.
- Do not translate or relabel the tool output.
- Do not add analysis, diagnosis, marketing guesses, traffic guesses, or next-step advice.
- Do not add closing questions or conversational filler.
- If the user requests only specific windows, pass those windows to the tool instead of using the default full set.
