import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/gamedev-08-flappy/" : "/",
  server: { port: 5180, open: true },
  build: { target: "es2020" },
}));
