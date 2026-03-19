import vm from "node:vm"
import type { Provider, ProviderExecuteResult } from "./providers/types.ts"
import type { ProviderProfile } from "./config.ts"

export type ExecuteScriptInput = {
  provider: Provider
  profile: ProviderProfile
  script: string
  timeoutMs: number
}

export type ExecuteScriptResult = ProviderExecuteResult & {
  status: "ok" | "error"
  result: unknown
  logs: string[]
  warnings: string[]
  error?: string
}

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bimport\s*\(/u, message: "Dynamic import is not available." },
  { pattern: /\bimport\s+/u, message: "Module imports are not available." },
  { pattern: /\brequire\s*\(/u, message: "require is not available." },
  { pattern: /\bprocess\b/u, message: "process is not available." },
  { pattern: /\bglobalThis\b/u, message: "globalThis is not available." },
  { pattern: /\bFunction\b/u, message: "Function constructors are not available." },
  { pattern: /\beval\s*\(/u, message: "eval is not available." },
  { pattern: /\bconstructor\b/u, message: "constructor access is not available." },
  {
    pattern: /\bfetch\s*\(/u,
    message: "Use provider.request or provider.graphql instead of fetch.",
  },
  { pattern: /\bchild_process\b/u, message: "child_process is not available." },
  { pattern: /\bworker_threads\b/u, message: "worker_threads is not available." },
  { pattern: /\bfs\b/u, message: "fs is not available." },
  { pattern: /\bvm\b/u, message: "vm is not available." },
]

const serializeLogArgs = (args: unknown[]) =>
  args
    .map(arg => {
      if (typeof arg === "string") {
        return arg
      }
      try {
        return JSON.stringify(arg)
      } catch {
        return "[unserializable]"
      }
    })
    .join(" ")

const validateScript = (script: string) => {
  for (const item of FORBIDDEN_PATTERNS) {
    if (item.pattern.test(script)) {
      return item.message
    }
  }
  return undefined
}

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    return Object.freeze(value)
  }
  return value
}

const normalizeResult = (value: unknown) => {
  if (value === undefined || value === null) {
    return value
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

/** Executes a JavaScript function body with a provider-scoped read-only context. */
export const executeReadOnlyScript = async (
  input: ExecuteScriptInput,
): Promise<ExecuteScriptResult> => {
  const validationError = validateScript(input.script)
  if (validationError) {
    return {
      status: "error",
      result: null,
      logs: [],
      warnings: [],
      error: validationError,
      requestSummary: [],
      rawResponses: [],
    }
  }

  const controller = new AbortController()
  const logs: string[] = []
  const warnings: string[] = []
  let requestSummary: ProviderExecuteResult["requestSummary"] = []
  let rawResponses: ProviderExecuteResult["rawResponses"] = []
  try {
    const providerContext = await input.provider.createExecutorContext(
      input.profile,
      controller.signal,
    )
    requestSummary = providerContext.requestSummary
    rawResponses = providerContext.rawResponses
    const timeoutMs = Math.max(100, Math.min(input.timeoutMs, 60_000))

    const sandbox = vm.createContext(
      {
        __input: freeze({
          provider: freeze({
            graphql: providerContext.graphql,
            request: providerContext.request,
          }),
          profile: freeze(providerContext.profile),
          connection: freeze(providerContext.connection),
          console: freeze({
            log: (...args: unknown[]) => {
              logs.push(serializeLogArgs(args))
            },
            error: (...args: unknown[]) => {
              logs.push(serializeLogArgs(args))
            },
          }),
        }),
        AbortController: undefined,
        Buffer: undefined,
        process: undefined,
        globalThis: undefined,
        require: undefined,
        fetch: undefined,
        module: undefined,
        exports: undefined,
      },
      {
        codeGeneration: {
          strings: false,
          wasm: false,
        },
      },
    )

    const runner = new vm.Script(
      `
        (async () => {
          const { provider, profile, connection, console } = __input
          ${input.script}
        })()
      `,
      {
        filename: `${input.profile.provider}-${input.profile.id}-read.js`,
      },
    )

    const timeoutPromise = new Promise<never>((_, reject) => {
      const handle = setTimeout(() => {
        controller.abort()
        reject(new Error(`Execution timed out after ${timeoutMs}ms.`))
      }, timeoutMs)

      controller.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(handle)
        },
        { once: true },
      )
    })

    const result = await Promise.race([
      runner.runInContext(sandbox, {
        timeout: timeoutMs,
      }) as Promise<unknown>,
      timeoutPromise,
    ])

    controller.abort()
    return {
      status: "ok",
      result: normalizeResult(result),
      logs,
      warnings,
      requestSummary,
      rawResponses,
    }
  } catch (error) {
    controller.abort()
    return {
      status: "error",
      result: null,
      logs,
      warnings,
      error: error instanceof Error ? error.message : "Execution failed.",
      requestSummary,
      rawResponses,
    }
  }
}
