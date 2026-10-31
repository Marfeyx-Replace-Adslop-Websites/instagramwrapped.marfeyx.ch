import { MarfeyxImport } from "./brand/MarfeyxImport";
import { MarfeyxBrand } from "./brand/MarfeyxBrand";
import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { calculateWrappedStats, pickLikelySelf } from "./stats";
import { createWrappedSummary, getSummaryFilename } from "./summary";
import { ImportCancelledError, ImportWorkerSession } from "./importWorker";
import type { ParsedBackup, ParticipantStats, WrappedStats } from "./types";

const mobileBreakpoint = 860;
const emptyParticipants: string[] = [];

export default function App() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= mobileBreakpoint);
  const [backup, setBackup] = useState<ParsedBackup | null>(null);
  const [selfAliases, setSelfAliases] = useState<Set<string>>(() => new Set());
  const [importStatus, setImportStatus] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const workerSessionRef = useRef<ImportWorkerSession | null>(null);
  const importGenerationRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const participants = backup?.participants ?? emptyParticipants;
  const stats = useMemo(() => calculateWrappedStats(backup, selfAliases, Date.now()), [backup, selfAliases]);
  const hasAliases = selfAliases.size > 0;
  const windowLabel = `${formatDate(stats.windowStartMs)} - ${formatDate(stats.windowEndMs)}`;

  useEffect(() => {
    document.title = "Instagram Wrapped — Marfeyx";
    return () => {
      importGenerationRef.current += 1;
      const session = workerSessionRef.current;
      workerSessionRef.current = null;
      session?.cancel();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= mobileBreakpoint);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setSelfAliases((current) => filterAliasesForParticipants(current, participants));
  }, [participants]);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

        if (!file.name.toLowerCase().endsWith(".zip")) {
      setImportErrors(["Choose an Instagram export ZIP file."]);
      return;
    }

    setIsImporting(true);
    setImportStatus("Reading Instagram ZIP locally...");
    setImportErrors([]);
    const generation = ++importGenerationRef.current;

    try {
      const parsed = await parseWithWorker(file);
      if (generation !== importGenerationRef.current) return;
      const likelySelf = pickLikelySelf(parsed);
      setBackup(parsed);
      setSelfAliases(likelySelf ? new Set([likelySelf]) : new Set());
      setImportStatus(
        `Imported ${parsed.messages.length.toLocaleString()} messages from the last 365 days. ${parsed.skippedMessages.toLocaleString()} older messages skipped.`,
      );
      setImportErrors(parsed.errors);
    } catch (caught) {
      if (caught instanceof ImportCancelledError || generation !== importGenerationRef.current) return;
      setImportErrors([caught instanceof Error ? caught.message : "Could not parse this Instagram export."]);
      setImportStatus("");
    } finally {
      if (generation === importGenerationRef.current) setIsImporting(false);
    }
  }

  function parseWithWorker(file: File) {
    workerSessionRef.current ??= new ImportWorkerSession(
      () => new Worker(new URL("./statsWorker.ts", import.meta.url), { type: "module" }),
    );
    return workerSessionRef.current.parse(file);
  }



  function toggleAlias(name: string) {
    setSelfAliases((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function clearImportedData() {
    importGenerationRef.current += 1;
    const session = workerSessionRef.current;
    workerSessionRef.current = null;
    session?.cancel();
    setIsImporting(false);
    setBackup(null);
    setSelfAliases(new Set());
    setImportStatus("");
    setImportErrors([]);
  }

  function downloadSummary() {
    if (!backup) return;
    const summary = createWrappedSummary(backup, stats, selfAliases);
    const blob = new Blob([`${JSON.stringify(summary, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getSummaryFilename(backup.sourceName, stats.generatedAtMs);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }



  if (isMobile) return <DesktopOnly />;
  if (!backup) return <MarfeyxImport product="Instagram Wrapped" title="A year worth looking back on." description="Who you talked to. What you shared. When you were there. Find the patterns in a year of Instagram conversations." instruction="Request your Instagram export in JSON format. Choose the ZIP here, then select the names that represent you to see your personal report." inputRef={fileInputRef} onChange={handleFileChange} onBrowse={openFilePicker} busy={isImporting} status={importStatus} errors={importErrors} />;

  return (
    <main className="app-shell">
      <aside className="control-panel">
        <MarfeyxBrand product="Instagram Wrapped" />
        <div>
          <p className="eyebrow">Instagram Wrapped</p>
          <h1>A year worth looking back on.</h1>
          <p className="lede">Upload an Instagram export ZIP. Stats are calculated in this browser for {windowLabel}.</p>
        </div>



        <button className="file-drop" disabled={isImporting} onClick={openFilePicker}>
          <span className="file-icon">+</span>
          <strong>{isImporting ? "Importing locally..." : "Choose Instagram export ZIP"}</strong>
          <small>Nothing is uploaded or saved. Only the last 365 days are kept in memory.</small>
        </button>
        <input className="hidden-file-input" accept=".zip,application/zip" type="file" ref={fileInputRef} onChange={handleFileChange} />

        {importStatus && <div className="notice">{importStatus}</div>}
        {importErrors.slice(0, 4).map((error) => (
          <div className="error-message" key={error}>
            {error}
          </div>
        ))}

        <div className="summary-actions">
          <button className="primary-button" disabled={!backup} onClick={downloadSummary}>
            Download summary
          </button>
          <button className="text-button" disabled={!backup && !isImporting} onClick={clearImportedData}>
            Clear imported data
          </button>
        </div>

        <section className="panel-block">
          <h2>Identity</h2>
          <p className="muted">Mark every Instagram sender name that represents you.</p>
          <div className="alias-list">
            {participants.length ? (
              participants.map((participant) => (
                <label className="alias-pill" key={participant}>
                  <input checked={selfAliases.has(participant)} type="checkbox" onChange={() => toggleAlias(participant)} />
                  <span>{participant}</span>
                </label>
              ))
            ) : (
              <p className="empty">Upload an export to detect senders.</p>
            )}
          </div>
        </section>

        <section className="panel-block compact-stats">
          <MiniStat label="Chats" value={stats.chats} />
          <MiniStat label="Messages" value={stats.messages} />
          <MiniStat label="Active days" value={stats.activeDays} />
        </section>

        <footer className="site-footer">
          <a href="privacy.html">Privacy Policy</a>
          <a href="mailto:contact.marfeyx@gmail.com?subject=Instagram%20Wrapped%20Issue">Report issues</a>
        </footer>
      </aside>

      <section className="story-panel">
        <div className="story-header">
          <p className="eyebrow">Rolling 365 days</p>
          <h2>{stats.messages ? "Your Instagram Wrapped" : "Import chats to start"}</h2>
          <p>
            {stats.messages
              ? `${stats.messages.toLocaleString()} messages across ${stats.chats.toLocaleString()} chats.`
              : "The dashboard fills after your first successful import."}
          </p>
        </div>

        <div className="hero-metrics">
          <MetricCard label="Total messages" value={stats.messages} />
          <MetricCard label="Your messages" value={hasAliases ? stats.yourMessages : "Select identity"} />
          <MetricCard label="Reels per day" value={stats.averageReelsPerDay.toFixed(2)} />
          <MetricCard label="Avg response" value={formatDuration(stats.yourAverageResponseMs)} />
        </div>

        <LazySection className="wrapped-section" minHeight={260}>
          <SectionTitle eyebrow="Response" title="Who replied fastest" />
          <div className="split-grid">
            <Highlight label="You" value={formatDuration(stats.yourAverageResponseMs)} detail="Average response time" />
            <Highlight label="Others" value={formatDuration(stats.othersAverageResponseMs)} detail="Average response time" />
          </div>
          {!hasAliases && <div className="notice">Choose your identity on the left to split your stats from everyone else.</div>}
        </LazySection>

        <LazySection className="wrapped-section" minHeight={300}>
          <SectionTitle eyebrow="Media" title="What moved through your DMs" />
          <div className="media-grid">
            <MetricCard label="Reels" value={stats.reels} />
            <MetricCard label="Photos" value={stats.photos} />
            <MetricCard label="Videos" value={stats.videos} />
            <MetricCard label="Reactions" value={stats.reactions} />
          </div>
          <div className="split-grid">
            <Highlight label="Your reels" value={stats.yourReels.toLocaleString()} detail={`${stats.averageReelsPerDay.toFixed(2)} total reels/day`} />
            <Highlight label="Others' reels" value={stats.othersReels.toLocaleString()} detail={`${stats.shares.toLocaleString()} total shares`} />
          </div>
        </LazySection>

        <LazySection className="wrapped-section" minHeight={260}>
          <SectionTitle eyebrow="Pulse" title="When the chats came alive" />
          <div className="split-grid">
            <Highlight
              label="Busiest day"
              value={stats.busiestDay ? formatReadableDay(stats.busiestDay.label) : "None"}
              detail={`${stats.busiestDay?.count.toLocaleString() ?? "0"} messages`}
            />
            <Highlight
              label="Busiest hour"
              value={stats.busiestHour ? `${String(stats.busiestHour.hour).padStart(2, "0")}:00` : "None"}
              detail={`${stats.busiestHour?.count.toLocaleString() ?? "0"} messages`}
            />
          </div>
          <HourBars stats={stats} />
        </LazySection>

        <LazySection className="wrapped-section" minHeight={320}>
          <SectionTitle eyebrow="People" title="Who kept it going" />
          <ParticipantTable participants={stats.participantStats} />
        </LazySection>

        <LazySection className="wrapped-section" minHeight={240}>
          <SectionTitle eyebrow="Receipts" title="The longest message" />
          <div className="quote-card">
            <p>{stats.longestMessage ? trimText(stats.longestMessage.text, 260) : "No participant messages in the selected window."}</p>
            {stats.longestMessage && (
              <small>
                {stats.longestMessage.sender} in {stats.longestMessage.threadTitle}
              </small>
            )}
          </div>
        </LazySection>
      </section>

      <aside className="detail-panel">
        <section className="panel-block">
          <h2>Annual split</h2>
          <ProgressRow label="You" value={stats.yourMessages} total={Math.max(1, stats.yourMessages + stats.othersMessages)} />
          <ProgressRow label="Others" value={stats.othersMessages} total={Math.max(1, stats.yourMessages + stats.othersMessages)} />
          <ProgressRow label="System" value={stats.systemMessages} total={Math.max(1, stats.messages)} />
        </section>

        <section className="panel-block">
          <h2>More totals</h2>
          <DetailStat label="Words" value={stats.words.toLocaleString()} />
          <DetailStat label="Calls" value={`${stats.calls.toLocaleString()} · ${formatDuration(stats.totalCallSeconds * 1000)}`} />
          <DetailStat label="Audio" value={stats.audio.toLocaleString()} />
          <DetailStat label="Files and GIFs" value={(stats.files + stats.gifs).toLocaleString()} />
        </section>

        <section className="panel-block chat-list">
          <h2>Top chats</h2>
          {stats.chatSummaries.length ? (
            stats.chatSummaries.slice(0, 12).map((chat) => (
              <article className="chat-row" key={chat.id}>
                <strong>{chat.title}</strong>
                <span>
                  {chat.messages.toLocaleString()} messages · {chat.reels.toLocaleString()} reels
                </span>
                <small>{chat.participants.slice(0, 3).join(", ")}</small>
              </article>
            ))
          ) : (
            <p className="empty">No chats imported yet.</p>
          )}
        </section>
      </aside>


    </main>
  );
}

function LazySection({ children, className, minHeight }: { children: ReactNode; className: string; minHeight: number }) {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "260px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={className} ref={ref} style={{ minHeight }}>
      {isVisible ? children : <div className="section-skeleton" />}
    </section>
  );
}

function ParticipantTable({ participants }: { participants: ParticipantStats[] }) {
  const visible = participants.slice(0, 10);
  return (
    <div className="participant-table">
      {visible.length ? (
        visible.map((participant) => (
          <div className="participant-row" key={participant.name}>
            <strong>{participant.name}</strong>
            <span>{participant.messages.toLocaleString()} messages</span>
            <span>{participant.reels.toLocaleString()} reels</span>
            <span>{formatDuration(participant.averageResponseMs)}</span>
          </div>
        ))
      ) : (
        <p className="empty">No participant messages yet.</p>
      )}
    </div>
  );
}

function HourBars({ stats }: { stats: WrappedStats }) {
  const max = Math.max(...stats.hourlyActivity.map((item) => item.count), 1);
  return (
    <div className="hour-bars" aria-label="Messages by hour">
      {stats.hourlyActivity.map((item) => (
        <span key={item.hour} title={`${item.hour}:00 · ${item.count} messages`}>
          <i style={{ height: `${Math.max(6, (item.count / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = Math.round((value / total) * 100);
  return (
    <div className="progress-row">
      <div>
        <span>{label}</span>
        <strong>{value.toLocaleString()}</strong>
      </div>
      <div className="progress-track">
        <i style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-title">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

function Highlight({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="highlight-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function DesktopOnly() {
  return (
    <main className="mobile-disabled">
      <div className="mobile-disabled-card">
        <MarfeyxBrand product="Instagram Wrapped" />
        <p className="eyebrow">Desktop only</p>
        <h1>Instagram Wrapped needs a larger screen.</h1>
        <p>Instagram exports can be large, so usage is disabled on mobile. Open this page on a laptop or desktop.</p>
      </div>
    </main>
  );
}







function formatDate(timestampMs: number) {
  return new Date(timestampMs).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatReadableDay(label: string) {
  const [year, month, day] = label.split("-").map(Number);
  return formatDate(new Date(year, month - 1, day).getTime());
}

function formatDuration(ms: number | null) {
  if (ms === null) return "No data";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours < 24) return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return dayHours ? `${days}d ${dayHours}h` : `${days}d`;
}

function trimText(text: string, limit: number) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}...` : cleaned;
}

export function filterAliasesForParticipants(current: Set<string>, participants: readonly string[]) {
  const allowed = new Set(participants);
  let changed = false;
  const next = new Set<string>();

  for (const name of current) {
    if (allowed.has(name)) {
      next.add(name);
    } else {
      changed = true;
    }
  }

  return changed ? next : current;
}
