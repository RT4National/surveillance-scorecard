import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig((ctx) => {
  switch (ctx.mode) {
    case "staging":
    case "production": {
      return {
        assetsDirectory: "./dist",
      };
    }
    default: {
      return {
        assetsDirectory: "./dist",
      };
    }
  }
});
