import { describe, expect, it } from "vitest";
import { formatReplyRate } from "./reporting-format";

describe("formatReplyRate", () => {
  it("rounds to a whole percent with no trailing float artifact", () => {
    expect(formatReplyRate(0.3333333)).toBe("33%");
  });

  it("applies the same whole-percent precision to zero, not an empty string", () => {
    expect(formatReplyRate(0)).toBe("0%");
  });

  it("renders the whole-number form for 1", () => {
    expect(formatReplyRate(1)).toBe("100%");
  });

  it("returns the awaiting literal for null, never NaN%, Infinity%, or null%", () => {
    const result = formatReplyRate(null);
    expect(result).toBe("— Not yet sending");
    expect(result).not.toContain("NaN");
    expect(result).not.toContain("Infinity");
    expect(result).not.toContain("null");
  });
});
