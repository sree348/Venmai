export function getAnthropicApiKey() {
  const provider = String(process.env.LLM_PROVIDER || '').toLowerCase();
  const anthropicDisabled = /^(1|true|yes)$/i.test(process.env.ANTHROPIC_DISABLED || '');
  if (anthropicDisabled || (process.env.OPENAI_API_KEY && provider !== 'anthropic')) {
    return '';
  }

  const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
  if (key && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = key;
  }
  return key;
}

export function hasAnthropicProvider() {
  return Boolean(getAnthropicApiKey());
}

export function hasOpenAiProvider() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getAnthropicModel(tier: 'analysis' | 'classifier' = 'analysis') {
  if (tier === 'classifier') {
    return process.env.ANTHROPIC_CHEAP_MODEL || process.env.CLAUDE_CHEAP_MODEL || 'claude-haiku-4-5-20251001';
  }

  return process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
}

export function logLlmProviderSelection(scope: string, provider: 'anthropic' | 'openai', model: string) {
  console.log(`[LLMProvider] ${scope} provider=${provider} model=${model}`);
}
