export interface TreeNode<T = unknown> {
  id: string | number;
  label: string;
  children?: TreeNode<T>[];
  isDisabled?: boolean;
  data?: T;
}
