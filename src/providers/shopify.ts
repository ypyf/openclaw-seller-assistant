import type { ProviderProfile } from "../config.ts"
import type {
  Provider,
  ProviderDocumentationNote,
  ProviderDocumentationSource,
  ProviderExecuteResult,
  ProviderExecutorContext,
  ProviderHttpRequestInput,
  ProviderHttpResponse,
  ProviderRequestLogEntry,
} from "./types.ts"

type ShopifyConnection = {
  storeDomain: string
  clientId: string
  clientSecretEnv: string
  apiVersion?: string
}

declare const process: {
  env: Record<string, string | undefined>
}

const DEFAULT_SHOPIFY_API_VERSION = "2026-01"
const RAW_RESPONSE_LIMIT = 4_000
const READ_ONLY_REST_METHODS = new Set(["GET", "HEAD"])

const defaultDocs: ProviderDocumentationSource[] = [
  {
    title: "Shopify Admin GraphQL API",
    url: "https://shopify.dev/docs/api/admin-graphql",
  },
  {
    title: "GraphQL queries basics",
    url: "https://shopify.dev/docs/apps/build/graphql/basics/queries",
  },
  {
    title: "GraphQL mutations basics",
    url: "https://shopify.dev/docs/apps/build/graphql/basics/mutations",
  },
]

const curatedNotes: ProviderDocumentationNote[] = [
  {
    title: "Shopify provider operating rules",
    url: "provider://shopify/operating-rules",
    content: [
      "Use Admin GraphQL by default for read workflows.",
      "Store access uses a merchant-owned app installed on the same store or organization.",
      "Order data can still fail when protected customer data access is missing.",
      "Long order windows may require both read_orders and read_all_orders.",
      "Prefer narrow paginated queries and respect API throttling in multi-step reads.",
    ].join(" "),
  },
]

const readString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined

const toShopifyConnection = (profile: ProviderProfile): ShopifyConnection | undefined => {
  const storeDomain = readString(profile.connection.storeDomain)
  const clientId = readString(profile.connection.clientId)
  const clientSecretEnv = readString(profile.connection.clientSecretEnv)
  const apiVersion = readString(profile.connection.apiVersion)

  if (!storeDomain || !clientId || !clientSecretEnv) {
    return undefined
  }

  return {
    storeDomain,
    clientId,
    clientSecretEnv,
    apiVersion,
  }
}

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value

const toBodyText = (value: unknown) => {
  if (typeof value === "string") {
    return truncate(value, RAW_RESPONSE_LIMIT)
  }

  try {
    return truncate(JSON.stringify(value), RAW_RESPONSE_LIMIT)
  } catch {
    return "[unserializable]"
  }
}

const toHeadersRecord = (headers: Headers) => {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

const getShopifyClientSecret = (connection: ShopifyConnection) => {
  const secret = process.env[connection.clientSecretEnv]
  if (!secret) {
    throw new Error(
      `Missing Shopify client secret env var for profile using store "${connection.storeDomain}".`,
    )
  }
  return secret
}

const getShopifyAccessToken = async (connection: ShopifyConnection, signal: AbortSignal) => {
  const response = await fetch(`https://${connection.storeDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: connection.clientId,
      client_secret: getShopifyClientSecret(connection),
    }).toString(),
    signal,
  })

  const payload: unknown = await response.json()
  if (!response.ok || typeof payload !== "object" || payload === null) {
    throw new Error(`Failed to fetch Shopify access token: ${response.statusText}`)
  }

  const accessToken =
    "access_token" in payload && typeof payload.access_token === "string"
      ? payload.access_token
      : undefined
  const errorDescription =
    "error_description" in payload && typeof payload.error_description === "string"
      ? payload.error_description
      : undefined
  const errorCode =
    "error" in payload && typeof payload.error === "string" ? payload.error : undefined

  if (!accessToken) {
    throw new Error(
      `Failed to fetch Shopify access token: ${errorDescription ?? errorCode ?? response.statusText}`,
    )
  }

  return accessToken
}

const withQuery = (url: URL, query: Record<string, string | number | boolean | undefined>) => {
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  })
  return url
}

const parseResponseBody = async (response: Response, method: string) => {
  if (
    method === "HEAD" ||
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304
  ) {
    return {
      body: undefined,
      bodyText: "",
    }
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  const bodyText = await response.text()

  if (bodyText.length === 0) {
    return {
      body: undefined,
      bodyText: "",
    }
  }

  if (contentType.includes("application/json")) {
    return {
      body: JSON.parse(bodyText),
      bodyText: truncate(bodyText, RAW_RESPONSE_LIMIT),
    }
  }

  return {
    body: bodyText,
    bodyText: truncate(bodyText, RAW_RESPONSE_LIMIT),
  }
}

const createResponseRecord = async (
  response: Response,
  method: string,
): Promise<ProviderHttpResponse> => {
  const parsed = await parseResponseBody(response, method)
  return {
    ok: response.ok,
    status: response.status,
    url: response.url,
    headers: toHeadersRecord(response.headers),
    body: parsed.body,
    bodyText: parsed.bodyText,
  }
}

const createRequestLogger = (
  requestSummary: ProviderRequestLogEntry[],
  rawResponses: ProviderHttpResponse[],
) => {
  return async <T>(input: {
    description: string
    method: string
    url: URL
    execute: () => Promise<Response>
    map: (response: ProviderHttpResponse) => T
  }) => {
    const startedAt = Date.now()
    const response = await input.execute()
    const record = await createResponseRecord(response, input.method)
    rawResponses.push(record)
    requestSummary.push({
      method: input.method,
      url: input.url.toString(),
      status: record.status,
      durationMs: Date.now() - startedAt,
      description: input.description,
    })
    return input.map(record)
  }
}

const isGraphqlNameStart = (character: string) => /[_A-Za-z]/u.test(character)

const isGraphqlNameCharacter = (character: string) => /[_0-9A-Za-z]/u.test(character)

type GraphqlToken =
  | {
      kind: "name"
      value: string
    }
  | {
      kind: "punctuator"
      value: string
    }

const isEscapedGraphqlBlockStringTerminator = (document: string, index: number) =>
  document[index - 1] === "\\"

const tokenizeGraphqlDocument = (document: string): GraphqlToken[] => {
  const tokens: GraphqlToken[] = []
  let index = 0

  while (index < document.length) {
    const character = document[index]

    if (!character) {
      break
    }

    if (character === "#" || character === ",") {
      if (character === "#") {
        index += 1
        while (index < document.length && document[index] !== "\n" && document[index] !== "\r") {
          index += 1
        }
        continue
      }

      index += 1
      continue
    }

    if (/\s/u.test(character)) {
      index += 1
      continue
    }

    if (character === '"') {
      const isBlockString = document.slice(index, index + 3) === '"""'
      index += isBlockString ? 3 : 1

      while (index < document.length) {
        if (isBlockString) {
          if (
            document.slice(index, index + 3) === '"""' &&
            !isEscapedGraphqlBlockStringTerminator(document, index)
          ) {
            index += 3
            break
          }
          index += 1
          continue
        }

        if (document[index] === "\\") {
          index += 2
          continue
        }

        if (document[index] === '"') {
          index += 1
          break
        }

        index += 1
      }

      continue
    }

    if (character === "." && document.slice(index, index + 3) === "...") {
      tokens.push({
        kind: "punctuator",
        value: "...",
      })
      index += 3
      continue
    }

    if ("!$():=@[]{}|".includes(character)) {
      tokens.push({
        kind: "punctuator",
        value: character,
      })
      index += 1
      continue
    }

    if (isGraphqlNameStart(character)) {
      let end = index + 1
      while (end < document.length && isGraphqlNameCharacter(document[end] ?? "")) {
        end += 1
      }

      tokens.push({
        kind: "name",
        value: document.slice(index, end),
      })
      index = end
      continue
    }

    index += 1
  }

  return tokens
}

const consumeGraphqlSelectionSet = (tokens: GraphqlToken[], startIndex: number) => {
  let braceDepth = 0
  let parenDepth = 0
  let bracketDepth = 0
  let index = startIndex

  while (index < tokens.length) {
    const token = tokens[index]
    if (token?.kind === "punctuator") {
      if (token.value === "(") {
        parenDepth += 1
      } else if (token.value === ")") {
        parenDepth = Math.max(0, parenDepth - 1)
      } else if (token.value === "[") {
        bracketDepth += 1
      } else if (token.value === "]") {
        bracketDepth = Math.max(0, bracketDepth - 1)
      } else if (token.value === "{" && parenDepth === 0 && bracketDepth === 0) {
        braceDepth += 1
      } else if (token.value === "}" && parenDepth === 0 && bracketDepth === 0) {
        braceDepth -= 1
        if (braceDepth === 0) {
          return index + 1
        }
      }
    }

    index += 1
  }

  return index
}

const consumeGraphqlDefinitionHeader = (tokens: GraphqlToken[], startIndex: number) => {
  let index = startIndex
  let parenDepth = 0
  let bracketDepth = 0

  while (index < tokens.length) {
    const token = tokens[index]
    if (token?.kind === "punctuator") {
      if (token.value === "(") {
        parenDepth += 1
      } else if (token.value === ")") {
        parenDepth = Math.max(0, parenDepth - 1)
      } else if (token.value === "[") {
        bracketDepth += 1
      } else if (token.value === "]") {
        bracketDepth = Math.max(0, bracketDepth - 1)
      } else if (token.value === "{" && parenDepth === 0 && bracketDepth === 0) {
        return consumeGraphqlSelectionSet(tokens, index)
      }
    }

    index += 1
  }

  return index
}

const containsGraphqlNonQueryOperation = (document: string) => {
  const tokens = tokenizeGraphqlDocument(document)
  let index = 0

  while (index < tokens.length) {
    const token = tokens[index]
    if (!token) {
      break
    }

    if (token.kind === "punctuator" && token.value === "{") {
      index = consumeGraphqlSelectionSet(tokens, index)
      continue
    }

    if (token.kind === "name") {
      if (token.value === "mutation" || token.value === "subscription") {
        return true
      }

      if (token.value === "query" || token.value === "fragment") {
        index = consumeGraphqlDefinitionHeader(tokens, index + 1)
        continue
      }
    }

    index += 1
  }

  return false
}

const createExecutorContext = async (
  profile: ProviderProfile,
  signal: AbortSignal,
): Promise<ProviderExecutorContext & ProviderExecuteResult> => {
  const connection = toShopifyConnection(profile)
  if (!connection) {
    throw new Error("Shopify profiles require storeDomain, clientId, and clientSecretEnv.")
  }

  const requestSummary: ProviderRequestLogEntry[] = []
  const rawResponses: ProviderHttpResponse[] = []
  const accessToken = await getShopifyAccessToken(connection, signal)
  const apiVersion = connection.apiVersion ?? DEFAULT_SHOPIFY_API_VERSION
  const baseUrl = `https://${connection.storeDomain}/admin/api/${apiVersion}`
  const runLoggedRequest = createRequestLogger(requestSummary, rawResponses)

  const request = async (input: ProviderHttpRequestInput) => {
    const method = input.method?.trim().toUpperCase() || "GET"
    if (!READ_ONLY_REST_METHODS.has(method)) {
      throw new Error(`Shopify read-only requests only support GET or HEAD. Received ${method}.`)
    }

    const path = input.path.startsWith("/") ? input.path : `/${input.path}`
    const url = withQuery(new URL(`${baseUrl}${path}`), input.query ?? {})

    return runLoggedRequest({
      description: `${method} ${path}`,
      method,
      url,
      execute: () =>
        fetch(url, {
          method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
            ...input.headers,
          },
          body: input.json === undefined ? undefined : JSON.stringify(input.json),
          signal,
        }),
      map: response => {
        if (!response.ok) {
          throw new Error(`Shopify request failed (${response.status}): ${response.bodyText}`)
        }
        return response.body
      },
    })
  }

  const graphql = async (query: string, variables?: Record<string, unknown>) => {
    if (containsGraphqlNonQueryOperation(query)) {
      throw new Error(
        "Shopify read-only GraphQL only supports queries. Mutations and subscriptions are not allowed.",
      )
    }

    const url = new URL(`${baseUrl}/graphql.json`)

    return runLoggedRequest({
      description: "POST /graphql.json",
      method: "POST",
      url,
      execute: () =>
        fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({
            query,
            variables: variables ?? {},
          }),
          signal,
        }),
      map: response => {
        if (!response.ok) {
          throw new Error(
            `Shopify GraphQL request failed (${response.status}): ${response.bodyText}`,
          )
        }

        if (typeof response.body !== "object" || response.body === null) {
          throw new Error("Shopify GraphQL response was not JSON.")
        }

        const errors =
          "errors" in response.body && Array.isArray(response.body.errors)
            ? response.body.errors
            : []
        if (errors.length > 0) {
          throw new Error(`Shopify GraphQL errors: ${toBodyText(errors)}`)
        }

        return "data" in response.body ? response.body.data : response.body
      },
    })
  }

  return {
    profile: {
      id: profile.id,
      name: profile.name,
      provider: profile.provider,
    },
    connection: {
      storeDomain: connection.storeDomain,
      apiVersion,
    },
    graphql,
    request,
    requestSummary,
    rawResponses,
  }
}

export const shopifyProvider: Provider = {
  name: "shopify",
  label: "Shopify",
  defaultDocs,
  curatedNotes,
  validateProfile(profile) {
    return toShopifyConnection(profile)
      ? { ok: true }
      : {
          ok: false,
          reason: "Shopify profiles require storeDomain, clientId, and clientSecretEnv.",
        }
  },
  summarizeProfile(profile) {
    const connection = toShopifyConnection(profile)
    return {
      connection: {
        storeDomain: connection?.storeDomain ?? "unknown",
        apiVersion: connection?.apiVersion ?? DEFAULT_SHOPIFY_API_VERSION,
      },
      capabilities: {
        search: true,
        execute: ["read"],
      },
    }
  },
  createExecutorContext,
}
