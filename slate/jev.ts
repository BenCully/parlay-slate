// Adapter for the decision model running on the Mac mini.
const endpoint = process.env.JEV_ENDPOINT ?? 'http://100.87.236.63:11435/v1/decide';

type Decision = { probabilities: number[]; choice: string };

async function decide(state: string, question: string, options: string[]): Promise<Decision> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, kind: 'choice', question, options }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`JEV decision endpoint returned HTTP ${response.status}.`);
  const result = await response.json() as Decision;
  if (!Array.isArray(result.probabilities) || result.probabilities.length !== options.length ||
      result.probabilities.some((p) => !Number.isFinite(p) || p < 0 || p > 1) ||
      !options.includes(result.choice)) {
    throw new Error('JEV decision endpoint returned an invalid decision.');
  }
  return result;
}

export async function rerank(input: {
  query: string;
  items: { id: string; text: string }[];
  topK: number;
  minRelevance: number;
}) {
  const scored = [];
  for (const item of input.items) {
    const result = await decide(item.text, `Is this relevant to: ${input.query}?`, ['no', 'yes']);
    scored.push({ ...item, relevance: result.probabilities[1] });
  }
  return { items: scored.filter((item) => item.relevance >= input.minRelevance)
    .sort((a, b) => b.relevance - a.relevance).slice(0, input.topK) };
}

export async function verify(input: {
  claims: { id: string; claim: string; evidence: string }[];
  minConfidence: number;
}) {
  const checks = [];
  const options = ['supported', 'contradicted', 'unsupported'] as const;
  for (const claim of input.claims) {
    const result = await decide(claim.evidence,
      `Does the evidence support, contradict, or fail to establish this claim: ${claim.claim}?`, [...options]);
    const verdict = result.choice as typeof options[number];
    const confidence = result.probabilities[options.indexOf(verdict)];
    checks.push({ id: claim.id, verdict, confidence,
      status: confidence >= input.minConfidence ? 'ready' as const : 'review' as const,
      probabilities: { supported: result.probabilities[0] } });
  }
  return { checks };
}
