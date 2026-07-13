import prettierConfig from "@vue/eslint-config-prettier";
import { withVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import pluginVue from "eslint-plugin-vue";

const prettierOptions = {
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  useTabs: false,
};

export default withVueTs(
  { rootDir: import.meta.dirname },
  {
    ignores: [
      ".vite/**",
      "coverage/**",
      "dist/**",
      "out/**",
      "src/components/ui/**",
      "src/styles/shadcn-vue.css",
    ],
  },
  pluginVue.configs["flat/essential"],
  vueTsConfigs.recommendedTypeChecked,
  prettierConfig,
  {
    rules: {
      "prettier/prettier": ["error", prettierOptions],
      "vue/multi-word-component-names": ["error", { ignores: ["App"] }],
    },
  },
);
