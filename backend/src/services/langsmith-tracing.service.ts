import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';

const hasLangsmithKey = Boolean(process.env.LANGCHAIN_API_KEY || process.env.LANGSMITH_API_KEY);

if (!process.env.LANGCHAIN_TRACING_V2) {
  process.env.LANGCHAIN_TRACING_V2 = hasLangsmithKey ? 'true' : 'false';
}

if (!process.env.LANGSMITH_TRACING) {
  process.env.LANGSMITH_TRACING = process.env.LANGCHAIN_TRACING_V2;
}

if (!process.env.LANGCHAIN_PROJECT) {
  process.env.LANGCHAIN_PROJECT = 'mip-agent';
}

export function estimateTraceTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function getTraceCostEstimate(modelName: string, inputText: string, outputText = '') {
  const inputTokens = estimateTraceTokens(inputText);
  const outputTokens = outputText ? estimateTraceTokens(outputText) : 0;
  const lower = modelName.toLowerCase();
  const pricing = lower.includes('gpt-4o-mini')
    ? { inputPerMillion: 0.15, outputPerMillion: 0.60 }
    : lower.includes('gpt-4o')
      ? { inputPerMillion: 2.50, outputPerMillion: 10.00 }
      : lower.includes('haiku')
        ? { inputPerMillion: 0.80, outputPerMillion: 4.00 }
        : lower.includes('sonnet')
          ? { inputPerMillion: 3.00, outputPerMillion: 15.00 }
          : { inputPerMillion: 1.00, outputPerMillion: 5.00 };

  return {
    tokens: inputTokens + outputTokens,
    inputTokens,
    outputTokens,
    estimate:
      (inputTokens / 1_000_000) * pricing.inputPerMillion +
      (outputTokens / 1_000_000) * pricing.outputPerMillion,
  };
}

export async function traceRunnableStep<T>(
  runName: string,
  input: Record<string, unknown>,
  fn: () => Promise<T> | T,
  metadata: Record<string, unknown> = {},
): Promise<T> {
  const startedAt = Date.now();
  const chain = RunnableSequence.from([
    RunnableLambda.from(async (stepInput: Record<string, unknown>) => stepInput),
    RunnableLambda.from(async () => fn()),
  ]).withConfig({
    runName,
    metadata: {
      project: process.env.LANGCHAIN_PROJECT || 'mip-agent',
      ...metadata,
    },
  });

  try {
    return await chain.invoke(input);
  } finally {
    console.log('[LangSmith]', {
      runName,
      latencyMs: Date.now() - startedAt,
      tracing: process.env.LANGCHAIN_TRACING_V2,
      project: process.env.LANGCHAIN_PROJECT || 'mip-agent',
    });
  }
}
