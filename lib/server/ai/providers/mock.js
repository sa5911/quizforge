/**
 * Offline provider for development/demos (no API key needed). It builds simple fill-in-the-blank
 * questions from sentences in the passage. Quality is deliberately basic: use a real provider in production.
 */
const STOP = new Set('the and that with from this have were which their there would about these those into than then them when what where while also been being other such more most some only over under after before because between through during'.split(' '));

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

export function mockProvider() {
  return {
    name: 'mock',
    async generateQuestions({ section, count, optionCount, avoid }) {
      const sentences = section.content
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.length >= 60 && s.length <= 260);
      const words = [...new Set(section.content.match(/\b[A-Za-z]{6,}\b/g) ?? [])].filter((w) => !STOP.has(w.toLowerCase()));
      const out = [];
      for (const s of shuffle(sentences)) {
        if (out.length >= count) break;
        const candidates = (s.match(/\b[A-Za-z]{6,}\b/g) ?? []).filter((w) => !STOP.has(w.toLowerCase()));
        const answer = candidates[Math.floor(Math.random() * candidates.length)];
        if (!answer) continue;
        const distractors = shuffle(words.filter((w) => w.toLowerCase() !== answer.toLowerCase() && !s.includes(w))).slice(0, optionCount - 1);
        if (distractors.length < optionCount - 1) continue;
        const question = `Complete the statement: "${s.replace(answer, '_____')}"`;
        if (avoid.includes(question)) continue;
        const options = [answer, ...distractors];
        out.push({
          question,
          options,
          correctIndex: 0,
          explanation: `The passage states: "${s}"`,
          sourceReference: section.title,
        });
      }
      return out;
    },
  };
}
