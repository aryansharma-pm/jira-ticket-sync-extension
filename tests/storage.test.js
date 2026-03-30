/**
 * storage.test.js
 * Unit tests for storage helpers using a mocked chrome.storage API.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Chrome storage mock ──────────────────────────────────────────────────────

const localStore = {};
const sessionStore = {};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) result[k] = localStore[k];
        cb(result);
      },
      set: (items, cb) => {
        Object.assign(localStore, items);
        cb?.();
      },
    },
    session: {
      get: (keys, cb) => {
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) result[k] = sessionStore[k];
        cb(result);
      },
      set: (items, cb) => {
        Object.assign(sessionStore, items);
        cb?.();
      },
    },
  },
});

// Import after stub so module picks up mocked chrome
const {
  addSeenTicketIds,
  getSeenTicketIds,
  clearSeenTicketIds,
  appendAuditLog,
  getAuditLog,
  setSyncStatus,
  getSyncStatus,
  setUserEmail,
  getUserEmailFromStorage,
  clearUserEmail,
} = await import("../src/utils/storage.js");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("storage: seenTicketIds", () => {
  beforeEach(async () => {
    await clearSeenTicketIds();
  });

  it("starts empty", async () => {
    const ids = await getSeenTicketIds();
    expect(ids.size).toBe(0);
  });

  it("adds and retrieves ticket IDs", async () => {
    await addSeenTicketIds(["ABC-1", "XYZ-99"]);
    const ids = await getSeenTicketIds();
    expect(ids.has("ABC-1")).toBe(true);
    expect(ids.has("XYZ-99")).toBe(true);
  });

  it("deduplicates ticket IDs across multiple adds", async () => {
    await addSeenTicketIds(["ABC-1", "ABC-2"]);
    await addSeenTicketIds(["ABC-1", "ABC-3"]);
    const ids = await getSeenTicketIds();
    expect(ids.size).toBe(3);
    expect(ids.has("ABC-3")).toBe(true);
  });

  it("clears all ticket IDs", async () => {
    await addSeenTicketIds(["ABC-1"]);
    await clearSeenTicketIds();
    const ids = await getSeenTicketIds();
    expect(ids.size).toBe(0);
  });
});

describe("storage: syncStatus", () => {
  it("sets and retrieves status", async () => {
    await setSyncStatus("Syncing complete");
    const status = await getSyncStatus();
    expect(status).toBe("Syncing complete");
  });
});

describe("storage: userEmail", () => {
  it("sets and retrieves user email", async () => {
    await setUserEmail("user@example.com");
    const email = await getUserEmailFromStorage();
    expect(email).toBe("user@example.com");
  });

  it("returns null after clear", async () => {
    await setUserEmail("user@example.com");
    await clearUserEmail();
    const email = await getUserEmailFromStorage();
    expect(email).toBeFalsy();
  });
});

describe("storage: auditLog", () => {
  it("appends and retrieves log entries", async () => {
    await appendAuditLog({ timestamp: "2026-03-18T09:00:00Z", outcome: "success", added: 3 });
    const log = await getAuditLog(10);
    expect(log.length).toBeGreaterThan(0);
    const last = log[log.length - 1];
    expect(last.outcome).toBe("success");
    expect(last.added).toBe(3);
  });

  it("respects the limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await appendAuditLog({ timestamp: `2026-03-18T0${i}:00:00Z`, outcome: "success" });
    }
    const log = await getAuditLog(2);
    expect(log.length).toBe(2);
  });
});
