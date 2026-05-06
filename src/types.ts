export type AttachmentKind = "image" | "video" | "audio" | "document" | "gif" | "unknown";

export type AttachmentSummary = {
  kind: AttachmentKind;
  path: string;
  size?: number;
};

export type ReactionSummary = {
  actor: string;
  reaction: string;
  timestampMs: number | null;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  threadTitle: string;
  timestampMs: number | null;
  sender: string | null;
  text: string;
  isSystem: boolean;
  attachments: AttachmentSummary[];
  reactions: ReactionSummary[];
  shareUrl?: string;
  isReel: boolean;
  callDurationSeconds: number | null;
};

export type ParsedThread = {
  id: string;
  title: string;
  participants: string[];
  messages: ChatMessage[];
  totalMessages: number;
  includedMessages: number;
};

export type ParsedBackup = {
  sourceName: string;
  importedAtMs: number;
  windowStartMs: number;
  windowEndMs: number;
  threads: ParsedThread[];
  participants: string[];
  messages: ChatMessage[];
  skippedMessages: number;
  errors: string[];
};

export type ParticipantStats = {
  name: string;
  messages: number;
  words: number;
  media: number;
  reels: number;
  reactionsGiven: number;
  reactionsReceived: number;
  calls: number;
  responseCount: number;
  totalResponseMs: number;
  averageResponseMs: number | null;
};

export type ChatSummary = {
  id: string;
  title: string;
  messages: number;
  participants: string[];
  media: number;
  reels: number;
  reactions: number;
  firstMessageMs: number | null;
  lastMessageMs: number | null;
};

export type WrappedStats = {
  generatedAtMs: number;
  windowStartMs: number;
  windowEndMs: number;
  chats: number;
  skippedMessages: number;
  messages: number;
  yourMessages: number;
  othersMessages: number;
  systemMessages: number;
  words: number;
  yourWords: number;
  othersWords: number;
  textMessages: number;
  photos: number;
  videos: number;
  audio: number;
  files: number;
  gifs: number;
  shares: number;
  reels: number;
  yourReels: number;
  othersReels: number;
  calls: number;
  totalCallSeconds: number;
  reactions: number;
  activeDays: number;
  averageMessagesPerActiveDay: number;
  averageReelsPerDay: number;
  yourAverageResponseMs: number | null;
  othersAverageResponseMs: number | null;
  busiestDay: { label: string; count: number } | null;
  busiestHour: { hour: number; count: number } | null;
  longestMessage: ChatMessage | null;
  firstMessageMs: number | null;
  lastMessageMs: number | null;
  participantStats: ParticipantStats[];
  chatSummaries: ChatSummary[];
  dailyActivity: Array<{ label: string; count: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
};

export type WorkerRequest = {
  id: string;
  file: File;
};

export type WorkerResponse =
  | { id: string; ok: true; backup: ParsedBackup }
  | { id: string; ok: false; error: string };
