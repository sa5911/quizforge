import { config } from '../../config.js';
import { llmProvider } from '../prompt.js';

export function anthropicProvider() {
  if (!config.ai.anthropicKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return llmProvider(`anthropic:${config.ai.anthropicModel}`, async ({ system, user }) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.ai.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.ai.anthropicModel,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(config.ai.timeoutMs),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('') ?? '';
  });
}
