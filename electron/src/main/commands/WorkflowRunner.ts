import { exec } from 'child_process'
import { promisify } from 'util'
import { callLLM } from './LLMClient'
import type { WorkflowStep } from '../../shared/commandTypes'

const execAsync = promisify(exec)

function interpolate(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => ctx[key] ?? '')
}

export async function runWorkflow(
  steps: WorkflowStep[],
  workingDir: string,
  apiKey: string,
  onStepOutput: (stepId: string, output: string, stepType: 'shell' | 'llm') => void,
  signal: AbortSignal
): Promise<void> {
  const ctx: Record<string, string> = {}

  for (const step of steps) {
    if (signal.aborted) {
      throw new Error('Workflow cancelled')
    }

    if (step.type === 'shell') {
      const cmd = interpolate(step.command, ctx)
      try {
        const { stdout, stderr } = await execAsync(cmd, { cwd: workingDir })
        const output = (stdout + stderr).trim()
        ctx[step.id] = output
        onStepOutput(step.id, output, 'shell')
      } catch (err: any) {
        const output = ((err.stdout ?? '') + (err.stderr ?? err.message ?? '')).trim()
        ctx[step.id] = output
        onStepOutput(step.id, output, 'shell')
      }
    } else if (step.type === 'llm') {
      const prompt = interpolate(step.prompt, ctx)
      const output = await callLLM(step, prompt, apiKey)
      ctx[step.id] = output
      onStepOutput(step.id, output, 'llm')
    }
  }
}
