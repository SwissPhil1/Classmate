/**
 * Detection helpers for mnemonics in brief markdown content.
 *
 * Used by:
 *   - /api/claude/backfill-vital (Claude-driven re-evaluation of has_mnemonic)
 *   - /api/admin/backfill-mnemonic-flags (server-side regex scan against the
 *     validated whitelist, no Claude call)
 *
 * Both reuse `mnemonicIsNegated` to honour an explicit "pas de mnémonique"
 * marker in the brief — never tag has_mnemonic=true if the author has flagged
 * the entity as having no published mnemonic.
 */

const MNEMONIC_NEGATION_PHRASES = [
  'pas de mnémonique',
  'pas de mnemonique',
  'aucune mnémonique',
  'aucune mnemonique',
  'aucun moyen mnémotechnique',
  'aucun moyen mnemotechnique',
  'pas de moyen mnémotechnique',
  'pas de moyen mnemotechnique',
  'no specific mnemonic',
]

export function extractMnemonicSection(content: string): string | null {
  const lines = content.split('\n')
  let capturing = false
  const buf: string[] = []
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (capturing) break
      if (/mn[ée]moni[qQ]ue/i.test(line)) {
        capturing = true
        continue
      }
    } else if (capturing) {
      buf.push(line)
    }
  }
  const text = buf.join('\n').trim()
  return text.length > 0 ? text : null
}

export function mnemonicIsNegated(content: string): boolean {
  const section = extractMnemonicSection(content)
  if (!section) return false
  const lower = section.toLowerCase()
  return MNEMONIC_NEGATION_PHRASES.some((phrase) => lower.includes(phrase))
}
