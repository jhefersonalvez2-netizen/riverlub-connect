import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const FORBIDDEN_DESKTOP_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "OPENAI_API_KEY",
];

const forbiddenEnvKey = FORBIDDEN_DESKTOP_ENV_KEYS.find((key) => process.env[key]);

if (forbiddenEnvKey) {
  throw new Error(
    `${forbiddenEnvKey} nao pode estar presente no build do RiverLub Desktop. Use backend seguro ou agente local protegido.`
  );
}

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
