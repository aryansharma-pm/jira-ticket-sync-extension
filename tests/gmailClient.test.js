/**
 * gmailClient.test.js
 * Unit tests for Gmail client parsing helpers.
 */
import { describe, it, expect } from "vitest";
import { getHeader, extractBody, parseEmail } from "../src/gmail/gmailClient.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePayload({ headers = [], body = null, parts = null } = {}) {
  const payload = { headers };
  if (body !== null) payload.body = body;
  if (parts !== null) payload.parts = parts;
  return payload;
}

function b64(text) {
  return btoa(unescape(encodeURIComponent(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// ─── getHeader ────────────────────────────────────────────────────────────────

describe("getHeader", () => {
  it("returns the header value case-insensitively", () => {
    const payload = makePayload({
      headers: [{ name: "Subject", value: "RE: ABC-123 blocked" }],
    });
    expect(getHeader(payload, "subject")).toBe("RE: ABC-123 blocked");
    expect(getHeader(payload, "SUBJECT")).toBe("RE: ABC-123 blocked");
  });

  it("returns empty string for missing header", () => {
    const payload = makePayload({ headers: [] });
    expect(getHeader(payload, "from")).toBe("");
  });

  it("returns empty string for null payload", () => {
    expect(getHeader(null, "from")).toBe("");
  });
});

// ─── extractBody ─────────────────────────────────────────────────────────────

describe("extractBody", () => {
  it("decodes single-part body", () => {
    const payload = makePayload({ body: { data: b64("Hello Jira ABC-1") } });
    expect(extractBody(payload)).toBe("Hello Jira ABC-1");
  });

  it("prefers text/plain over text/html in multipart", () => {
    const payload = makePayload({
      parts: [
        { mimeType: "text/html", body: { data: b64("<b>HTML</b>") } },
        { mimeType: "text/plain", body: { data: b64("Plain text") } },
      ],
    });
    expect(extractBody(payload)).toBe("Plain text");
  });

  it("falls back to text/html when no plain part exists", () => {
    const payload = makePayload({
      parts: [{ mimeType: "text/html", body: { data: b64("<b>HTML only</b>") } }],
    });
    expect(extractBody(payload)).toBe("<b>HTML only</b>");
  });

  it("returns empty string for null payload", () => {
    expect(extractBody(null)).toBe("");
  });
});

// ─── parseEmail ──────────────────────────────────────────────────────────────

describe("parseEmail", () => {
  it("builds a structured email object from a raw Gmail message", () => {
    const raw = {
      id: "abc123",
      internalDate: String(new Date("2026-03-18T09:00:00Z").getTime()),
      snippet: "see ABC-99 for details",
      payload: makePayload({
        headers: [
          { name: "Subject", value: "Re: ABC-99 update" },
          { name: "From", value: "alice@example.com" },
          { name: "To", value: "bob@example.com" },
          { name: "Cc", value: "carol@example.com" },
        ],
        body: { data: b64("Body text here") },
      }),
    };

    const email = parseEmail(raw);
    expect(email.id).toBe("abc123");
    expect(email.subject).toBe("Re: ABC-99 update");
    expect(email.from).toBe("alice@example.com");
    expect(email.to).toBe("bob@example.com");
    expect(email.cc).toBe("carol@example.com");
    expect(email.body).toBe("Body text here");
    expect(email.snippet).toBe("see ABC-99 for details");
    expect(email.date).toBe("2026-03-18T09:00:00.000Z");
  });

  it("falls back to current time when internalDate is missing", () => {
    const raw = {
      id: "x",
      snippet: "",
      payload: makePayload({ headers: [] }),
    };
    const before = Date.now();
    const email = parseEmail(raw);
    const after = Date.now();
    const emailTime = new Date(email.date).getTime();
    expect(emailTime).toBeGreaterThanOrEqual(before);
    expect(emailTime).toBeLessThanOrEqual(after);
  });
});
