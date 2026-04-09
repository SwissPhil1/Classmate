import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON, queueBriefGeneration } from '@/lib/claude'
import type { QAPair } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { entity_name, entity_type, chapter, topic, reference_text } = await request.json()

    const result = await queueBriefGeneration(async () => {
      const referenceBlock = reference_text
        ? `\n\nCONTENU DE RÉFÉRENCE DU LIVRE (utilise ce contenu comme base principale, traduis en français, complète avec tes connaissances):\n${reference_text}`
        : ''

      const systemPrompt = `Tu es un radiologue expert et coach pour l'examen FMH2 suisse. Génère un brief d'étude pour: ${entity_name} (chapitre: ${chapter}, thème: ${topic}, type: ${entity_type}).

IMPORTANT: Tout le contenu en français.
Contexte FMH2 suisse — niveau attendu: médecin spécialiste en formation dernière année.
${referenceBlock}

Format selon entity_type:

=== single_diagnosis ===
## Vue d'ensemble
2-3 phrases: qu'est-ce, patient typique, pourquoi cet aspect radiologique

## Matrice des modalités
Tableau markdown: Modalité | Signes clés
(CT, IRM T1, IRM T2/FLAIR, Post-contraste, Diffusion, + séquences spécifiques si pertinent)

## L'Aunt Minnie
Signe pathognomonique unique si existe.
Sinon: 'Aucun signe pathognomonique unique — diagnostic par constellation de signes.'

## Template de présentation orale (FMH2)
Script exact en français:
1. Description technique
2. Analyse systématique
3. Conclusion diagnostique
4. Diagnostics différentiels (top 3, un différenciateur par ligne)
5. Prise en charge

## Mnémonique & DDx structuré
Si un moyen mnémotechnique RECONNU existe pour les diagnostics différentiels de cette entité ou de sa localisation, l'inclure obligatoirement.
Exemples de mnémoniques reconnues en radiologie:
- MEGA (tumeurs fosse postérieure pédiatrique): Medulloblastome, Ependymome, Gliome/astrocytome pilocytique, ATRT
- FEGNOMASHIC (nécrose avasculaire)
- VINDICATE (cadre DDx systématique: Vasculaire, Infectieux, Néoplasique, Dégénératif, Inflammatoire/Iatrogène, Congénital, Autoimmun, Traumatique, Endocrinien/métabolique)
- TORCH (infections congénitales)
- Etc.

Format: "Mnémonique: [NOM] → [lettre = diagnostic], [lettre = diagnostic], ..."
Si aucune mnémonique reconnue n'existe, créer une liste DDx structurée par fréquence (fréquent → rare) avec un critère discriminant par ligne.

## Perles
Points cliniques et radiologiques essentiels à retenir — les pièges classiques, les associations à ne pas manquer.

## Perle protocolaire
(Inclure seulement si pertinent: quel protocole choisir et pourquoi)

## Chiffres clés
(Inclure seulement si pertinent: mesures, critères, seuils)

=== ddx_pair ===
## Mnémonique & DDx structuré
Si un moyen mnémotechnique RECONNU existe pour ce groupe de diagnostics différentiels, l'inclure obligatoirement (ex: MEGA, FEGNOMASHIC, VINDICATE, etc.).
Sinon, structurer les DDx par fréquence avec un critère discriminant par ligne.

## Tableau comparatif
Tableau côte à côte des critères de différenciation (imagerie, clinique, épidémiologie)

## Le piège classique
L'erreur que tout le monde fait + comment l'éviter

## Perles
Points essentiels à retenir pour chaque diagnostic

=== concept ===
Explication + 'Ce que l'examen teste vraiment' + Mnémoniques si applicables + Perles

=== protocol ===
Indications + Technique + 'Ce qu'on cherche' + Pièges + Perles

Temps de lecture total: moins de 5 minutes.

APRÈS le contenu markdown, ajoute une section séparée avec EXACTEMENT ce format:
---QA_JSON---
[{"question": "...", "model_answer": "...", "key_points": ["..."]}, ...]
---END_QA_JSON---

Les 3 paires Q&A doivent être de style examen FMH2, en français. Les réponses modèles doivent être COMPLÈTES et exhaustives.`

      const userMessage = `Génère le brief complet pour: ${entity_name} (${entity_type})`

      const response = await callClaude(systemPrompt, userMessage, 6144)

      // Split content and QA pairs
      const qaMatch = response.match(/---QA_JSON---\s*([\s\S]*?)\s*---END_QA_JSON---/)
      let qa_pairs: QAPair[] = []
      let content = response

      if (qaMatch) {
        content = response.substring(0, response.indexOf('---QA_JSON---')).trim()
        qa_pairs = parseClaudeJSON<QAPair[]>(qaMatch[1])
      }

      return { content, qa_pairs }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Brief generation error:', error)
    return NextResponse.json(
      { error: 'Génération indisponible temporairement' },
      { status: 500 }
    )
  }
}
