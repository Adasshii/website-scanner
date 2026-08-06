import { describe, expect, it } from "vitest";
import { NdjsonLineSplitter } from "@/lib/pipeline-run";

// The line splitter that turns a chunked byte stream (spawned child
// process stdout/stderr) into whole NDJSON lines. Server-side counterpart
// to the client's own newline-splitting in usePipelineRun — this one has
// to survive an object being split mid-write across two `data` events,
// which a naive one-shot `.split("\n")` on each chunk would corrupt.
describe("NdjsonLineSplitter", () => {
  it("yields every line exactly once when a payload arrives in one chunk", () => {
    const splitter = new NdjsonLineSplitter();
    const payload = '{"t":"start","total":3}\n{"t":"progress","done":1,"total":3}\n';
    const lines = splitter.push(payload);
    expect(lines).toEqual([
      '{"t":"start","total":3}',
      '{"t":"progress","done":1,"total":3}',
    ]);
    expect(splitter.flush()).toEqual([]);
  });

  it("yields identical lines when the same payload is split mid-JSON-object across two chunks", () => {
    const fullPayload = '{"t":"result","mode":"triage","result":{"triaged":5}}\n';
    const splitPoint = 20; // lands inside the JSON object, not on a newline

    const wholeSplitter = new NdjsonLineSplitter();
    const wholeLines = wholeSplitter.push(fullPayload);

    const chunkedSplitter = new NdjsonLineSplitter();
    const first = chunkedSplitter.push(fullPayload.slice(0, splitPoint));
    const second = chunkedSplitter.push(fullPayload.slice(splitPoint));

    // No object is ever emitted half-parsed: the first push (mid-object)
    // yields nothing, and the combined lines from both pushes equal the
    // single-chunk case exactly.
    expect(first).toEqual([]);
    expect([...first, ...second]).toEqual(wholeLines);
  });

  it("flushes a trailing fragment with no newline exactly once at stream end", () => {
    const splitter = new NdjsonLineSplitter();
    const trailing = '{"t":"exit","code":0}'; // no trailing \n — stream just ended

    expect(splitter.push(trailing)).toEqual([]);
    expect(splitter.flush()).toEqual([trailing]);
    // Not duplicated: a second flush after the first yields nothing more.
    expect(splitter.flush()).toEqual([]);
  });

  it("passes a non-JSON line through untouched for the client to classify", () => {
    const splitter = new NdjsonLineSplitter();
    const humanLogLine = "[triage-prospects] 5 triaged, 3 clear the cutoff, 1 unreachable\n";
    const lines = splitter.push(humanLogLine);
    expect(lines).toEqual([
      "[triage-prospects] 5 triaged, 3 clear the cutoff, 1 unreachable",
    ]);
  });
});
