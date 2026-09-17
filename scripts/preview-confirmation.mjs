// Isolated browser fixture; never included in the application's routes/build.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  configFile: false,
  css: { postcss: { plugins: [tailwindcss({ base: root })] } },
  root: fileURLToPath(new URL("../tests/browser/", import.meta.url)),
  plugins: [react()],
  resolve: { alias: { "@": root } },
  server: {
    host: "127.0.0.1",
    port: 3100,
    strictPort: true,
    fs: { allow: [root] },
  },
});
await server.listen();
server.printUrls();
