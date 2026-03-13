## Output format for Discord

Format structured responses for Discord using Discord embeds instead of Markdown tables.

Rules:
- Do not output Markdown tables.
- Use embeds with fields for structured data.
- Return valid JSON shaped like `{ "embeds": [...] }`.
- Use inline fields when appropriate.
- Keep output within Discord embed limits.
- Fall back to a code-block monospace table only when embeds are not suitable.
