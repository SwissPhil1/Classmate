import { NextRequest, NextResponse } from 'next/server'
import { callClaude, callClaudeWithVision, parseClaudeJSON } from '@/lib/claude'
import type { ClaudeQuestionResponse } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { entity_name, entity_type, cycle_count, difficulty_level, chapter, topic, exam_component, notes, reference_text, is_synthesis, children_names, children_references, has_images, image_urls } = await request.json()

    // Synthesis mode: parent entity with children
    if (is_synthesis && children_names?.length > 0) {
      const childrenBlock = children_names.map((name: string, i: number) => {
        const ref = children_references?.[i] || ''
        return `### ${name}\n${ref ? ref.substring(0, 1500) : '(pas de référence)'}`
      }).join('\n\n')

      const synthPrompt = `Génère une question de SYNTHÈSE / COMPARAISON niveau FMH2 sur le groupe: ${entity_name}.
Difficulté ${difficulty_level}, cycle ${cycle_count}.

Ce groupe contient les sous-entités suivantes:
${childrenBlock}

Types de questions de synthèse (varier selon le cycle):
- Tableau comparatif: "Comparez X et Y en termes de [critère]"
- Pattern commun: "Quel signe est commun à tous les types de ${entity_name} ?"
- Discrimination: "Comment différencier X de Y à l'imagerie ?"
- Intégration: "Patient avec [présentation], quel sous-type de ${entity_name} est le plus probable ?"

${notes ? `\nCORRECTIONS DU CANDIDAT:\n${notes}` : ''}

Retourne UNIQUEMENT un JSON valide:
{
  "type": "B",
  "question": "string (en français)",
  "model_answer": "string (en français, intégrant les données de TOUS les sous-types)",
  "key_points": ["string"],
  "difficulty_used": number
}`

      const response = await callClaude(synthPrompt, `Question de synthèse pour: ${entity_name}`, 2048)
      const parsed = parseClaudeJSON<ClaudeQuestionResponse>(response)
      if (!parsed.type || !parsed.question || !parsed.model_answer || !Array.isArray(parsed.key_points)) {
        return NextResponse.json({ error: 'Réponse Claude invalide' }, { status: 502 })
      }
      return NextResponse.json(parsed)
    }

    const referenceBlock = reference_text
      ? `\n\nCONTENU DE RÉFÉRENCE (la réponse modèle doit être cohérente avec ces faits — ne pas les contredire, ne pas inventer de faits absents):\n${reference_text}`
      : ''

    const notesBlock = notes
      ? `\n\nCORRECTIONS DU CANDIDAT (priorité sur toute autre source):\n${notes}`
      : ''

    const hasVision = Array.isArray(image_urls) && image_urls.length > 0
    const imageBlock = (has_images || hasVision)
      ? `\n\nIMAGES DISPONIBLES — ${hasVision ? "Tu peux VOIR les images ci-jointes. Analyse-les AVANT de formuler ta question." : "L'étudiant verra des images radiologiques de cette entité."}
Adapte la question en fonction de CE QUE MONTRENT les images:
- Si l'image montre une ANATOMIE NORMALE avec des structures numérotées → demander d'IDENTIFIER les structures
- Si l'image montre une PATHOLOGIE → demander le diagnostic, DDx, signes radiologiques
- Si l'image est un schéma ou protocole → adapter la question en conséquence
- Difficulté 1: Description des findings ou identification des structures
- Difficulté 2: Diagnostic + justification par les signes d'imagerie
- Difficulté 3: DDx + intégration clinique + prise en charge
- Format B est PRÉFÉRÉ (l'étudiant s'auto-évalue après la révélation de la réponse modèle)
- La réponse modèle doit correspondre à ce que montre RÉELLEMENT l'image. Ne PAS inventer de pathologie si l'image est normale.\n`
      : ''

    const systemPrompt = `Génère une question de re-test froid niveau FMH2 sur: ${entity_name}.
Difficulté ${difficulty_level}, cycle ${cycle_count}.
${imageBlock}${referenceBlock}

Règles de difficulté:
1: Présentation classique, cas typique
2: Présentation atypique ou différenciation avec un mimique proche
3: Intégration de plusieurs signes ou décision de prise en charge

Règles de type:
- single_diagnosis → Format A (réponse tapée)
- ddx_pair → Format B (réponse orale ouverte)
- concept → Format A
- protocol → Format A ou B
- Si exam_component inclut 'written' ET cycle >2: 10% chance Format C (réponse libre paragraphe)

IMPORTANT pour les réponses modèles:
- Baser les faits médicaux UNIQUEMENT sur la référence fournie ou le consensus médical établi. Ne pas inventer de signes d'imagerie. En cas de doute, omettre.
- Si un moyen mnémotechnique SPÉCIFIQUE et RECONNU existe pour les DDx testés (ex: MEGA pour fosse postérieure, FEGNOMASHIC pour AVN, TORCH pour infections congénitales), l'inclure et tester le candidat dessus. NE PAS utiliser VINDICATE comme DDx — c'est un cadre générique, pas une mnémonique spécifique à tester.
- Structurer les DDx par fréquence avec un critère discriminant par ligne.
- À difficulté 2+: tester les mnémoniques directement ("Quel mnémonique permet de se rappeler les tumeurs de la fosse postérieure ?")

NE PAS répéter les questions du brief (cycle 1).
À partir du cycle 2, générer des questions nouvelles.
${notesBlock}

Retourne UNIQUEMENT un JSON valide, sans markdown ni texte additionnel:
{
  "type": "A" ou "B" ou "C",
  "question": "string (en français)",
  "model_answer": "string (en français)",
  "key_points": ["string"],
  "difficulty_used": number
}`

    const userMessage = `Entité: ${entity_name}
Type: ${entity_type}
Cycle: ${cycle_count}
Difficulté: ${difficulty_level}
Chapitre: ${chapter}
Thème: ${topic}
Composante d'examen: ${exam_component}`

    const response = hasVision
      ? await callClaudeWithVision(systemPrompt, userMessage, image_urls, 2048)
      : await callClaude(systemPrompt, userMessage, 2048)
    const parsed = parseClaudeJSON<ClaudeQuestionResponse>(response)

    if (!parsed.type || !parsed.question || !parsed.model_answer || !Array.isArray(parsed.key_points)) {
      return NextResponse.json({ error: 'Réponse Claude invalide' }, { status: 502 })
    }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Question generation error:', error)
    return NextResponse.json(
      { error: 'Génération indisponible temporairement' },
      { status: 500 }
    )
  }
}
