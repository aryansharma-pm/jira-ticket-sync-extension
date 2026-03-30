/**
 * engine.js
 * JMD Platform query engine — intent detection, DRI lookup, version feature search.
 */

export class JMDEngine {
  constructor(kb) { this.kb = kb; }
  normalize(t) { return t.toLowerCase().replace(/[^a-z0-9\s.]/g, " ").trim(); }

  detectIntent(q) {
    if (/\bdo\s+we\s+(have|support|allow|offer)\b|\bis\s+there\s+(a\s+|an\s+)?\b|\bcan\s+we\b|\bdoes\s+(the\s+)?(platform|system|fynd)\b|\bis\s+it\s+(possible|available|supported)\b|\bdo\s+we\s+(currently\s+)?(allow|offer|provide)\b/.test(q)) return "feature_check";
    if (/\bhow\s+(does|do|is|to|can|are|should|would|will)\b/.test(q)) return "how_does";
    if (/\bwho\s+(handles|owns|manages|is\s+(the\s+)?(dri|responsible|owner|poc|contact))\b/.test(q)) return "who_handles";
    if (/\bwhat\s+(is|are|does|changed|was|happens)\b/.test(q)) return "what_is";
    return "general";
  }

  extractConcept(q) {
    return q
      .replace(/\b(do|we|have|is|there|a|an|can|the|platform|support|does|it|possible|offer|this|that|available|supported|are|for|any|option|feature|functionality|system|fynd|allow|be|to|in|on|at|or|and|not|how|who|what|which|where|when|will|was|were|been|has|had|use|used|using|get|set|our|its|from|with|about|into|over|after|before|currently|please|tell|me|know|want|need|check|see|show|find)\b/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  conceptMatch(concept, vq) {
    if (!concept || !vq.length) return [];
    const STOP = new Set(["have","this","that","with","from","what","when","where","does","will","more","some","also","been","they","them","their","make","made","after","about","before","into","over","under"]);
    const words = concept.split(" ").filter(w => w.length > 3 && !STOP.has(w));
    if (!words.length) return vq;
    const threshold = Math.min(2, words.length);
    return vq.filter(r =>
      r.matched.some(m =>
        m.items.some(item =>
          words.filter(w => this.normalize(item).includes(w)).length >= threshold
        )
      )
    );
  }

  findDRI(query) {
    const q = this.normalize(query);
    return this.kb.dri.map(d => {
      let score = 0;
      d.keywords.forEach(kw => { if (q.includes(kw)) score += kw.split(" ").length * 2; });
      d.codenames.forEach(cn => { if (q.includes(cn.toLowerCase())) score += 5; });
      if (q.includes(d.service.toLowerCase())) score += 10;
      return { ...d, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  }

  findFAQ(query) {
    const q = this.normalize(query);
    const qWords = q.split(" ").filter(w => w.length > 3);
    return this.kb.faq.filter(f => {
      const fqNorm = this.normalize(f.q);
      const faNorm = this.normalize(f.a);
      return qWords.some(w => fqNorm.includes(w)) ||
             qWords.filter(w => faNorm.includes(w)).length >= 2;
    });
  }

  /**
   * Search Megatron and Avis code knowledge for flags, fields, states, business rules.
   * Returns a plain-text summary string or null.
   */
  findMegatronKnowledge(query) {
    const q = this.normalize(query);
    const hits = [];

    // ── Search Avis OMS knowledge ────────────────────────────────────────────
    const av = this.kb.avis;
    if (av) {
      // Search bag states
      const allStates = { ...av.bagStates.forward, ...av.bagStates.cancellation, ...av.bagStates.returnFlow, ...av.bagStates.rto, ...av.bagStates.refund, ...av.bagStates.payment };
      for (const [state, id] of Object.entries(allStates)) {
        if (q.includes(this.normalize(state))) {
          const display = av.customerFacingStatus[state] || "";
          hits.push(`**Avis state \`${state}\` (ID: ${id}):** Customer-facing: "${display}"`);
        }
      }
      // Search Avis bag fields
      for (const [field, desc] of Object.entries(av.models.Bag?.keyFields || {})) {
        if (q.includes(this.normalize(field))) hits.push(`**Bag.${field}:** ${desc}`);
      }
      // Search Avis shipment fields
      for (const [field, desc] of Object.entries(av.models.Shipment?.keyFields || {})) {
        if (q.includes(this.normalize(field))) hits.push(`**Shipment.${field}:** ${desc}`);
      }
      // Search business rules
      for (const [rule, val] of Object.entries(av.businessRules || {})) {
        const valStr = Array.isArray(val) ? val.join(" ") : String(val);
        if (q.split(" ").filter(w => w.length > 4).some(w => this.normalize(valStr).includes(w) || this.normalize(rule).includes(w))) {
          hits.push(`**Avis ${rule}:** ${valStr}`);
        }
      }
    }

    if (!this.kb.megatron) return hits.length ? hits.slice(0, 5).join("\n\n") : null;
    const m = this.kb.megatron;

    // Search config flags
    for (const [flag, desc] of Object.entries(m.configFlags || {})) {
      if (q.includes(this.normalize(flag)) || this.normalize(desc).split(" ").filter(w => w.length > 4).some(w => q.includes(w))) {
        hits.push(`**Config flag \`${flag}\`:** ${desc}`);
      }
    }

    // Search cart article wrapper key flags
    const wrapperFlags = m.models?.CartArticleWrapper?.keyFlags || {};
    for (const [field, desc] of Object.entries(wrapperFlags)) {
      if (q.includes(this.normalize(field)) || this.normalize(desc).split(" ").filter(w => w.length > 4).some(w => q.includes(w))) {
        hits.push(`**CartArticleWrapper.${field}:** ${desc}`);
      }
    }

    // Search CartObject fields
    const cartObjFields = m.models?.CartObject?.keyFields || {};
    for (const [field, desc] of Object.entries(cartObjFields)) {
      if (q.includes(this.normalize(field))) {
        hits.push(`**CartObject.${field}:** ${desc}`);
      }
    }

    // Search clusters
    for (const [cluster, desc] of Object.entries(m.clusters || {})) {
      if (q.includes(cluster)) hits.push(`**Cluster \`${cluster}\`:** ${desc}`);
    }

    // Search business rules
    const ruleGroups = m.businessRules || {};
    for (const [group, rules] of Object.entries(ruleGroups)) {
      const ruleText = rules.join(" ").toLowerCase();
      if (q.split(" ").filter(w => w.length > 4).some(w => ruleText.includes(w))) {
        hits.push(`**${group}:** ${rules.join("; ")}`);
      }
    }

    if (!hits.length) return null;
    return hits.slice(0, 5).join("\n\n");
  }

  findDirectFAQ(concept) {
    if (!concept) return null;
    const words = this.normalize(concept).split(" ").filter(w => w.length > 3);
    if (!words.length) return null;
    const threshold = Math.min(2, words.length);
    const byQuestion = this.kb.faq.find(f =>
      words.filter(w => this.normalize(f.q).includes(w)).length >= threshold
    );
    if (byQuestion) return byQuestion;
    return this.kb.faq.find(f =>
      words.every(w => this.normalize(f.a).includes(w))
    ) || null;
  }

  findVersionFeatures(query) {
    const q = this.normalize(query);
    const results = [];
    for (const [ver, data] of Object.entries(this.kb.versions)) {
      const matched = [];
      for (const [mod, items] of Object.entries(data.features)) {
        const hits = items.filter(item => this.normalize(item).split(" ").filter(w => w.length > 3).some(w => q.includes(w)));
        if (hits.length) matched.push({ mod, items: hits });
      }
      if (matched.length) results.push({ version: ver, label: data.label, released: data.released, matched });
    }
    return results;
  }

  compareVersions(query) {
    const q = this.normalize(query);
    const results = [];
    for (const [ver, data] of Object.entries(this.kb.versions)) {
      const hits = [];
      for (const [mod, items] of Object.entries(data.features)) {
        items.forEach(item => {
          if (q.split(" ").filter(w => w.length > 3).some(w => item.toLowerCase().includes(w)))
            hits.push({ mod, item });
        });
      }
      if (hits.length) results.push({ version: ver, label: data.label, released: data.released, status: data.status, hits });
    }
    return results;
  }

  analyzeJira(text) {
    const q = this.normalize(text);
    const ticketMatch = text.match(/[A-Z]+-\d+/);
    let detectedService = null, detectedDri = null, max = 0;
    for (const [, pat] of Object.entries(this.kb.jiraPatterns)) {
      const score = pat.keywords.filter(kw => q.includes(kw)).length;
      if (score > max) { max = score; detectedService = pat.service; detectedDri = pat.dri; }
    }
    if (!detectedService) { const m = this.findDRI(text); if (m.length) { detectedService = m[0].service; detectedDri = m[0].primary; } }
    return { ticketId: ticketMatch ? ticketMatch[0] : null, detectedService, detectedDri, versionGaps: this.detectVersionGaps(q), problems: this.detectProblems(q), codeHints: this.detectCodeHints(q) };
  }

  detectVersionGaps(q) {
    return [
      { kw: ["manual order","create order manually","telephonic"], feature: "Manual Order Creation", v: "2.0.0" },
      { kw: ["lane view","custom lane","super lane","sub lane"], feature: "Custom OMS Lane Views", v: "2.0.0" },
      { kw: ["reverse pickup","return serviceability"], feature: "Reverse Pickup Serviceability", v: "2.0.0" },
      { kw: ["store os extension","storeos extension"], feature: "StoreOS Extensions", v: "2.0.0" },
      { kw: ["buy now coupon","coupon buy now","coupon checkout"], feature: "Coupon in Buy Now Checkout", v: "2.1.0" },
      { kw: ["same day tag","next day tag","hyperlocal tag","shipment tag"], feature: "Shipment Priority Tags", v: "2.1.0" },
      { kw: ["3 month download","three month oms","extended download"], feature: "3-Month OMS Data Download", v: "2.1.0" },
      { kw: ["bulk mto","mto bulk","mto non-mto"], feature: "Bulk MTO Update", v: "2.1.0" },
      { kw: ["price breakdown","shipment breakdown","cost breakdown"], feature: "Detailed Shipment Price Breakdown", v: "2.1.0" },
      { kw: ["bulk attribute","multi value bulk","bulk tag","bulk highlight"], feature: "Bulk Multi-Valued Attribute Management", v: "2.1.0" }
    ].filter(c => c.kw.some(kw => q.includes(kw))).map(c => ({ feature: c.feature, availableIn: c.v, notIn: "1.9.5" }));
  }

  detectProblems(q) {
    return [
      { t: "bug",          k: ["not working","broken","bug","fail"],                  l: "Functional regression or broken behavior" },
      { t: "code_error",   k: ["null","undefined","nan","error","exception"],          l: "Possible null/undefined or runtime exception" },
      { t: "missing_data", k: ["missing","not found","404"],                           l: "Missing data — check API response and DB" },
      { t: "perf",         k: ["slow","timeout","latency","performance"],              l: "Performance issue — check query optimization or cache" },
      { t: "auth",         k: ["permission","unauthorized","403","access denied"],     l: "Authorization issue — check token scopes or role config" },
      { t: "ui",           k: ["not display","ui issue","not show","blank screen"],    l: "UI rendering issue — check state and API binding" },
      { t: "webhook",      k: ["webhook","event not","event missing"],                 l: "Webhook not firing — check subscriber and broadcaster" },
      { t: "coupon",       k: ["coupon","not apply","invalid coupon"],                 l: "Coupon not applying — check Maker-Checker status and end date" },
      { t: "payment",      k: ["payment fail","stuck","pending payment"],              l: "Payment stuck — check PG response and session state" },
      { t: "inventory",    k: ["inventory wrong","stock incorrect","quantity wrong"],  l: "Inventory sync issue — check location, buffer, sellable qty" }
    ].filter(p => p.k.some(k => q.includes(k))).map(p => ({ type: p.t, label: p.l }));
  }

  detectCodeHints(q) {
    const hints = [];
    if (q.includes("api") || q.includes("endpoint")) hints.push("Check API response schema — may differ between versions");
    if (q.includes("db") || q.includes("database") || q.includes("mongo")) hints.push("Verify DB query — check application_id and company_id scoping");
    if (q.includes("kafka") || q.includes("event")) hints.push("Check Kafka consumer lag and event payload structure");
    if (q.includes("redis") || q.includes("cache")) hints.push("Cache invalidation may be needed — check TTL and key patterns");
    if (q.includes("webhook")) hints.push("Verify webhook subscriber is registered and broadcaster type configured");
    if (q.includes("token") || q.includes("oauth")) hints.push("Validate OAuth token scopes and expiry — regenerate if needed");
    if (q.includes("migration") || q.includes("script")) hints.push("Check if a migration script ran — validate data integrity post-run");
    return hints;
  }

  findApiInfo(query) {
    const q = this.normalize(query);
    const results = [];
    const isPlatform = q.includes("platform api") || q.includes("platform rest") || q.includes("client credential") || q.includes("company level api") || q.includes("bearer token");
    const isStorefront = q.includes("storefront api") || q.includes("application api") || q.includes("storefront rest") || q.includes("application token") || q.includes("basic auth");

    const apiSources = [];
    if (isPlatform && !isStorefront) apiSources.push({ key: "platformApi", data: this.kb.platformApi });
    else if (isStorefront && !isPlatform) apiSources.push({ key: "storefrontApi", data: this.kb.storefrontApi });
    else { apiSources.push({ key: "platformApi", data: this.kb.platformApi }); apiSources.push({ key: "storefrontApi", data: this.kb.storefrontApi }); }

    for (const { key, data } of apiSources) {
      const matchedModules = [];
      for (const [modName, modData] of Object.entries(data.modules)) {
        const desc = this.normalize(modData.description || "");
        const endpointText = JSON.stringify(modData.endpoints || modData).toLowerCase();
        const words = q.split(" ").filter(w => w.length > 3);
        if (words.some(w => desc.includes(w) || endpointText.includes(w))) {
          matchedModules.push({ name: modName, description: modData.description, endpoints: modData.endpoints || [] });
        }
      }
      if (matchedModules.length || isPlatform || isStorefront) {
        results.push({ apiType: key, label: data.description, authMethod: data.authMethod, baseUrl: data.baseUrl, modules: matchedModules.slice(0, 4) });
      }
    }
    return results;
  }

  /**
   * Returns true when the query is long or contains technical specifics that
   * the static KB is unlikely to fully answer — signals that AI should be called
   * even if the KB returned a partial match.
   */
  _isSpecificTechnical(query) {
    const wordCount = query.trim().split(/\s+/).length;
    const hasSyntax  = /[=<>{}[\]]/.test(query);
    const hasTechTerms = /\b(true|false|null|config|field|flag|param|attribute|property|value|setting|boolean|cluster|child|parent|nested|object|array|module|function|method|class|schema|payload|response|request|endpoint|hook|callback|event|listener|handler|middleware|service|microservice|api|sdk|plugin|extension|integration)\b/.test(query.toLowerCase());
    return wordCount > 7 || hasSyntax || (wordCount > 5 && hasTechTerms);
  }

  buildResponse(query) {
    const q = this.normalize(query);
    const isJira = /[A-Z]{2,}-\d+/.test(query) || q.includes("jira") || q.includes("ticket") || (q.length > 80 && (q.includes("issue") || q.includes("bug") || q.includes("problem")));
    const isCompare = q.includes("compare") || q.includes("vs") || q.includes("available in") || q.includes("which version") || q.includes("not in v1");
    const isApiQuery = q.includes("platform api") || q.includes("storefront api") || q.includes("application api") || q.includes("client credential") || q.includes("application token") || q.includes("rest api") || q.includes("authenticate") && (q.includes("api") || q.includes("endpoint"));
    const isSpecific = this._isSpecificTechnical(query);

    if (/^(hi|hello|hey|good\s*(morning|afternoon|evening))/.test(q)) return { type: "greeting" };
    if (q.includes("list all") || q.includes("all services") || q.includes("all dri")) return { type: "list_all" };
    if (q === "version" || q.includes("all version") || q.includes("current version")) return { type: "version_info" };
    if (isJira) return { type: "jira", analysis: this.analyzeJira(query) };

    if (isApiQuery) {
      const faq = this.findDirectFAQ(this.extractConcept(q)) || (this.findFAQ(query)[0] || null);
      const apiResults = this.findApiInfo(query);
      const dq = this.findDRI(query);
      const sections = [];
      let answer = "";
      if (faq) {
        answer = faq.a;
      } else if (apiResults.length) {
        const label = apiResults[0].apiType === "platformApi" ? "Platform REST API" : "Storefront REST API";
        answer = `<strong>${label}</strong> — Auth: ${apiResults[0].authMethod}.`;
        if (apiResults[0].modules.length) {
          answer += ` Matching modules: ${apiResults[0].modules.map(m => m.name).join(", ")}.`;
        }
      }
      if (apiResults.length) sections.push({ type: "api", items: apiResults });
      if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
      if (answer || sections.length) return { type: "result", answer, sections };
    }
    if (isCompare) { const r = this.compareVersions(query); if (r.length) return { type: "compare", results: r }; }

    const intent     = this.detectIntent(q);
    const concept    = this.extractConcept(q);
    const dq         = this.findDRI(query);
    const vq         = this.findVersionFeatures(query);
    const directFaq  = this.findDirectFAQ(concept);
    const specificVq = this.conceptMatch(concept, vq);
    const megatronHit = this.findMegatronKnowledge(query);

    const sections = [];
    let answer = "";

    const driRef = dq.length
      ? ` Reach out to <strong>${dq[0].primary}</strong> (${dq[0].service}) for confirmation.`
      : "";
    const conceptLabel = concept.length > 2
      ? concept.replace(/\b\w/g, c => c.toUpperCase())
      : query;
    const specificLabels = specificVq.map(r => r.label);
    const relatedLabels  = [...new Set(vq.map(r => r.label))];

    if (intent === "feature_check") {
      if (directFaq) {
        answer = directFaq.a;
        if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
      } else if (specificVq.length) {
        answer = `Yes — <strong>${conceptLabel}</strong> is documented in <strong>${specificLabels.join(" and ")}</strong>. See below:`;
        if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
        sections.push({ type: "vf", items: specificVq.slice(0, 3) });
      } else if (vq.length) {
        answer = `<strong>${conceptLabel}</strong> is not explicitly documented in v1.9.5–v2.1.0. Related features exist in ${relatedLabels.join(", ")} — but may not cover your specific question.${driRef}`;
        if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
        sections.push({ type: "vf", items: vq.slice(0, 2) });
      } else {
        answer = `<strong>${conceptLabel}</strong> is not documented in any tracked version (v1.9.5, v2.0.0, v2.1.0).${driRef}`;
        if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
      }
      return { type: "result", lowConfidence: isSpecific && !specificVq.length, answer, sections };
    }

    if (intent === "how_does") {
      const faq = directFaq || (this.findFAQ(query)[0] || null);
      if (faq) {
        answer = faq.a;
        if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
        if (vq.length) sections.push({ type: "vf", items: vq.slice(0, 2) });
      } else if (vq.length) {
        answer = `Here's what the knowledge base documents on this:`;
        if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
        sections.push({ type: "vf", items: vq.slice(0, 3) });
      } else {
        answer = `No specific workflow documentation found for this.${driRef}`;
        if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
      }
      // how_does is almost always specific — escalate to AI when query is technical
      return { type: "result", lowConfidence: isSpecific, answer, sections };
    }

    if (intent === "who_handles") {
      if (dq.length) {
        answer = `<strong>${dq[0].service}</strong> is owned by <strong>${dq[0].primary}</strong> (Primary DRI) with ${dq[0].backup} as backup.`;
        sections.push({ type: "dri", items: dq.slice(0, 2) });
        // DRI lookups are precise — never lowConfidence
        return { type: "result", lowConfidence: false, answer, sections };
      }
    }

    if (intent === "what_is") {
      const faq = directFaq || (this.findFAQ(query)[0] || null);
      if (faq) {
        answer = faq.a;
        if (megatronHit) answer += `\n\n${megatronHit}`;
        if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
        const faqMatchesConcept = concept.split(" ").some(w => w.length > 3 && this.normalize(faq.q).includes(w));
        return { type: "result", lowConfidence: isSpecific && !faqMatchesConcept, answer, sections };
      }
      if (megatronHit) {
        answer = megatronHit;
        if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 1) });
        return { type: "result", lowConfidence: isSpecific, answer, sections };
      }
    }

    const fq = this.findFAQ(query);
    if (fq.length) sections.push({ type: "faq", items: fq.slice(0, 2) });
    if (dq.length) sections.push({ type: "dri", items: dq.slice(0, 3) });
    if (vq.length) sections.push({ type: "vf", items: vq.slice(0, 3) });
    if (!sections.length) return { type: "none" };
    return { type: "result", lowConfidence: isSpecific, answer, sections };
  }
}
