import { defineConfig } from "vite";

const apiPort = process.env.API_PORT ?? "3101";

export default defineConfig({
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": `http://localhost:${apiPort}`,
    },
  },
});
