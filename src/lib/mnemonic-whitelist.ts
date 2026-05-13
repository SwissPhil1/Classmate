import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whitelist of mnemonics validated against trusted radiology references:
 *   - Crack the Core (Prometheus Lionhart)
 *   - Core Radiology (Mandell)
 *   - Radiology Vibes — curated FRCR/EDiR mnemonic list (Dr. Awal,
 *     with source references to Dahnert, Chapman & Nakielny, Brant & Helms,
 *     RadioGraphics, AJR, Radiopaedia).
 *   - ESR EPOS 2024 — European Congress of Radiology mnemonic poster.
 *
 * Any mnemonic tagged by Claude that does not match this list is treated as a
 * hallucination and rejected (has_mnemonic → false, mnemonic_name → null).
 *
 * Each entry holds the canonical form, all variant spellings, and the theme
 * used to group them in the standalone mnemonic learning module.
 *
 * Matching is done after normalize() — case- and punctuation-insensitive.
 */
export interface CanonicalMnemonicEntry {
  canonical: string;
  variants: readonly string[];
  theme: string;
}

const NEURO = "Neuro / Tête & cou";
const THORAX = "Thorax / Poumon / Médiastin";
const CARDIO = "Cardiovasculaire / Vasculaire";
const ABDO = "Abdomen / Digestif / GU";
const GYN = "Gynéco-obstétrique";
const MSK = "Musculo-squelettique";
const MAMMO = "Mammaire / Signes";
const PEDIA = "Pédiatrique / Syndromique";
const NUC = "Nucléaire";
const MULTI = "Général / Multi-système";
const DIVERS = "Divers / Règles nommées";
const ESR = "ESR EPOS 2024";

export const CANONICAL_MNEMONIC_ENTRIES: readonly CanonicalMnemonicEntry[] = [
  // ── Neuro / Tête & cou ──────────────────────────────────────────
  { canonical: "7 Up Coke Down", variants: ["7 Up Coke Down", "7 Up - Coke Down"], theme: NEURO },
  { canonical: "ACGME'S MC", variants: ["ACGME'S MC", "ACGMES MC"], theme: NEURO },
  { canonical: "Basal ICV", variants: ["Basal ICV"], theme: NEURO },
  { canonical: "CONMAN", variants: ["CONMAN"], theme: NEURO },
  { canonical: "FEDS", variants: ["FEDS"], theme: NEURO },
  { canonical: "George Washington Bridge", variants: ["George Washington Bridge", "GWB"], theme: NEURO },
  { canonical: "GRAD RAP", variants: ["GRAD RAP", "GRADRAP"], theme: NEURO },
  { canonical: "HEAL", variants: ["HEAL"], theme: NEURO },
  { canonical: "HIPPEL", variants: ["HIPPEL"], theme: NEURO },
  { canonical: "It Be Iddy Biddy BaBy Doo Doo", variants: ["It Be Iddy Biddy BaBy Doo Doo", "It Be Iddy Biddy, BaBy, Doo-Doo"], theme: NEURO },
  { canonical: "MAGIC DR", variants: ["MAGIC DR", "MAGICDR", "DR MAGIC"], theme: NEURO },
  { canonical: "MEGA", variants: ["MEGA"], theme: NEURO },
  { canonical: "MOuSTACHE", variants: ["MOuSTACHE", "MOUSTACHE"], theme: NEURO },
  { canonical: "MSME", variants: ["MSME", "MISME"], theme: NEURO },
  { canonical: "O2", variants: ["O2"], theme: NEURO },
  { canonical: "Old Elephants Age Gracefully", variants: ["Old Elephants Age Gracefully"], theme: NEURO },
  { canonical: "Oreo Cookie", variants: ["Oreo Cookie"], theme: NEURO },
  { canonical: "R2V2", variants: ["R2V2"], theme: NEURO },
  { canonical: "SAME", variants: ["SAME"], theme: NEURO },

  // ── Thorax / Poumon / Médiastin ─────────────────────────────────
  { canonical: "4Ts", variants: ["4Ts", "4 Ts", "Four Ts"], theme: THORAX },
  { canonical: "BADSAI", variants: ["BADSAI"], theme: THORAX },
  { canonical: "BREAST", variants: ["BREAST"], theme: THORAX },
  { canonical: "CAVITY", variants: ["CAVITY"], theme: THORAX },
  { canonical: "CHARM G", variants: ["CHARM G", "CHARMG"], theme: THORAX },
  { canonical: "HARSH", variants: ["HARSH"], theme: THORAX },
  { canonical: "MNoP", variants: ["MNoP", "MNOP"], theme: THORAX },

  // ── Cardiovasculaire / Vasculaire ───────────────────────────────
  { canonical: "I Love Sex", variants: ["I Love Sex"], theme: CARDIO },
  { canonical: "I'M SLOw", variants: ["I'M SLOw", "IM SLOW"], theme: CARDIO },

  // ── Abdomen / Digestif / GU ─────────────────────────────────────
  { canonical: "COGA", variants: ["COGA"], theme: ABDO },
  { canonical: "DOPE Gardner", variants: ["DOPE Gardner", "DOPE"], theme: ABDO },
  { canonical: "IPS", variants: ["IPS"], theme: ABDO },
  { canonical: "MAH HOP", variants: ["MAH HOP", "MAHHOP"], theme: ABDO },
  { canonical: "Michael Jackson", variants: ["Michael Jackson"], theme: ABDO },
  { canonical: "NSAIDs", variants: ["NSAIDs", "NSAIDS"], theme: ABDO },
  { canonical: "TURbans", variants: ["TURbans", "TURBANS", "Turcot"], theme: ABDO },

  // ── Gynéco-obstétrique ──────────────────────────────────────────
  { canonical: "Meigs Syndrome", variants: ["Meigs Syndrome", "Meigs"], theme: GYN },

  // ── Musculo-squelettique ────────────────────────────────────────
  { canonical: "ASP", variants: ["ASP"], theme: MSK },
  { canonical: "CRITOE", variants: ["CRITOE"], theme: MSK },
  { canonical: "DAL", variants: ["DAL"], theme: MSK },
  { canonical: "FEGNOMASHIC", variants: ["FEGNOMASHIC", "FOG MACHINES", "FOGMACHINES"], theme: MSK },
  { canonical: "FEMALE", variants: ["FEMALE"], theme: MSK },
  { canonical: "GOATS OF PD", variants: ["GOATS OF PD", "GOATS PD", "GOATSOFPD"], theme: MSK },
  { canonical: "LOSS", variants: ["LOSS"], theme: MSK },
  { canonical: "MELON", variants: ["MELON"], theme: MSK },
  { canonical: "MELT", variants: ["MELT"], theme: MSK },
  { canonical: "MUGR", variants: ["MUGR"], theme: MSK },
  { canonical: "NIMROD", variants: ["NIMROD"], theme: MSK },
  { canonical: "OATs", variants: ["OATs", "OATS"], theme: MSK },
  { canonical: "PORK-CHOP", variants: ["PORK-CHOP", "PORK CHOP", "PORKCHOP", "PORKCHOPS"], theme: MSK },
  { canonical: "PROT", variants: ["PROT"], theme: MSK },
  { canonical: "SALMON", variants: ["SALMON"], theme: MSK },
  { canonical: "SALTeR", variants: ["SALTeR", "SALTER"], theme: MSK },
  { canonical: "VACTERL", variants: ["VACTERL"], theme: MSK },

  // ── Mammaire / Signes ───────────────────────────────────────────
  { canonical: "Lead Sinks Muffins Rise", variants: ["Lead Sinks Muffins Rise", "Lead Sinks, Muffins Rise"], theme: MAMMO },
  { canonical: 'Schat"B"ki Ring', variants: ['Schat"B"ki Ring', "Schatzki Ring", "Schatzki"], theme: MAMMO },
  { canonical: "Ursula", variants: ["Ursula"], theme: MAMMO },

  // ── Pédiatrique / Syndromique ───────────────────────────────────
  { canonical: "CHARGE", variants: ["CHARGE"], theme: PEDIA },
  { canonical: "PHACES", variants: ["PHACES"], theme: PEDIA },

  // ── Nucléaire ───────────────────────────────────────────────────
  { canonical: "I Lived Bitch", variants: ["I Lived Bitch"], theme: NUC },

  // ── Général / Multi-système ─────────────────────────────────────
  { canonical: "WWII", variants: ["WWII", "World War II", "WW2"], theme: MULTI },
  { canonical: "CT-MRI-PET", variants: ["CT-MRI-PET", "CT MRI PET", "CTMRIPET"], theme: MULTI },
  { canonical: "TEACH", variants: ["TEACH"], theme: MULTI },
  { canonical: "3Ps", variants: ["3Ps", "Pit-Para-Pan", "Pit Para Pan"], theme: MULTI },
  { canonical: "1M 2P", variants: ["1M 2P", "Me-Para-Pheo"], theme: MULTI },
  { canonical: "1P 2M", variants: ["1P 2M", "Me-MM-Pheo"], theme: MULTI },

  // ── Divers / Règles nommées ─────────────────────────────────────
  { canonical: "Rule of 3s", variants: ["Rule of 3s", "Rule of 3", "Rule of Threes"], theme: DIVERS },

  // ── ESR EPOS — European Congress of Radiology poster (2024) ─────
  { canonical: "Blood Can Be Very Bad", variants: ["Blood Can Be Very Bad"], theme: ESR },
  { canonical: "VITAMIN", variants: ["VITAMIN", "VITAMIN C", "VITAMIN CD", "VITAMIN C&D", "VITAMIN CDEF"], theme: ESR },
  { canonical: "PACHI MENINGES", variants: ["PACHI MENINGES", "PACHI"], theme: ESR },
  { canonical: "LAMP CAMP", variants: ["LAMP CAMP"], theme: ESR },
  { canonical: "My Best Friend is Pretty Cool", variants: ["My Best Friend is Pretty Cool", "My Best Friend Is Pretty Cool"], theme: ESR },
  { canonical: "SEAL", variants: ["SEAL"], theme: ESR },
  { canonical: "Normal BIRTH", variants: ["Normal BIRTH", "BIRTH"], theme: ESR },
  { canonical: "STURGE CAPS", variants: ["STURGE CAPS"], theme: ESR },
  { canonical: "STOMACH", variants: ["STOMACH"], theme: ESR },
  { canonical: "Jefferson Bit Off A Hangman's Thumb", variants: ["Jefferson Bit Off A Hangman's Thumb", "Jefferson Bit Off A Hangmans Thumb"], theme: ESR },
  { canonical: "SMALL MEN", variants: ["SMALL MEN"], theme: ESR },
  { canonical: "I HEAL", variants: ["I HEAL", "IHEAL"], theme: ESR },
  { canonical: "CRESP", variants: ["CRESP"], theme: ESR },
  { canonical: "ABCDEFGHI", variants: ["ABCDEFGHI"], theme: ESR },
  { canonical: "CARPETS", variants: ["CARPETS"], theme: ESR },
  { canonical: "Thanks So Much", variants: ["Thanks So Much"], theme: ESR },
  { canonical: "METAL", variants: ["METAL"], theme: ESR },
  { canonical: "HALT", variants: ["HALT"], theme: ESR },
  { canonical: "CHIMP", variants: ["CHIMP"], theme: ESR },
  { canonical: "Grovelling Surgeons Expect Immediate CT Scans", variants: ["Grovelling Surgeons Expect Immediate CT Scans", "Grovelling Surgeons"], theme: ESR },
  { canonical: "ChIPS", variants: ["ChIPS", "CHIPS"], theme: ESR },
  { canonical: "L SHAPE", variants: ["L SHAPE", "L-SHAPE"], theme: ESR },
  { canonical: "PROMS", variants: ["PROMS"], theme: ESR },
];

/**
 * The 12 themes used to group mnemonics in the catalogue. Order matters for
 * display — kept stable across additions.
 */
export const MNEMONIC_THEMES: readonly string[] = [
  NEURO, THORAX, CARDIO, ABDO, GYN, MSK, MAMMO, PEDIA, NUC, MULTI, DIVERS, ESR,
];

/**
 * Backward-compatible export — derived from the typed entries. Existing callers
 * (regex backfill, isValidMnemonic) continue to receive `string[][]`.
 */
export const CANONICAL_MNEMONICS: readonly (readonly string[])[] =
  CANONICAL_MNEMONIC_ENTRIES.map((e) => e.variants);

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toUpperCase()
    .replace(/['"‘’`´]/g, "") // strip all quote marks (curly + straight)
    .replace(/[.()[\]{}!?:;,]/g, "") // strip other punctuation
    .replace(/[-/\\_]/g, " ") // hyphen/slash/underscore → space
    .replace(/\s+/g, " ")
    .trim();
}

const NORMALIZED_SET: ReadonlySet<string> = new Set(
  CANONICAL_MNEMONIC_ENTRIES.flatMap((e) => e.variants.map(normalize))
);

/**
 * Returns true if `name` matches one of the validated mnemonics (case- and
 * punctuation-insensitive). Returns false for null / undefined / empty strings.
 */
export function isValidMnemonic(name: string | null | undefined): boolean {
  if (!name || !name.trim()) return false;
  return NORMALIZED_SET.has(normalize(name));
}

/**
 * The full list of canonical names (first variant of each entry), for display
 * purposes e.g. on a validation page.
 */
export const CANONICAL_MNEMONIC_NAMES: readonly string[] =
  CANONICAL_MNEMONIC_ENTRIES.map((e) => e.canonical);

export interface InvalidMnemonicRow {
  entity_id: string;
  entity_name: string;
  mnemonic_name: string | null;
}

/**
 * Scan the user's entities, find those flagged has_mnemonic=true whose
 * mnemonic_name is NOT in the whitelist, and clear both flags. Does NOT touch
 * `priority` — a can't-miss vital stays vital even if its alleged mnemonic was
 * a hallucination.
 */
export async function cleanupInvalidMnemonics(
  supabase: SupabaseClient,
  userId: string
): Promise<{ cleared: number; rows: InvalidMnemonicRow[] }> {
  const { data, error } = await supabase
    .from("entities")
    .select("id, name, mnemonic_name")
    .eq("user_id", userId)
    .eq("has_mnemonic", true);
  if (error) throw error;

  const invalid: InvalidMnemonicRow[] = (data ?? [])
    .filter((e) => !isValidMnemonic(e.mnemonic_name as string | null))
    .map((e) => ({
      entity_id: e.id as string,
      entity_name: e.name as string,
      mnemonic_name: (e.mnemonic_name as string | null) ?? null,
    }));

  for (const row of invalid) {
    const { error: updErr } = await supabase
      .from("entities")
      .update({ has_mnemonic: false, mnemonic_name: null })
      .eq("id", row.entity_id);
    if (updErr) throw updErr;
  }

  return { cleared: invalid.length, rows: invalid };
}
