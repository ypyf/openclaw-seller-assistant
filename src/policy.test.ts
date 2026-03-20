import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { allowsScope, inferExecuteModes, scopeMatches, toProfilePolicy } from "./policy.ts"

describe("policy", () => {
  it("normalizes structured resources into internal scopes", () => {
    const policy = toProfilePolicy({
      product: ["read", "write", "read"],
      inventory: ["write"],
    })

    assert.deepEqual(policy.resources, {
      product: ["read", "write"],
      inventory: ["write"],
    })
    assert.deepEqual(policy.scopes, ["product.read", "product.write", "inventory.write"])
  })

  it("falls back to read-only access when policy resources are omitted", () => {
    const policy = toProfilePolicy(undefined)

    assert.deepEqual(policy.resources, {
      "*": ["read"],
    })
    assert.deepEqual(policy.scopes, ["*.read"])
  })

  it("matches wildcard scopes and infers execute modes", () => {
    assert.equal(scopeMatches("product.*", "product.write"), true)
    assert.equal(allowsScope(["*.read", "inventory.write"], "product.read"), true)
    assert.equal(allowsScope(["*.read", "inventory.write"], "product.write"), false)
    assert.deepEqual(inferExecuteModes(["*.read", "inventory.write"]), ["read", "write"])
  })
})
