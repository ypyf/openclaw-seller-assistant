import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { toPluginConfig } from "./src/config.js"
import { registerSellerTools } from "./src/tools.js"

/** Registers the seller assistant plugin tools */
export default function register(api: OpenClawPluginApi) {
  api.logger.info(
    `[seller-assistant] plugin loaded id=${api.id} version=${api.version ?? "unknown"}`,
  )
  const pluginConfig = toPluginConfig(api)
  registerSellerTools(api, pluginConfig)
}
