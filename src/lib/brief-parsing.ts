import type { Entity } from "./types";

export interface Section {
  title: string;
  content: string;
  alwaysOpen?: boolean;
}

/**
 * Split a markdown brief into its `## ` sections. The first section (before
 * any header, or under the first header) is flagged `alwaysOpen` so consumers
 * that render collapsible accordions can keep it expanded by default.
 */
export function parseSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const lines = markdown.split("\n");
  let currentTitle = "";
  let currentContent: string[] = [];
  let isFirst = true;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentTitle || currentContent.length > 0) {
        sections.push({
          title: currentTitle || "Vue d'ensemble",
          content: currentContent.join("\n").trim(),
          alwaysOpen: isFirst,
        });
        isFirst = false;
      }
      currentTitle = line.replace("## ", "");
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentTitle || currentContent.length > 0) {
    sections.push({
      title: currentTitle || "Contenu",
      content: currentContent.join("\n").trim(),
      alwaysOpen: isFirst,
    });
  }

  return sections;
}

export function sectionsToMarkdown(sections: Section[]): string {
  return sections
    .map((s) => {
      const header = `## ${s.title}`;
      return `${header}\n${s.content}`;
    })
    .join("\n\n");
}

export interface DrillReveal {
  /** Expanded mnemonic letters, e.g. ["M — Medulloblastoma", "E — Ependymoma", ...] */
  mnemonicExpansion: string[] | null;
  /** Up to 3 DDx bullets, each truncated to ~80 chars */
  ddxTop3: string[] | null;
  /** One punchy pearl, ≤ 120 chars */
  pearl: string | null;
}

/**
 * Extract a structured drill reveal from an entity's brief. Designed for the
 * daily drill flashcard: small, scannable, retrieval-friendly.
 *
 * Returns null if no reveal data could be extracted at all — callers should
 * fall back to a raw markdown snippet in that case.
 */
export function extractDrillReveal(entity: Entity): DrillReveal | null {
  const content = getBriefContent(entity);
  if (!content) return null;

  const sections = parseSections(content);
  const mnemonicSection = findSection(sections, /mn[ée]moni[qQ]ue/i);
  const perlesSection = findSection(sections, /\bperles?\b/i);
  const oralSection = findSection(sections, /template.*oral|pr[ée]sentation orale/i);
  const summarySection = findSection(sections, /r[ée]sum[ée].*diagnostic/i);

  const mnemonicExpansion =
    entity.has_mnemonic && mnemonicSection
      ? extractMnemonicExpansion(mnemonicSection.content)
      : null;

  const ddxTop3 = extractDdxTop3(
    [mnemonicSection, summarySection, oralSection]
      .filter((s): s is Section => s !== null)
      .map((s) => s.content)
  );

  const pearl = perlesSection ? extractPearl(perlesSection.content) : null;

  if (!mnemonicExpansion && !ddxTop3 && !pearl) return null;
  return { mnemonicExpansion, ddxTop3, pearl };
}

function findSection(sections: Section[], pattern: RegExp): Section | null {
  return sections.find((s) => pattern.test(s.title)) ?? null;
}

/**
 * Parse a mnemonic section into letter-labeled entries. Handles two common
 * formats Claude produces:
 *
 *   Format A (multi-line):
 *     - M = Medulloblastoma
 *     - E — Ependymoma
 *     G : Glioma
 *
 *   Format B (single line with arrow):
 *     Mnémonique: MEGA → M = Medulloblastoma, E = Ependymoma, G = Glioma, A = Astrocytoma
 *
 * Returns the list only if ≥ 3 items were extracted; otherwise null.
 */
function extractMnemonicExpansion(sectionContent: string): string[] | null {
  const clean = (raw: string) => raw.replace(/\s+/g, " ").trim();
  const letterLine = /^\s*[-•*]?\s*([A-Za-zÀ-ÿ])\s*[=:—–\-→]\s*(.+?)\s*$/;

  // Format A: iterate lines
  const lineItems: string[] = [];
  for (const line of sectionContent.split("\n")) {
    const m = line.match(letterLine);
    if (m) {
      const letter = m[1].toUpperCase();
      const desc = clean(m[2]);
      if (desc.length >= 2) lineItems.push(`${letter} — ${desc}`);
    }
  }
  if (lineItems.length >= 3) {
    return lineItems.slice(0, 10).map((s) => (s.length > 80 ? s.substring(0, 77) + "…" : s));
  }

  // Format B: find a line with an arrow followed by comma-separated X = Y
  const arrowLine = sectionContent.split("\n").find((l) => /→|⇒|->/.test(l) && /[=:]/.test(l));
  if (arrowLine) {
    const afterArrow = arrowLine.split(/→|⇒|->/).slice(-1)[0];
    const parts = afterArrow.split(/,|;/).map((p) => p.trim()).filter(Boolean);
    const items: string[] = [];
    for (const p of parts) {
      const m = p.match(/^([A-Za-zÀ-ÿ])\s*[=:—–\-]\s*(.+)$/);
      if (m) {
        const letter = m[1].toUpperCase();
        const desc = clean(m[2]);
        if (desc.length >= 2) items.push(`${letter} — ${desc}`);
      }
    }
    if (items.length >= 3) {
      return items.slice(0, 10).map((s) => (s.length > 80 ? s.substring(0, 77) + "…" : s));
    }
  }

  return null;
}

/**
 * Extract up to 3 DDx bullets from the candidate sections, in order.
 * A "bullet" is any line starting with -, •, * or a numbered list marker.
 * Skips obvious header lines (ending with ":" and no other content).
 */
function extractDdxTop3(candidateContents: string[]): string[] | null {
  const bullet = /^\s*(?:[-•*]|\d+[.)])\s+(.+?)\s*$/;
  const stripMd = (s: string) =>
    s
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim();

  for (const content of candidateContents) {
    const items: string[] = [];
    for (const line of content.split("\n")) {
      const m = line.match(bullet);
      if (!m) continue;
      const text = stripMd(m[1]);
      // Skip header-like bullets ("Inflammatoire :" with nothing after)
      if (/^[A-Za-zÀ-ÿ\s]+:\s*$/.test(text)) continue;
      // Skip letter-lines (those go in mnemonicExpansion)
      if (/^[A-Za-zÀ-ÿ]\s*[=—–\-]/.test(text)) continue;
      if (text.length < 4) continue;
      items.push(text.length > 80 ? text.substring(0, 77) + "…" : text);
      if (items.length === 3) break;
    }
    if (items.length >= 2) return items;
  }
  return null;
}

/**
 * Extract the punchiest single pearl. Takes the first non-empty bullet or
 * line from the Perles section. Strips markdown emphasis and truncates to
 * ~120 chars.
 */
function extractPearl(sectionContent: string): string | null {
  const bullet = /^\s*(?:[-•*]|\d+[.)])\s+(.+?)\s*$/;
  for (const line of sectionContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(bullet);
    const text = (m ? m[1] : trimmed).replace(/\*\*/g, "").replace(/`/g, "").trim();
    if (text.length < 8) continue;
    return text.length > 120 ? text.substring(0, 117) + "…" : text;
  }
  return null;
}

/**
 * Return a usable markdown snippet from the brief. First tries the preferred
 * sections (Mnémonique → Perles → Vue d'ensemble), then falls back to the
 * first non-empty section, then to the first `maxChars` of raw content.
 * Only returns null when the brief itself is missing or entirely blank.
 */
export function extractRawMnemonicBody(entity: Entity, maxChars = 400): string | null {
  const content = getBriefContent(entity);
  if (!content || !content.trim()) return null;

  const sections = parseSections(content);
  const patterns = [/mn[ée]moni[qQ]ue/i, /\bperles?\b/i, /vue d['’]ensemble/i];
  for (const re of patterns) {
    const section = findSection(sections, re);
    if (section && section.content.trim()) {
      return truncate(section.content, maxChars);
    }
  }

  // No preferred section matched — fall back to the first section with content.
  const firstWithContent = sections.find((s) => s.content.trim().length > 20);
  if (firstWithContent) return truncate(firstWithContent.content, maxChars);

  // Last resort: return a snippet of the whole brief, stripped of headers.
  const stripped = content.replace(/^#+\s.*$/gm, "").trim();
  if (stripped.length > 0) return truncate(stripped, maxChars);
  return null;
}

function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length > maxChars ? trimmed.substring(0, maxChars).trim() + "…" : trimmed;
}

/**
 * Defensive brief-content accessor. Supabase's `.select('..., brief:briefs(content)')`
 * returns a single object when the FK has a UNIQUE constraint (which it does
 * in this schema), but some code paths in the app still treat it as an array.
 * Handle both for safety.
 */
function getBriefContent(entity: Entity): string | null {
  const b = entity.brief as unknown;
  if (!b) return null;
  if (Array.isArray(b)) {
    const first = b[0] as { content?: string } | undefined;
    return first?.content ?? null;
  }
  const obj = b as { content?: string };
  return obj.content ?? null;
}
