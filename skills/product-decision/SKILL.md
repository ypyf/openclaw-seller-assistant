---
name: "product-decision"
description: "Decide whether a product should be replenished, discounted, or cleared with the focused seller decision tools. Use when the user asks what action to take on one product's inventory or pricing."
---

# Product Decision

Use the focused decision tool that matches the user's ask.

Rules:

- For restock / reorder questions, call `seller_replenishment_decision`.
- For markdown / discount questions, call `seller_discount_decision`.
- For clearance / liquidation questions, call `seller_clearance_decision`.
- For combined questions, call each relevant tool for the same product/store/lookback and aggregate the results into one answer.
- If only one tool is called, keep its output as the final answer shape.
- If a combined question triggers an ambiguity prompt from any tool, stop and ask the user to disambiguate before calling the others.
- If `seller_replenishment_decision` asks for missing lead-time inputs, keep any ready discount / clearance results and ask the user for the missing replenishment inputs instead of discarding the ready guidance.
- Preserve each tool's decision sentence when aggregating. Do not invent additional operational logic that the tools did not provide.
- Do not add ad-spend, traffic, or promotion speculation.
- Do not turn the answer into a campaign plan.
