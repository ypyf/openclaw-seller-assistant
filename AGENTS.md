# AGENTS.md

## Project

TypeScript project using Node.js.

## Code Style

- Prefer `unknown` over `any`
- Avoid type assertions (`as`) unless necessary
- Export types for public APIs
- Prefer pure functions when possible
- Prefer **async/await** over callbacks

## Error Handling

- Avoid using exceptions for normal control flow
- Prefer returning Result-style values or undefined
- Only throw exceptions for unexpected failures

## Testing

- Write tests for new features
- Update tests when behavior changes
- Use descriptive test names
- Prefer asserting the current supported contract. Do not add tests whose main purpose is to assert that removed or nonexistent things do not exist.
- Keep assertions minimal.
- Do not lock tests to wording, formatting, or ordering unless they are part of the contract.
- Prefer public structured data over rendered text.
- Keep test scaffolding small.
- Use test framework lifecycle hooks for global cleanup.

## Rules for Agents

- Do not change dependencies unless necessary
- Do not preserve backward compatibility or worry about breaking existing callers. Prefer thorough refactors and complete fixes over incremental compatibility layers.
- Prefer positive framing in documentation and user-facing explanations. Describe supported scope, intended focus, target coverage, and capability boundaries directly; reserve negative phrasing for hard limitations, incompatibilities, or safety-critical constraints.

## Capability Design Principles

- Do not assume a missing dedicated tool means the agent cannot answer the user. Skills can often compose multiple basic tool calls into a useful answer.
- Do not add a new tool only because a user question sounds new. First ask whether the answer can be assembled by the agent from existing reusable data tools.
- Prefer a small set of reusable data primitives over many phrasing-specific tools. Examples: store window summaries, product sales summaries, product time series, inventory totals, variant breakdowns.
- Keep query planning, comparisons, summarization, and low-risk heuristic interpretation in skills or agent orchestration when possible.
- Keep deterministic business policies in tools. Replenishment, discount, clearance, price guardrails, margin floors, and other high-impact operational decisions should remain coded and testable.
- When a capability is currently only achievable through approximate orchestration, be explicit about the limitation. Distinguish between exact tool-native answers and agent-composed approximations.
- If users repeatedly ask for a workflow that requires awkward repeated tool calls, prefer adding a better underlying data primitive instead of another high-level policy tool.
