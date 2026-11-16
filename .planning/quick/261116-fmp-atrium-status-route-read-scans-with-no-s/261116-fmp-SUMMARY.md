---
quick_id: 261116-fmp
status: complete
commits: [596cd6d, 4e5b03e]
---
# Summary

- Root cause: stale Data Cache read in the Atrium status route; the DB rows were completed.
- Fix: no-store on every server Supabase request (4e5b03e). Lint cleanup of the 261116-419 test (596cd6d).
- Verified: unit project 49 files / 894 tests pass; root tsc exit 0; next lint 0 errors; next build exit 0.
- Live check pending: after deploy, Atrium polls for scan 02a87265 must return done.
