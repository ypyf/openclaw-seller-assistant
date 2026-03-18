import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

type DefaultPluginConfig = {
  currency: string
  locale: string
  timeZone: string
  salesLookbackDays: number
}

/** Built-in fallback values used when the plugin config omits a supported setting. */
export const DEFAULT_PLUGIN_CONFIG: DefaultPluginConfig = {
  currency: "USD",
  locale: "en-US",
  timeZone: "UTC",
  salesLookbackDays: 30,
}

export type ShopifyStoreOperationsConfig = {
  salesLookbackDays?: number
}

/** Shopify store connection settings plus optional store-level operational overrides. */
export type ShopifyStoreConfig = {
  id: string
  name: string
  storeDomain: string
  clientId: string
  clientSecretEnv: string
  operations?: ShopifyStoreOperationsConfig
}

type RawPluginConfig = {
  currency?: string
  locale?: string
  defaultStoreId?: string
  stores?: {
    shopify?: ShopifyStoreConfig[]
  }
} & Record<string, unknown>

/** Normalized runtime config used by the plugin after applying built-in defaults. */
export type PluginConfig = {
  /** Display currency fallback for outputs that do not have an explicit business currency. */
  currency: string
  /** Display locale used when formatting dates, numbers, and currency output. */
  locale: string
  defaultStoreId?: string
  stores?: {
    shopify?: ShopifyStoreConfig[]
  }
} & Record<string, unknown>

/** Normalizes raw plugin config into the runtime shape used by the plugin. */
export const toPluginConfig = (api: Pick<OpenClawPluginApi, "pluginConfig">): PluginConfig => {
  const rawConfig = (api?.pluginConfig ?? {}) as RawPluginConfig

  return {
    ...rawConfig,
    currency: rawConfig.currency ?? DEFAULT_PLUGIN_CONFIG.currency,
    locale: rawConfig.locale ?? DEFAULT_PLUGIN_CONFIG.locale,
  }
}

const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** Resolves the active Shopify store from an explicit id, the configured default, or the first store. */
export const findConfiguredStore = (
  config: PluginConfig,
  storeId?: string,
): ShopifyStoreConfig | null => {
  const configuredStores = toArray<ShopifyStoreConfig>(config?.stores?.shopify).filter(Boolean)

  if (storeId) {
    return configuredStores.find(store => store.id === storeId) ?? null
  }

  if (config?.defaultStoreId) {
    return configuredStores.find(store => store.id === config.defaultStoreId) ?? null
  }

  return configuredStores[0] ?? null
}

/** Reads a numeric store-level operation setting when present and returns undefined otherwise. */
export const getStoreOperationNumber = (
  configuredStore: ShopifyStoreConfig | null,
  key: "salesLookbackDays",
) => {
  const storeValue = configuredStore?.operations?.[key]
  if (typeof storeValue === "number" && Number.isFinite(storeValue)) {
    return storeValue
  }

  return undefined
}
