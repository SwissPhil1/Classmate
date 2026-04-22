import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whitelist of mnemonics validated against trusted radiology references:
 *   - Crack the Core (Prometheus Lionhart)
 *   - Core Radiology (Mandell)
 *   - Radiology Vibes — curated FRCR/EDiR mnemonic list (Dr. Awal,
 *     with source references to Dahnert, Chapman & Nakielny, Brant & Helms,
 *     RadioGraphics, AJR, Radiopaedia).
 *
 * First 30 entries extracted by NotebookLM from Crack the Core + Core Radiology
 * on 2026-04-22. Remaining entries added 2026-04-22 from Radiology Vibes.
 *
 * Any mnemonic tagged by Claude that does not match this list is treated as a
 * hallucination and rejected (has_mnemonic → false, mnemonic_name → null).
 *
 * Each inner array holds the canonical form plus any aliases/variant spellings.
 * Matching is done after normalize() — case-insensitive, punctuation-insensitive.
 *
 * To extend: add a new inner array with every reasonable variant a brief
 * generator might emit.
 */
const CANONICAL_MNEMONICS: readonly (readonly string[])[] = [
  // ── Neuro / Tête & cou ──────────────────────────────────────────
  ["7 Up Coke Down", "7 Up - Coke Down"],
  ["ACGME'S MC", "ACGMES MC"],
  ["Basal ICV"],
  ["CONMAN"],
  ["FEDS"],
  ["George Washington Bridge", "GWB"],
  ["GRAD RAP", "GRADRAP"],
  ["HEAL"],
  ["HIPPEL"],
  ["It Be Iddy Biddy BaBy Doo Doo", "It Be Iddy Biddy, BaBy, Doo-Doo"],
  ["MAGIC DR", "MAGICDR", "DR MAGIC"],
  ["MEGA"],
  ["MOuSTACHE", "MOUSTACHE"],
  ["MSME", "MISME"],
  ["O2"],
  ["Old Elephants Age Gracefully"],
  ["Oreo Cookie"],
  ["R2V2"],
  ["SAME"],

  // ── Thorax / Poumon / Médiastin ─────────────────────────────────
  ["4Ts", "4 Ts", "Four Ts"],
  ["BADSAI"],
  ["BREAST"],
  ["CAVITY"],
  ["CHARM G", "CHARMG"],
  ["HARSH"],
  ["MNoP", "MNOP"],

  // ── Cardiovasculaire / Vasculaire ───────────────────────────────
  ["I Love Sex"],
  ["I'M SLOw", "IM SLOW"],

  // ── Abdomen / Digestif / GU ─────────────────────────────────────
  ["COGA"],
  ["DOPE Gardner", "DOPE"],
  ["IPS"],
  ["MAH HOP", "MAHHOP"],
  ["Michael Jackson"],
  ["NSAIDs", "NSAIDS"],
  ["TURbans", "TURBANS", "Turcot"],

  // ── Gynéco-obstétrique ───────────────────────────────────────────
  ["Meigs Syndrome", "Meigs"],

  // ── Musculo-squelettique ────────────────────────────────────────
  ["ASP"],
  ["CRITOE"],
  ["DAL"],
  ["FEGNOMASHIC", "FOG MACHINES", "FOGMACHINES"],
  ["FEMALE"],
  ["GOATS OF PD", "GOATS PD", "GOATSOFPD"],
  ["LOSS"],
  ["MELON"],
  ["MELT"],
  ["MUGR"],
  ["NIMROD"],
  ["OATs", "OATS"],
  ["PORK-CHOP", "PORK CHOP", "PORKCHOP", "PORKCHOPS"],
  ["PROT"],
  ["SALMON"],
  ["SALTeR", "SALTER"],
  ["VACTERL"],

  // ── Mammaire / Signes ──────────────────────────────────────────
  ["Lead Sinks Muffins Rise", "Lead Sinks, Muffins Rise"],
  ['Schat"B"ki Ring', "Schatzki Ring", "Schatzki"],
  ["Ursula"],

  // ── Pédiatrique / Syndromique ───────────────────────────────────
  ["CHARGE"],
  ["PHACES"],

  // ── Nucléaire ───────────────────────────────────────────────────
  ["I Lived Bitch"],

  // ── Général / Physique / Syndromique multi-système ──────────────
  ["WWII", "World War II", "WW2"],
  ["CT-MRI-PET", "CT MRI PET", "CTMRIPET"],
  ["TEACH"],
  ["3Ps", "Pit-Para-Pan", "Pit Para Pan"],
  ["1M 2P", "Me-Para-Pheo"],
  ["1P 2M", "Me-MM-Pheo"],

  // ── Divers / Règles nommées ─────────────────────────────────────
  ["Rule of 3s", "Rule of 3", "Rule of Threes"],

  // ── ESR EPOS — European Congress of Radiology poster (2024) ─────
  // Curated radiology mnemonic poster with CT/MRI case illustrations.
  ["Blood Can Be Very Bad"],
  ["VITAMIN", "VITAMIN C", "VITAMIN CD", "VITAMIN C&D", "VITAMIN CDEF"],
  ["PACHI MENINGES", "PACHI"],
  ["LAMP CAMP"],
  ["My Best Friend is Pretty Cool", "My Best Friend Is Pretty Cool"],
  ["SEAL"],
  ["Normal BIRTH", "BIRTH"],
  ["STURGE CAPS"],
  ["STOMACH"],
  ["Jefferson Bit Off A Hangman's Thumb", "Jefferson Bit Off A Hangmans Thumb"],
  ["SMALL MEN"],
  ["I HEAL", "IHEAL"],
  ["CRESP"],
  ["ABCDEFGHI"],
  ["CARPETS"],
  ["Thanks So Much"],
  ["METAL"],
  ["HALT"],
  ["CHIMP"],
  ["Grovelling Surgeons Expect Immediate CT Scans", "Grovelling Surgeons"],
  ["ChIPS", "CHIPS"],
  ["L SHAPE", "L-SHAPE"],
  ["PROMS"],
];

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
  CANONICAL_MNEMONICS.flatMap((variants) => variants.map(normalize))
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
export const CANONICAL_MNEMONIC_NAMES: readonly string[] = CANONICAL_MNEMONICS.map(
  (v) => v[0]
);

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
