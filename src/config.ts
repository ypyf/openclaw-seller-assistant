import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

type DefaultPluginConfig = {
  currency: string
  locale: string
  timeZone: string
  salesLookbackDays: number
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
  salesLookbackDays: 30,
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

export type ShopifyStoreOperationsConfig = {
  supplierLeadDays?: number
  safetyStockDays?: number
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
  targetMarginFloorPct?: number
  decisionPolicy?: RawProductDecisionPolicy
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
  decisionPolicy: ProductDecisionPolicy
  targetMarginFloorPct?: number
  defaultStoreId?: string
  stores?: {
    shopify?: ShopifyStoreConfig[]
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
    decisionPolicy: normalizeProductDecisionPolicy(rawConfig.decisionPolicy),
    targetMarginFloorPct:
      typeof rawConfig.targetMarginFloorPct === "number"
        ? rawConfig.targetMarginFloorPct
        : undefined,
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
  key: "supplierLeadDays" | "safetyStockDays" | "salesLookbackDays",
) => {
  const storeValue = configuredStore?.operations?.[key]
  if (typeof storeValue === "number" && Number.isFinite(storeValue)) {
    return storeValue
  }

  return undefined
}
