---
name: "store-health"
description: "Check store health with the seller_health_check tool. Requires the seller-assistant plugin. Use when the user asks to check store health, store performance, weekly sales health, inventory health, or similar seller-side diagnostics."
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

# Store Health

## When to use

Use this skill when the user wants a health summary for a store, such as:

- "Check store health"
- "How is my store doing this week?"
- "Review store performance"

## Instructions

1. Prefer the `seller_health_check` tool.
2. If the user names a configured store id, pass it as `storeId`.
3. If the user does not name a store, call `seller_health_check` without `storeId` so the plugin can use `defaultStoreId` or fall back to the first configured store.
4. Do not ask the user for revenue, visits, conversion, or inventory metrics before trying the tool.
5. If the plugin is unavailable or the tool is unavailable, tell the user that this skill requires the `seller-assistant` plugin to be installed and enabled.
6. If the tool reports that no configured store exists, then ask the user to configure a store.
7. If the tool reports that the platform is not implemented yet, explain that clearly and do not fabricate the result.

## Output

- Summarize the tool output plainly.
- Keep the response seller-facing and operational.
- Use short bullet points, not Markdown tables.
