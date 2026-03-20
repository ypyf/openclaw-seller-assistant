import type { AgentToolResult } from "@mariozechner/pi-agent-core"
import { Type, type Static, type TSchema } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { executeScript } from "./execute.ts"
import { findConfiguredProfile, type PluginConfig, type ProviderProfile } from "./config.ts"
import { searchDocumentation } from "./docs.ts"
import { findProvider, getDocumentationSources, listProviders } from "./providers/index.ts"
import type { ExecutionMode, Provider, ProviderSearchDocument } from "./providers/types.ts"
import { textResult, textResultWithDetails } from "./utils.ts"

const SellerProfilesParamsSchema = Type.Object(
  {
    operation: Type.Union([Type.Literal("list"), Type.Literal("get")]),
    profileId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)

const SellerSearchParamsSchema = Type.Object(
  {
    profileId: Type.Optional(Type.String()),
    provider: Type.Optional(Type.String()),
    query: Type.String({ minLength: 1 }),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    refresh: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
)

const SellerExecuteParamsSchema = Type.Object(
  {
    profileId: Type.Optional(Type.String()),
    runtime: Type.Literal("javascript"),
    mode: Type.Union([Type.Literal("read"), Type.Literal("write")]),
    script: Type.String({ minLength: 1 }),
    timeoutMs: Type.Optional(Type.Number({ minimum: 100, maximum: 60000 })),
  },
  { additionalProperties: false },
)

type SellerProfilesParams = Static<typeof SellerProfilesParamsSchema>
type SellerSearchParams = Static<typeof SellerSearchParamsSchema>
type SellerExecuteParams = Static<typeof SellerExecuteParamsSchema>

export type SellerToolRegistration<TParams> = {
  name: string
  label: string
  description: string
  parameters: TSchema
  execute: (id: string, params: TParams) => Promise<AgentToolResult<unknown>>
}

export type SellerToolApi = Pick<OpenClawPluginApi, "registerTool" | "logger">

export type SellerToolDependencies = {
  listProviders: typeof listProviders
  findProvider: typeof findProvider
  getDocumentationSources: typeof getDocumentationSources
  searchDocumentation: typeof searchDocumentation
  executeScript: typeof executeScript
}

const DEFAULT_SELLER_TOOL_DEPENDENCIES: SellerToolDependencies = {
  listProviders,
  findProvider,
  getDocumentationSources,
  searchDocumentation,
  executeScript,
}

type SellerProfileSummary = {
  id: string
  name: string
  provider: string
  default: boolean
  docsUrls: string[]
  connection: Record<string, unknown>
  capabilities: {
    search: boolean
    execute: ExecutionMode[]
  }
}

const validateParams = <T>(schema: TSchema, value: unknown): T | undefined =>
  Value.Check(schema, value) ? (value as T) : undefined

const resolveProviderForProfile = (
  dependencies: SellerToolDependencies,
  profile: ProviderProfile,
): Provider | undefined => dependencies.findProvider(profile.provider)

const listProfileSummaries = (
  config: PluginConfig,
  dependencies: SellerToolDependencies,
): SellerProfileSummary[] =>
  config.profiles.flatMap(profile => {
    const provider = resolveProviderForProfile(dependencies, profile)
    if (!provider) {
      return []
    }
    const validation = provider.validateProfile(profile)
    if (!validation.ok) {
      return []
    }
    const summary = provider.summarizeProfile(profile)
    return [
      {
        id: profile.id,
        name: profile.name,
        provider: profile.provider,
        default:
          config.defaultProfile === profile.id ||
          (!config.defaultProfile && config.profiles[0]?.id === profile.id),
        docsUrls: dependencies.getDocumentationSources(provider).map(doc => doc.url),
        connection: summary.connection,
        capabilities: summary.capabilities,
      },
    ]
  })

const formatProfileSummary = (profile: SellerProfileSummary) =>
  [
    `${profile.name} (${profile.id})`,
    `Provider: ${profile.provider}`,
    profile.default ? "Default profile: yes" : null,
    `Connection: ${Object.entries(profile.connection)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ")}`,
    `Docs: ${profile.docsUrls.join(", ")}`,
    `Capabilities: search=${profile.capabilities.search ? "yes" : "no"}, execute=${profile.capabilities.execute.join(", ") || "none"}`,
  ]
    .filter(Boolean)
    .join("\n")

const resolveProfileSummary = (
  profiles: SellerProfileSummary[],
  profileId?: string,
): SellerProfileSummary | undefined => {
  if (profileId) {
    return profiles.find(profile => profile.id === profileId)
  }

  return profiles.find(profile => profile.default) ?? profiles[0]
}

const formatSearchResults = (results: ProviderSearchDocument[], query: string) => {
  if (results.length === 0) {
    return `No documentation matches were found for "${query}".`
  }

  return [
    `Documentation matches for "${query}":`,
    "",
    ...results.map(
      result =>
        `- ${result.title} | ${result.heading} | ${result.sourceKind} | ${result.url}\n  ${result.excerpt}`,
    ),
  ].join("\n")
}

const formatExecuteResult = (input: {
  profile: SellerProfileSummary
  status: "ok" | "error"
  result: unknown
  logs: string[]
  requestCount: number
  error?: string
}) => {
  const lines = [
    `Execution profile: ${input.profile.name} (${input.profile.id})`,
    `Provider: ${input.profile.provider}`,
    `Status: ${input.status}`,
    `Requests: ${input.requestCount}`,
  ]

  if (input.error) {
    lines.push(`Error: ${input.error}`)
  }

  if (input.logs.length > 0) {
    lines.push("Logs:")
    lines.push(...input.logs.map(line => `- ${line}`))
  }

  if (input.status === "ok") {
    lines.push(
      `Result: ${typeof input.result === "string" ? input.result : JSON.stringify(input.result)}`,
    )
  }

  return lines.join("\n")
}

/** Registers all seller-facing OpenClaw tools for this plugin instance. */
export const registerSellerTools = (
  api: SellerToolApi,
  pluginConfig: PluginConfig,
  dependencies: SellerToolDependencies = DEFAULT_SELLER_TOOL_DEPENDENCIES,
) => {
  api.registerTool({
    name: "seller_profiles",
    label: "Seller Profiles",
    description:
      "List or inspect configured seller profiles, their provider, documentation sources, and safe connection summary.",
    parameters: SellerProfilesParamsSchema,
    async execute(_id: string, params: SellerProfilesParams) {
      const input = validateParams<SellerProfilesParams>(SellerProfilesParamsSchema, params)
      if (!input) {
        return textResult("seller_profiles requires operation=list|get and an optional profileId.")
      }

      const profiles = listProfileSummaries(pluginConfig, dependencies)
      if (profiles.length === 0) {
        return textResult(
          "No provider profiles are configured. Add at least one profile under plugins.entries.seller-assistant.config.profiles.",
        )
      }

      if (input.operation === "list") {
        return textResultWithDetails(profiles.map(formatProfileSummary).join("\n\n"), {
          status: "ok",
          operation: input.operation,
          profiles,
        })
      }

      const profile = resolveProfileSummary(profiles, input.profileId)
      if (!profile) {
        return textResult("The requested profile was not found.")
      }

      return textResultWithDetails(formatProfileSummary(profile), {
        status: "ok",
        operation: input.operation,
        profile,
      })
    },
  })

  api.registerTool({
    name: "seller_search",
    label: "Seller Search",
    description:
      "Search provider notes and official platform documentation for a configured profile or provider.",
    parameters: SellerSearchParamsSchema,
    async execute(_id: string, params: SellerSearchParams) {
      const input = validateParams<SellerSearchParams>(SellerSearchParamsSchema, params)
      if (!input) {
        return textResult(
          "seller_search requires query plus an optional profileId, provider, limit, and refresh flag.",
        )
      }

      const profile = input.profileId
        ? findConfiguredProfile(pluginConfig, input.profileId)
        : findConfiguredProfile(pluginConfig)
      const providerName = input.provider ?? profile?.provider
      if (!providerName) {
        return textResult(
          "seller_search needs either a configured default profile, an explicit profileId, or a provider.",
        )
      }

      const provider = dependencies.findProvider(providerName)
      if (!provider) {
        return textResult(`Provider "${providerName}" is not supported by this plugin.`)
      }

      const results = await dependencies.searchDocumentation({
        query: input.query,
        limit: input.limit ?? 5,
        refresh: input.refresh ?? false,
        notes: provider.curatedNotes,
        sources: dependencies.getDocumentationSources(provider),
      })

      return textResultWithDetails(formatSearchResults(results, input.query), {
        status: "ok",
        profileId: profile?.id,
        provider: provider.name,
        query: input.query,
        results,
      })
    },
  })

  api.registerTool({
    name: "seller_execute",
    label: "Seller Execute",
    description:
      "Execute a JavaScript script against one configured provider profile through provider helpers. Write operations require matching local policy scopes.",
    parameters: SellerExecuteParamsSchema,
    async execute(_id: string, params: SellerExecuteParams) {
      const input = validateParams<SellerExecuteParams>(SellerExecuteParamsSchema, params)
      if (!input) {
        return textResult(
          'seller_execute requires runtime="javascript", mode="read|write", script, and an optional profileId/timeoutMs.',
        )
      }

      const profile = findConfiguredProfile(pluginConfig, input.profileId)
      if (!profile) {
        return textResult("seller_execute needs a configured profile or explicit profileId.")
      }

      const provider = resolveProviderForProfile(dependencies, profile)
      if (!provider) {
        return textResult(`Provider "${profile.provider}" is not supported by this plugin.`)
      }

      const validation = provider.validateProfile(profile)
      if (!validation.ok) {
        return textResult(validation.reason)
      }

      const summaries = listProfileSummaries(pluginConfig, dependencies)
      const profileSummary = summaries.find(item => item.id === profile.id)
      if (!profileSummary) {
        return textResult(`Profile "${profile.id}" is configured but unavailable.`)
      }

      if (!profileSummary.capabilities.execute.includes(input.mode)) {
        return textResult(
          `Profile "${profile.id}" does not allow ${input.mode} execution. Update policy.resources in the plugin config to grant the needed local scopes.`,
        )
      }

      const result = await dependencies.executeScript({
        provider,
        profile,
        mode: input.mode,
        script: input.script,
        timeoutMs: input.timeoutMs ?? 15000,
      })

      return textResultWithDetails(
        formatExecuteResult({
          profile: profileSummary,
          status: result.status,
          result: result.result,
          logs: result.logs,
          requestCount: result.requestSummary.length,
          error: result.error,
        }),
        {
          status: result.status,
          provider: provider.name,
          profile: profileSummary,
          runtime: input.runtime,
          mode: input.mode,
          script: input.script,
          logs: result.logs,
          warnings: result.warnings,
          requestSummary: result.requestSummary,
          rawResponses: result.rawResponses,
          result: result.result,
          error: result.error,
        },
      )
    },
  })
}
