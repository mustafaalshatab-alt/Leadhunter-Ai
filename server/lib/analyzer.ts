/**
 * Website Analysis Engine — LeadHunter AI's core differentiator.
 *
 * Fetches a website URL, parses its HTML, detects ~10 health signals,
 * and produces a 0–100 lead score indicating how badly the business
 * needs a new website.
 *
 * Lower score = more problems = hotter lead for web agencies.
 */

export interface Finding {
  type: "positive" | "negative" | "neutral";
  signal: string;
  detail: string;
}

export interface AnalysisMetrics {
  hasSsl: boolean;
  hasMobileViewport: boolean;
  loadTimeMs: number | null;
  title: string | null;
  metaDescription: string | null;
  hasH1: boolean;
  contactMethods: string[];
  wordCount: number | null;
  lastModified: string | null;
  redirectsTo: string | null;
}

export interface AnalysisResult {
  url: string;
  reachable: boolean;
  score: number;
  tier: "gold" | "excellent" | "good" | "average" | "low";
  findings: Finding[];
  metrics: AnalysisMetrics;
}

// ─── Constants ────────────────────────────────────────────────────────

const CONNECT_TIMEOUT_MS = 10_000; // Timeout for establishing connection
const TOTAL_TIMEOUT_MS = 15_000; // Total fetch timeout including body
const MAX_REDIRECTS = 5;
const OUTDATED_YEAR_THRESHOLD = 2020; // Copyright years before this are "old"

// Social media / non-website domains that indicate the business has no real site
const SOCIAL_REDIRECT_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "maps.google.com",
  "google.com/maps",
  "yelp.com",
  "tripadvisor.com",
];

// Deprecated tech signals (appear in HTML)
const DEPRECATED_SIGNALS = [
  /<meta[^>]+http-equiv=["']?X-UA-Compatible/i, // Old IE meta
  /<center\b/i, // <center> tag (deprecated in HTML4)
  /<font\b/i, // <font> tag (deprecated)
];

// ─── URL Helpers ──────────────────────────────────────────────────────

/** Normalize a URL by adding https:// if no protocol is present. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Extract the domain from a URL. */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// ─── Detectors ────────────────────────────────────────────────────────

/** Fetch a URL (following redirects) and return response info + body. */
async function fetchPage(
  url: string
): Promise<{
  reachable: boolean;
  finalUrl: string;
  body: string | null;
  loadTimeMs: number | null;
  lastModified: string | null;
  redirectChain: string[];
  httpStatus: number;
  errorMessage?: string;
}> {
  const redirectChain: string[] = [url];
  let currentUrl = url;
  let totalTime = 0;
  let lastModified: string | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const startTime = Date.now();
    let response: Response;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent":
            "LeadHunterAI/1.0 (Website Analyzer; +https://leadhunter.ai)",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
      });

      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;
      totalTime += elapsed;
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      totalTime += elapsed;

      if (err.name === "AbortError") {
        return {
          reachable: false,
          finalUrl: currentUrl,
          body: null,
          loadTimeMs: totalTime,
          lastModified: null,
          redirectChain,
          httpStatus: 0,
          errorMessage: "Connection timed out",
        };
      }

      return {
        reachable: false,
        finalUrl: currentUrl,
        body: null,
        loadTimeMs: totalTime,
        lastModified: null,
        redirectChain,
        httpStatus: 0,
        errorMessage: err.message || "Connection failed",
      };
    }

    // Check for redirect
    const redirectTo = response.headers.get("location");
    if (redirectTo && [301, 302, 303, 307, 308].includes(response.status)) {
      // Resolve relative redirects
      const resolved = new URL(redirectTo, currentUrl).href;
      redirectChain.push(resolved);
      currentUrl = resolved;

      // Check for redirect loops (redirecting to a URL already in chain)
      if (redirectChain.slice(0, -1).includes(resolved)) {
        return {
          reachable: false,
          finalUrl: resolved,
          body: null,
          loadTimeMs: totalTime,
          lastModified: null,
          redirectChain,
          httpStatus: response.status,
          errorMessage: "Redirect loop detected",
        };
      }
      continue;
    }

    // Not a redirect — read the body
    lastModified = response.headers.get("last-modified");
    let body: string | null = null;

    try {
      const bodyStart = Date.now();
      const bodyController = new AbortController();
      const bodyTimeoutId = setTimeout(
        () => bodyController.abort(),
        TOTAL_TIMEOUT_MS - totalTime
      );

      // Only read text/html responses
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
        body = await response.text();
      }

      clearTimeout(bodyTimeoutId);
      totalTime = Date.now() - startTime; // Recalculate from original start
    } catch {
      body = null;
      totalTime = TOTAL_TIMEOUT_MS; // Cap if body read failed
    }

    return {
      reachable: true,
      finalUrl: currentUrl,
      body,
      loadTimeMs: totalTime,
      lastModified,
      redirectChain,
      httpStatus: response.status,
    };
  }

  // Exceeded max redirects
  return {
    reachable: false,
    finalUrl: currentUrl,
    body: null,
    loadTimeMs: totalTime,
    lastModified: null,
    redirectChain,
    httpStatus: 0,
    errorMessage: `Exceeded maximum redirects (${MAX_REDIRECTS})`,
  };
}

/** Check if the URL uses HTTPS. */
function detectSsl(url: string, redirectChain: string[]): boolean {
  const allUrls = [url, ...redirectChain];
  const finalUrl = allUrls[allUrls.length - 1];
  return finalUrl.startsWith("https://");
}

/** Parse text content from HTML body (strip tags, scripts, styles). */
function extractVisibleText(html: string): string {
  // Remove scripts, styles, head, and HTML comments
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ")
    // Strip remaining HTML tags
    .replace(/<[^>]*>/g, " ")
    // Decode common entities
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#?\w+;/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

/** Count words in visible text. */
function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Extract HTML <title>. */
function extractTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (!match) return null;
  return match[1].replace(/<[^>]*>/g, "").trim() || null;
}

/** Extract meta description. */
function extractMetaDescription(html: string): string | null {
  const match = html.match(
    /<meta\s[^>]*name=["'](?:\s*)description(?:\s*)["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );
  if (match) return match[1].trim();
  // Try reversed attribute order
  const match2 = html.match(
    /<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["'](?:\s*)description(?:\s*)["'][^>]*>/i
  );
  if (match2) return match2[1].trim();
  return null;
}

/** Check for viewport meta tag with width=device-width. */
function detectMobileViewport(html: string): boolean {
  return /<meta\s[^>]*name=["'][^"']*viewport[^"']*["'][^>]*content=["'][^"']*width\s*=\s*device-width/i.test(
    html
  );
}

/** Check for exactly one <h1> tag. */
function detectH1(html: string): boolean {
  const matches = html.match(/<h1\b[\s>]/gi);
  return matches !== null && matches.length >= 1;
}

/** Count <h1> tags. */
function countH1(html: string): number {
  const matches = html.match(/<h1\b[\s>]/gi);
  return matches ? matches.length : 0;
}

/** Detect phone numbers in visible text. */
function detectPhone(text: string): boolean {
  // Match various phone formats: (123) 456-7890, 123-456-7890, +1 123 456 7890, etc.
  return /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text);
}

/** Detect email addresses in visible text. */
function detectEmail(text: string): boolean {
  return /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
}

/** Detect contact form patterns in HTML. */
function detectContactForm(html: string): boolean {
  // Look for forms with name/email fields
  const hasForm = /<form\b/i.test(html);
  if (!hasForm) return false;

  const hasNameField =
    /<input\s[^>]*(?:name=["'][^"']*name[^"']*["']|id=["'][^"']*name[^"']*["']|placeholder=["'][^"']*(?:name|your name)[^"']*["'])/i.test(
      html
    );
  const hasEmailField =
    /<input\s[^>]*(?:type=["']email["']|name=["'][^"']*email[^"']*["']|placeholder=["'][^"']*(?:email|e-mail)[^"']*["'])/i.test(
      html
    );

  return hasNameField || hasEmailField;
}

/** Detect physical address in visible text. */
function detectAddress(text: string): boolean {
  // Simple heuristic: street number + street name patterns, PO Box, etc.
  return (
    /\d+\s+\w+(?:\s+\w+)?\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|boulevard|way|court|ct|plaza|pl|circle|cir)\b/i.test(
      text
    ) ||
    /P\.?O\.?\s*Box\s+\d+/i.test(text) ||
    /\d{5}(?:-\d{4})?/.test(text) // US ZIP code (a signal, not definitive)
  );
}

/** Detect outdated website indicators. */
function detectOutdated(html: string, text: string): {
  count: number;
  signals: string[];
} {
  const signals: string[] = [];

  // Check copyright year
  const copyrightMatch = text.match(
    /(?:copyright|©)\s*(?:20\d{2}\s*[-–]\s*)?(20\d{2})/i
  );
  if (copyrightMatch) {
    const year = parseInt(copyrightMatch[1]);
    if (year < OUTDATED_YEAR_THRESHOLD) {
      signals.push(`Copyright year ${year} (before ${OUTDATED_YEAR_THRESHOLD})`);
    }
  }

  // Check deprecated tech signals
  for (const pattern of DEPRECATED_SIGNALS) {
    if (pattern.test(html)) {
      if (pattern.source.includes("X-UA-Compatible")) {
        signals.push("Uses X-UA-Compatible meta tag (IE-specific)");
      } else if (pattern.source.includes("<center")) {
        signals.push("Uses deprecated <center> tag");
      } else if (pattern.source.includes("<font")) {
        signals.push("Uses deprecated <font> tag");
      }
    }
  }

  // Check for old jQuery versions
  const jqueryMatch = html.match(
    /jquery[\/-]?([\d.]+)(?:\.min)?\.js/i
  );
  if (jqueryMatch) {
    const ver = jqueryMatch[1];
    const major = parseInt(ver.split(".")[0]);
    if (major <= 2) {
      signals.push(`Uses jQuery ${ver} (outdated)`);
    }
  }

  // Check for table-based layout (crude heuristic)
  const tableCount = (html.match(/<table\b/gi) || []).length;
  if (tableCount > 5) {
    signals.push(`Heavy table usage (${tableCount} tables — may indicate table-based layout)`);
  }

  return { count: signals.length, signals };
}

/** Check if redirect goes to a social media / non-business domain. */
function isSocialRedirect(finalUrl: string, originalDomain: string): boolean {
  try {
    const finalHostname = extractHostname(finalUrl);
    const originalHostname = extractHostname(originalDomain);

    // Different domain entirely
    if (finalHostname && originalHostname && finalHostname !== originalHostname) {
      // Check against social redirect list
      for (const social of SOCIAL_REDIRECT_DOMAINS) {
        if (finalHostname.includes(social) || finalUrl.includes(social)) {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

/** Check if final domain is different from original domain. */
function isDifferentDomain(finalUrl: string, originalUrl: string): boolean {
  try {
    return extractHostname(finalUrl) !== extractHostname(originalUrl);
  } catch {
    return false;
  }
}

/** Detect contact methods available. */
function detectContactMethods(
  html: string,
  text: string
): { methods: string[]; hasPhone: boolean; hasEmail: boolean; hasContactForm: boolean; hasAddress: boolean } {
  const methods: string[] = [];
  const hasPhone = detectPhone(text);
  const hasEmail = detectEmail(text);
  const hasContactForm = detectContactForm(html);
  const hasAddress = detectAddress(text);

  if (hasPhone) methods.push("phone");
  if (hasEmail) methods.push("email");
  if (hasContactForm) methods.push("contact form");
  if (hasAddress) methods.push("address");

  return { methods, hasPhone, hasEmail, hasContactForm, hasAddress };
}

// ─── Scoring ──────────────────────────────────────────────────────────

function computeScore(
  metrics: AnalysisMetrics,
  redirectInfo: {
    chainLength: number;
    differentDomain: boolean;
    socialRedirect: boolean;
  },
  outdatedCount: number,
  wordCount: number | null,
  loadTimeMs: number | null,
  hasSsl: boolean
): { score: number; deductions: { reason: string; amount: number }[] } {
  const deductions: { reason: string; amount: number }[] = [];
  let score = 100;

  const deduct = (reason: string, amount: number) => {
    deductions.push({ reason, amount });
    score -= amount;
  };

  // SSL
  if (!hasSsl) deduct("No HTTPS", 20);

  // Redirect issues
  if (redirectInfo.socialRedirect) {
    deduct("Redirects to social media / Google Maps — no real website", 25);
  } else if (redirectInfo.differentDomain) {
    deduct("Redirects to a different domain", 25);
  }

  // Mobile viewport
  if (!metrics.hasMobileViewport) deduct("Missing mobile viewport meta tag", 15);

  // Title
  if (!metrics.title) {
    deduct("Missing <title> tag", 10);
  } else if (metrics.title.length < 10 || metrics.title.length > 120) {
    deduct("Title tag is poorly sized", 5);
  }

  // Meta description
  if (!metrics.metaDescription) deduct("Missing meta description", 5);

  // H1
  if (!metrics.hasH1) deduct("No H1 heading", 5);

  // Contact methods
  if (!metrics.contactMethods.includes("phone")) deduct("No phone number found", 15);
  if (!metrics.contactMethods.includes("email")) deduct("No email found", 10);
  if (!metrics.contactMethods.includes("contact form")) deduct("No contact form found", 5);
  if (!metrics.contactMethods.includes("address")) deduct("No physical address found", 5);

  // Word count
  if (wordCount !== null && wordCount < 100) {
    deduct(`Low word count (${wordCount} words)`, 15);
  }

  // Outdated
  if (outdatedCount >= 3) deduct(`${outdatedCount} outdated signals detected`, 10);

  // Load time
  if (loadTimeMs !== null && loadTimeMs > 10_000) {
    deduct(`Very slow load (${Math.round(loadTimeMs / 1000)}s)`, 20);
  } else if (loadTimeMs !== null && loadTimeMs > 5_000) {
    deduct(`Slow load (${Math.round(loadTimeMs / 1000)}s)`, 10);
  }

  return { score: Math.max(0, score), deductions };
}

function computeTier(score: number): AnalysisResult["tier"] {
  if (score >= 85) return "gold";
  if (score >= 70) return "excellent";
  if (score >= 55) return "good";
  if (score >= 35) return "average";
  return "low";
}

// ─── Main Export ──────────────────────────────────────────────────────

/**
 * Analyze a business website URL and produce a lead score (0–100).
 *
 * Lower scores = more problems = hotter lead for web agencies.
 */
export async function analyzeWebsite(url: string): Promise<AnalysisResult> {
  // ── No website ──
  if (!url || !url.trim()) {
    return {
      url: "",
      reachable: false,
      score: 0,
      tier: "low",
      findings: [
        {
          type: "negative",
          signal: "no_website",
          detail: "Business has no website listed",
        },
      ],
      metrics: {
        hasSsl: false,
        hasMobileViewport: false,
        loadTimeMs: null,
        title: null,
        metaDescription: null,
        hasH1: false,
        contactMethods: [],
        wordCount: null,
        lastModified: null,
        redirectsTo: null,
      },
    };
  }

  const normalizedUrl = normalizeUrl(url);
  const originalDomain = extractHostname(normalizedUrl);

  // ── Fetch page ──
  const page = await fetchPage(normalizedUrl);

  // ── Unreachable ──
  if (!page.reachable || !page.body) {
    return {
      url: normalizedUrl,
      reachable: false,
      score: 0,
      tier: "low",
      findings: [
        {
          type: "negative",
          signal: "unreachable",
          detail: page.errorMessage
            ? `Website unreachable: ${page.errorMessage}`
            : "Website unreachable",
        },
      ],
      metrics: {
        hasSsl: detectSsl(normalizedUrl, page.redirectChain),
        hasMobileViewport: false,
        loadTimeMs: page.loadTimeMs,
        title: null,
        metaDescription: null,
        hasH1: false,
        contactMethods: [],
        wordCount: null,
        lastModified: page.lastModified,
        redirectsTo:
          page.redirectChain.length > 1
            ? page.redirectChain[page.redirectChain.length - 1]
            : null,
      },
    };
  }

  // ── Analyze HTML ──
  const html = page.body;
  const visibleText = extractVisibleText(html);
  const wordCount = countWords(visibleText);
  const title = extractTitle(html);
  const metaDescription = extractMetaDescription(html);
  const hasMobileViewport = detectMobileViewport(html);
  const hasH1 = detectH1(html);
  const h1Count = countH1(html);
  const contact = detectContactMethods(html, visibleText);
  const outdated = detectOutdated(html, visibleText);
  const hasSsl = detectSsl(normalizedUrl, page.redirectChain);

  // ── Redirect analysis ──
  const chainLength = page.redirectChain.length;
  const finalUrl = page.redirectChain[page.redirectChain.length - 1];
  const differentDomain = chainLength > 1 && isDifferentDomain(finalUrl, normalizedUrl);
  const socialRedirect = isSocialRedirect(finalUrl, originalDomain);

  // ── Build findings ──
  const findings: Finding[] = [];

  // SSL
  if (hasSsl) {
    findings.push({
      type: "positive",
      signal: "has_ssl",
      detail: "Website uses HTTPS",
    });
  } else {
    findings.push({
      type: "negative",
      signal: "ssl_missing",
      detail: "Website does not use HTTPS",
    });
  }

  // Redirect findings
  if (socialRedirect) {
    findings.push({
      type: "negative",
      signal: "social_redirect",
      detail: `Website redirects to ${extractHostname(finalUrl)} — no dedicated business website`,
    });
  } else if (differentDomain) {
    findings.push({
      type: "negative",
      signal: "domain_redirect",
      detail: `Website redirects to a different domain: ${extractHostname(finalUrl)}`,
    });
  } else if (chainLength > 3) {
    findings.push({
      type: "neutral",
      signal: "long_redirect_chain",
      detail: `Redirect chain of ${chainLength} hops (excessive)`,
    });
  }

  // Mobile
  if (hasMobileViewport) {
    findings.push({
      type: "positive",
      signal: "mobile_friendly",
      detail: "Has mobile viewport meta tag",
    });
  } else {
    findings.push({
      type: "negative",
      signal: "not_mobile_friendly",
      detail: "Missing mobile viewport meta tag — site may not be mobile-friendly",
    });
  }

  // Title
  if (title) {
    if (title.length >= 10 && title.length <= 120) {
      findings.push({ type: "positive", signal: "has_title", detail: `Title: "${title}"` });
    } else {
      findings.push({
        type: "negative",
        signal: "poor_title",
        detail: `Title is poorly sized (${title.length} chars): "${title}"`,
      });
    }
  } else {
    findings.push({ type: "negative", signal: "missing_title", detail: "Missing <title> tag" });
  }

  // Meta description
  if (metaDescription) {
    findings.push({
      type: "positive",
      signal: "has_meta_description",
      detail: `Meta description: "${metaDescription.slice(0, 120)}${metaDescription.length > 120 ? "..." : ""}"`,
    });
  } else {
    findings.push({
      type: "negative",
      signal: "missing_meta_description",
      detail: "Missing meta description",
    });
  }

  // H1
  if (h1Count === 1) {
    findings.push({ type: "positive", signal: "good_h1", detail: "Single H1 heading present" });
  } else if (h1Count === 0) {
    findings.push({ type: "negative", signal: "missing_h1", detail: "No H1 heading found" });
  } else {
    findings.push({
      type: "neutral",
      signal: "multiple_h1",
      detail: `${h1Count} H1 headings found (should have exactly one)`,
    });
  }

  // Word count
  if (wordCount !== null) {
    if (wordCount >= 200) {
      findings.push({
        type: "positive",
        signal: "good_content",
        detail: `Good content length: ${wordCount} words`,
      });
    } else if (wordCount >= 100) {
      findings.push({
        type: "neutral",
        signal: "moderate_content",
        detail: `Moderate content length: ${wordCount} words`,
      });
    } else {
      findings.push({
        type: "negative",
        signal: "thin_content",
        detail: `Thin content: only ${wordCount} words`,
      });
    }
  }

  // Contact methods
  if (contact.methods.length >= 3) {
    findings.push({
      type: "positive",
      signal: "good_contact",
      detail: `Multiple contact methods: ${contact.methods.join(", ")}`,
    });
  } else if (contact.methods.length > 0) {
    findings.push({
      type: "neutral",
      signal: "limited_contact",
      detail: `Limited contact methods: ${contact.methods.join(", ")}`,
    });
  } else {
    findings.push({
      type: "negative",
      signal: "no_contact",
      detail: "No contact methods found on page",
    });
  }

  // Outdated signals
  if (outdated.count > 0) {
    for (const sig of outdated.signals) {
      findings.push({
        type: "negative",
        signal: "outdated",
        detail: sig,
      });
    }
  } else {
    findings.push({
      type: "positive",
      signal: "modern",
      detail: "No obvious outdated signals detected",
    });
  }

  // Load time
  if (page.loadTimeMs !== null) {
    if (page.loadTimeMs > 10_000) {
      findings.push({
        type: "negative",
        signal: "very_slow_loading",
        detail: `Very slow: ${(page.loadTimeMs / 1000).toFixed(1)}s`,
      });
    } else if (page.loadTimeMs > 5_000) {
      findings.push({
        type: "negative",
        signal: "slow_loading",
        detail: `Slow loading: ${(page.loadTimeMs / 1000).toFixed(1)}s`,
      });
    } else {
      findings.push({
        type: "positive",
        signal: "fast_loading",
        detail: `Loads in ${(page.loadTimeMs / 1000).toFixed(1)}s`,
      });
    }
  }

  // HTTP status
  if (page.httpStatus >= 400) {
    findings.push({
      type: "negative",
      signal: "error_status",
      detail: `HTTP ${page.httpStatus} error`,
    });
  }

  // ── Compute score ──
  const { score, deductions } = computeScore(
    {
      hasSsl,
      hasMobileViewport,
      loadTimeMs: page.loadTimeMs,
      title,
      metaDescription,
      hasH1,
      contactMethods: contact.methods,
      wordCount,
      lastModified: page.lastModified,
      redirectsTo: chainLength > 1 ? finalUrl : null,
    },
    {
      chainLength,
      differentDomain,
      socialRedirect,
    },
    outdated.count,
    wordCount,
    page.loadTimeMs,
    hasSsl
  );

  const tier = computeTier(score);

  // Add score summary finding
  findings.unshift({
    type: score >= 70 ? "positive" : score >= 35 ? "neutral" : "negative",
    signal: "lead_score",
    detail: `Lead score: ${score}/100 — ${deductions.length > 0 ? `${deductions.length} issues found` : "no major issues"}`,
  });

  return {
    url: normalizedUrl,
    reachable: true,
    score,
    tier,
    findings,
    metrics: {
      hasSsl,
      hasMobileViewport,
      loadTimeMs: page.loadTimeMs,
      title,
      metaDescription,
      hasH1,
      contactMethods: contact.methods,
      wordCount,
      lastModified: page.lastModified,
      redirectsTo: chainLength > 1 ? finalUrl : null,
    },
  };
}

/**
 * Generate a "no website" analysis result with a score based on review count.
 * Businesses with many reviews but no website are gold leads.
 */
export function analyzeNoWebsite(reviewCount: number): AnalysisResult {
  let score: number;
  let tier: AnalysisResult["tier"];

  if (reviewCount >= 10) {
    score = 90;
    tier = "gold";
  } else if (reviewCount >= 5) {
    score = 75;
    tier = "excellent";
  } else {
    score = 60;
    tier = "good";
  }

  return {
    url: "",
    reachable: false,
    score,
    tier,
    findings: [
      {
        type: score >= 85 ? "positive" : "neutral",
        signal: "lead_score",
        detail: `Lead score: ${score}/100 — no website but ${reviewCount} reviews (high-intent lead)`,
      },
      {
        type: "negative",
        signal: "no_website",
        detail: "Business has no website listed",
      },
    ],
    metrics: {
      hasSsl: false,
      hasMobileViewport: false,
      loadTimeMs: null,
      title: null,
      metaDescription: null,
      hasH1: false,
      contactMethods: [],
      wordCount: null,
      lastModified: null,
      redirectsTo: null,
    },
  };
}

/**
 * Update a business record in the DB with analysis results.
 * Used by the scan orchestrator after analysis completes.
 */
export function saveAnalysisToDb(
  db: any,
  businessId: number,
  result: AnalysisResult
): void {
  db.prepare(
    `UPDATE businesses
     SET lead_score = ?,
         analysis_json = ?
     WHERE id = ?`
  ).run(result.score, JSON.stringify(result), businessId);
}
