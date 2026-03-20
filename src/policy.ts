export type Scope = `${string}.${string}`

export type ProfilePolicy = {
  resources: Record<string, string[]>
  scopes: Scope[]
}

export const DEFAULT_PROFILE_POLICY_RESOURCES: Record<string, string[]> = {
  "*": ["read"],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readPolicySegment = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.length === 0 || normalized.includes(".")) {
    return undefined
  }

  return normalized
}

const unique = (values: string[]) => [...new Set(values)]

const toPolicyResources = (value: unknown): Record<string, string[]> => {
  if (!isRecord(value)) {
    return {
      ...DEFAULT_PROFILE_POLICY_RESOURCES,
    }
  }

  const entries = Object.entries(value).flatMap(([rawResource, rawActions]) => {
    const resource = readPolicySegment(rawResource)
    if (!resource || !Array.isArray(rawActions)) {
      return []
    }

    const actions = unique(
      rawActions.map(readPolicySegment).filter((action): action is string => Boolean(action)),
    )

    return actions.length > 0 ? [[resource, actions] as const] : []
  })

  if (entries.length === 0) {
    return {
      ...DEFAULT_PROFILE_POLICY_RESOURCES,
    }
  }

  return Object.fromEntries(entries)
}

const toScopes = (resources: Record<string, string[]>): Scope[] =>
  Object.entries(resources).flatMap(([resource, actions]) =>
    actions.map(action => `${resource}.${action}` as Scope),
  )

export const toProfilePolicy = (value: unknown): ProfilePolicy => {
  const resources = toPolicyResources(value)
  return {
    resources,
    scopes: toScopes(resources),
  }
}

const splitScope = (scope: string) => {
  const [resource, action, extra] = scope.split(".")
  if (!resource || !action || extra) {
    return undefined
  }

  return { resource, action }
}

export const scopeMatches = (allowedScope: Scope, requiredScope: Scope) => {
  const allowed = splitScope(allowedScope)
  const required = splitScope(requiredScope)
  if (!allowed || !required) {
    return false
  }

  return (
    (allowed.resource === "*" || allowed.resource === required.resource) &&
    (allowed.action === "*" || allowed.action === required.action)
  )
}

export const allowsScope = (scopes: Scope[], requiredScope: Scope) =>
  scopes.some(scope => scopeMatches(scope, requiredScope))

export const inferExecuteModes = (scopes: Scope[]): Array<"read" | "write"> => {
  const modes: Array<"read" | "write"> = []

  if (
    scopes.some(scope => {
      const segments = splitScope(scope)
      return segments?.action === "read" || segments?.action === "*"
    })
  ) {
    modes.push("read")
  }

  if (
    scopes.some(scope => {
      const segments = splitScope(scope)
      return segments?.action === "write" || segments?.action === "*"
    })
  ) {
    modes.push("write")
  }

  return modes
}
