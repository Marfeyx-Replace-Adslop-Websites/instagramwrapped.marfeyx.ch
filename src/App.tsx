import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AccountProfile } from "./accountProfile";
import { calculateWrappedStats, pickLikelySelf } from "./stats";
import type { ParsedBackup, ParticipantStats, WorkerResponse, WrappedStats } from "./types";

type AuthMode = "login" | "register";

const maxAuthAttempts = 5;
const authLockoutMs = 60 * 1000;
const maxAuthSubmissions = 5;
const authRateLimitWindowMs = 60 * 1000;
const mobileBreakpoint = 860;

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authFailures, setAuthFailures] = useState(0);
  const [authLockedUntil, setAuthLockedUntil] = useState<number | null>(null);
  const [authRateLimitedUntil, setAuthRateLimitedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < mobileBreakpoint);
  const [backup, setBackup] = useState<ParsedBackup | null>(null);
  const [selfAliases, setSelfAliases] = useState<Set<string>>(() => new Set());
  const [importStatus, setImportStatus] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const authSubmissionTimes = useRef<number[]>([]);

  const isAuthLocked = Boolean(authLockedUntil && authLockedUntil > now);
  const isAuthRateLimited = Boolean(authRateLimitedUntil && authRateLimitedUntil > now);
  const isAuthBlocked = isAuthLocked || isAuthRateLimited;
  const authBlockSeconds = Math.max(
    authLockedUntil ? Math.ceil((authLockedUntil - now) / 1000) : 0,
    authRateLimitedUntil ? Math.ceil((authRateLimitedUntil - now) / 1000) : 0,
  );
  const participants = backup?.participants ?? [];
  const stats = useMemo(() => calculateWrappedStats(backup, selfAliases, Date.now()), [backup, selfAliases]);
  const hasAliases = selfAliases.size > 0;
  const windowLabel = `${formatDate(stats.windowStartMs)} - ${formatDate(stats.windowEndMs)}`;

  useEffect(() => {
    document.title = "Instagram Wrapped";
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < mobileBreakpoint);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let isMounted = true;

      if (!isMounted) return;
      setAuthUser(data.user);
      setIsAuthReady(true);
      setIsAuthModalOpen(!data.user);
    });

    const {
      data: { subscription },
      setAuthUser(session?.user ?? null);
      setIsAuthReady(true);
      setIsAuthModalOpen(!session?.user);
      if (!session?.user) clearImportedData();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    setSelfAliases((current) => new Set([...current].filter((name) => participants.includes(name))));
  }, [participants]);

  function openFilePicker() {
    if (!authUser) {
      setAuthError("");
      setIsAuthModalOpen(true);
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!authUser) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setImportErrors(["Choose an Instagram export ZIP file."]);
      return;
    }

    setIsImporting(true);
    setImportStatus("Reading Instagram ZIP locally...");
    setImportErrors([]);

    try {
      const parsed = await parseWithWorker(file);
      const likelySelf = pickLikelySelf(parsed);
      setBackup(parsed);
      setSelfAliases(likelySelf ? new Set([likelySelf]) : new Set());
      setImportStatus(
        `Imported ${parsed.messages.length.toLocaleString()} messages from the last 365 days. ${parsed.skippedMessages.toLocaleString()} older messages skipped.`,
      );
      setImportErrors(parsed.errors);
    } catch (caught) {
      setImportErrors([caught instanceof Error ? caught.message : "Could not parse this Instagram export."]);
      setImportStatus("");
    } finally {
      setIsImporting(false);
    }
  }

  function parseWithWorker(file: File) {
    return new Promise<ParsedBackup>((resolve, reject) => {
      workerRef.current?.terminate();
      const worker = new Worker(new URL("./statsWorker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      const id = crypto.randomUUID();

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id) return;
        worker.terminate();
        workerRef.current = null;
        if (event.data.ok) resolve(event.data.backup);
        else reject(new Error(event.data.error));
      };

      worker.onerror = () => {
        worker.terminate();
        workerRef.current = null;
        reject(new Error("The local parser failed. Try a smaller export or a fresh Instagram download."));
      };

      worker.postMessage({ id, file });
    });
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isAuthBlocked) {
      setAuthError(`Too many attempts. Try again in ${authBlockSeconds} seconds.`);
      return;
    }

    const email = authEmail.trim().toLowerCase();
    const displayName = authDisplayName.trim();
    const validationError = validateCredentials(email, authPassword, authMode === "register" ? displayName : undefined);
    if (validationError) {
      setAuthError(validationError);
      return;
    }

    const rateLimitError = registerAuthSubmission();
    if (rateLimitError) {
      setAuthError(rateLimitError);
      return;
    }

    setIsAuthenticating(true);
    setAuthError("");

    try {
      const result =
        authMode === "login"
              email,
              password: authPassword,
              options: { data: { display_name: displayName, username: displayName } },
            });

      if (result.error) {
        if (shouldCountAuthFailure(result.error, authMode)) registerAuthFailure();
        setAuthError(getAuthErrorMessage(result.error, authMode));
        return;
      }

      setAuthFailures(0);
      setAuthLockedUntil(null);
      setAuthPassword("");
      setIsAuthModalOpen(false);

      if (authMode === "register" && !result.data.session) {
        setAuthError("Check your email to confirm your account before signing in.");
        setAuthMode("login");
        setIsAuthModalOpen(true);
      }
    } catch {
    } finally {
      setIsAuthenticating(false);
    }
  }

  function registerAuthSubmission() {
    const cutoff = Date.now() - authRateLimitWindowMs;
    authSubmissionTimes.current = authSubmissionTimes.current.filter((time) => time > cutoff);
    if (authSubmissionTimes.current.length >= maxAuthSubmissions) {
      setAuthRateLimitedUntil(Date.now() + authRateLimitWindowMs);
      return "Too many login attempts. Try again in 60 seconds.";
    }
    authSubmissionTimes.current.push(Date.now());
    return "";
  }

  function registerAuthFailure() {
    const nextFailures = authFailures + 1;
    setAuthFailures(nextFailures);
    if (nextFailures >= maxAuthAttempts) {
      setAuthLockedUntil(Date.now() + authLockoutMs);
      setAuthFailures(0);
    }
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
    workerRef.current?.terminate();
    workerRef.current = null;
    setBackup(null);
    setSelfAliases(new Set());
    setImportStatus("");
    setImportErrors([]);
  }

    clearImportedData();
  }

  if (isMobile) return <DesktopOnly />;

  return (
    <main className="app-shell">
      <aside className="control-panel">
        <div>
          <p className="eyebrow">Instagram Wrapped</p>
          <h1>Your chat year, computed privately.</h1>
          <p className="lede">Upload an Instagram export ZIP. Stats are calculated in this browser for {windowLabel}.</p>
        </div>

        <AccountProfile
          compact
          className="auth-status"
          user={authUser}
          isAuthReady={isAuthReady}
          onSignOut={signOut}
          onLogin={() => setIsAuthModalOpen(true)}
        />

        <button className="file-drop" disabled={!authUser || isImporting} onClick={openFilePicker}>
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
              : "The dashboard unlocks after your first successful import."}
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

      {isAuthModalOpen && (
        <AuthModal
          authMode={authMode}
          blockSeconds={authBlockSeconds}
          displayName={authDisplayName}
          email={authEmail}
          error={authError}
          isAuthenticating={isAuthenticating}
          isBlocked={isAuthBlocked}
          password={authPassword}
          setAuthMode={setAuthMode}
          setDisplayName={setAuthDisplayName}
          setEmail={setAuthEmail}
          setPassword={setAuthPassword}
          onClose={() => authUser && setIsAuthModalOpen(false)}
          onSubmit={handleAuthSubmit}
        />
      )}
    </main>
  );
}

function AuthModal(props: {
  authMode: AuthMode;
  blockSeconds: number;
  displayName: string;
  email: string;
  error: string;
  isAuthenticating: boolean;
  isBlocked: boolean;
  password: string;
  setAuthMode: (mode: AuthMode) => void;
  setDisplayName: (value: string) => void;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="auth-modal" onSubmit={props.onSubmit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Private access</p>
            <h2>{props.authMode === "login" ? "Login required" : "Create account"}</h2>
          </div>
          <button type="button" onClick={props.onClose} aria-label="Close login">
            x
          </button>
        </div>
        {props.authMode === "register" && (
          <label className="field">
            Display name
            <input value={props.displayName} autoComplete="name" onChange={(event) => props.setDisplayName(event.target.value)} />
          </label>
        )}
        <label className="field">
          Email
          <input value={props.email} autoComplete="email" inputMode="email" onChange={(event) => props.setEmail(event.target.value)} />
        </label>
        <label className="field">
          Password
          <input
            value={props.password}
            autoComplete={props.authMode === "login" ? "current-password" : "new-password"}
            type="password"
            onChange={(event) => props.setPassword(event.target.value)}
          />
        </label>
        {props.error && <div className="error-message">{props.error}</div>}
        <button className="primary-button" disabled={props.isAuthenticating || props.isBlocked} type="submit">
          {props.isBlocked
            ? `Try again in ${props.blockSeconds}s`
            : props.isAuthenticating
              ? "Working..."
              : props.authMode === "login"
                ? "Login"
                : "Register"}
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            props.setAuthMode(props.authMode === "login" ? "register" : "login");
          }}
        >
          {props.authMode === "login" ? "Need an account?" : "Already have an account?"}
        </button>
      </form>
    </div>
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
      <div>
        <p className="eyebrow">Desktop only</p>
        <h1>Instagram Wrapped needs a larger screen.</h1>
        <p>Instagram exports can be large, so usage is disabled on mobile. Open this page on a laptop or desktop.</p>
      </div>
    </main>
  );
}

function validateCredentials(email: string, password: string, displayName?: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (displayName !== undefined && displayName.length < 2) return "Display name must be at least 2 characters.";
  return "";
}

function shouldCountAuthFailure(error: AuthError, mode: AuthMode) {
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error.message.toLowerCase();
  return mode === "login" && (code === "invalid_credentials" || message.includes("invalid login credentials"));
}

function getAuthErrorMessage(error: AuthError, mode: AuthMode) {
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error.message.toLowerCase();
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "Invalid email or password.";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "Confirm your email address before signing in.";
  if (code === "user_already_exists" || message.includes("already registered") || message.includes("already exists")) {
    return "An account already exists for this email.";
  }
  if (error.status === 429 || message.includes("rate limit")) return "Too many requests. Wait a moment and try again.";
  return mode === "login" ? "Login failed. Check your credentials and try again." : "Registration failed. Check your details and try again.";
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
