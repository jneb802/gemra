// Backend profiles for different LLM providers

export interface BackendProfile {
  id: string
  name: string
  description: string
  env: Record<string, string>
}

export const BACKEND_PROFILES: Record<string, BackendProfile> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Official)',
    description: 'Claude models via Anthropic API',
    env: {
      // Uses default system env vars (ANTHROPIC_API_KEY from environment)
    },
  },
  litellm: {
    id: 'litellm',
    name: 'LiteLLM + OpenRouter',
    description: 'Open source models via LiteLLM proxy',
    env: {
      ANTHROPIC_API_URL: 'http://localhost:8000',
      // ANTHROPIC_API_KEY will be read from system env or can be overridden here
    },
  },
}

export function getProfile(profileId: string): BackendProfile {
  return BACKEND_PROFILES[profileId] || BACKEND_PROFILES.anthropic
}
