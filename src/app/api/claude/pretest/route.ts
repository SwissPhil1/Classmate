import { NextRequest, NextResponse } from 'next/server'
import { callClaude, callClaudeWithVision, parseClaudeJSON } from '@/lib/claude'
import type { ClaudePretestResponse } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { entity_name, entity_type, chapter, topic, reference_text, notes, is_synthesis, children_names, children_references, has_images, image_urls } = await request.json()

    // Synthesis mode: parent entity pretest
    if (is_synthesis && children_names?.length > 0) {
      const childrenBlock = children_names.map((name: string, i: number) => {
        const ref = children_references?.[i] || ''
        return `- ${name}${ref ? `: ${ref.substring(0, 800)}` : ''}`
      }).join('\n')

      const synthPrompt = `Tu es un coach FMH2. Génère un pré-test de synthèse sur le groupe: ${entity_name}.
Le candidat n'a PAS encore étudié en détail — la tentative échouée est intentionnelle.

Sous-entités du groupe:
${childrenBlock}

Génère une question large qui teste la connaissance globale du groupe (pas un sous-type spécifique).
Exemples: "Citez les principaux types de ${entity_name} et un critère discriminant pour chacun", "Quelle est la classification des ${entity_name} ?"

${notes ? `\nCORRECTIONS DU CANDIDAT:\n${notes}` : ''}

Retourne UNIQUEMENT un JSON valide:
{
  "type": "B",
  "question": "string (en français)",
  "model_answer": "string (en français)",
  "key_points": ["string"]
}`

      const response = await callClaude(synthPrompt, `Pré-test synthèse: ${entity_name}`, 2048)
      const parsed = parseClaudeJSON<ClaudePretestResponse>(response)
      if (!parsed.type || !parsed.question || !parsed.model_answer || !Array.isArray(parsed.key_points)) {
        return NextResponse.json({ error: 'Réponse Claude invalide' }, { status: 502 })
      }
      return NextResponse.json(parsed)
    }

    const referenceBlock = reference_text
      ? `\n\nCONTENU DE RÉFÉRENCE:\n${reference_text}\n\nLa réponse modèle doit contenir UNIQUEMENT des faits présents dans le contenu de référence ci-dessus. Ne pas inventer de caractéristiques d'imagerie ou de faits cliniques absents de la référence. En cas de doute, omettre.`
      : `\n\nAucune référence fournie. Baser la réponse modèle UNIQUEMENT sur des faits médicaux établis et consensuels. En cas de doute, omettre.`

    const notesBlock = notes
      ? `\n\nCORRECTIONS DU CANDIDAT (priorité sur toute autre source):\n${notes}`
      : ''

    const hasVision = Array.isArray(image_urls) && image_urls.length > 0
    const imageInstructions = (has_images || hasVision)
      ? `\n\nIMPORTANT — IMAGES DISPONIBLES:
${hasVision ? "Tu peux VOIR les images ci-jointes. Analyse-les AVANT de formuler ta question." : "L'étudiant verra des images radiologiques de cette entité."}
Adapte la question en fonction de CE QUE MONTRENT les images:
- Si l'image montre une ANATOMIE NORMALE avec des structures numérotées → demander d'IDENTIFIER les structures (ex: "Identifiez les structures numérotées 1 à 10 sur cette coupe.")
- Si l'image montre une PATHOLOGIE → demander le diagnostic et les signes radiologiques
- Si l'image montre un protocole ou une technique → demander les paramètres ou l'indication
- Format OBLIGATOIRE: B (réponse orale/auto-évaluée)
- La réponse modèle doit correspondre à ce que montre RÉELLEMENT l'image. Ne PAS inventer de pathologie si l'image est normale.
- NE PAS demander de décrire la modalité ou la technique — l'image parle d'elle-même.`
      : ''

    const systemPrompt = `Tu es un coach expert pour l'examen FMH2 de radiologie suisse. Génère une question de pré-test froid sur: ${entity_name}.
Le candidat n'a PAS encore étudié cette entité — la tentative échouée est intentionnelle et améliore l'apprentissage ultérieur.
${imageInstructions}
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

    const response = hasVision
      ? await callClaudeWithVision(systemPrompt, userMessage, image_urls, 2048)
      : await callClaude(systemPrompt, userMessage, 2048)
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
