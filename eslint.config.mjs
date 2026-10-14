import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // As paginas carregam os dados do Supabase no useEffect de montagem
      // (app client-side, sem login). A regra do React Compiler sinaliza esse
      // padrao, mas aqui ele e intencional.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
