import { describe, expect, it } from "vitest";
import { ImportCancelledError, ImportWorkerSession } from "./importWorker";
import type { ImportWorker } from "./importWorker";
import type { ParsedBackup, WorkerResponse } from "./types";

class FakeWorker implements ImportWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: unknown;
  terminated = false;

  postMessage(message: unknown) {
    this.posted = message;
  }

  terminate() {
    this.terminated = true;
  }

  succeed(backup: ParsedBackup) {
    const id = (this.posted as { id: string }).id;
    this.onmessage?.({ data: { id, ok: true, backup } } as MessageEvent<WorkerResponse>);
  }
}

const backup = (sourceName: string): ParsedBackup => ({
  sourceName,
  importedAtMs: 0,
  windowStartMs: 0,
  windowEndMs: 1,
  threads: [],
  participants: [],
  messages: [],
  skippedMessages: 0,
  errors: [],
});

describe("ImportWorkerSession", () => {
  it("settles cancellation and supports a later import", async () => {
    const workers: FakeWorker[] = [];
    let nextId = 0;
    const session = new ImportWorkerSession(
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      () => `import-${++nextId}`,
    );

    const first = session.parse({ name: "first.zip" } as File);
    workers[0].succeed(backup("first.zip"));
    await expect(first).resolves.toMatchObject({ sourceName: "first.zip" });

    const replacement = session.parse({ name: "second.zip" } as File);
    session.cancel();
    await expect(replacement).rejects.toBeInstanceOf(ImportCancelledError);
    expect(workers[1].terminated).toBe(true);
    expect(workers[1].onmessage).toBeNull();
    expect(workers[1].onerror).toBeNull();

    const third = session.parse({ name: "third.zip" } as File);
    workers[2].succeed(backup("third.zip"));
    await expect(third).resolves.toMatchObject({ sourceName: "third.zip" });
  });

  it("ignores a stale callback after cancellation", async () => {
    const workers: FakeWorker[] = [];
    const session = new ImportWorkerSession(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const cancelled = session.parse({ name: "old.zip" } as File);
    session.cancel();
    await expect(cancelled).rejects.toBeInstanceOf(ImportCancelledError);

    const current = session.parse({ name: "new.zip" } as File);
    workers[0].succeed(backup("old.zip"));
    workers[1].succeed(backup("new.zip"));

    await expect(current).resolves.toMatchObject({ sourceName: "new.zip" });
  });
});
