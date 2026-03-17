import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { toPluginConfig } from "./src/config.ts"
import { registerSellerTools } from "./src/tools.ts"

/** Registers the seller assistant plugin tools */
export default function register(api: OpenClawPluginApi) {
  api.logger.info(
    `[seller-assistant] plugin loaded id=${api.id} version=${api.version ?? "unknown"}`,
  )
  const pluginConfig = toPluginConfig(api)
  registerSellerTools(api, pluginConfig)
}
