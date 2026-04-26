import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

/**
 * Generate a Claude-authored chapter manual (long-form markdown) covering
 * every entity already in the chapter, structured one `## Section` per entity
 * plus thematic cross-cutting sections. The manual itself is what gives the
 * Uro-genital chapter its quality — every brief regenerated against an
 * existing manual gets dramatically richer because /api/claude/brief uses
 * `extractManualSection` as the dominant reference when the entity is linked.
 *
 * Two modes:
 *   - `from_knowledge`: Claude leverages general radiology knowledge (FMH2-
 *     level). No external reference; safest for canonical chapters.
 *   - `from_reference`: Claude restructures the user-provided `reference_text`
 *     (pasted PDF/textbook text). Higher fidelity to source.
 *
 * Returns `{ manual_content }` — the route does NOT save it; the caller can
 * review/edit before persisting via the existing manual editor.
 */
export const maxDuration = 60

interface RequestBody {
  chapter_id: string
  mode: 'from_knowledge' | 'from_reference'
  reference_text?: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as RequestBody
    if (!body.chapter_id || typeof body.chapter_id !== 'string') {
      return NextResponse.json({ error: 'chapter_id required' }, { status: 400 })
    }
    if (body.mode !== 'from_knowledge' && body.mode !== 'from_reference') {
      return NextResponse.json({ error: 'mode must be from_knowledge or from_reference' }, { status: 400 })
    }
    if (body.mode === 'from_reference' && (!body.reference_text || body.reference_text.trim().length < 50)) {
      return NextResponse.json({ error: 'reference_text required (≥ 50 chars) for from_reference mode' }, { status: 400 })
    }

    // Fetch chapter, topic, and the user's existing entities in this chapter.
    const { data: chapter, error: chErr } = await supabase
      .from('chapters')
      .select('id, name, topic:topics(name)')
      .eq('id', body.chapter_id)
      .single()
    if (chErr || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
    }

    const { data: entities, error: enErr } = await supabase
      .from('entities')
      .select('id, name, entity_type')
      .eq('user_id', user.id)
      .eq('chapter_id', body.chapter_id)
      .order('date_flagged', { ascending: true })
    if (enErr) {
      return NextResponse.json({ error: enErr.message }, { status: 500 })
    }

    const topicName = (chapter as unknown as { topic?: { name?: string } }).topic?.name ?? '(thème non spécifié)'
    const chapterName = chapter.name

    const entitiesList = (entities ?? [])
      .map((e: { name: string; entity_type: string }) => `- ${e.name} (${e.entity_type})`)
      .join('\n')

    const referenceBlock = body.mode === 'from_reference'
      ? `\n\nTEXTE DE RÉFÉRENCE FOURNI (à restructurer en restant FIDÈLE aux faits) :\n\n${body.reference_text}\n\nRÈGLE ABSOLUE : tous les faits médicaux (signes d'imagerie, critères, signal IRM, densité scanner, épidémiologie) DOIVENT venir de ce texte. Tu peux reformater, traduire, structurer, ajouter une mnémonique reconnue. Tu ne dois PAS inventer ou ajouter de faits non présents.`
      : `\n\nMODE: utilise tes connaissances générales en radiologie (niveau FMH2 suisse). Ne mentionne que des faits, signes et critères CONSENSUELS et bien établis (Radiopaedia, Crack the Core, Core Radiology, ESR EPOS). En cas de doute sur un chiffre/critère, l'OMETTRE plutôt que d'inventer.`

    const systemPrompt = `Tu es radiologue FMH suisse expert et coach pour l'examen oral FMH2. Tu rédiges un MANUEL DE CHAPITRE long-form en français, qui servira de référence dominante pour générer ensuite des briefs de révision par entité.

CONTEXTE:
- Thème: ${topicName}
- Chapitre: ${chapterName}

ENTITÉS DÉJÀ DANS CE CHAPITRE (chacune doit avoir sa propre ## Section, avec exactement le même nom):
${entitiesList || '(aucune — tu peux créer le chapitre de zéro avec les sections canoniques)'}
${referenceBlock}

STRUCTURE OBLIGATOIRE — markdown:

# ${chapterName}

## Vue d'ensemble du chapitre
2-4 paragraphes : qu'est-ce que ce chapitre couvre, anatomie/physiologie pertinente, les enjeux à l'oral FMH2.

## Méta-règles oral
3-6 bullets : ce que les examinateurs attendent systématiquement (signe à mentionner d'office, mnémonique de cadre, "can't miss" pour ce chapitre).

[POUR CHAQUE ENTITÉ ci-dessus, EXACTEMENT cette section, dans cet ordre :]

## <Nom exact de l'entité>
### Définition
1-2 phrases.

### Épidémiologie / clinique
Patients typiques, fréquence, présentation clinique pertinente.

### Imagerie
Modalité par modalité (CT / IRM T1 / IRM T2 / Diffusion / Post-contraste / autres séquences pertinentes / RX-US si applicable). Tableau markdown si la matrice rend la lecture plus dense.

### Diagnostics différentiels
Top 3-5 DDx avec un critère discriminant par ligne. Mnémonique reconnue si elle existe (MEGA, FEGNOMASHIC, TORCH, VITAMIN-CD, etc. — PAS VINDICATE qui est un cadre générique).

### Pièges classiques
2-4 erreurs fréquentes / artéfacts.

### Perles oral FMH2
3-5 phrases COURTES (max 15 mots), du genre qu'on retient la veille de l'examen. Pas de redondance avec les sections ci-dessus.

[FIN de la boucle entités]

## DDx croisés du chapitre
Tableau ou liste qui groupe les entités par axe de présentation (ex: "masse hyperéchogène", "rehaussement annulaire", "calcifications") quand pertinent. Aide à naviguer le DDx en oral.

## Mnémoniques transverses
Si une mnémonique reconnue couvre plusieurs entités du chapitre, l'expliciter ici (1 par bloc).

## Protocoles d'imagerie clés
Si le chapitre implique des protocoles standards (ex: Uro-TDM 4 phases, washout surrénalien, IRM prostate multiparamétrique), un mini-bloc par protocole.

CONTRAINTES STRICTES:
- Tout en français, niveau FMH2 suisse.
- Markdown propre, headers # et ## et ###.
- Les noms d'entités dans les ## DOIVENT être identiques à ceux fournis (copie-colle).
- Pas de méta-commentaires, pas de "voici votre manuel". Le markdown brut, rien d'autre.
- Cible 8000-15000 mots pour un chapitre dense.`

    const userMessage = body.mode === 'from_reference'
      ? `Restructure le texte de référence en suivant le format ci-dessus, en respectant scrupuleusement les faits du texte.`
      : `Génère le manuel complet pour le chapitre "${chapterName}" du thème "${topicName}".`

    // Use generous budget — manuals are long. callClaude under the hood uses
    // claude-sonnet-4-20250514 which is fine for this volume.
    const response = await callClaude(systemPrompt, userMessage, 16384)

    return NextResponse.json({ manual_content: response.trim() })
  } catch (err) {
    console.error('generate-chapter-manual error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
