import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * O alias `@/*` vem do tsconfig e o Next resolve sozinho; o Vitest não.
 * Sem isto, todo módulo que importa por `@/` falha só nos testes — e falha
 * de um jeito que parece bug do código.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts", "app/**/*.test.ts"],
  },
});
