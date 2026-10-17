import { DATASET_NAMES } from "./dataSwapPresets";
import type { DatasetName } from "./dataSwapPresets";

/** Row of buttons (`data-testid="dataset-<name>"`) used by the DataSwap stories. */
export function DatasetBar({
  active,
  onPick,
}: {
  active: DatasetName;
  onPick: (name: DatasetName) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Dataset">
      {DATASET_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          data-testid={`dataset-${name}`}
          aria-pressed={active === name}
          onClick={() => onPick(name)}
          className={`rounded border px-2 py-1 text-xs ${
            active === name ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white"
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
