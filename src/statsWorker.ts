import { parseInstagramBackup } from "./parser";
import type { WorkerRequest, WorkerResponse } from "./types";

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const { id, file } = event.data;

  try {
    const backup = await parseInstagramBackup(file);
    const response: WorkerResponse = { id, ok: true, backup };
    self.postMessage(response);
  } catch (caught) {
    const response: WorkerResponse = {
      id,
      ok: false,
      error: caught instanceof Error ? caught.message : "Could not parse this Instagram export.",
    };
    self.postMessage(response);
  }
});
