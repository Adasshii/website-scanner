"use client";

interface CutoffSliderProps {
  value: number;
  onChange: (value: number) => void;
  eligibleCount: number;
  totalTriaged: number;
}

/**
 * Live cutoff control (TRI-08). Parent recomputes eligibility on every
 * onChange against already-fetched rows — this component does no fetching
 * of its own (D-07).
 */
export function CutoffSlider({ value, onChange, eligibleCount, totalTriaged }: CutoffSliderProps) {
  return (
    <div>
      <div className="text-sm text-gray-500 mb-2">
        Cutoff: score &le; {value} — {eligibleCount} of {totalTriaged} eligible
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-adashi-blue w-full"
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">0 (worst)</span>
        <span className="text-xs text-gray-400">100 (best)</span>
      </div>
    </div>
  );
}
