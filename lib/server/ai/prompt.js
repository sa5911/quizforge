import { z } from 'zod';

export const SYSTEM_PROMPT = `You are an expert exam writer creating multiple-choice questions (MCQs) from a passage of a book.

STRICT RULES
1. Use ONLY information stated in the passage. Never use outside knowledge. If the passage cannot support a question, write fewer questions.
2. Every question must be answerable from the passage alone and stand on its own (no "according to the passage", no references to "the text above").
3. Exactly ONE option is correct; the others must be plausible but clearly wrong according to the passage.
4. Options must be distinct, similar in length and style, and must not include "all of the above" / "none of the above".
5. Do not repeat or rephrase any question in the "already asked" list.
6. Write a short explanation (1-3 sentences) justifying the correct answer using the passage.
7. Respect the requested difficulty: easy = direct recall of a stated fact; medium = understanding/paraphrase; hard = inference, comparison or multi-step reasoning across the passage.
8. Reply with ONE JSON object and nothing else (no markdown fences).

JSON shape:
{"questions":[{"question":"...","options":["...","..."],"correctIndex":0,"explanation":"...","sourceReference":"chapter/section/page if identifiable, else empty string"}]}`;

export function buildUserPrompt({ section, count, difficulty, optionCount, avoid }) {
  const pages = section.pageStart ? ` (pages ${section.pageStart}${section.pageEnd && section.pageEnd !== section.pageStart ? `-${section.pageEnd}` : ''})` : '';
  const avoidBlock = avoid.length ? `\nALREADY ASKED (do not repeat):\n${avoid.map((q) => `- ${q}`).join('\n')}\n` : '';
  return `Write ${count} ${difficulty} multiple-choice question(s), each with exactly ${optionCount} options.

SECTION: ${section.title}${pages}
${avoidBlock}
PASSAGE:
"""
${section.content}
"""`;
}

export const rawQuestionSchema = z.object({
  question: z.string().trim().min(10).max(1000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().trim().max(3000).default(''),
  sourceReference: z.string().trim().max(300).optional().default(''),
});

/** Pull the first JSON object out of a model reply (tolerates code fences / chatter). */
export function extractJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model reply did not contain JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Turns any "prompt in, text out" function into a full provider.
 * A new LLM vendor only has to implement `complete({ system, user })`.
 */
export function llmProvider(name, complete) {
  return {
    name,
    async generateQuestions(req) {
      const text = await complete({ system: SYSTEM_PROMPT, user: buildUserPrompt(req) });
      const json = extractJson(text);
      const list = Array.isArray(json) ? json : json.questions;
      if (!Array.isArray(list)) throw new Error('Model reply had no "questions" array');
      return list;
    },
  };
}
