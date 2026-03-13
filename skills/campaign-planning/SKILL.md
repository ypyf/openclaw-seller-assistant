---
name: "campaign-planning"
description: "Plan seller-side campaigns with the seller_campaign_context tool plus seller inventory/restock data. Requires the seller-assistant plugin. Use when the user asks how to promote, discount, clear inventory, launch, or recover conversion for a SKU or product."
metadata:
  {
    "openclaw":
      {
        "requires":
          {
            "config":
              [
                "plugins.entries.seller-assistant.enabled",
              ],
          },
      },
  }
---

# Campaign Planning

## When to use

Use this skill when the user wants campaign guidance, such as:

- "How should I promote SKU WM-01?"
- "Short sleeve销量差，怎么解决"
- "Help me clear inventory for this product"
- "Give me a campaign plan for Meta ads"
- "How should I recover conversion for this SKU?"

## Instructions

1. Prefer the `seller_campaign_context` tool first to load campaign planning context.
2. If the user names a configured store id, pass it as `storeId`.
3. If the user does not name a store, call the tool without `storeId` so the plugin can use `defaultStoreId` or fall back to the first configured store.
4. Treat the tool output as factual planning context, not as the final user-facing campaign plan.
5. Before giving the final plan, confirm that the required planning inputs are complete:
   - objective
   - hero SKU or resolvable product title
   - primary channel
   - current margin percentage
   - inventory cover in days
6. If any required input is missing and cannot be loaded from Shopify, ask the user for it before producing the final plan.
7. If the lookup is ambiguous, ask the user to choose one exact SKU or full product title before planning.
8. If useful, call `seller_inventory_lookup` or `seller_restock_signal` to clarify inventory posture, but do not skip the required campaign inputs.
9. If the plugin or tool is unavailable, tell the user that this skill requires the `seller-assistant` plugin to be installed and enabled.
10. If the tool reports that no configured store exists, ask the user either to provide the missing campaign inputs manually or to configure a store.

## Output

- Once required inputs are complete, write the final plan in your own words.
- Keep the response seller-facing and operational.
- Cover:
  - current situation
  - offer direction
  - channel / audience / creative guidance
  - guardrails and risks
  - next actions and KPIs
- Do not paste raw tool output as the final answer.
