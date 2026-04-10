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

    const { entity_name, entity_type, chapter, topic, reference_text, notes } = await request.json()

    const result = await queueBriefGeneration(async () => {
      const referenceBlock = reference_text
        ? `\n\nCONTENU DE RÉFÉRENCE DU LIVRE:\n${reference_text}\n\nRÈGLE ABSOLUE: Base-toi EXCLUSIVEMENT sur le contenu de référence ci-dessus pour tous les faits médicaux (signes d'imagerie, caractéristiques cliniques, épidémiologie, localisations, signal IRM, densité scanner, etc.).
Tu peux:
- Restructurer et reformater le contenu en français selon le template demandé
- Ajouter les mnémoniques RECONNUS et PUBLIÉS (MEGA, FEGNOMASHIC, VINDICATE, TORCH, etc.)
- Structurer les diagnostics différentiels issus de la référence
- Créer le template de présentation orale basé sur les faits de la référence
Tu ne dois PAS:
- Inventer ou ajouter des signes d'imagerie non mentionnés dans la référence
- Modifier les caractéristiques décrites (ex: si la référence dit "asymétrique", ne pas écrire "symétrique")
- Compléter avec des faits dont tu n'es pas absolument certain
- En cas de doute sur un fait, l'OMETTRE plutôt que risquer une erreur`
        : `\n\nAUCUNE RÉFÉRENCE FOURNIE. Base-toi UNIQUEMENT sur des faits médicaux établis et consensuels (niveau Radiopaedia, sources de référence reconnues). En cas de doute sur un fait, l'OMETTRE. Ne rien inventer. Privilégier la précision à l'exhaustivité.`

      const notesBlock = notes
        ? `\n\nCORRECTIONS DU CANDIDAT (priorité sur toute autre source):\n${notes}`
        : ''

      const systemPrompt = `Tu es un radiologue expert et coach pour l'examen FMH2 suisse. Génère un brief d'étude pour: ${entity_name} (chapitre: ${chapter}, thème: ${topic}, type: ${entity_type}).

IMPORTANT: Tout le contenu en français.
Contexte FMH2 suisse — niveau attendu: médecin spécialiste en formation dernière année.
${referenceBlock}${notesBlock}

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
- MEGA (tumeurs fosse postérieure pédiatrique): Medulloblastome, Ependymome, Gliome du tronc cérébral, Astrocytome pilocytique
- FEGNOMASHIC (nécrose avasculaire)
- VINDICATE (cadre DDx systématique: Vasculaire, Infectieux, Néoplasique, Dégénératif, Inflammatoire/Iatrogène, Congénital, Autoimmun, Traumatique, Endocrinien/métabolique)
- TORCH (infections congénitales)
- Etc.

Format: "Mnémonique: [NOM] → [lettre = diagnostic], [lettre = diagnostic], ..."
Si aucune mnémonique reconnue n'existe, créer une liste DDx structurée par fréquence (fréquent → rare) avec un critère discriminant par ligne.

## Perles
3-5 points COURTS et PERCUTANTS — le genre de chose qu'on retient la veille de l'examen.
Format: une ligne par perle, maximum 15 mots chacune.
Exemples de bonnes perles:
- "Capsule plus fine côté ventriculaire = risque de rupture intra-V"
- "T2 hypo + restriction diffusion = haute cellularité → lymphome ou médulloblastome"
- "Anneau ouvert vers le cortex = démyélinisation"
NE PAS répéter le contenu des sections précédentes — uniquement les raccourcis mnémotechniques et associations clés.

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

## Résumé par diagnostic
Pour chaque diagnostic du DDx, un sous-titre ### avec:
- Définition en 1 phrase
- Signes d'imagerie clés (CT, IRM T1/T2, diffusion, rehaussement)
- Épidémiologie et clinique si pertinent
Basé STRICTEMENT sur la référence fournie.

## Le piège classique
L'erreur que tout le monde fait + comment l'éviter

## Perles
3-5 points COURTS et PERCUTANTS — le genre de chose qu'on retient la veille de l'examen.
Format: une ligne par perle, maximum 15 mots chacune.
Exemples de bonnes perles:
- "Capsule plus fine côté ventriculaire = risque de rupture intra-V"
- "T2 hypo + restriction diffusion = haute cellularité → lymphome ou médulloblastome"
- "Anneau ouvert vers le cortex = démyélinisation"
NE PAS répéter le contenu du résumé — uniquement les raccourcis mnémotechniques et associations clés.

=== concept ===
## Vue d'ensemble
Définition et contexte clinique — qu'est-ce que c'est et pourquoi c'est testé en FMH2.

## Ce que l'examen teste vraiment
Les pièges et subtilités que les examinateurs ciblent.

## Mnémonique & DDx structuré
Si une mnémonique reconnue existe, l'inclure. Sinon, liste structurée par fréquence.

## Perles
3-5 points COURTS et PERCUTANTS (max 15 mots chacun).

=== protocol ===
## Indications
Quand ce protocole est-il indiqué? Principaux scénarios cliniques.

## Technique & Paramètres
Séquences/phases, paramètres clés, produit de contraste (type, dose, timing).

## Dose & Sécurité
- Dose de radiation estimée (si applicable, en mSv)
- Principe ALARA appliqué: comment réduire la dose
- Contre-indications absolues et relatives
- Gestion de l'allergie au contraste / insuffisance rénale (DFG seuils)
- Précautions grossesse/allaitement si pertinent

## Ce qu'on cherche
Signes clés à identifier, diagnostic principal et DDx.

## Pièges
Faux positifs/négatifs classiques, artéfacts, variantes anatomiques.

## Perles
3-5 points COURTS et PERCUTANTS (max 15 mots chacun).

Temps de lecture total: moins de 5 minutes.

APRÈS le contenu markdown, ajoute une section séparée avec EXACTEMENT ce format:
---QA_JSON---
[{"question": "...", "model_answer": "...", "key_points": ["..."]}, ...]
---END_QA_JSON---

Les 3 paires Q&A doivent être de style examen FMH2, en français. Les réponses modèles doivent être basées UNIQUEMENT sur les faits du brief ci-dessus — ne pas ajouter de faits supplémentaires.`

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
