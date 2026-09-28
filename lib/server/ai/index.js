import { config } from '../config.js';
import { anthropicProvider } from './providers/anthropic.js';
import { openaiProvider } from './providers/openai.js';
import { mockProvider } from './providers/mock.js';

/**
 * Provider contract:
 *   { name: string, generateQuestions({ section, count, difficulty, optionCount, avoid }) => Promise<RawQuestion[]> }
 * where RawQuestion = { question, options[], correctIndex, explanation, sourceReference }.
 * To add a vendor, write a provider and register it below. Nothing else in the app changes.
 */
const registry = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  mock: mockProvider,
};

export function getProvider(name = config.ai.provider) {
  const factory = registry[name];
  if (!factory) throw new Error(`Unknown AI_PROVIDER "${name}". Available: ${Object.keys(registry).join(', ')}`);
  return factory();
}

/** Is a real (non-demo) AI provider configured? The admin UI uses this to point at JSON import instead. */
export function aiStatus() {
  const p = config.ai.provider;
  const configured = (p === 'anthropic' && !!config.ai.anthropicKey) || (p === 'openai' && (!!config.ai.openaiKey || !config.ai.openaiBaseUrl.includes('api.openai.com')));
  return { provider: p, configured };
}
