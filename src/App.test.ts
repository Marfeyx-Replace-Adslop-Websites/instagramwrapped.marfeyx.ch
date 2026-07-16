import { describe, expect, it } from "vitest";

import { filterAliasesForParticipants } from "./App";

describe("alias cleanup", () => {
  it("keeps the same Set instance when no aliases need cleanup", () => {
    const aliases = new Set(["Alice"]);

    const filtered = filterAliasesForParticipants(aliases, ["Alice", "Bob"]);

    expect(filtered).toBe(aliases);
    expect([...filtered]).toEqual(["Alice"]);
  });

  it("keeps an empty alias Set stable with no backup participants", () => {
    const aliases = new Set<string>();

    const filtered = filterAliasesForParticipants(aliases, []);

    expect(filtered).toBe(aliases);
    expect([...filtered]).toEqual([]);
  });

  it("removes aliases that are no longer present", () => {
    const aliases = new Set(["Alice", "Old Name"]);

    const filtered = filterAliasesForParticipants(aliases, ["Alice", "Bob"]);

    expect(filtered).not.toBe(aliases);
    expect([...filtered]).toEqual(["Alice"]);
  });
});
