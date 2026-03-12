import { describe, it, expect } from "vitest";
import { buildAiArtifacts, isAiConfigured } from "../src/ai/aiClient.js";

function baseSettings(overrides = {}) {
  return {
    enableAiSummaries: true,
    aiProvider: "basic",
    aiSummaryMode: "full",
    maxConcurrentAiRequests: 2,
    openAiApiKey: "",
    openAiModel: "gpt-4.1-mini",
    geminiApiKey: "",
    geminiModel: "gemini-2.0-flash",
    ...overrides,
  };
}

function sampleEntries() {
  return [
    {
      ticketNumber: "ABC-100",
      ticketTitle: "Payment webhook issue",
      emailSubject: "ABC-100 blocked due to dependency",
      from: "ops@example.com",
      date: "2026-03-12T10:00:00.000Z",
      body: "Blocked by upstream API. Next step: retry after vendor fix.",
      snippet: "critical issue",
    },
  ];
}

describe("aiClient", () => {
  it("reports configured only when AI is enabled", () => {
    expect(isAiConfigured({ enableAiSummaries: false })).toBe(false);
    expect(isAiConfigured({ enableAiSummaries: true })).toBe(true);
  });

  it("builds summaries in basic mode", async () => {
    const artifacts = await buildAiArtifacts(sampleEntries(), baseSettings());
    const summary = artifacts.summariesByTicket.get("ABC-100");
    expect(summary).toContain("ABC-100");
    expect(artifacts.consolidatedSummary).toContain("ticket(s) analyzed");
  });

  it("falls back to basic when OpenAI is requested without key", async () => {
    const artifacts = await buildAiArtifacts(
      sampleEntries(),
      baseSettings({ aiProvider: "openai", openAiApiKey: "" })
    );
    expect(artifacts.fallbackUsed).toBe(true);
    expect(artifacts.providerRequested).toBe("openai");
    expect(artifacts.summariesByTicket.get("ABC-100")).toContain("ABC-100");
  });

  it("supports consolidated-only mode", async () => {
    const artifacts = await buildAiArtifacts(
      sampleEntries(),
      baseSettings({ aiSummaryMode: "consolidated_only" })
    );
    expect(artifacts.summariesByTicket.size).toBe(0);
    expect(typeof artifacts.consolidatedSummary).toBe("string");
  });
});
