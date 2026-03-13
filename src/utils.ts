import type { AgentToolResult } from "@mariozechner/pi-agent-core"

export const percentage = (value: number) => `${value.toFixed(1)}%`

export const currency = (value: number, code = "USD", locale = "en-US") =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(value)

export const toNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

export const optionalNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null

export const normalizeSku = (value: string) => value.trim().toLowerCase().replace(/[-_\s]+/g, "")
export const unique = <T>(values: T[]) => [...new Set(values)]
export const tokenizeSearchTerms = (value: string) =>
  unique(
    value
      .trim()
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map(token => token.trim())
      .filter(Boolean),
  )

export const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export const textResult = (text: string): AgentToolResult<unknown> => ({
  content: [{ type: "text", text }],
  details: null,
})

export type FlowResolution<T> =
  | { kind: "ready"; value: T }
  | { kind: "needs_input"; message: string }

export const ready = <T>(value: T): FlowResolution<T> => ({ kind: "ready", value })

export const needsInput = <T = never>(message: string): FlowResolution<T> => ({
  kind: "needs_input",
  message,
})

export const resolveNonNegativeNumber = (
  value: unknown,
  fieldName: string,
  missingMessage: string,
): FlowResolution<number> => {
  const parsed = optionalNumber(value)
  if (parsed === null) {
    return needsInput(missingMessage)
  }
  if (parsed < 0) {
    return needsInput(
      `Ask the user to correct ${fieldName}. The current value ${parsed} is invalid.`,
    )
  }
  return ready(parsed)
}

export const resolvePositiveNumber = (
  value: unknown,
  fieldName: string,
  missingMessage: string,
): FlowResolution<number> => {
  const parsed = optionalNumber(value)
  if (parsed === null) {
    return needsInput(missingMessage)
  }
  if (parsed <= 0) {
    return needsInput(
      `Ask the user to correct ${fieldName}. The current value ${parsed} is invalid.`,
    )
  }
  return ready(parsed)
}

export const formatObjectiveLabel = (objective: string) =>
  objective
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
