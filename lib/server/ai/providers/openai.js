import { config } from '../../config.js';
import { llmProvider } from '../prompt.js';

/** Works with OpenAI and any OpenAI-compatible endpoint (Groq, Together, Ollama, LM Studio...) via OPENAI_BASE_URL. */
export function openaiProvider() {
  if (!config.ai.openaiKey && config.ai.openaiBaseUrl.includes('api.openai.com')) throw new Error('OPENAI_API_KEY is not set');
  return llmProvider(`openai:${config.ai.openaiModel}`, async ({ system, user }) => {
    const res = await fetch(`${config.ai.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ai.openaiKey || 'none'}` },
      body: JSON.stringify({
        model: config.ai.openaiModel,
        temperature: 0.4,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(config.ai.timeoutMs),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  });
}
