import { defineConfig } from "vite";
//import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";
import deno from "@deno/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [deno(), tailwindcss()],
  server: {
    watch: {
      ignored: ["!**/src/**"], // ensure src/ is *not* ignored
    },
    port: 5173,
    proxy: {
      "/jellyseerr": "http://localhost:60421",
      "/catalog": "http://localhost:60421",
      "/stream": "http://localhost:60421",
      "/manifest.json": "http://localhost:60421",
    },
  },
});
