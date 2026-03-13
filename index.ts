import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { toPluginConfig } from "./src/config.js"
import { registerSellerTools } from "./src/tools.js"

export default function register(api: OpenClawPluginApi) {
  const pluginConfig = toPluginConfig(api)
  registerSellerTools(api, pluginConfig)
}
