// @ts-check

import { defineConfig, globalIgnores } from "eslint/config"
import { configs as tsConfigs } from "typescript-eslint"
import stylistic from "@stylistic/eslint-plugin"

const base = stylistic.configs.customize({
  indent: 2,
  quotes: "double",
  semi: false,
  arrowParens: true,
  jsx: true,
})

export default defineConfig([
  globalIgnores([
    "node_modules/",
    "dist/",
    "build/",
    ".medusa/",
    ".cache/",
    ".yarn/",
    "jest.config.js",
    "integration-tests/setup.js",
  ]),
  tsConfigs.recommended,
  {
    plugins: {
      "@stylistic": stylistic,
    },
    rules: {
      ...base.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@stylistic/comma-dangle": ["error", {
        functions: "never",
        imports: "always-multiline",
        exports: "always-multiline",
        objects: "always-multiline",
        arrays: "always-multiline",
        enums: "always-multiline",
      }],
      "@stylistic/operator-linebreak": ["error", "after", { overrides: { "?": "before", ":": "before", "|": "before" } }],
      "@stylistic/brace-style": ["error", "1tbs"],
      "@stylistic/semi": ["error", "never"],
      "@stylistic/quotes": ["error", "double"],
      "@stylistic/arrow-parens": ["error", "always"],
      "@stylistic/member-delimiter-style": ["error", {
        multiline: { delimiter: "none" },
        singleline: { delimiter: "comma" },
      }],
    },
  },
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/semi": ["error", "always"],
      "@stylistic/quotes": ["error", "backtick"],
      "@stylistic/eol-last": ["error", "always"],
      "@stylistic/lines-between-class-members": ["error", "always"],
      "@stylistic/padded-blocks": ["error", { classes: "always" }],
    },
    files: ["src/**/migrations/*.ts"],
  },
])
