import { describe, it, expect } from "vitest";
import {
  extractTicketNumbers,
  containsTicket,
  buildJiraUrl,
  buildGmailUrl,
  sanitize,
} from "../src/utils/jiraParser.js";

describe("jiraParser", () => {
  it("extracts unique ticket numbers in order", () => {
    const text = "ABC-123 and DEF-9 plus ABC-123 again";
    expect(extractTicketNumbers(text)).toEqual(["ABC-123", "DEF-9"]);
  });

  it("detects ticket presence", () => {
    expect(containsTicket("Please check PROJ-44")).toBe(true);
    expect(containsTicket("No issue id here")).toBe(false);
  });

  it("builds Jira and Gmail URLs", () => {
    expect(buildJiraUrl("ABC-1", "https://acme.atlassian.net/"))
      .toBe("https://acme.atlassian.net/browse/ABC-1");
    expect(buildGmailUrl("17c0ffee")).toBe("https://mail.google.com/mail/u/0/#inbox/17c0ffee");
  });

  it("sanitizes html/entities and collapses whitespace", () => {
    const input = " <b>Hello</b> &amp;   team &lt;ok&gt; ";
    expect(sanitize(input)).toBe("Hello & team <ok>");
  });
});
