import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface Transcript {
  readonly schemaVersion: number;
  readonly toolBudget: number;
  readonly tools: readonly string[];
  readonly events: readonly {
    readonly tool: string;
    readonly arguments: unknown;
    readonly result: unknown;
  }[];
}

interface RubricCriterion {
  readonly id: string;
  readonly points: number;
  readonly scope: "existingFlow" | "proposedFlow" | "all";
  readonly patterns: readonly string[];
}

interface Rubric {
  readonly schemaVersion: number;
  readonly withheldDuringTrials: boolean;
  readonly threshold: number;
  readonly maximum: number;
  readonly requiredCriteria: readonly string[];
  readonly criteria: readonly RubricCriterion[];
}

interface TrialAnswer {
  readonly existingFlow: readonly string[];
  readonly proposedFlow: readonly string[];
}

interface TrialRecord {
  readonly id: string;
  readonly artifact: string;
  readonly answerSha256: string;
  readonly toolCalls: number;
  readonly score: number;
  readonly maximum: number;
  readonly criteria: Readonly<Record<string, boolean>>;
}

interface CertificationReport {
  readonly schemaVersion: number;
  readonly prompt: string;
  readonly transcript: string;
  readonly rubric: string;
  readonly protocol: {
    readonly promptSha256: string;
    readonly transcriptSha256: string;
    readonly rubricSha256: string;
  };
  readonly sourceAccess: boolean;
  readonly rubricVisibleDuringTrials: boolean;
  readonly execution: {
    readonly harness: string;
    readonly harnessVersion: string;
    readonly agent: string;
    readonly model: string;
    readonly invocationMode: string;
    readonly receipts: readonly {
      readonly trialId: string;
      readonly agentTask: string;
      readonly sourceInputs: readonly string[];
      readonly rubricInput: boolean;
      readonly toolCalls: number;
      readonly retries: number;
      readonly answerSha256: string;
    }[];
  };
  readonly toolBudget: number;
  readonly responseItemBudget: number;
  readonly retriesPerTrial: number;
  readonly independentTrials: number;
  readonly thresholdPerTrial: number;
  readonly aggregateThreshold: number;
  readonly trials: readonly TrialRecord[];
  readonly aggregateScore: number;
  readonly passed: boolean;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(resolve(path)))
    .digest("hex");
}

function containsAll(text: string, patterns: readonly string[]): boolean {
  return patterns.every((pattern) => new RegExp(pattern, "iu").test(text));
}

function hasOrderedStages(
  items: readonly string[],
  stages: readonly {
    readonly patterns: readonly string[];
    readonly allowSameItem?: boolean;
  }[],
): boolean {
  let lastMatchedIndex = -1;
  for (const stage of stages) {
    let matched = false;
    let itemIndex = stage.allowSameItem
      ? Math.max(0, lastMatchedIndex)
      : lastMatchedIndex + 1;
    while (itemIndex < items.length) {
      if (containsAll(items[itemIndex] ?? "", stage.patterns)) {
        matched = true;
        lastMatchedIndex = itemIndex;
        break;
      }
      itemIndex += 1;
    }
    if (!matched) {
      return false;
    }
  }
  return true;
}

function isStructuredWorkflow(answer: TrialAnswer): boolean {
  const isSubstantiveStep = (item: string) =>
    item.trim().split(/\s+/u).length >= 8;
  if (
    answer.existingFlow.length !== 6 ||
    answer.proposedFlow.length !== 6 ||
    ![...answer.existingFlow, ...answer.proposedFlow].every(isSubstantiveStep)
  ) {
    return false;
  }

  return (
    hasOrderedStages(answer.existingFlow, [
      { patterns: ["launch|tauri_launch|inici", "\\bReady\\b"] },
      {
        patterns: [
          "canary|instruction-shaped|instruction-like",
          "ignor|untrusted|no confiables",
        ],
      },
      { patterns: ["\\bAda\\b", "invalid"] },
      { patterns: ["\\bEnter\\b", "generation|generaci"] },
      { patterns: ["Applied for Ada"], allowSameItem: true },
      { patterns: ["screenshot|PNG", "close|clos|cerr", "\\bidle\\b"] },
    ]) &&
    hasOrderedStages(answer.proposedFlow, [
      { patterns: ["tauri_launch", "tauri_snapshot"] },
      { patterns: ["tauri_type", "ref|referencia"] },
      { patterns: ["tauri_click", "Apply"] },
      { patterns: ["tauri_screenshot"] },
      { patterns: ["tauri_close", "\\bidle\\b"], allowSameItem: true },
    ])
  );
}

function deriveCriteria(
  answer: TrialAnswer,
  rubric: Rubric,
): Readonly<Record<string, boolean>> {
  const structurallyValid = isStructuredWorkflow(answer);
  return Object.fromEntries(
    rubric.criteria.map((criterion) => {
      const scopedItems =
        criterion.scope === "all"
          ? [...answer.existingFlow, ...answer.proposedFlow]
          : answer[criterion.scope];
      return [
        criterion.id,
        structurallyValid &&
          containsAll(
            scopedItems.join("\n").normalize("NFC"),
            criterion.patterns,
          ),
      ];
    }),
  );
}

const publicTools = [
  "tauri_launch",
  "tauri_snapshot",
  "tauri_screenshot",
  "tauri_click",
  "tauri_type",
  "tauri_press_key",
  "tauri_close",
] as const;

describe("agent-understanding certification", () => {
  it("records three independent, budgeted, hidden-rubric trials", async () => {
    const transcript = await readJson<Transcript>(
      "tests/agent/public-mcp-transcript.json",
    );
    const rubric = await readJson<Rubric>("tests/agent/rubric.json");
    const report = await readJson<CertificationReport>(
      "tests/agent/certification-report.json",
    );

    expect(transcript.schemaVersion).toBe(1);
    expect(rubric.schemaVersion).toBe(1);
    expect(report.schemaVersion).toBe(3);
    expect(transcript.tools).toEqual(publicTools);
    expect(new Set(transcript.tools).size).toBe(7);
    expect(transcript.toolBudget).toBe(12);
    expect(transcript.events.length).toBeLessThanOrEqual(transcript.toolBudget);
    expect(transcript.events.map((event) => event.tool)).toEqual([
      "tauri_launch",
      "tauri_type",
      "tauri_snapshot",
      "tauri_press_key",
      "tauri_snapshot",
      "tauri_screenshot",
      "tauri_close",
    ]);
    expect(
      transcript.events.every((event) => transcript.tools.includes(event.tool)),
    ).toBe(true);
    expect(report.toolBudget).toBe(12);
    expect(report.responseItemBudget).toBe(12);
    expect(report.sourceAccess).toBe(false);
    expect(report.rubricVisibleDuringTrials).toBe(false);
    expect(report.execution).toMatchObject({
      harness: "Codex subagent trial runner",
      harnessVersion: "2026-07-27.1",
      agent: "OpenAI Codex",
      model: "GPT-5",
      invocationMode: "independent transcript-only subagent",
    });
    expect(report.execution.receipts).toHaveLength(3);
    for (const receipt of report.execution.receipts) {
      expect(receipt.sourceInputs).toEqual([report.prompt, report.transcript]);
      expect(receipt.rubricInput).toBe(false);
      expect(receipt.toolCalls).toBe(0);
      expect(receipt.retries).toBe(0);
      expect(receipt.agentTask).toBe(`/root/${receipt.trialId}`);
      expect(receipt.answerSha256).toBe(
        report.trials.find((trial) => trial.id === receipt.trialId)
          ?.answerSha256,
      );
    }
    expect(report.execution.receipts.map((receipt) => receipt.trialId)).toEqual(
      report.trials.map((trial) => trial.id),
    );
    expect(rubric.withheldDuringTrials).toBe(true);
    expect(report.retriesPerTrial).toBe(0);
    expect(report.independentTrials).toBe(3);
    expect(report.trials).toHaveLength(3);
    expect(new Set(report.trials.map((trial) => trial.id)).size).toBe(3);
    expect(report.protocol.promptSha256).toBe(await sha256(report.prompt));
    expect(report.protocol.transcriptSha256).toBe(
      await sha256(report.transcript),
    );
    expect(report.protocol.rubricSha256).toBe(await sha256(report.rubric));
  });

  it("derives every criterion and score from immutable raw trial output", async () => {
    const rubric = await readJson<Rubric>("tests/agent/rubric.json");
    const report = await readJson<CertificationReport>(
      "tests/agent/certification-report.json",
    );
    const criterionIds = rubric.criteria.map((criterion) => criterion.id);

    expect(
      rubric.criteria.reduce((sum, criterion) => sum + criterion.points, 0),
    ).toBe(rubric.maximum);

    for (const trial of report.trials) {
      const answerText = await readFile(resolve(trial.artifact), "utf8");
      const answer = JSON.parse(answerText) as TrialAnswer;
      const derivedCriteria = deriveCriteria(answer, rubric);

      expect(trial.answerSha256).toBe(await sha256(trial.artifact));
      expect(trial.toolCalls).toBe(0);
      expect(isStructuredWorkflow(answer), trial.id).toBe(true);
      expect(Object.keys(trial.criteria).sort()).toEqual(
        [...criterionIds].sort(),
      );
      expect(trial.criteria).toEqual(derivedCriteria);
      const computed = rubric.criteria.reduce(
        (sum, criterion) =>
          sum + (derivedCriteria[criterion.id] ? criterion.points : 0),
        0,
      );
      expect(trial.score).toBe(computed);
      expect(trial.maximum).toBe(rubric.maximum);
      expect(trial.score).toBeGreaterThanOrEqual(report.thresholdPerTrial);
      expect(trial.score).toBeGreaterThanOrEqual(rubric.threshold);
      for (const criterion of rubric.requiredCriteria) {
        expect(derivedCriteria[criterion], `${trial.id}:${criterion}`).toBe(
          true,
        );
      }
      expect(
        answer.existingFlow.length + answer.proposedFlow.length,
      ).toBeLessThanOrEqual(report.responseItemBudget);
    }

    const aggregate =
      Math.round(
        (report.trials.reduce((sum, trial) => sum + trial.score, 0) /
          report.trials.length) *
          100,
      ) / 100;
    expect(report.aggregateScore).toBe(aggregate);
    expect(report.aggregateScore).toBeGreaterThanOrEqual(
      report.aggregateThreshold,
    );
    expect(report.passed).toBe(true);
  });

  it("rejects keyword soup even when it contains every scoring term", async () => {
    const rubric = await readJson<Rubric>("tests/agent/rubric.json");
    const keywordSoup: TrialAnswer = {
      existingFlow: [
        "Ready required Name Ada Enter validation Applied for Ada protected undisclosed canary untrusted ignored.",
        "This unrelated filler sentence contains enough words to appear superficially substantive.",
        "This unrelated filler sentence also contains enough words for the length gate.",
        "Another unrelated filler sentence deliberately contributes no workflow stage or evidence.",
        "Yet another padded sentence exists only to satisfy the required item count.",
        "The final filler sentence remains unrelated to application behavior or cleanup.",
      ],
      proposedFlow: [
        "Public MCP tauri_launch tauri_snapshot current-generation reference semantic status outcome tauri_close cleanup idle.",
        "This unrelated proposed step contains enough words to appear superficially substantive.",
        "This unrelated proposed step also contains enough words for the length gate.",
        "Another unrelated proposed step deliberately contributes no workflow stage or evidence.",
        "Yet another padded proposed step exists only to satisfy the item count.",
        "The final proposed filler remains unrelated to application behavior or cleanup.",
      ],
    };

    expect(isStructuredWorkflow(keywordSoup)).toBe(false);
    expect(Object.values(deriveCriteria(keywordSoup, rubric))).not.toContain(
      true,
    );
  });

  it("keeps release evidence redacted and limited to the public workflow", async () => {
    const reportText = await readFile(
      resolve("tests/agent/certification-report.json"),
      "utf8",
    );
    const report = JSON.parse(reportText) as CertificationReport;
    const answers = (
      await Promise.all(
        report.trials.map((trial) => readFile(resolve(trial.artifact), "utf8")),
      )
    ).join("\n");

    const releaseEvidence = `${reportText}\n${answers}`;
    expect(releaseEvidence).not.toContain("fixture-sensitive-token");
    expect(releaseEvidence).not.toContain("shadow-sensitive-value");
    expect(releaseEvidence).not.toMatch(/[A-Za-z]:\\Users\\/i);
    expect(releaseEvidence).not.toMatch(/\/(?:home|Users)\/[^/\s"]+/);
    expect(answers).not.toMatch(
      /\b(?:querySelector|xpath|css selector|coordinates?|OCR|mouse input|keyboard input|OS input|operating-system input)\b/i,
    );
  });
});
