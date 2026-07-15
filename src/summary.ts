import type { ParsedBackup, WrappedStats } from "./types";

export function createWrappedSummary(backup: ParsedBackup, stats: WrappedStats, selfAliases: Set<string>) {
  return {
    schemaVersion: 1,
    generatedAt: new Date(stats.generatedAtMs).toISOString(),
    sourceStem: getSafeSourceStem(backup.sourceName),
    selfAliases: [...selfAliases].sort((a, b) => a.localeCompare(b)),
    analysisWindow: {
      start: new Date(stats.windowStartMs).toISOString(),
      end: new Date(stats.windowEndMs).toISOString(),
    },
    totals: {
      chats: stats.chats,
      messages: stats.messages,
      yourMessages: stats.yourMessages,
      othersMessages: stats.othersMessages,
      systemMessages: stats.systemMessages,
      words: stats.words,
      yourWords: stats.yourWords,
      othersWords: stats.othersWords,
      textMessages: stats.textMessages,
      activeDays: stats.activeDays,
      averageMessagesPerActiveDay: stats.averageMessagesPerActiveDay,
    },
    media: {
      photos: stats.photos,
      videos: stats.videos,
      audio: stats.audio,
      files: stats.files,
      gifs: stats.gifs,
      shares: stats.shares,
      reels: stats.reels,
      yourReels: stats.yourReels,
      othersReels: stats.othersReels,
      averageReelsPerDay: stats.averageReelsPerDay,
      reactions: stats.reactions,
    },
    calls: {
      count: stats.calls,
      totalDurationSeconds: stats.totalCallSeconds,
    },
    responseTimes: {
      yourAverageMs: stats.yourAverageResponseMs,
      othersAverageMs: stats.othersAverageResponseMs,
    },
    busiest: {
      day: stats.busiestDay,
      hour: stats.busiestHour,
    },
    topChats: stats.chatSummaries.slice(0, 12).map((chat) => ({
      title: chat.title,
      messages: chat.messages,
      participants: chat.participants,
      media: chat.media,
      reels: chat.reels,
      reactions: chat.reactions,
      firstMessageAt: toIsoString(chat.firstMessageMs),
      lastMessageAt: toIsoString(chat.lastMessageMs),
    })),
    topParticipants: stats.participantStats.slice(0, 10).map((participant) => ({
      name: participant.name,
      messages: participant.messages,
      words: participant.words,
      media: participant.media,
      reels: participant.reels,
      reactionsGiven: participant.reactionsGiven,
      reactionsReceived: participant.reactionsReceived,
      calls: participant.calls,
      responseCount: participant.responseCount,
      averageResponseMs: participant.averageResponseMs,
    })),
  };
}

export function getSummaryFilename(sourceName: string, generatedAtMs: number) {
  const date = new Date(generatedAtMs).toISOString().slice(0, 10);
  return `instagram-wrapped-${getSafeSourceStem(sourceName)}-${date}.json`;
}

function getSafeSourceStem(sourceName: string) {
  const withoutExtension = sourceName.replace(/\.[^.]+$/, "");
  return (
    withoutExtension
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "instagram-export"
  );
}

function toIsoString(timestampMs: number | null) {
  return timestampMs === null ? null : new Date(timestampMs).toISOString();
}
