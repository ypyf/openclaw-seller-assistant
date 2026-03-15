---
name: "campaign-planning"
description: "Plan seller-side campaigns with the seller_campaign_context tool plus seller inventory/restock data. Use when the user asks how to promote, discount, clear inventory, launch, or recover conversion for a product."
---

# Campaign Planning

Prefer `seller_campaign_context` first. Use the tool output as planning context, not as the final answer. If the tool says more input is needed or the product match is ambiguous, ask the user to fill the gap before planning. If useful, call `seller_inventory_query` or `seller_restock_signal` for extra context.

Write the final answer in seller-facing language. Focus on current situation, offer direction, channel and creative guidance, guardrails, and next actions.
