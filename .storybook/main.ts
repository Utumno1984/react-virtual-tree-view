import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  viteFinal: async (viteConfig) => {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    // e2e build (npm run build-storybook:e2e): development React and library warnings,
    // so the smoke suite can see console warnings. The regular Storybook is unchanged.
    if (process.env.STORYBOOK_E2E === "1") {
      viteConfig.define = { ...viteConfig.define, "process.env.NODE_ENV": '"development"' };
    }
    return viteConfig;
  },
};

export default config;
