import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // 問題作成を何十回も回すテストがあり、混んだCIでは5秒を超えることがあるため長めにする
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 20_000 },
});
