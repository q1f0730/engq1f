import { describe, expect, it } from "vitest";
import { pickExamples } from "./examples";

const api = [
  {
    word: "absorb",
    meanings: [
      {
        partOfSpeech: "verb",
        definitions: [
          { definition: "To include so that it no longer has separate existence.", example: "The company absorbed its smaller rival." },
          { definition: "To suck up or drink in.", example: "A sponge absorbs water." },
          { definition: "x" },
          { definition: "dup", example: "A sponge absorbs   water." },
          { definition: "too short", example: "Hi." },
        ],
      },
      { partOfSpeech: "noun", definitions: [{ definition: "unrelated", example: "Something without the headword at all here." }] },
    ],
  },
];

describe("pickExamples", () => {
  it("keeps at most 2, deduped, containing the word, shortest first", () => {
    expect(pickExamples("absorb", api)).toEqual(["A sponge absorbs water.", "The company absorbed its smaller rival."]);
  });
  it("handles odd payloads", () => {
    expect(pickExamples("x", { title: "No Definitions Found" })).toEqual([]);
    expect(pickExamples("x", null)).toEqual([]);
    expect(pickExamples("x", [{ meanings: [{ definitions: [{ example: 3 }] }] }])).toEqual([]);
  });
});
