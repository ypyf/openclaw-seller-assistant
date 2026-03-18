---
name: "product-decision"
description: "Choose replenishment, discount, or clearance guidance for one product. Use when the user asks what action to take on that product's inventory or pricing."
---

# Product Decision

Use `seller_catalog` to load one product fact bundle, then make the recommendation in the skill.

- Call `seller_catalog` with `resource: "product_facts"`, `operation: "query"`, and `input.productRef` for the product.
- Use `input.salesLookbackDays` when the user provides it or when the calling context requires a specific review window.
- If the tool returns an ambiguity prompt, ask the user to clarify the product before giving advice.

Decision guidance:

- Restock / reorder: favor restocking when sales are active and inventory cover is low or stock is already out. Be cautious when demand is weak or sales are near zero.
- Markdown / discount: consider discount testing only when inventory cover is high enough to justify intervention and margin appears healthy enough to absorb a markdown.
- Clearance / liquidation: reserve clearance guidance for aged inventory with weak demand, especially when inventory cover is very long and sales are slow.
- If cost or margin data is unavailable, say that discount and clearance guidance is lower confidence and avoid precise pricing instructions.
- For combined asks, answer each requested action using the same fact set rather than calling separate tools.

Answer shape:

- Present current-state facts separately from analysis.
- Write a concise operator-facing answer in the user's language with natural section headings.
- For single-product answers, use this order: current situation, analysis, recommended actions, conclusion.
- Make recommended actions concrete. Include pricing guardrails, review cadence, or escalation triggers when provided.

If blocked:

- If the product reference is ambiguous, ask the user to clarify before continuing.
- If margin or cost facts are unavailable, continue with inventory and demand guidance and clearly mark pricing guidance as limited.

Boundaries:

- Base the answer only on tool-provided facts.
- Do not add ad-spend, traffic, or promotion speculation.
- Do not turn the answer into a campaign plan.
