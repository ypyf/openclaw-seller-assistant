import type { AgentToolResult } from "@mariozechner/pi-agent-core"

/** Wraps plain text as an OpenClaw text tool result. */
export const textResult = (text: string): AgentToolResult<unknown> => ({
  content: [{ type: "text", text }],
  details: null,
})

/** Wraps plain text plus structured details as an OpenClaw text tool result. */
export const textResultWithDetails = <T>(text: string, details: T): AgentToolResult<T> => ({
  content: [{ type: "text", text }],
  details,
})
