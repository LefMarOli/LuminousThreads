import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist"] },
  tseslint.configs.recommended,
  {
    rules: {
      // tsc already catches genuinely undefined names; no-undef can't see
      // TS-only ambient types/module augmentations and produces false
      // positives for them.
      "no-undef": "off",
    },
  },
  eslintConfigPrettier,
);
