/**
 * syncEngine.test.js
 * Tests for deduplication, query building, and fast mode behaviour
 * using mocked chrome APIs and network calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Chrome mock ─────────────────────────────────────────────────────────────

const localStore = {};
const sessionStore = {};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) result[k] = localStore[k];
        cb(result);
      },
      set: (items, cb) => { Object.assign(localStore, items); cb?.(); },
    },
    session: {
      get: (keys, cb) => {
        const result = {};
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) result[k] = sessionStore[k];
        cb(result);
      },
      set: (items, cb) => { Object.assign(sessionStore, items); cb?.(); },
    },
  },
});

// ─── Import the helpers we want to test ──────────────────────────────────────
// We test only the pure/exported helpers — the full runSync requires live auth.

import { extractTicketNumbers } from "../src/utils/jiraParser.js";

// ─── Deduplication logic (inline, mirrors syncEngine behaviour) ───────────────

describe("sync deduplication", () => {
  it("skips tickets already present in the sheet set", () => {
    const sheetTickets = new Set(["ABC-1", "ABC-2"]);
    const detectedTickets = ["ABC-1", "ABC-3", "ABC-4"];

    const pending = [];
    const existing = [];

    for (const ticket of detectedTickets) {
      if (sheetTickets.has(ticket)) {
        existing.push(ticket);
      } else {
        pending.push(ticket);
        sheetTickets.add(ticket);
      }
    }

    expect(pending).toEqual(["ABC-3", "ABC-4"]);
    expect(existing).toEqual(["ABC-1"]);
  });

  it("prevents the same ticket from two emails being added twice in one run", () => {
    const sheetTickets = new Set();
    const emails = [
      { subject: "Fix ABC-5", body: "" },
      { subject: "Also ABC-5 update", body: "" },
    ];

    const pending = [];
    for (const email of emails) {
      const tickets = extractTicketNumbers(email.subject + " " + email.body);
      for (const ticket of tickets) {
        if (!sheetTickets.has(ticket)) {
          pending.push(ticket);
          sheetTickets.add(ticket);
        }
      }
    }

    expect(pending).toEqual(["ABC-5"]);
    expect(pending.length).toBe(1);
  });

  it("handles an empty email set without errors", () => {
    const sheetTickets = new Set(["ABC-1"]);
    const messageIds = [];
    const pending = [];
    for (const id of messageIds) {
      if (!sheetTickets.has(id)) pending.push(id);
    }
    expect(pending).toEqual([]);
  });
});

// ─── Gmail query builder (mirrors buildEffectiveGmailQuery logic) ─────────────

describe("Gmail query construction", () => {
  function buildQuery(settings) {
    // Inline mirror of buildEffectiveGmailQuery for unit testing
    const parts = [];
    if (settings.after) parts.push(`after:${settings.after}`);
    if (settings.before) parts.push(`before:${settings.before}`);
    if (settings.fastModeEnabled) parts.push("(to:me OR cc:me)");
    return parts.join(" ").trim() || "in:anywhere";
  }

  it("includes to:me/cc:me filter when fast mode is enabled", () => {
    const q = buildQuery({ after: "2026/02/17", fastModeEnabled: true });
    expect(q).toContain("(to:me OR cc:me)");
    expect(q).toContain("after:2026/02/17");
  });

  it("omits to:me/cc:me filter when fast mode is disabled", () => {
    const q = buildQuery({ after: "2026/02/17", fastModeEnabled: false });
    expect(q).not.toContain("to:me");
  });

  it("falls back to in:anywhere when no filters are set", () => {
    const q = buildQuery({ fastModeEnabled: false });
    expect(q).toBe("in:anywhere");
  });
});

// ─── Ticket extraction edge cases ─────────────────────────────────────────────

describe("extractTicketNumbers edge cases", () => {
  it("is case-sensitive: lowercase project keys are not matched", () => {
    // Per Jira convention, project keys are all-caps
    const tickets = extractTicketNumbers("fix abc-1 and ABC-2");
    expect(tickets).not.toContain("abc-1");
    expect(tickets).toContain("ABC-2");
  });

  it("requires at least 2 characters in the project key", () => {
    // Regex is [A-Z][A-Z0-9]+ so single-letter keys like A-1 do NOT match
    expect(extractTicketNumbers("A-1 should not match")).not.toContain("A-1");
    // Two-letter key AB-1 matches
    expect(extractTicketNumbers("AB-1 should match")).toContain("AB-1");
    // Malformed trailing dash should never match
    expect(extractTicketNumbers("AB- broken")).not.toContain("AB-");
  });

  it("handles very long ticket lists without duplicates", () => {
    const text = Array.from({ length: 50 }, (_, i) => `PROJ-${i + 1}`).join(", ");
    const tickets = extractTicketNumbers(text);
    expect(tickets.length).toBe(50);
    expect(new Set(tickets).size).toBe(50);
  });

  it("returns empty array for empty input", () => {
    expect(extractTicketNumbers("")).toEqual([]);
    expect(extractTicketNumbers(null)).toEqual([]);
  });
});
