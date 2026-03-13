import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

const BUILTIN_CONFIG = {
  currency: "USD",
  locale: "en-US",
  lowInventoryDays: 14,
  salesLookbackDays: 30,
  responseTone: "consultative",
} as const

export type ShopifyStoreConfig = {
  id: string
  name: string
  storeDomain: string
  clientId: string
  clientSecretEnv: string
}

export type ConfiguredStore =
  | { platform: "shopify"; store: ShopifyStoreConfig }
  | { platform: "amazon"; store: Record<string, unknown> }

type RawPluginConfig = {
  defaultCurrency?: string
  defaultLocale?: string
  targetMarginFloorPct?: number
  lowInventoryDays?: number
  defaultSalesLookbackDays?: number
  defaultResponseTone?: "concise" | "consultative" | "premium"
  defaultStoreId?: string
  defaultSupplierLeadDays?: number
  defaultSafetyStockDays?: number
  stores?: {
    shopify?: ShopifyStoreConfig[]
    amazon?: Record<string, unknown>[]
  }
} & Record<string, unknown>

export type PluginConfig = {
  currency: string
  locale: string
  lowInventoryDays: number
  salesLookbackDays: number
  responseTone: "concise" | "consultative" | "premium"
  targetMarginFloorPct?: number
  defaultStoreId?: string
  defaultSupplierLeadDays?: number
  defaultSafetyStockDays?: number
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
    currency: rawConfig.defaultCurrency ?? BUILTIN_CONFIG.currency,
    locale: rawConfig.defaultLocale ?? BUILTIN_CONFIG.locale,
    lowInventoryDays: rawConfig.lowInventoryDays ?? BUILTIN_CONFIG.lowInventoryDays,
    salesLookbackDays:
      rawConfig.defaultSalesLookbackDays ?? BUILTIN_CONFIG.salesLookbackDays,
    responseTone: rawConfig.defaultResponseTone ?? BUILTIN_CONFIG.responseTone,
    targetMarginFloorPct:
      typeof rawConfig.targetMarginFloorPct === "number"
        ? rawConfig.targetMarginFloorPct
        : undefined,
  }
}

const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** Resolves the active store from an explicit id, the configured default, or the first store. */
export const findConfiguredStore = (config: PluginConfig, storeId?: string): ConfiguredStore | null => {
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
