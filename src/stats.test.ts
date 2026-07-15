import { describe, expect, it } from "vitest";

import { calculateWrappedStats } from "./stats";
import type { ChatMessage, ParsedBackup } from "./types";

const hourMs = 60 * 60 * 1000;

function message(threadId: string, sender: string | null, timestampMs: number, isSystem = false): ChatMessage {
  return {
    id: `${threadId}-${sender ?? "unsent"}-${timestampMs}`,
    threadId,
    threadTitle: threadId,
    timestampMs,
    sender,
    text: "synthetic message",
    isSystem,
    attachments: [],
    reactions: [],
    isReel: false,
    callDurationSeconds: null,
  };
}

function backup(messages: ChatMessage[]): ParsedBackup {
  return {
    sourceName: "synthetic.zip",
    importedAtMs: 0,
    windowStartMs: 0,
    windowEndMs: 20 * hourMs,
    threads: [],
    participants: [...new Set(messages.flatMap((item) => (item.sender ? [item.sender] : [])))],
    messages,
    skippedMessages: 0,
    errors: [],
  };
}

describe("response-time statistics", () => {
  it("does not treat adjacent messages from different threads as replies", () => {
    const stats = calculateWrappedStats(
      backup([message("thread-a", "Alice", 1_000), message("thread-b", "Bob", 2_000)]),
      new Set(["Alice"]),
      20 * hourMs,
    );

    expect(stats.yourAverageResponseMs).toBeNull();
    expect(stats.othersAverageResponseMs).toBeNull();
    expect(stats.participantStats.map(({ name, responseCount }) => ({ name, responseCount }))).toEqual([
      { name: "Alice", responseCount: 0 },
      { name: "Bob", responseCount: 0 },
    ]);
  });

  it("counts alternating senders within one thread", () => {
    const stats = calculateWrappedStats(
      backup([
        message("thread-a", "Alice", 1_000),
        message("thread-a", "Bob", 2_000),
        message("thread-a", "Alice", 4_000),
      ]),
      new Set(["Alice"]),
      20 * hourMs,
    );

    expect(stats.yourAverageResponseMs).toBe(2_000);
    expect(stats.othersAverageResponseMs).toBe(1_000);
  });

  it("calculates interleaved threads deterministically", () => {
    const input = [
      message("thread-a", "Alice", 1_000),
      message("thread-b", "Carol", 2_000),
      message("thread-a", "Bob", 4_000),
      message("thread-b", "Dave", 5_000),
    ];

    const chronological = calculateWrappedStats(backup(input), new Set(["Alice"]), 20 * hourMs);
    const shuffled = calculateWrappedStats(backup([...input].reverse()), new Set(["Alice"]), 20 * hourMs);

    const responses = (stats: typeof chronological) =>
      stats.participantStats.map(({ name, responseCount, averageResponseMs }) => ({ name, responseCount, averageResponseMs }));

    expect(responses(shuffled)).toEqual(responses(chronological));
    expect(responses(chronological)).toEqual([
      { name: "Alice", responseCount: 0, averageResponseMs: null },
      { name: "Carol", responseCount: 0, averageResponseMs: null },
      { name: "Bob", responseCount: 1, averageResponseMs: 3_000 },
      { name: "Dave", responseCount: 1, averageResponseMs: 3_000 },
    ]);
  });

  it("ignores system and unsent messages and excludes gaps over 16 hours", () => {
    const stats = calculateWrappedStats(
      backup([
        message("thread-a", "Alice", 1_000),
        message("thread-a", "Instagram User", 2_000, true),
        message("thread-a", null, 3_000),
        message("thread-a", "Bob", 16 * hourMs + 1_001),
      ]),
      new Set(["Alice"]),
      20 * hourMs,
    );

    expect(stats.yourAverageResponseMs).toBeNull();
    expect(stats.othersAverageResponseMs).toBeNull();
  });
});
