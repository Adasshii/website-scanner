// Single formatter for the Reporting tab's reply-rate cell — the only place
// a `ReportingDay.replyRate` becomes a string (D-7-13). Keeping it out of
// the component makes the precision backstop testable without a DOM, and
// keeps a `null` from ever reaching the DOM as `NaN%`, `Infinity%`, or
// `null%` via ad-hoc string arithmetic.
export function formatReplyRate(rate: number | null): string {
  if (rate === null) return "— Not yet sending";
  return `${Math.round(rate * 100)}%`;
}
