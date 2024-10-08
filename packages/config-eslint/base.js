import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "@eslint-react/eslint-plugin";
import { fixupPluginRules } from "@eslint/compat";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import * as tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.tshy-build/**",
      "**/.tshy/**",
    ],
  },
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  { languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },
  { languageOptions: { globals: globals.node } },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/.storybook/**"],
    ...react.configs["dom"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json" },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["**/.storybook/**"],
    ...react.configs["recommended-type-checked"],
    settings: {
      "react-x": {
        additionalHooks: {
          useLayoutEffect: ["useIsomorphicLayoutEffect"],
        },
      },
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      ...react.configs["recommended-type-checked"].rules,
      "@eslint-react/prefer-shorthand-boolean": "error",
      "@eslint-react/naming-convention/filename-extension": "error",
    },
  },
  {
    plugins: {
      "react-hooks": fixupPluginRules(eslintPluginReactHooks),
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
    },
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-shadow": "error",
    },
  },
  {
    ignores: ["**/*.stories.tsx"],
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["**/*.test.*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
