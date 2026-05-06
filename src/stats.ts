import type { ChatMessage, ChatSummary, ParsedBackup, ParticipantStats, WrappedStats } from "./types";

const maxResponseGapMs = 16 * 60 * 60 * 1000;
const rollingWindowDays = 365;

export function calculateWrappedStats(backup: ParsedBackup | null, selfAliases: Set<string>, now = Date.now()): WrappedStats {
  const windowStartMs = backup?.windowStartMs ?? now - rollingWindowDays * 24 * 60 * 60 * 1000;
  const windowEndMs = backup?.windowEndMs ?? now;
  const messages = (backup?.messages ?? []).slice().sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
  const participantStats = new Map<string, ParticipantStats>();
  const daily = new Map<string, number>();
  const hourly = new Map<number, number>();
  let longestMessage: ChatMessage | null = null;

  const stats: WrappedStats = {
    generatedAtMs: now,
    windowStartMs,
    windowEndMs,
    chats: backup?.threads.length ?? 0,
    skippedMessages: backup?.skippedMessages ?? 0,
    messages: messages.length,
    yourMessages: 0,
    othersMessages: 0,
    systemMessages: 0,
    words: 0,
    yourWords: 0,
    othersWords: 0,
    textMessages: 0,
    photos: 0,
    videos: 0,
    audio: 0,
    files: 0,
    gifs: 0,
    shares: 0,
    reels: 0,
    yourReels: 0,
    othersReels: 0,
    calls: 0,
    totalCallSeconds: 0,
    reactions: 0,
    activeDays: 0,
    averageMessagesPerActiveDay: 0,
    averageReelsPerDay: 0,
    yourAverageResponseMs: null,
    othersAverageResponseMs: null,
    busiestDay: null,
    busiestHour: null,
    longestMessage: null,
    firstMessageMs: messages[0]?.timestampMs ?? null,
    lastMessageMs: messages[messages.length - 1]?.timestampMs ?? null,
    participantStats: [],
    chatSummaries: getChatSummaries(backup),
    dailyActivity: [],
    hourlyActivity: [],
  };

  for (const message of messages) {
    if (message.timestampMs !== null) {
      const date = new Date(message.timestampMs);
      const day = formatDayKey(date);
      daily.set(day, (daily.get(day) ?? 0) + 1);
      hourly.set(date.getHours(), (hourly.get(date.getHours()) ?? 0) + 1);
    }

    stats.reactions += message.reactions.length;
    if (message.shareUrl) stats.shares += 1;
    if (message.isReel) stats.reels += 1;
    if (message.callDurationSeconds !== null) {
      stats.calls += 1;
      stats.totalCallSeconds += message.callDurationSeconds;
    }

    for (const attachment of message.attachments) {
      if (attachment.kind === "image") stats.photos += 1;
      else if (attachment.kind === "video") stats.videos += 1;
      else if (attachment.kind === "audio") stats.audio += 1;
      else if (attachment.kind === "gif") stats.gifs += 1;
      else stats.files += 1;
    }

    if (message.isSystem || !message.sender) {
      stats.systemMessages += 1;
      continue;
    }

    const participant = getParticipantBucket(participantStats, message.sender);
    const words = countWords(cleanText(message.text));
    const isSelf = selfAliases.has(message.sender);

    participant.messages += 1;
    participant.words += words;
    participant.media += message.attachments.length;
    participant.reels += message.isReel ? 1 : 0;
    participant.reactionsReceived += message.reactions.length;
    participant.calls += message.callDurationSeconds !== null ? 1 : 0;

    for (const reaction of message.reactions) {
      if (!reaction.actor) continue;
      const reactor = getParticipantBucket(participantStats, reaction.actor);
      reactor.reactionsGiven += 1;
    }

    stats.words += words;
    stats.textMessages += cleanText(message.text) ? 1 : 0;

    if (isSelf) {
      stats.yourMessages += 1;
      stats.yourWords += words;
      if (message.isReel) stats.yourReels += 1;
    } else {
      stats.othersMessages += 1;
      stats.othersWords += words;
      if (message.isReel) stats.othersReels += 1;
    }

    if (!longestMessage || cleanText(message.text).length > cleanText(longestMessage.text).length) {
      longestMessage = message;
    }
  }

  addResponseTimes(messages, participantStats);

  const dailyActivity = Array.from(daily.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hourly.get(hour) ?? 0 }));
  const selfResponse = summarizeResponseTimes([...participantStats.values()].filter((participant) => selfAliases.has(participant.name)));
  const othersResponse = summarizeResponseTimes([...participantStats.values()].filter((participant) => !selfAliases.has(participant.name)));

  stats.activeDays = daily.size;
  stats.averageMessagesPerActiveDay = daily.size ? Math.round(messages.length / daily.size) : 0;
  stats.averageReelsPerDay = roundTo(stats.reels / rollingWindowDays, 2);
  stats.yourAverageResponseMs = selfResponse;
  stats.othersAverageResponseMs = othersResponse;
  stats.busiestDay = [...dailyActivity].sort((a, b) => b.count - a.count)[0] ?? null;
  stats.busiestHour = [...hourlyActivity].sort((a, b) => b.count - a.count)[0] ?? null;
  stats.longestMessage = longestMessage;
  stats.participantStats = Array.from(participantStats.values()).sort((a, b) => b.messages - a.messages || b.words - a.words);
  stats.dailyActivity = dailyActivity;
  stats.hourlyActivity = hourlyActivity;

  return stats;
}

export function pickLikelySelf(backup: ParsedBackup): string | null {
  const counts = new Map<string, number>();
  for (const message of backup.messages) {
    if (!message.sender || message.isSystem) continue;
    counts.set(message.sender, (counts.get(message.sender) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function getChatSummaries(backup: ParsedBackup | null): ChatSummary[] {
  return (backup?.threads ?? [])
    .map((thread) => {
      const timestamps = thread.messages
        .map((message) => message.timestampMs)
        .filter((timestamp): timestamp is number => timestamp !== null)
        .sort((a, b) => a - b);
      return {
        id: thread.id,
        title: thread.title,
        messages: thread.messages.length,
        participants: thread.participants,
        media: thread.messages.reduce((sum, message) => sum + message.attachments.length, 0),
        reels: thread.messages.filter((message) => message.isReel).length,
        reactions: thread.messages.reduce((sum, message) => sum + message.reactions.length, 0),
        firstMessageMs: timestamps[0] ?? null,
        lastMessageMs: timestamps[timestamps.length - 1] ?? null,
      };
    })
    .sort((a, b) => b.messages - a.messages);
}

function addResponseTimes(messages: ChatMessage[], byParticipant: Map<string, ParticipantStats>) {
  let previous: ChatMessage | null = null;

  for (const message of messages) {
    if (message.isSystem || !message.sender || message.timestampMs === null) continue;
    if (previous?.sender && previous.timestampMs !== null && previous.sender !== message.sender) {
      const responseMs = message.timestampMs - previous.timestampMs;
      const bucket = byParticipant.get(message.sender);
      if (bucket && responseMs >= 0 && responseMs <= maxResponseGapMs) {
        bucket.responseCount += 1;
        bucket.totalResponseMs += responseMs;
        bucket.averageResponseMs = Math.round(bucket.totalResponseMs / bucket.responseCount);
      }
    }
    previous = message;
  }
}

function summarizeResponseTimes(participants: ParticipantStats[]) {
  const responseCount = participants.reduce((sum, participant) => sum + participant.responseCount, 0);
  if (!responseCount) return null;
  const responseMs = participants.reduce((sum, participant) => sum + participant.totalResponseMs, 0);
  return Math.round(responseMs / responseCount);
}

function getParticipantBucket(map: Map<string, ParticipantStats>, name: string) {
  const existing = map.get(name);
  if (existing) return existing;
  const created: ParticipantStats = {
    name,
    messages: 0,
    words: 0,
    media: 0,
    reels: 0,
    reactionsGiven: 0,
    reactionsReceived: 0,
    calls: 0,
    responseCount: 0,
    totalResponseMs: 0,
    averageResponseMs: null,
  };
  map.set(name, created);
  return created;
}

function countWords(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:[''][\p{L}\p{N}]+)?/gu)?.length ?? 0;
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function formatDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function roundTo(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
