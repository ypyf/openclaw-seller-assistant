---
name: "product-decision"
description: "Choose replenishment, discount, or clearance guidance for one product. Use when the user asks what action to take on that product's inventory or pricing."
---

# Product Decision

Use the decision tool that matches the user's ask.

Tool selection:

- Restock / reorder -> `seller_replenishment_decision`
- Markdown / discount -> `seller_discount_decision`
- Clearance / liquidation -> `seller_clearance_decision`
- Combined asks -> call each relevant tool for the same product, store, and lookback, then merge the results

Answer shape:

- Preserve each tool's decision sentence and numeric facts.
- Present current-state facts separately from analysis.
- If a discount or clearance tool includes a `Structured decision data` block in its content, prefer that block over the fallback prose and turn it into natural-language guidance. Do not echo the raw block.
- Write a concise operator-facing answer in the user's language with natural section headings.
- For single-tool answers, use this order: current situation, analysis, recommended actions, conclusion.
- Make recommended actions concrete. Include pricing guardrails, review cadence, or escalation triggers when provided.

If blocked:

- If any tool returns an ambiguity prompt for a combined question, ask the user to clarify before continuing.
- If `seller_replenishment_decision` needs lead-time inputs, keep any ready discount / clearance guidance and ask only for the missing replenishment inputs.

Boundaries:

- Base the answer only on tool-provided decisions and facts.
- Do not add ad-spend, traffic, or promotion speculation.
- Do not turn the answer into a campaign plan.
