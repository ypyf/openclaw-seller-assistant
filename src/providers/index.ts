import type { Provider, ProviderDocumentationSource } from "./types.ts"
import { shopifyProvider } from "./shopify.ts"

const providers = [shopifyProvider] as const

/** Returns every built-in provider supported by this plugin runtime. */
export const listProviders = (): Provider[] => [...providers]

/** Resolves a provider by its stable provider name. */
export const findProvider = (name: string): Provider | undefined =>
  providers.find(provider => provider.name === name)

/** Returns the documentation sources for one provider. */
export const getDocumentationSources = (provider: Provider): ProviderDocumentationSource[] => [
  ...provider.defaultDocs,
]
