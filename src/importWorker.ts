import type { ParsedBackup, WorkerResponse } from "./types";

export type ImportWorker = {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
};

export class ImportCancelledError extends Error {
  constructor() {
    super("Instagram import was cancelled.");
    this.name = "ImportCancelledError";
  }
}

type ActiveImport = {
  id: string;
  worker: ImportWorker;
  reject: (reason: Error) => void;
};

export class ImportWorkerSession {
  private active: ActiveImport | null = null;

  constructor(
    private readonly createWorker: () => ImportWorker,
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  parse(file: File): Promise<ParsedBackup> {
    this.cancel();
    const worker = this.createWorker();
    const id = this.createId();

    return new Promise<ParsedBackup>((resolve, reject) => {
      this.active = { id, worker, reject };

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (this.active?.id !== id || event.data.id !== id) return;
        this.finish(id);
        if (event.data.ok) resolve(event.data.backup);
        else reject(new Error(event.data.error));
      };

      worker.onerror = () => {
        if (this.active?.id !== id) return;
        this.finish(id);
        reject(new Error("The local parser failed. Try a smaller export or a fresh Instagram download."));
      };

      worker.postMessage({ id, file });
    });
  }

  cancel() {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.disposeWorker(active.worker);
    active.reject(new ImportCancelledError());
  }

  private finish(id: string) {
    if (this.active?.id !== id) return;
    const { worker } = this.active;
    this.active = null;
    this.disposeWorker(worker);
  }

  private disposeWorker(worker: ImportWorker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }
}
