import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

type DefaultPluginConfig = {
  currency: string
  locale: string
  timeZone: string
  lowInventoryDays: number
  salesLookbackDays: number
  responseTone: "concise" | "consultative" | "premium"
}

export type ProductDecisionPolicy = {
  weakDemandDailySalesThreshold: number
  healthyDemandDailySalesThreshold: number
  insufficientDataMinLookbackDays: number
  insufficientDataMinUnitsSold: number
  discountMinInventoryDays: number
  clearanceMinInventoryDays: number
  clearanceStrongSignalInventoryDays: number
  veryLowLookbackUnitsFactor: number
}

type RawProductDecisionPolicy = Partial<ProductDecisionPolicy>

/** Built-in fallback values used when the plugin config omits a supported setting. */
export const DEFAULT_PLUGIN_CONFIG: DefaultPluginConfig = {
  currency: "USD",
  locale: "en-US",
  timeZone: "UTC",
  lowInventoryDays: 14,
  salesLookbackDays: 30,
  responseTone: "consultative",
}

/** Built-in defaults for product decision thresholds. */
export const DEFAULT_PRODUCT_DECISION_POLICY: ProductDecisionPolicy = {
  weakDemandDailySalesThreshold: 0.3,
  healthyDemandDailySalesThreshold: 1,
  insufficientDataMinLookbackDays: 14,
  insufficientDataMinUnitsSold: 3,
  discountMinInventoryDays: 60,
  clearanceMinInventoryDays: 120,
  clearanceStrongSignalInventoryDays: 180,
  veryLowLookbackUnitsFactor: 0.1,
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
  decisionPolicy?: RawProductDecisionPolicy
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
  decisionPolicy: ProductDecisionPolicy
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

const normalizeNumberAtLeast = (value: unknown, fallback: number, minimum: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : fallback

const normalizeProductDecisionPolicy = (
  value: RawProductDecisionPolicy | undefined,
): ProductDecisionPolicy => {
  const weakDemandDailySalesThreshold = normalizeNumberAtLeast(
    value?.weakDemandDailySalesThreshold,
    DEFAULT_PRODUCT_DECISION_POLICY.weakDemandDailySalesThreshold,
    0,
  )
  const healthyDemandDailySalesThreshold = Math.max(
    normalizeNumberAtLeast(
      value?.healthyDemandDailySalesThreshold,
      DEFAULT_PRODUCT_DECISION_POLICY.healthyDemandDailySalesThreshold,
      0,
    ),
    weakDemandDailySalesThreshold,
  )
  const clearanceMinInventoryDays = normalizeNumberAtLeast(
    value?.clearanceMinInventoryDays,
    DEFAULT_PRODUCT_DECISION_POLICY.clearanceMinInventoryDays,
    0,
  )

  return {
    weakDemandDailySalesThreshold,
    healthyDemandDailySalesThreshold,
    insufficientDataMinLookbackDays: normalizeNumberAtLeast(
      value?.insufficientDataMinLookbackDays,
      DEFAULT_PRODUCT_DECISION_POLICY.insufficientDataMinLookbackDays,
      0,
    ),
    insufficientDataMinUnitsSold: normalizeNumberAtLeast(
      value?.insufficientDataMinUnitsSold,
      DEFAULT_PRODUCT_DECISION_POLICY.insufficientDataMinUnitsSold,
      0,
    ),
    discountMinInventoryDays: normalizeNumberAtLeast(
      value?.discountMinInventoryDays,
      DEFAULT_PRODUCT_DECISION_POLICY.discountMinInventoryDays,
      0,
    ),
    clearanceMinInventoryDays,
    clearanceStrongSignalInventoryDays: Math.max(
      normalizeNumberAtLeast(
        value?.clearanceStrongSignalInventoryDays,
        DEFAULT_PRODUCT_DECISION_POLICY.clearanceStrongSignalInventoryDays,
        0,
      ),
      clearanceMinInventoryDays,
    ),
    veryLowLookbackUnitsFactor: normalizeNumberAtLeast(
      value?.veryLowLookbackUnitsFactor,
      DEFAULT_PRODUCT_DECISION_POLICY.veryLowLookbackUnitsFactor,
      0,
    ),
  }
}

/** Normalizes raw plugin config into the runtime shape used by the plugin. */
export const toPluginConfig = (api: Pick<OpenClawPluginApi, "pluginConfig">): PluginConfig => {
  const rawConfig = (api?.pluginConfig ?? {}) as RawPluginConfig

  return {
    ...rawConfig,
    currency: rawConfig.currency ?? DEFAULT_PLUGIN_CONFIG.currency,
    locale: rawConfig.locale ?? DEFAULT_PLUGIN_CONFIG.locale,
    lowInventoryDays: rawConfig.lowInventoryDays ?? DEFAULT_PLUGIN_CONFIG.lowInventoryDays,
    salesLookbackDays: rawConfig.salesLookbackDays ?? DEFAULT_PLUGIN_CONFIG.salesLookbackDays,
    decisionPolicy: normalizeProductDecisionPolicy(rawConfig.decisionPolicy),
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
