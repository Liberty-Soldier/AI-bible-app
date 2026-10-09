export type EmetAiPerformanceStage =
  | "ledger"
  | "cache-lookup"
  | "planning"
  | "retrieval"
  | "evidence-cache-lookup"
  | "generation"
  | "validation"
  | "repair"
  | "storage";

export type EmetAiUsageMeasurement = {
  stage: "plan-answer" | "answer" | "repair";
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type EmetAiPerformanceObserver = {
  stage(stage: EmetAiPerformanceStage, elapsedMs: number): void;
  usage(measurement: EmetAiUsageMeasurement): void;
};

export function createEmetAiPerformanceTrace() {
  const startedAt = performance.now();
  const stages: Partial<Record<EmetAiPerformanceStage, number>> = {};
  const usage: EmetAiUsageMeasurement[] = [];
  const observer: EmetAiPerformanceObserver = {
    stage(stage, elapsedMs) {
      stages[stage] = (stages[stage] || 0) + elapsedMs;
    },
    usage(measurement) {
      usage.push(measurement);
    },
  };
  return {
    observer,
    measure<T>(stage: EmetAiPerformanceStage, operation: () => T): T {
      const stageStartedAt = performance.now();
      try {
        return operation();
      } finally {
        observer.stage(stage, performance.now() - stageStartedAt);
      }
    },
    async measureAsync<T>(stage: EmetAiPerformanceStage, operation: () => Promise<T>): Promise<T> {
      const stageStartedAt = performance.now();
      try {
        return await operation();
      } finally {
        observer.stage(stage, performance.now() - stageStartedAt);
      }
    },
    report(details: Record<string, unknown> = {}) {
      const totalTokens = usage.reduce((sum, item) => sum + item.totalTokens, 0);
      const report = {
        totalMs: Math.round(performance.now() - startedAt),
        stages: Object.fromEntries(
          Object.entries(stages).map(([stage, elapsed]) => [stage, Math.round(elapsed || 0)]),
        ),
        aiCalls: usage.length,
        totalTokens,
        usage,
        ...details,
      };
      console.info("EMET AI performance", report);
      return report;
    },
  };
}
