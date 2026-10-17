import type { TreeNode } from "../../src/types";
import type { FileMeta } from "./generateTree";

/** Small hand-written dataset for the NodeMetadata story (also read by the e2e test). */
export const fileTree: TreeNode<FileMeta>[] = [
  {
    id: "docs",
    label: "Documents",
    data: { owner: "alice", status: "published", sizeBytes: 0, updatedAt: "2025-03-01T09:00:00.000Z" },
    children: [
      {
        id: "cv",
        label: "CV.pdf",
        data: { owner: "alice", status: "published", sizeBytes: 12_698, updatedAt: "2025-03-02T10:30:00.000Z" },
      },
      {
        id: "report",
        label: "Report Q2.xlsx",
        data: { owner: "bob", status: "review", sizeBytes: 2_480_000, updatedAt: "2025-06-30T17:45:00.000Z" },
      },
      // No `data` on purpose: the panel must show an explicit message.
      { id: "scratch", label: "scratch.txt" },
    ],
  },
  {
    id: "pics",
    label: "Pictures",
    data: { owner: "carla", status: "draft", sizeBytes: 0, updatedAt: "2025-01-15T08:00:00.000Z" },
    children: [
      {
        id: "holiday",
        label: "Holiday.png",
        data: { owner: "carla", status: "draft", sizeBytes: 4_321_987, updatedAt: "2025-08-12T12:00:00.000Z" },
      },
    ],
  },
  {
    id: "readme",
    label: "README.md",
    data: { owner: "dario", status: "published", sizeBytes: 1_024, updatedAt: "2025-02-10T07:15:00.000Z" },
  },
  {
    id: "locked",
    label: "Locked.bin",
    isDisabled: true,
    data: { owner: "elena", status: "review", sizeBytes: 999_999, updatedAt: "2025-05-05T05:05:00.000Z" },
  },
];
