import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON, queueBriefGeneration } from '@/lib/claude'
import type { QAPair } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

interface BriefMeta {
  has_mnemonic: boolean
  mnemonic_name: string | null
  is_critical: boolean
}

interface ParsedBrief {
  content: string
  qa_pairs: QAPair[]
  meta: BriefMeta
}

function parseBriefResponse(response: string): ParsedBrief {
  // Strip meta first so it doesn't contaminate content
  const metaMatch = response.match(/---META_JSON---\s*([\s\S]*?)\s*---END_META_JSON---/)
  let working = response
  let meta: BriefMeta = { has_mnemonic: false, mnemonic_name: null, is_critical: false }
  if (metaMatch) {
    try {
      const raw = parseClaudeJSON<Partial<BriefMeta> & { mnemonic_name?: string | null }>(metaMatch[1])
      meta = {
        has_mnemonic: raw.has_mnemonic === true,
        mnemonic_name: typeof raw.mnemonic_name === 'string' && raw.mnemonic_name.trim().length > 0 ? raw.mnemonic_name.trim() : null,
        is_critical: raw.is_critical === true,
      }
    } catch {
      // Keep defaults if meta parsing fails — don't fail the whole brief
    }
    working = working.substring(0, working.indexOf('---META_JSON---')).trim()
  }

  const qaMatch = working.match(/---QA_JSON---\s*([\s\S]*?)\s*---END_QA_JSON---/)
  let qa_pairs: QAPair[] = []
  let content = working
  if (qaMatch) {
    content = working.substring(0, working.indexOf('---QA_JSON---')).trim()
    try {
      qa_pairs = parseClaudeJSON<QAPair[]>(qaMatch[1])
    } catch {
      qa_pairs = []
    }
  }

  return { content, qa_pairs, meta }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { entity_name, entity_type, chapter, topic, reference_text, notes, existing_content, is_synthesis, children_names, children_references } = await request.json()

    // Synthesis brief for parent entities
    if (is_synthesis && children_names?.length > 0) {
      const result = await queueBriefGeneration(async () => {
        const childrenBlock = children_names.map((name: string, i: number) => {
          const ref = children_references?.[i] || ''
          return `### ${name}\n${ref ? ref.substring(0, 2000) : '(pas de référence fournie)'}`
        }).join('\n\n')

        const synthPrompt = `Tu es un radiologue expert et coach FMH2 suisse. Génère un BRIEF DE SYNTHÈSE pour le groupe: ${entity_name} (chapitre: ${chapter}, thème: ${topic}).

Ce groupe contient les sous-entités suivantes avec leurs références:
${childrenBlock}

${notes ? `\nCORRECTIONS DU CANDIDAT (priorité):\n${notes}` : ''}
${existing_content ? `\nBRIEF EXISTANT (préserver les modifications manuelles):\n${existing_content}` : ''}

IMPORTANT: Tout en français. Niveau FMH2.

Format du brief de synthèse:

## Vue d'ensemble du groupe
2-3 phrases: qu'est-ce que ${entity_name} en tant que catégorie, pourquoi c'est important en radiologie.

## Tableau comparatif
Tableau markdown comparant TOUTES les sous-entités:
| Critère | Sous-type 1 | Sous-type 2 | ... |
Inclure: épidémiologie, localisation typique, signes clés, signal IRM/CT, traitement.

## Points communs
Ce qui unit toutes les sous-entités de ce groupe.

## Critères de discrimination rapide
Pour chaque paire de sous-types facilement confondus: LE critère qui les différencie.

## Arbre décisionnel
Approche systématique: comment identifier le bon sous-type à partir d'une image.

## Perles de synthèse
3-5 perles COURTES qui aident à naviguer le groupe rapidement.

Temps de lecture: moins de 5 minutes.

APRÈS le contenu, ajoute:
---QA_JSON---
[{"question": "...", "model_answer": "...", "key_points": ["..."]}, ...]
---END_QA_JSON---

Les 3 Q&A doivent être des questions de SYNTHÈSE/COMPARAISON entre les sous-types, pas sur un seul sous-type.

APRÈS les Q&A, ajoute encore EXACTEMENT ce bloc:
---META_JSON---
{"has_mnemonic": true|false, "mnemonic_name": "NOM ou null", "is_critical": true|false}
---END_META_JSON---

has_mnemonic: true si tu as inclus une mnémonique SPÉCIFIQUE publiée (ex: MEGA, TORCH, FEGNOMASHIC, VITAMIN-C&D). NE PAS compter VINDICATE (cadre générique) comme true.
mnemonic_name: nom court en MAJUSCULES (ex: "MEGA") ou null.
is_critical: true si le groupe contient au moins un diagnostic "can't miss" en radiologie (urgences STAT, asymétries diagnostiques à ne pas manquer).`

        const response = await callClaude(synthPrompt, `Brief de synthèse: ${entity_name}`, 6144)
        return parseBriefResponse(response)
      })
      return NextResponse.json(result)
    }

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

      const existingContentBlock = existing_content
        ? `\n\nBRIEF EXISTANT (le candidat a manuellement modifié certaines sections — PRÉSERVE toutes les modifications, corrections et ajouts de l'utilisateur. Intègre les nouvelles informations de la référence SANS écraser les éditions manuelles):\n${existing_content}`
        : ''

      const systemPrompt = `Tu es un radiologue expert et coach pour l'examen FMH2 suisse. Génère un brief d'étude pour: ${entity_name} (chapitre: ${chapter}, thème: ${topic}, type: ${entity_type}).

IMPORTANT: Tout le contenu en français.
Contexte FMH2 suisse — niveau attendu: médecin spécialiste en formation dernière année.
${referenceBlock}${notesBlock}${existingContentBlock}

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
IMPORTANT — distinguer deux types de mnémoniques:
1. **Mnémonique SPÉCIFIQUE à cette entité/localisation** (ex: MEGA pour tumeurs fosse postérieure pédiatrique, TORCH pour infections congénitales, FEGNOMASHIC pour nécrose avasculaire). Si une telle mnémonique RECONNUE et PUBLIÉE existe, l'inclure EN PRIORITÉ.
2. **Cadre DDx générique** (VINDICATE = Vasculaire, Infectieux, Néoplasique, Dégénératif, etc.). NE PAS utiliser VINDICATE comme mnémonique principale pour une entité — c'est un outil d'organisation, pas un DDx spécifique. Ne l'inclure que si AUCUNE mnémonique spécifique n'existe ET uniquement comme cadre de réflexion secondaire.

Si aucune mnémonique spécifique n'existe: lister les DDx par fréquence (fréquent → rare) avec un critère discriminant par ligne.
Format si mnémonique: "Mnémonique: [NOM] → [lettre = diagnostic], [lettre = diagnostic], ..."

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
Si un moyen mnémotechnique SPÉCIFIQUE et RECONNU existe pour ce groupe précis de diagnostics (ex: MEGA pour fosse postérieure pédiatrique, TORCH pour infections congénitales), l'inclure en priorité.
NE PAS utiliser VINDICATE comme mnémonique principale — c'est un cadre générique d'organisation, pas un DDx spécifique. Ne l'inclure qu'en complément si aucune mnémonique spécifique n'existe.
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

Les 3 paires Q&A doivent être de style examen FMH2, en français. Les réponses modèles doivent être basées UNIQUEMENT sur les faits du brief ci-dessus — ne pas ajouter de faits supplémentaires.

APRÈS les Q&A, ajoute encore EXACTEMENT ce bloc:
---META_JSON---
{"has_mnemonic": true|false, "mnemonic_name": "NOM ou null", "is_critical": true|false}
---END_META_JSON---

has_mnemonic: true si tu as inclus une mnémonique SPÉCIFIQUE publiée pour cette entité (ex: MEGA pour fosse postérieure pédiatrique, TORCH pour infections congénitales, FEGNOMASHIC pour lésions lytiques, VITAMIN-C&D pour DDx rachis). NE PAS compter VINDICATE (cadre générique d'organisation, pas une mnémonique spécifique).
mnemonic_name: nom court en MAJUSCULES (ex: "MEGA") ou null si has_mnemonic est false.
is_critical: true si cette entité est un diagnostic "can't miss" / STAT en radiologie (dissection aortique, embolie pulmonaire, pneumothorax sous tension, AVC hémorragique, urgences pédiatriques, ischémie mésentérique, abcès, etc.). false sinon.`

      const userMessage = `Génère le brief complet pour: ${entity_name} (${entity_type})`

      const response = await callClaude(systemPrompt, userMessage, 6144)
      return parseBriefResponse(response)
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
