import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

export type ProviderProfile = {
  id: string
  name: string
  provider: string
  connection: Record<string, unknown>
}

type RawPluginConfig = Record<string, unknown>

type RawProviderProfile = {
  id?: unknown
  name?: unknown
  provider?: unknown
  connection?: unknown
}

export type PluginConfig = {
  currency: string
  locale: string
  timeZone: string
  defaultProfile?: string
  profiles: ProviderProfile[]
}

/** Built-in fallback values used when the plugin config omits a supported setting. */
export const DEFAULT_PLUGIN_CONFIG = {
  currency: "USD",
  locale: "en-US",
  timeZone: "UTC",
} as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined

const toProviderProfile = (value: unknown): ProviderProfile | undefined => {
  const input: RawProviderProfile = isRecord(value) ? value : {}
  const id = readString(input.id)
  const name = readString(input.name)
  const provider = readString(input.provider)
  const connection = isRecord(input.connection) ? input.connection : undefined

  if (!id || !name || !provider || !connection) {
    return undefined
  }

  return {
    id,
    name,
    provider,
    connection,
  }
}

const toProfiles = (value: unknown) =>
  Array.isArray(value)
    ? value.map(toProviderProfile).filter((profile): profile is ProviderProfile => Boolean(profile))
    : []

/** Normalizes raw plugin config into the runtime shape used by the plugin. */
export const toPluginConfig = (api: Pick<OpenClawPluginApi, "pluginConfig">): PluginConfig => {
  const rawConfig: RawPluginConfig = isRecord(api?.pluginConfig) ? api.pluginConfig : {}

  return {
    currency: readString(rawConfig.currency) ?? DEFAULT_PLUGIN_CONFIG.currency,
    locale: readString(rawConfig.locale) ?? DEFAULT_PLUGIN_CONFIG.locale,
    timeZone: readString(rawConfig.timeZone) ?? DEFAULT_PLUGIN_CONFIG.timeZone,
    defaultProfile: readString(rawConfig.defaultProfile),
    profiles: toProfiles(rawConfig.profiles),
  }
}

/** Resolves the active configured profile from an explicit id, the configured default, or the first profile. */
export const findConfiguredProfile = (
  config: PluginConfig,
  profileId?: string,
): ProviderProfile | undefined => {
  if (profileId) {
    return config.profiles.find(profile => profile.id === profileId)
  }

  if (config.defaultProfile) {
    return config.profiles.find(profile => profile.id === config.defaultProfile)
  }

  return config.profiles[0]
}

/** Returns configured profiles for one provider name. */
export const findProfilesByProvider = (config: PluginConfig, provider: string) =>
  config.profiles.filter(profile => profile.provider === provider)
