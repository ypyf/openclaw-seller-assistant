import type { AgentToolResult } from "@mariozechner/pi-agent-core"
import { DEFAULT_PLUGIN_CONFIG } from "./config.ts"

/** Formats a numeric percentage with one decimal place. */
export const percentage = (value: number) => `${value.toFixed(1)}%`

/** Formats a currency amount with the given code and locale. */
export const currency = (
  value: number,
  code = DEFAULT_PLUGIN_CONFIG.currency,
  locale = DEFAULT_PLUGIN_CONFIG.locale,
) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(value)

/** Formats an ISO timestamp into a user-facing local datetime string. */
export const formatDateTime = (
  value: string,
  locale = DEFAULT_PLUGIN_CONFIG.locale,
  timeZone = DEFAULT_PLUGIN_CONFIG.timeZone,
) =>
  new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value))

/** Returns a finite number or falls back to the provided default. */
export const toNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

/** Returns a finite number or null when the input is missing or invalid. */
export const optionalNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null

/** Calculates gross margin as a percentage of selling price. */
export const grossMarginPct = (unitPrice: number, unitCost: number) =>
  unitPrice > 0 ? ((unitPrice - unitCost) / unitPrice) * 100 : 0

/** Calculates the minimum selling price needed to preserve a gross-margin floor. */
export const minimumPriceForGrossMargin = (unitCost: number, marginFloorPct: number) =>
  Number.isFinite(unitCost) && Number.isFinite(marginFloorPct) && marginFloorPct < 100
    ? Math.max(unitCost, unitCost / (1 - marginFloorPct / 100))
    : null

/** Normalizes SKUs and titles for exact or fuzzy matching. */
export const normalizeSku = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "")
/** Removes duplicate values while preserving insertion order. */
export const unique = <T>(values: T[]) => [...new Set(values)]
/** Splits a search phrase into normalized letter/number tokens. */
export const tokenizeSearchTerms = (value: string) =>
  unique(
    value
      .trim()
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map(token => token.trim())
      .filter(Boolean),
  )

/** Coerces an unknown value into an array or returns an empty array. */
export const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** Sums a numeric array. */
export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

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

export type NeedsInputToolDetails = {
  status: "needs_input"
  userPrompt: string
  missingParameters: string[]
  invalidParameters: Array<{
    name: string
    issue: string
  }>
}

/** Wraps a missing-input response as text plus structured details for the agent. */
export const needsInputResult = (input: {
  userPrompt: string
  missingParameters?: string[]
  invalidParameters?: Array<{
    name: string
    issue: string
  }>
}): AgentToolResult<NeedsInputToolDetails> => ({
  content: [{ type: "text", text: input.userPrompt }],
  details: {
    status: "needs_input",
    userPrompt: input.userPrompt,
    missingParameters: input.missingParameters ?? [],
    invalidParameters: input.invalidParameters ?? [],
  },
})

export type FlowResolution<T> =
  | { kind: "ready"; value: T }
  | { kind: "needs_input"; message: string }

/** Builds a successful flow result. */
export const ready = <T>(value: T): FlowResolution<T> => ({ kind: "ready", value })

/** Builds a flow result that asks the caller to collect more input. */
export const needsInput = <T = never>(message: string): FlowResolution<T> => ({
  kind: "needs_input",
  message,
})

/** Validates that a value is a non-negative number or returns a user-facing follow-up prompt. */
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

/** Validates that a value is a positive number or returns a user-facing follow-up prompt. */
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

/** Converts an objective key like clear_inventory into a title-cased label. */
export const formatObjectiveLabel = (objective: string) =>
  objective
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
