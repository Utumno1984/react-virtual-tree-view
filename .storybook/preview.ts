import type { Preview } from "@storybook/react-vite";
import "./tailwind.css";

declare const __RVTV_E2E_BUILD__: boolean | undefined;

// Exposed so the e2e suite can verify Storybook was built with `npm run build-storybook:e2e`.
(window as unknown as { __RVTV_E2E_BUILD__: boolean }).__RVTV_E2E_BUILD__ =
  typeof __RVTV_E2E_BUILD__ !== "undefined" && __RVTV_E2E_BUILD__ === true;

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
  },
};

export default preview;
