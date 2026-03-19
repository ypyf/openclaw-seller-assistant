---
name: "seller-api-workflow"
description: "Use when the user wants to inspect profiles, search docs, generate a read-only script, execute it, and summarize the result."
---

# API Workflow

Use this skill for the standard workflow:

1. Inspect profiles with `seller_profiles` when the user does not name a profile.
2. Search provider notes and official docs with `seller_search`.
3. Generate a read-only JavaScript script that uses `provider.graphql(...)` or `provider.request(...)`.
4. Execute it with `seller_execute`.
5. Summarize the result using the returned `result`, `requestSummary`, `rawResponses`, and `logs`.

Rules:

- Prefer the configured default profile when the user does not name one.
- Keep execution in `runtime: "javascript"` and `mode: "read"`.
- In this runtime, `provider.graphql(...)` returns the validated GraphQL `data` object directly.
- Use `provider.request(...)` for read-only HTTP endpoints only when GraphQL is not the best fit.
- Use `seller_search` before inventing request shapes from memory.
- Keep scripts narrowly scoped to the user request and return concise structured objects instead of full raw payloads.
- Treat `requestSummary` and `rawResponses` as execution evidence when explaining what happened.
- If documentation search returns multiple relevant entries, pick the narrowest one that directly supports the requested data access pattern.

Answer shape:

- Briefly state which profile and provider were used.
- Reference the relevant doc matches.
- Summarize what the script did and what the API returned.
- Call out any missing access scopes or protected-data issues when the raw response indicates them.
