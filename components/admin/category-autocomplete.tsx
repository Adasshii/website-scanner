"use client";

import { useMemo, useState } from "react";
import type { CategoryCount } from "@/lib/overture-categories";

const MAX_VISIBLE_ROWS = 12;

export interface CategoryAutocompleteProps {
  value: string;
  onChange: (next: string) => void;
  options: CategoryCount[];
  loading: boolean;
  hint?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Filter-as-you-type control for the Overture category vocabulary (Task 3,
 * 260806-p6f; D-05). Deliberately NOT a native <datalist> — a datalist
 * cannot render the second column (the with-a-website count) every row
 * needs. The input stays plain free text at all times: every keystroke
 * calls onChange with the raw typed value, so a category absent from the
 * list is still submittable, and an unseeded region (empty `options`)
 * degrades to exactly today's plain text field plus an optional hint (D-06).
 */
export function CategoryAutocomplete({
  value,
  onChange,
  options,
  loading,
  hint,
  placeholder,
  className,
}: CategoryAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const filtered = useMemo(() => {
    const needle = value.trim().toLowerCase();
    const matches = needle
      ? options.filter((row) => row.category.toLowerCase().includes(needle))
      : options;
    return matches.slice(0, MAX_VISIBLE_ROWS);
  }, [options, value]);

  const showListbox = isOpen && !loading && filtered.length > 0;

  function selectRow(category: string) {
    onChange(category);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showListbox) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      // Not optional: this control lives inside a form with a submit
      // button, so without preventDefault, picking a suggestion with the
      // keyboard fires an import instead of just filling the field.
      e.preventDefault();
      const row = filtered[highlightedIndex];
      if (row) selectRow(row.category);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        role="textbox"
        value={value}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlightedIndex(0);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {loading && <p className="mt-1 text-xs text-gray-400">Loading categories…</p>}
      {!loading && options.length === 0 && hint && (
        <p className="mt-1 text-xs text-gray-400">{hint}</p>
      )}
      {showListbox && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {filtered.map((row, index) => (
            <li key={row.category}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                // Keeps focus on the input so onBlur never fires before this
                // click lands — without it, the click silently does nothing.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectRow(row.category)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                  index === highlightedIndex ? "bg-gray-100" : ""
                }`}
              >
                <span>{row.category}</span>
                <span className="text-xs text-gray-400">{row.withSite} with a website</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
