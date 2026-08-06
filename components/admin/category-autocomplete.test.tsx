// Filter-as-you-type control tests (Task 3, 260806-p6f; D-05, D-06). Runs in
// the jsdom "component" vitest project. globals: false means RTL's automatic
// cleanup never registers — every test file in this project MUST import
// cleanup and call it in an explicit afterEach (precedent:
// components/admin/shortlist-table.test.tsx).
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CategoryAutocomplete } from "@/components/admin/category-autocomplete";
import type { CategoryCount } from "@/lib/overture-categories";

afterEach(() => {
  cleanup();
});

const OPTIONS: CategoryCount[] = [
  { category: "dentist", count: 947, withSite: 848 },
  { category: "hairdresser", count: 300, withSite: 200 },
  { category: "restaurant", count: 2000, withSite: 1800 },
];

/**
 * The real Import form keeps `category` as controlled state and passes
 * onChange down. CategoryAutocomplete is itself a controlled component (the
 * value prop drives what's rendered), so a bare render() with a fixed value
 * prop can't exercise "type a character and see it reflected" — this
 * harness stands in for the parent form's own useState<string>, exactly the
 * wiring Task 3's <action> describes for import-form.tsx.
 */
function Harness({
  options,
  loading = false,
  hint,
  onChangeSpy,
}: {
  options: CategoryCount[];
  loading?: boolean;
  hint?: string;
  onChangeSpy: (next: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <CategoryAutocomplete
      value={value}
      onChange={(next) => {
        onChangeSpy(next);
        setValue(next);
      }}
      options={options}
      loading={loading}
      hint={hint}
    />
  );
}

describe("CategoryAutocomplete", () => {
  it("typing 'den' into a populated options list shows a row with both the slug and its with-a-website count", () => {
    const spy = vi.fn();
    render(<Harness options={OPTIONS} onChangeSpy={spy} />);
    const input = screen.getByRole("textbox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "den" } });

    expect(spy).toHaveBeenCalledWith("den");
    const option = screen.getByRole("option", { name: /dentist/i });
    expect(option.textContent).toContain("dentist");
    expect(option.textContent).toContain("848");
  });

  it("clicking a row calls onChange with exactly the slug and closes the list", () => {
    const spy = vi.fn();
    render(<Harness options={OPTIONS} onChangeSpy={spy} />);
    const input = screen.getByRole("textbox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "den" } });
    fireEvent.click(screen.getByRole("option", { name: /dentist/i }));

    expect(spy).toHaveBeenLastCalledWith("dentist");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("typing a string matching nothing shows no option rows, and onChange still receives every keystroke", () => {
    const spy = vi.fn();
    render(<Harness options={OPTIONS} onChangeSpy={spy} />);
    const input = screen.getByRole("textbox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz-no-match-zzz" } });

    expect(spy).toHaveBeenCalledWith("zzz-no-match-zzz");
    expect(screen.queryAllByRole("option").length).toBe(0);
  });

  it("given an EMPTY options list, focusing and typing renders no listbox at all and onChange still fires (D-06)", () => {
    const spy = vi.fn();
    render(<Harness options={[]} onChangeSpy={spy} />);
    const input = screen.getByRole("textbox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "tandarts" } });

    expect(spy).toHaveBeenCalledWith("tandarts");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryAllByRole("option").length).toBe(0);
  });

  it("renders the hint text when options are empty and a hint is given", () => {
    render(<Harness options={[]} onChangeSpy={vi.fn()} hint="No cached list for NL:zeeland" />);
    expect(screen.getByText("No cached list for NL:zeeland")).toBeTruthy();
  });

  it("renders a loading line instead of an empty-list state while loading", () => {
    render(<Harness options={[]} onChangeSpy={vi.fn()} loading hint="should not show while loading" />);
    expect(screen.getByText(/loading categories/i)).toBeTruthy();
    expect(screen.queryByText("should not show while loading")).toBeNull();
  });

  it("Enter selects the highlighted row and prevents default so the form does not submit", () => {
    const spy = vi.fn();
    render(<Harness options={OPTIONS} onChangeSpy={spy} />);
    const input = screen.getByRole("textbox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "den" } });
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    fireEvent(input, event);

    expect(spy).toHaveBeenLastCalledWith("dentist");
    expect(event.defaultPrevented).toBe(true);
  });
});
