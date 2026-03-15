import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

type DefaultPluginConfig = {
  currency: string
  locale: string
  timeZone: string
  lowInventoryDays: number
  salesLookbackDays: number
  responseTone: "concise" | "consultative" | "premium"
}

/** Built-in fallback values used when the plugin config omits a supported setting. */
export const DEFAULT_PLUGIN_CONFIG: DefaultPluginConfig = {
  currency: "USD",
  locale: "en-US",
  timeZone: "UTC",
  lowInventoryDays: 14,
  salesLookbackDays: 30,
  responseTone: "consultative",
}

/** Shopify store connection settings plus optional store-level operational overrides. */
export type ShopifyStoreConfig = {
  id: string
  name: string
  storeDomain: string
  clientId: string
  clientSecretEnv: string
  supplierLeadDays?: number
  safetyStockDays?: number
  salesLookbackDays?: number
}

/** A configured store entry resolved to a supported platform shape. */
export type ConfiguredStore =
  | { platform: "shopify"; store: ShopifyStoreConfig }
  | { platform: "amazon"; store: Record<string, unknown> }

type RawPluginConfig = {
  currency?: string
  locale?: string
  targetMarginFloorPct?: number
  lowInventoryDays?: number
  salesLookbackDays?: number
  responseTone?: "concise" | "consultative" | "premium"
  defaultStoreId?: string
  supplierLeadDays?: number
  safetyStockDays?: number
  stores?: {
    shopify?: ShopifyStoreConfig[]
    amazon?: Record<string, unknown>[]
  }
} & Record<string, unknown>

/** Normalized runtime config used by the plugin after applying built-in defaults. */
export type PluginConfig = {
  /** Display currency fallback for outputs that do not have an explicit business currency. */
  currency: string
  /** Display locale used when formatting dates, numbers, and currency output. */
  locale: string
  lowInventoryDays: number
  salesLookbackDays: number
  responseTone: "concise" | "consultative" | "premium"
  targetMarginFloorPct?: number
  defaultStoreId?: string
  supplierLeadDays?: number
  safetyStockDays?: number
  stores?: {
    shopify?: ShopifyStoreConfig[]
    amazon?: Record<string, unknown>[]
  }
} & Record<string, unknown>

/** Normalizes raw plugin config into the runtime shape used by the plugin. */
export const toPluginConfig = (api: Pick<OpenClawPluginApi, "pluginConfig">): PluginConfig => {
  const rawConfig = (api?.pluginConfig ?? {}) as RawPluginConfig

  return {
    ...rawConfig,
    currency: rawConfig.currency ?? DEFAULT_PLUGIN_CONFIG.currency,
    locale: rawConfig.locale ?? DEFAULT_PLUGIN_CONFIG.locale,
    lowInventoryDays: rawConfig.lowInventoryDays ?? DEFAULT_PLUGIN_CONFIG.lowInventoryDays,
    salesLookbackDays: rawConfig.salesLookbackDays ?? DEFAULT_PLUGIN_CONFIG.salesLookbackDays,
    responseTone: rawConfig.responseTone ?? DEFAULT_PLUGIN_CONFIG.responseTone,
    targetMarginFloorPct:
      typeof rawConfig.targetMarginFloorPct === "number"
        ? rawConfig.targetMarginFloorPct
        : undefined,
  }
}

const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** Resolves the active store from an explicit id, the configured default, or the first store. */
export const findConfiguredStore = (
  config: PluginConfig,
  storeId?: string,
): ConfiguredStore | null => {
  const groupedStores: ConfiguredStore[] = [
    ...toArray<ShopifyStoreConfig>(config?.stores?.shopify)
      .filter(Boolean)
      .map(store => ({ platform: "shopify" as const, store })),
    ...toArray<Record<string, unknown>>(config?.stores?.amazon)
      .filter(Boolean)
      .map(store => ({ platform: "amazon" as const, store })),
  ]

  if (storeId) {
    return groupedStores.find(entry => entry.store.id === storeId) ?? null
  }

  if (config?.defaultStoreId) {
    return groupedStores.find(entry => entry.store.id === config.defaultStoreId) ?? null
  }

  return groupedStores[0] ?? null
}

/** Reads a numeric store-level setting when present and returns undefined otherwise. */
export const getStoreSettingNumber = (
  configuredStore: ConfiguredStore | null,
  key: "supplierLeadDays" | "safetyStockDays" | "salesLookbackDays",
) => {
  if (configuredStore?.platform === "shopify") {
    const storeValue = configuredStore.store[key]
    if (typeof storeValue === "number" && Number.isFinite(storeValue)) {
      return storeValue
    }
  }

  return undefined
}
