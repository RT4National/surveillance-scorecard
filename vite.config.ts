import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    open: "/scorecard/",
    proxy: { "/scorecard/api": "http://127.0.0.1:8787" },
  },
  build: { outDir: "dist", assetsDir: "scorecard/assets" },
});
