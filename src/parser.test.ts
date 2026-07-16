import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { parseInstagramBackup } from "./parser";

const dayMs = 24 * 60 * 60 * 1000;
const messageRoot = "your_instagram_activity/messages/inbox/synthetic-thread";

async function archive(entries: Record<string, string>, name = "synthetic-export.zip") {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return Object.assign(bytes, { name }) as unknown as File;
}

function messageFile(messages: unknown[], overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    participants: [{ name: "Alice" }, { name: "Bob" }],
    title: "Synthetic thread",
    thread_path: messageRoot,
    messages,
    ...overrides,
  });
}

describe("parseInstagramBackup", () => {
  it("combines message files, reports malformed JSON, deduplicates, and enforces rolling-window boundaries", async () => {
    const now = 400 * dayMs;
    const windowStart = now - 365 * dayMs;
    const duplicate = { sender_name: "Alice", timestamp_ms: windowStart, content: "Boundary message" };
    const file = await archive({
      [`${messageRoot}/message_1.json`]: messageFile([
        duplicate,
        { sender_name: "Bob", timestamp_ms: windowStart - 1, content: "Too old" },
      ]),
      [`${messageRoot}/message_2.json`]: messageFile([
        duplicate,
        { sender_name: "Bob", timestamp_ms: now, content: "End boundary" },
        { sender_name: "Bob", timestamp_ms: now + 1, content: "From the future" },
      ]),
      [`${messageRoot}/message_3.json`]: "{not valid JSON",
    });

    const parsed = await parseInstagramBackup(file, now);

    expect(parsed.errors).toEqual([`Skipped unreadable message file: ${messageRoot}/message_3.json`]);
    expect(parsed.threads).toHaveLength(1);
    expect(parsed.messages.map((item) => item.text)).toEqual(["Boundary message", "End boundary"]);
    expect(parsed.messages.map((item) => item.timestampMs)).toEqual([windowStart, now]);
    expect(parsed.skippedMessages).toBe(3);
  });

  it("classifies media and reels and decodes Instagram text", async () => {
    const now = 400 * dayMs;
    const file = await archive({
      [`${messageRoot}/message_1.json`]: messageFile(
        [
          {
            sender_name: "Jos\u00c3\u00a9",
            timestamp_ms: now - dayMs,
            content: "Ol\u00c3\u00a1",
            photos: [{ uri: "media/video.mp4" }],
            videos: [{ uri: "media/photo.jpg" }],
            audio_files: [{ uri: "media/voice.ogg" }],
            files: [{ uri: "media/document.pdf" }],
            gifs: [{ uri: "media/animation.gif" }],
            share: { link: "https://www.instagram.com/reel/synthetic/" },
          },
        ],
        {
          participants: [{ name: "Jos\u00c3\u00a9" }, { name: "Bob" }],
          title: "Caf\u00c3\u00a9",
        },
      ),
    });

    const parsed = await parseInstagramBackup(file, now);
    const parsedMessage = parsed.messages[0];

    expect(parsed.threads[0]?.title).toBe("Caf\u00e9");
    expect(parsed.participants).toEqual(["Bob", "Jos\u00e9"]);
    expect(parsedMessage?.sender).toBe("Jos\u00e9");
    expect(parsedMessage?.text).toContain("Ol\u00e1");
    expect(parsedMessage?.isReel).toBe(true);
    expect(parsedMessage?.attachments.map(({ kind }) => kind)).toEqual(["video", "image", "audio", "document", "gif"]);
  });
});
