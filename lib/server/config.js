const env = process.env;

export const config = {
  isProd: env.NODE_ENV === 'production',
  allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  maxUploadBytes: Number(env.MAX_UPLOAD_MB || 25) * 1024 * 1024,
  storageBucket: env.FIREBASE_STORAGE_BUCKET || '', // optional: only set if Cloud Storage is enabled
  sessionMaxAgeMs: 5 * 24 * 3600 * 1000,
  quiz: { defaultDurationMinutes: 60, submitGraceMs: 3000 },
  ai: {
    provider: (env.AI_PROVIDER || 'mock').toLowerCase(),
    anthropicKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    openaiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
    timeoutMs: Number(env.AI_TIMEOUT_MS || 120000),
  },
};
