// Shared types for custom slash commands

export interface ShellCommandDef {
  name: string
  description: string
  type: 'shell'
  command: string
}

export interface ShellStep {
  id: string
  type: 'shell'
  command: string
}

export interface LLMStep {
  id: string
  type: 'llm'
  provider: string
  model: string
  system?: string
  prompt: string
}

export type WorkflowStep = ShellStep | LLMStep

export interface WorkflowCommandDef {
  name: string
  description: string
  type: 'workflow'
  steps: WorkflowStep[]
}

export type ProjectCommand = ShellCommandDef | WorkflowCommandDef

export interface StepOutputEvent {
  runId: string
  stepId: string
  output: string
  stepType: 'shell' | 'llm'
}

export interface WorkflowDoneEvent {
  runId: string
}

export interface WorkflowErrorEvent {
  runId: string
  error: string
}
