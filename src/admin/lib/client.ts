import Medusa from "@medusajs/js-sdk"

// Resolve the backend origin so the plugin works in split-host deployments
// (admin and backend on different origins). The Medusa core admin defines
// `process.env.BACKEND_URL` via `admin.vite.define` in `medusa-config.ts`;
// honoring it keeps the plugin SDK aligned with the rest of the admin.
const resolveBaseUrl = (): string => {
  const fromVite = import.meta.env.VITE_BACKEND_URL
  if (fromVite) {
    return fromVite
  }

  if (typeof process !== "undefined" && process.env?.BACKEND_URL) {
    return process.env.BACKEND_URL
  }

  return "/"
}

export const sdk = new Medusa({
  baseUrl: resolveBaseUrl(),
  debug: import.meta.env.DEV,
  auth: {
    type: "session",
  },
})
