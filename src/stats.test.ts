import { describe, expect, it } from "vitest";

import { calculateWrappedStats } from "./stats";
import type { AttachmentSummary, ChatMessage, ParsedBackup, ReactionSummary } from "./types";

const hourMs = 60 * 60 * 1000;

function message(
  threadId: string,
  sender: string | null,
  timestampMs: number,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: `${threadId}-${sender ?? "unsent"}-${timestampMs}`,
    threadId,
    threadTitle: threadId,
    timestampMs,
    sender,
    text: "synthetic message",
    isSystem: false,
    attachments: [],
    reactions: [],
    isReel: false,
    callDurationSeconds: null,
    ...overrides,
  };
}

function attachment(kind: AttachmentSummary["kind"], path = `${kind}-asset`): AttachmentSummary {
  return { kind, path };
}

function reaction(actor: string, value = "liked"): ReactionSummary {
  return { actor, reaction: value, timestampMs: null };
}

function backup(messages: ChatMessage[], threads: ParsedBackup["threads"] = []): ParsedBackup {
  return {
    sourceName: "synthetic.zip",
    importedAtMs: 0,
    windowStartMs: 0,
    windowEndMs: 20 * hourMs,
    threads,
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
        message("thread-a", "Instagram User", 2_000, { isSystem: true }),
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

describe("wrapped statistics totals", () => {
  it("counts self aliases, participant buckets, media, reels, calls, shares, and reactions", () => {
    const messages = [
      message("thread-a", "Alice", 1_000, {
        text: "one two three",
        attachments: [attachment("image", "photo.jpg"), attachment("video", "clip.mp4")],
        isReel: true,
        shareUrl: "https://www.instagram.com/reel/synthetic/",
        reactions: [reaction("Bob")],
      }),
      message("thread-a", "Alicia", 2_000, {
        text: "alias message",
        attachments: [attachment("audio", "voice.ogg"), attachment("document", "file.pdf"), attachment("gif", "loop.gif")],
        callDurationSeconds: 90,
      }),
      message("thread-a", "Bob", 3_000, {
        text: "other reply",
        isReel: true,
        reactions: [reaction("Alice"), reaction("Alicia", "laughed")],
      }),
    ];

    const stats = calculateWrappedStats(backup(messages), new Set(["Alice", "Alicia"]), 20 * hourMs);

    expect(stats.messages).toBe(3);
    expect(stats.yourMessages).toBe(2);
    expect(stats.othersMessages).toBe(1);
    expect(stats.words).toBe(7);
    expect(stats.yourWords).toBe(5);
    expect(stats.othersWords).toBe(2);
    expect(stats.photos).toBe(1);
    expect(stats.videos).toBe(1);
    expect(stats.audio).toBe(1);
    expect(stats.files).toBe(1);
    expect(stats.gifs).toBe(1);
    expect(stats.shares).toBe(1);
    expect(stats.reels).toBe(2);
    expect(stats.yourReels).toBe(1);
    expect(stats.othersReels).toBe(1);
    expect(stats.calls).toBe(1);
    expect(stats.totalCallSeconds).toBe(90);
    expect(stats.reactions).toBe(3);
    expect(Object.fromEntries(stats.participantStats.map(({ name, messages: count, reactionsGiven, reactionsReceived }) => [
      name,
      { messages: count, reactionsGiven, reactionsReceived },
    ]))).toEqual({
      Alice: { messages: 1, reactionsGiven: 1, reactionsReceived: 1 },
      Alicia: { messages: 1, reactionsGiven: 1, reactionsReceived: 0 },
      Bob: { messages: 1, reactionsGiven: 1, reactionsReceived: 2 },
    });
  });

  it("returns stable zero values for null and empty imports", () => {
    const withoutBackup = calculateWrappedStats(null, new Set(["Alice"]), 20 * hourMs);
    const emptyBackup = calculateWrappedStats(backup([]), new Set(["Alice"]), 20 * hourMs);

    for (const stats of [withoutBackup, emptyBackup]) {
      expect(stats.chats).toBe(0);
      expect(stats.messages).toBe(0);
      expect(stats.yourMessages).toBe(0);
      expect(stats.othersMessages).toBe(0);
      expect(stats.systemMessages).toBe(0);
      expect(stats.photos).toBe(0);
      expect(stats.reels).toBe(0);
      expect(stats.yourAverageResponseMs).toBeNull();
      expect(stats.othersAverageResponseMs).toBeNull();
      expect(stats.busiestDay).toBeNull();
      expect(stats.longestMessage).toBeNull();
      expect(stats.participantStats).toEqual([]);
      expect(stats.dailyActivity).toEqual([]);
      expect(stats.hourlyActivity).toHaveLength(24);
    }
  });
});
