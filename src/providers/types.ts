import type { ProviderProfile } from "../config.ts"

export type ExecutionMode = "read" | "write"

export type ProviderPublicProfileSummary = {
  connection: Record<string, unknown>
  capabilities: {
    search: boolean
    execute: ExecutionMode[]
  }
}

export type ProviderDocumentationNote = {
  title: string
  url: string
  content: string
}

export type ProviderDocumentationSource = {
  url: string
  title?: string
}

export type ProviderSearchDocument = {
  title: string
  url: string
  heading: string
  excerpt: string
  sourceKind: "provider_note" | "official_doc"
  lastFetchedAt: string
  score: number
}

export type ProviderHttpRequestInput = {
  method?: string
  path: string
  query?: Record<string, string | number | boolean | undefined>
  json?: unknown
  headers?: Record<string, string>
}

export type ProviderHttpResponse = {
  ok: boolean
  status: number
  url: string
  headers: Record<string, string>
  body: unknown
  bodyText: string
}

export type ProviderRequestLogEntry = {
  method: string
  url: string
  status: number
  durationMs: number
  description: string
}

export type ProviderExecutorContext = {
  profile: {
    id: string
    name: string
    provider: string
  }
  connection: Record<string, unknown>
  /** Returns the validated GraphQL `data` object directly. */
  graphql: (query: string, variables?: Record<string, unknown>) => Promise<unknown>
  request: (input: ProviderHttpRequestInput) => Promise<unknown>
}

export type ProviderExecuteResult = {
  requestSummary: ProviderRequestLogEntry[]
  rawResponses: ProviderHttpResponse[]
}

export type Provider = {
  name: string
  label: string
  defaultDocs: ProviderDocumentationSource[]
  curatedNotes: ProviderDocumentationNote[]
  validateProfile: (profile: ProviderProfile) => { ok: true } | { ok: false; reason: string }
  summarizeProfile: (profile: ProviderProfile) => ProviderPublicProfileSummary
  createExecutorContext: (
    profile: ProviderProfile,
    signal: AbortSignal,
    input: {
      mode: ExecutionMode
    },
  ) => Promise<ProviderExecutorContext & ProviderExecuteResult>
}
