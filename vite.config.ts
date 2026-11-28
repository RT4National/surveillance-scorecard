import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    open: "/scorecard/",
    proxy: { "/scorecard/api": "http://127.0.0.1:8787" },
  },
  build: { outDir: "dist", assetsDir: "scorecard/assets" },
  // Agent worktrees under .claude/ hold full repo copies; never collect their tests.
  test: { exclude: [...configDefaults.exclude, ".claude/**"] },
});
