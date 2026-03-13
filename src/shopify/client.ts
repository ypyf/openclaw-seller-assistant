import { createAdminApiClient } from "@shopify/admin-api-client"
import type { ShopifyGraphQLClient } from "./types.js"
import type { ShopifyStoreConfig } from "../config.js"
import { toArray } from "../utils.js"

declare const process: {
  env: Record<string, string | undefined>
}

const SHOPIFY_API_VERSION = "2026-01"

const getShopifyClientSecret = (store: ShopifyStoreConfig) => {
  const secret = process.env[store.clientSecretEnv]
  if (!secret) {
    throw new Error(
      `Missing Shopify client secret env var "${store.clientSecretEnv}" for store "${store.id}".`,
    )
  }
  return secret
}

const getShopifyAccessToken = async (store: ShopifyStoreConfig) => {
  const response = await fetch(`https://${store.storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: store.clientId,
      client_secret: getShopifyClientSecret(store),
    }).toString(),
  })

  const payload = await response.json()
  if (!response.ok || !payload?.access_token) {
    throw new Error(
      `Failed to fetch Shopify access token for "${store.id}": ${payload?.error_description ?? payload?.error ?? response.statusText}`,
    )
  }

  return payload.access_token as string
}

/** Creates an authenticated Shopify Admin GraphQL client for the configured store. */
export const createShopifyClient = async (
  store: ShopifyStoreConfig,
): Promise<ShopifyGraphQLClient> => {
  const accessToken = await getShopifyAccessToken(store)

  return createAdminApiClient({
    storeDomain: store.storeDomain,
    apiVersion: SHOPIFY_API_VERSION,
    accessToken,
  })
}

/** Returns an inclusive-exclusive UTC date range ending a given number of days ago. */
export const getDateRange = (windowDays: number, endDaysAgo: number) => {
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() - endDaysAgo)

  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - windowDays)

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

/** Flattens Shopify request and GraphQL errors into a readable message. */
export const formatShopifyErrors = (errors: unknown) => {
  const baseMessage =
    typeof (errors as { message?: unknown })?.message === "string" &&
    (errors as { message: string }).message.trim()
      ? (errors as { message: string }).message.trim()
      : "Shopify Admin API request failed."

  const gqlMessages = toArray<{ message?: string; path?: unknown }>(
    (errors as { graphQLErrors?: unknown })?.graphQLErrors,
  )
    .map(error => {
      const message =
        typeof error?.message === "string" && error.message.trim() ? error.message.trim() : null
      const fieldPath = Array.isArray(error?.path) ? error.path.join(".") : null
      if (message && fieldPath) {
        return `${fieldPath}: ${message}`
      }
      return message
    })
    .filter(Boolean)

  return gqlMessages.length > 0 ? `${baseMessage} ${gqlMessages.join("; ")}` : baseMessage
}
