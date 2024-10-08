import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      reporter: ["text", "html", "json-summary", "json"],
      reportOnFailure: true,
    },
    browser: {
      enabled: true,
      name: "chromium",
      provider: "playwright",
      // https://playwright.dev
      providerOptions: {},
    },
  },
});
