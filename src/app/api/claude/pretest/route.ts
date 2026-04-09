import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON } from '@/lib/claude'
import type { ClaudePretestResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const { entity_name, entity_type, chapter, topic, reference_text } = await request.json()

    const referenceBlock = reference_text
      ? `\n\nCONTENU DE RÉFÉRENCE (utilise ce contenu comme base pour la question et la réponse modèle, traduis en français si nécessaire):\n${reference_text}`
      : ''

    const systemPrompt = `Tu es un coach expert pour l'examen FMH2 de radiologie suisse. Génère une question de pré-test froid sur: ${entity_name}.
Le candidat n'a PAS encore étudié cette entité — la tentative échouée est intentionnelle et améliore l'apprentissage ultérieur.

Type selon entity_type:
- single_diagnosis → scénario clinique Format A (réponse tapée)
- ddx_pair → question de différenciation Format B (réponse orale ouverte)
- concept → question de définition Format A
- protocol → question d'indication Format A
${referenceBlock}

IMPORTANT: La réponse modèle doit être COMPLÈTE et couvrir tous les points clés. Inclure les perles cliniques si pertinent.

Retourne UNIQUEMENT un JSON valide, sans markdown ni texte additionnel:
{
  "type": "A" ou "B",
  "question": "string (en français)",
  "model_answer": "string (en français, réponse complète et exhaustive)",
  "key_points": ["string"]
}`

    const userMessage = `Entité: ${entity_name}
Type: ${entity_type}
Chapitre: ${chapter}
Thème: ${topic}`

    const response = await callClaude(systemPrompt, userMessage, 2048)
    const parsed = parseClaudeJSON<ClaudePretestResponse>(response)

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Pretest generation error:', error)
    return NextResponse.json(
      { error: 'Génération indisponible temporairement' },
      { status: 500 }
    )
  }
}
