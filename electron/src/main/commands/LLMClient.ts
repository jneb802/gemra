import { generateText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LLMStep } from '../../shared/commandTypes'

export async function callLLM(step: LLMStep, interpolatedPrompt: string, apiKey: string): Promise<string> {
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set. Add it in Preferences > Providers.')
  }

  const openrouter = createOpenRouter({ apiKey })
  const model = openrouter(step.model)

  const result = await generateText({
    model,
    ...(step.system ? { system: step.system } : {}),
    prompt: interpolatedPrompt,
  })

  return result.text
}
