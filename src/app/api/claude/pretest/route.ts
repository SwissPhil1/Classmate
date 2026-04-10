import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON } from '@/lib/claude'
import type { ClaudePretestResponse } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { entity_name, entity_type, chapter, topic, reference_text, notes } = await request.json()

    const referenceBlock = reference_text
      ? `\n\nCONTENU DE RÉFÉRENCE:\n${reference_text}\n\nLa réponse modèle doit contenir UNIQUEMENT des faits présents dans le contenu de référence ci-dessus. Ne pas inventer de caractéristiques d'imagerie ou de faits cliniques absents de la référence. En cas de doute, omettre.`
      : `\n\nAucune référence fournie. Baser la réponse modèle UNIQUEMENT sur des faits médicaux établis et consensuels. En cas de doute, omettre.`

    const notesBlock = notes
      ? `\n\nCORRECTIONS DU CANDIDAT (priorité sur toute autre source):\n${notes}`
      : ''

    const systemPrompt = `Tu es un coach expert pour l'examen FMH2 de radiologie suisse. Génère une question de pré-test froid sur: ${entity_name}.
Le candidat n'a PAS encore étudié cette entité — la tentative échouée est intentionnelle et améliore l'apprentissage ultérieur.

Type selon entity_type:
- single_diagnosis → scénario clinique Format A (réponse tapée)
- ddx_pair → question de différenciation Format B (réponse orale ouverte)
- concept → question de définition Format A
- protocol → question d'indication Format A
${referenceBlock}${notesBlock}

IMPORTANT:
- La réponse modèle doit être complète mais basée UNIQUEMENT sur des faits vérifiés (référence fournie ou consensus médical établi).
- Si un moyen mnémotechnique SPÉCIFIQUE et RECONNU existe pour les DDx de cette entité précise (ex: MEGA pour fosse postérieure pédiatrique, FEGNOMASHIC pour AVN, TORCH pour infections congénitales), l'INCLURE dans la réponse modèle. NE PAS utiliser VINDICATE comme DDx — c'est un cadre générique d'organisation, pas une mnémonique spécifique.
- Structurer les diagnostics différentiels par fréquence avec un critère discriminant par ligne.
- Ne pas inventer de signes d'imagerie. En cas de doute, omettre le fait.

Retourne UNIQUEMENT un JSON valide, sans markdown ni texte additionnel:
{
  "type": "A" ou "B",
  "question": "string (en français)",
  "model_answer": "string (en français, basée uniquement sur la référence ou le consensus)",
  "key_points": ["string"]
}`

    const userMessage = `Entité: ${entity_name}
Type: ${entity_type}
Chapitre: ${chapter}
Thème: ${topic}`

    const response = await callClaude(systemPrompt, userMessage, 2048)
    const parsed = parseClaudeJSON<ClaudePretestResponse>(response)

    if (!parsed.type || !parsed.question || !parsed.model_answer || !Array.isArray(parsed.key_points)) {
      return NextResponse.json({ error: 'Réponse Claude invalide' }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Pretest generation error:', error)
    return NextResponse.json(
      { error: 'Génération indisponible temporairement' },
      { status: 500 }
    )
  }
}
