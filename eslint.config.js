import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist"] },
  tseslint.configs.recommended,
  {
    rules: {
      // TS ambient globals (p5's global mode, our own .d.ts) aren't visible
      // to plain no-undef - tsc already catches genuinely undefined names.
      "no-undef": "off",
    },
  },
  eslintConfigPrettier,
);
