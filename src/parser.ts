import JSZip from "jszip";
import type { AttachmentKind, AttachmentSummary, ChatMessage, ParsedBackup, ParsedThread, ReactionSummary } from "./types";

type InstagramMessageFile = {
  participants?: Array<{ name?: string }>;
  messages?: InstagramMessage[];
  title?: string;
  thread_path?: string;
};

type InstagramMessage = {
  sender_name?: string;
  timestamp_ms?: number;
  content?: string;
  photos?: InstagramMedia[];
  videos?: InstagramMedia[];
  audio_files?: InstagramMedia[];
  files?: InstagramMedia[];
  gifs?: InstagramMedia[];
  reactions?: Array<{
    actor?: string;
    reaction?: string;
    sticker_reaction?: string;
    timestamp?: number;
  }>;
  share?: {
    link?: string;
    share_text?: string;
    original_content_owner?: string;
    profile_share_name?: string;
    profile_share_username?: string;
  };
  call_duration?: number;
};

type InstagramMedia = {
  uri?: string;
  creation_timestamp?: number;
};

const messagePathPattern =
  /^your_instagram_activity\/messages\/(?:inbox|archived_threads|filtered_threads|message_requests)\/([^/]+)\/message_\d+\.json$/i;

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".heic", ".bmp"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".3gp", ".avi", ".webm"]);
const audioExtensions = new Set([".opus", ".ogg", ".mp3", ".m4a", ".aac", ".wav", ".amr"]);

export async function parseInstagramBackup(file: File, now = Date.now()): Promise<ParsedBackup> {
  const windowEndMs = now;
  const windowStartMs = now - 365 * 24 * 60 * 60 * 1000;
  const errors: string[] = [];
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const messageEntries = entries
    .filter((entry) => messagePathPattern.test(normalizePath(entry.name)))
    .sort((a, b) => normalizePath(a.name).localeCompare(normalizePath(b.name), undefined, { numeric: true }));

  if (!messageEntries.length) {
    throw new Error("No Instagram message JSON files were found in this ZIP.");
  }

  const filesByThreadPath = new Map<string, InstagramMessageFile[]>();

  for (const entry of messageEntries) {
    try {
      const parsed = JSON.parse(await entry.async("string")) as InstagramMessageFile;
      const threadPath = normalizePath(parsed.thread_path || getThreadPath(entry.name));
      const files = filesByThreadPath.get(threadPath) ?? [];
      files.push(parsed);
      filesByThreadPath.set(threadPath, files);
    } catch {
      errors.push(`Skipped unreadable message file: ${entry.name}`);
    }
  }

  const threads = Array.from(filesByThreadPath.entries()).map(([threadPath, files], index) =>
    parseThread(threadPath, files, index, windowStartMs, windowEndMs),
  );
  const sortedThreads = threads
    .filter((thread) => thread.includedMessages > 0)
    .sort((a, b) => newestTimestamp(b) - newestTimestamp(a) || b.messages.length - a.messages.length);
  const messages = sortedThreads.flatMap((thread) => thread.messages);
  const participants = Array.from(new Set(sortedThreads.flatMap((thread) => thread.participants))).sort((a, b) =>
    a.localeCompare(b),
  );
  const totalMessages = threads.reduce((sum, thread) => sum + thread.totalMessages, 0);

  return {
    sourceName: file.name,
    importedAtMs: Date.now(),
    windowStartMs,
    windowEndMs,
    threads: sortedThreads,
    participants,
    messages,
    skippedMessages: totalMessages - messages.length,
    errors,
  };
}

function parseThread(
  threadPath: string,
  files: InstagramMessageFile[],
  index: number,
  windowStartMs: number,
  windowEndMs: number,
): ParsedThread {
  const participants = Array.from(
    new Set(files.flatMap((file) => file.participants ?? []).map((participant) => fixInstagramText(participant.name ?? ""))),
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const rawMessages = files.flatMap((file) => file.messages ?? []);
  const allMessages = rawMessages
    .map((message, messageIndex) => buildMessage(message, threadPath, messageIndex))
    .sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
  const messages = dedupeThreadMessages(allMessages).filter(
    (message) => message.timestampMs !== null && message.timestampMs >= windowStartMs && message.timestampMs <= windowEndMs,
  );
  const fallbackTitle = participants.join(", ") || `Thread ${index + 1}`;
  const title = fixInstagramText(files.find((file) => file.title)?.title ?? fallbackTitle);

  return {
    id: threadPath || `thread-${index + 1}`,
    title,
    participants,
    messages: messages.map((message) => ({ ...message, threadTitle: title })),
    totalMessages: rawMessages.length,
    includedMessages: messages.length,
  };
}

function buildMessage(message: InstagramMessage, threadPath: string, index: number): ChatMessage {
  const timestampMs = typeof message.timestamp_ms === "number" ? message.timestamp_ms : null;
  const shareText = formatShareText(message.share);
  const textParts = [fixInstagramText(message.content ?? ""), shareText, formatCallText(message.call_duration)].filter(Boolean);
  const shareUrl = message.share?.link ? fixInstagramText(message.share.link) : undefined;
  const attachments = [
    ...toAttachments(message.photos, "image"),
    ...toAttachments(message.videos, "video"),
    ...toAttachments(message.audio_files, "audio"),
    ...toAttachments(message.files, "document"),
    ...toAttachments(message.gifs, "gif"),
  ];

  return {
    id: `${threadPath}-${timestampMs ?? "unknown"}-${index}`,
    threadId: threadPath,
    threadTitle: "",
    timestampMs,
    sender: message.sender_name ? fixInstagramText(message.sender_name) : null,
    text: textParts.join("\n"),
    isSystem: !message.sender_name,
    attachments,
    reactions: parseReactions(message.reactions),
    shareUrl,
    isReel: isReelShare(shareUrl, shareText),
    callDurationSeconds: typeof message.call_duration === "number" ? Math.max(0, message.call_duration) : null,
  };
}

function toAttachments(media: InstagramMedia[] | undefined, fallbackKind: AttachmentKind): AttachmentSummary[] {
  return (media ?? [])
    .map((item) => normalizePath(item.uri ?? ""))
    .filter(Boolean)
    .map((path) => ({ path, kind: getAttachmentKind(path, fallbackKind) }));
}

function parseReactions(reactions?: InstagramMessage["reactions"]): ReactionSummary[] {
  return (reactions ?? []).map((reaction) => ({
    actor: fixInstagramText(reaction.actor ?? ""),
    reaction: fixInstagramText(reaction.reaction || reaction.sticker_reaction || ""),
    timestampMs: typeof reaction.timestamp === "number" ? reaction.timestamp * 1000 : null,
  }));
}

function formatShareText(share?: InstagramMessage["share"]): string {
  if (!share) return "";
  return [share.share_text, share.profile_share_name, share.profile_share_username, share.original_content_owner, share.link]
    .map((part) => fixInstagramText(part ?? ""))
    .filter(Boolean)
    .join("\n");
}

function formatCallText(callDuration?: number): string {
  if (typeof callDuration !== "number") return "";
  if (callDuration <= 0) return "Call ended";
  const minutes = Math.floor(callDuration / 60);
  const seconds = callDuration % 60;
  return `Call duration ${minutes}:${String(seconds).padStart(2, "0")}`;
}

function dedupeThreadMessages(messages: ChatMessage[]) {
  const seen = new Set<string>();
  const unique: ChatMessage[] = [];

  for (const message of messages) {
    const key = [
      message.timestampMs ?? "none",
      message.sender ?? "system",
      cleanText(message.text),
      message.shareUrl ?? "",
      message.attachments.map((attachment) => attachment.path).join(","),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(message);
  }

  return unique;
}

function isReelShare(link = "", text = "") {
  const value = `${link}\n${text}`.toLowerCase();
  return /instagram\.com\/(?:reel|reels)\//i.test(value) || /\/(?:reel|reels)\//i.test(value);
}

function newestTimestamp(thread: ParsedThread): number {
  return Math.max(...thread.messages.map((message) => message.timestampMs ?? 0), 0);
}

function getThreadPath(path: string): string {
  const normalized = normalizePath(path);
  return normalized.includes("/message_") ? normalized.slice(0, normalized.indexOf("/message_")) : normalized;
}

function getAttachmentKind(path: string, fallbackKind: AttachmentKind): AttachmentKind {
  const extension = getExtension(path);
  if (fallbackKind === "gif" || extension === ".gif") return "gif";
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  if (audioExtensions.has(extension)) return "audio";
  return fallbackKind;
}

function getExtension(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function fixInstagramText(value: string): string {
  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}
