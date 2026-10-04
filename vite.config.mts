import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
