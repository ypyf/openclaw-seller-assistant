import type { PluginConfig, ProviderProfile } from "./config.ts"
import { inferExecuteModes, type Scope } from "./policy.ts"
import type { ExecutionMode, Provider, ProviderDocumentationSource } from "./providers/types.ts"

export type SellerProfileInspection = {
  id: string
  name: string
  provider: string
  default: boolean
  status: "ready" | "invalid" | "unsupported"
  statusReason?: string
  docsUrls: string[]
  connection: Record<string, unknown>
  authorization: {
    resources: Record<string, string[]>
    scopes: Scope[]
    executeModes: ExecutionMode[]
  }
}

type ProfileInspectionDependencies = {
  findProvider: (name: string) => Provider | undefined
  getDocumentationSources: (provider: Provider) => ProviderDocumentationSource[]
}

const isDefaultProfile = (config: PluginConfig, profileId: string) =>
  config.defaultProfile === profileId ||
  (!config.defaultProfile && config.profiles[0]?.id === profileId)

const formatList = (values: string[]) => (values.length > 0 ? values.join(", ") : "none")

const formatPolicyResources = (resources: Record<string, string[]>) => {
  const entries = Object.entries(resources)
  if (entries.length === 0) {
    return "none"
  }

  return entries.map(([resource, actions]) => `${resource}=${actions.join(", ")}`).join("; ")
}

const buildAuthorization = (profile: ProviderProfile) => {
  const resources: Record<string, string[]> = {}
  for (const [resource, actions] of Object.entries(profile.policy.resources)) {
    resources[resource] = [...actions]
  }

  return {
    resources,
    scopes: [...profile.policy.scopes],
    executeModes: inferExecuteModes(profile.policy.scopes),
  }
}

export const inspectConfiguredProfiles = (
  config: PluginConfig,
  dependencies: ProfileInspectionDependencies,
): SellerProfileInspection[] =>
  config.profiles.map(profile => {
    const provider = dependencies.findProvider(profile.provider)
    if (!provider) {
      return {
        id: profile.id,
        name: profile.name,
        provider: profile.provider,
        default: isDefaultProfile(config, profile.id),
        status: "unsupported",
        statusReason: `Provider "${profile.provider}" is not supported by this plugin.`,
        docsUrls: [],
        connection: {},
        authorization: buildAuthorization(profile),
      }
    }

    const description = provider.describeProfile(profile)
    const validation = provider.validateProfile(profile)

    return {
      id: profile.id,
      name: profile.name,
      provider: profile.provider,
      default: isDefaultProfile(config, profile.id),
      status: validation.ok ? "ready" : "invalid",
      statusReason: validation.ok ? undefined : validation.reason,
      docsUrls: dependencies.getDocumentationSources(provider).map(doc => doc.url),
      connection: description.connection,
      authorization: buildAuthorization(profile),
    }
  })

export const formatProfileInspection = (profile: SellerProfileInspection) =>
  [
    `${profile.name} (${profile.id})`,
    `Provider: ${profile.provider}`,
    profile.default ? "Default profile: yes" : null,
    `Status: ${profile.status}${profile.statusReason ? ` (${profile.statusReason})` : ""}`,
    `Connection: ${
      Object.entries(profile.connection).length > 0
        ? Object.entries(profile.connection)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(", ")
        : "unavailable"
    }`,
    `Docs: ${formatList(profile.docsUrls)}`,
    `Local policy resources: ${formatPolicyResources(profile.authorization.resources)}`,
    `Local policy scopes: ${formatList(profile.authorization.scopes)}`,
    `Allowed execution modes: ${formatList(profile.authorization.executeModes)}`,
  ]
    .filter(Boolean)
    .join("\n")

export const resolveProfileInspection = (
  profiles: SellerProfileInspection[],
  profileId?: string,
): SellerProfileInspection | undefined => {
  if (profileId) {
    return profiles.find(profile => profile.id === profileId)
  }

  return profiles.find(profile => profile.default) ?? profiles[0]
}
