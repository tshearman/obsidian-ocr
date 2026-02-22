/**
 * Tests for configurePreprocessingWorker().
 *
 * Obsidian's Electron renderer blocks constructing a Worker directly from an
 * app:// resource URL (different origin from app://obsidian.md).  The fix is
 * to fetch the script, create a Blob, and pass a blob: URL to the constructor.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { configurePreprocessingWorker } from "../src/preprocessing";

describe("configurePreprocessingWorker", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not throw and leaves the worker unset when the script cannot be fetched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );
    const MockWorker = vi.fn();
    vi.stubGlobal("Worker", MockWorker);

    // Must not throw even though fetch rejects (plugin should still load).
    await expect(
      configurePreprocessingWorker("app://abc123/preprocessing.worker.js")
    ).resolves.toBeUndefined();

    // Worker must not have been constructed — preprocessImageDataUrl falls back
    // to the synchronous main-thread path when _worker is null.
    expect(MockWorker).not.toHaveBeenCalled();
  });

  it("constructs the Worker from a blob: URL, not directly from the app:// URL", async () => {
    const workerUrl = "app://cb29671/preprocessing.worker.js";
    const fakeBlob = new Blob(["self.onmessage = () => {}"], {
      type: "application/javascript",
    });
    const fakeBlobUrl = "blob:app://obsidian.md/fake-uuid";

    const MockWorker = vi.fn();
    vi.stubGlobal("Worker", MockWorker);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ blob: () => Promise.resolve(fakeBlob) })
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue(fakeBlobUrl);

    await configurePreprocessingWorker(workerUrl);

    // Must NOT pass the app:// URL directly to Worker (cross-origin violation).
    expect(MockWorker).not.toHaveBeenCalledWith(workerUrl);
    // Must construct the Worker from the blob: URL created from fetched content.
    expect(URL.createObjectURL).toHaveBeenCalledWith(fakeBlob);
    expect(MockWorker).toHaveBeenCalledWith(fakeBlobUrl);
  });
});
