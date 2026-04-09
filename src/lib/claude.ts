import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Sequential queue for brief generation
let briefQueue: Promise<void> = Promise.resolve()

export function queueBriefGeneration<T>(fn: () => Promise<T>): Promise<T> {
  let resolve: (value: T) => void
  let reject: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  briefQueue = briefQueue.then(async () => {
    try {
      const result = await fn()
      resolve!(result)
    } catch (e) {
      reject!(e)
    }
  })

  return promise
}

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 4096
): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const block = message.content[0]
  if (block.type === 'text') {
    return block.text
  }
  throw new Error('Unexpected response type from Claude')
}

/** Parse JSON from Claude response, stripping markdown fences if present */
export function parseClaudeJSON<T>(text: string): T {
  // Strip markdown code fences
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  return JSON.parse(cleaned)
}
