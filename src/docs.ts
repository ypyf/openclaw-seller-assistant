import type {
  ProviderDocumentationNote,
  ProviderDocumentationSource,
  ProviderSearchDocument,
} from "./providers/types.ts"

type CachedChunk = {
  heading: string
  excerpt: string
  text: string
}

type CachedDocument = {
  title: string
  url: string
  lastFetchedAt: string
  sourceKind: "official_doc"
  chunks: CachedChunk[]
}

type SearchDocumentationInput = {
  query: string
  limit: number
  refresh: boolean
  notes: ProviderDocumentationNote[]
  sources: ProviderDocumentationSource[]
}

type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>

type DocsDependencies = {
  fetch: FetchLike
  now: () => number
  cacheTtlMs: number
  cacheStore: Map<string, CachedDocument>
}

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000
const DEFAULT_DOCS_CACHE = new Map<string, CachedDocument>()

const DEFAULT_DOCS_DEPENDENCIES: DocsDependencies = {
  fetch: globalThis.fetch,
  now: () => Date.now(),
  cacheTtlMs: DEFAULT_CACHE_TTL_MS,
  cacheStore: DEFAULT_DOCS_CACHE,
}

const toError = (value: unknown) =>
  value instanceof Error ? value : new Error(typeof value === "string" ? value : "Unknown error")

const decodeEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()

const stripHtml = (value: string) =>
  decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

const readTitle = (body: string, fallback: string) => {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)
  return collapseWhitespace(decodeEntities(titleMatch?.[1] ?? "")) || fallback
}

const excerpt = (value: string, maxLength = 240) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value

const splitIntoChunks = (title: string, text: string): CachedChunk[] => {
  const paragraphs = text
    .split(/\n+/)
    .map(paragraph => collapseWhitespace(paragraph))
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return [{ heading: title, excerpt: "", text: "" }]
  }

  const chunks: CachedChunk[] = []
  let current = ""

  const flush = () => {
    const normalized = collapseWhitespace(current)
    if (!normalized) {
      return
    }

    chunks.push({
      heading: title,
      excerpt: excerpt(normalized),
      text: normalized,
    })
    current = ""
  }

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n${paragraph}` : paragraph
    if (next.length > 700 && current) {
      flush()
      current = paragraph
    } else {
      current = next
    }
  }

  flush()
  return chunks
}

const parseBody = async (response: Response) => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
  const body = await response.text()
  if (contentType.includes("text/html")) {
    return {
      title: readTitle(body, response.url),
      text: stripHtml(body),
    }
  }
  return {
    title: response.url,
    text: collapseWhitespace(body),
  }
}

const isFresh = (document: CachedDocument, now: number, cacheTtlMs: number) =>
  now - new Date(document.lastFetchedAt).getTime() <= cacheTtlMs

const fetchDocument = async (
  source: ProviderDocumentationSource,
  dependencies: DocsDependencies,
) => {
  const response = await dependencies.fetch(source.url, {
    headers: {
      Accept: "text/html, text/plain, text/markdown;q=0.9, application/json;q=0.1",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch documentation ${source.url}: ${response.status}`)
  }

  const parsed = await parseBody(response)
  const document: CachedDocument = {
    title: source.title ?? parsed.title,
    url: source.url,
    lastFetchedAt: new Date(dependencies.now()).toISOString(),
    sourceKind: "official_doc",
    chunks: splitIntoChunks(source.title ?? parsed.title, parsed.text),
  }

  dependencies.cacheStore.set(source.url, document)
  return document
}

const loadDocument = async (
  source: ProviderDocumentationSource,
  refresh: boolean,
  dependencies: DocsDependencies,
) => {
  const cached = dependencies.cacheStore.get(source.url)

  if (!refresh && cached && isFresh(cached, dependencies.now(), dependencies.cacheTtlMs)) {
    return cached
  }

  try {
    return await fetchDocument(source, dependencies)
  } catch (error) {
    if (cached) {
      return cached
    }
    throw error
  }
}

const tokenize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(token => token.trim())
    .filter(Boolean)

const countMatches = (haystack: string, needles: string[]) =>
  needles.reduce((score, needle) => score + (haystack.includes(needle) ? 1 : 0), 0)

const toSearchResults = (
  notes: ProviderDocumentationNote[],
  docs: CachedDocument[],
  query: string,
  limit: number,
  now: number,
): ProviderSearchDocument[] => {
  const queryTokens = tokenize(query)
  const scored: ProviderSearchDocument[] = []

  for (const note of notes) {
    const haystack = `${note.title} ${note.content}`.toLowerCase()
    const score = countMatches(haystack, queryTokens) + 10
    if (score > 10 || queryTokens.length === 0) {
      scored.push({
        title: note.title,
        url: note.url,
        heading: note.title,
        excerpt: excerpt(note.content),
        sourceKind: "provider_note",
        lastFetchedAt: new Date(now).toISOString(),
        score,
      })
    }
  }

  for (const document of docs) {
    for (const chunk of document.chunks) {
      const haystack =
        `${document.title} ${chunk.heading} ${chunk.text} ${document.url}`.toLowerCase()
      const score =
        countMatches(document.title.toLowerCase(), queryTokens) * 5 +
        countMatches(chunk.heading.toLowerCase(), queryTokens) * 3 +
        countMatches(haystack, queryTokens)
      if (score > 0 || queryTokens.length === 0) {
        scored.push({
          title: document.title,
          url: document.url,
          heading: chunk.heading,
          excerpt: chunk.excerpt,
          sourceKind: document.sourceKind,
          lastFetchedAt: document.lastFetchedAt,
          score,
        })
      }
    }
  }

  return scored
    .sort((left, right) => {
      if (left.sourceKind !== right.sourceKind) {
        return left.sourceKind === "provider_note" ? -1 : 1
      }
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return left.title.localeCompare(right.title)
    })
    .slice(0, limit)
}

/** Searches provider notes and in-memory official documentation cache with optional refresh. */
export const searchDocumentation = async (
  input: SearchDocumentationInput,
  overrides: Partial<DocsDependencies> = {},
) => {
  const dependencies: DocsDependencies = {
    ...DEFAULT_DOCS_DEPENDENCIES,
    ...overrides,
    cacheStore: overrides.cacheStore ?? DEFAULT_DOCS_CACHE,
    now: overrides.now ?? DEFAULT_DOCS_DEPENDENCIES.now,
    cacheTtlMs: overrides.cacheTtlMs ?? DEFAULT_DOCS_DEPENDENCIES.cacheTtlMs,
  }
  const limit = Math.max(1, Math.min(input.limit, 20))
  const settledDocs = await Promise.allSettled(
    input.sources.map(source => loadDocument(source, input.refresh, dependencies)),
  )
  const docs = settledDocs.flatMap(result => (result.status === "fulfilled" ? [result.value] : []))
  const failures = settledDocs.flatMap(result =>
    result.status === "rejected" ? [toError(result.reason)] : [],
  )
  const results = toSearchResults(input.notes, docs, input.query, limit, dependencies.now())

  if (failures.length > 0 && results.length === 0) {
    throw failures[0]
  }

  return results
}
