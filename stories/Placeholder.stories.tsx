import type { Meta, StoryObj } from "@storybook/react-vite";

const Placeholder = () => <p className="p-4 text-lg text-gray-700">TreeView coming soon</p>;

const meta = {
  title: "Placeholder",
  component: Placeholder,
} satisfies Meta<typeof Placeholder>;

export default meta;

export const ComingSoon: StoryObj<typeof meta> = {};
