import { describe, expect, it } from "vitest";
import { calculateMasteryMetrics, calculateReviewSchedule } from "./studyLogic";

describe("calculateReviewSchedule", () => {
  it("reinicia a revisão para o dia seguinte quando a recordação foi fraca", () => {
    const review = calculateReviewSchedule({ easeFactor: "2.50", repetitions: 4, intervalDays: 18 }, 2, new Date("2026-08-19T00:00:00Z"));
    expect(review.repetitions).toBe(0);
    expect(review.intervalDays).toBe(1);
    expect(review.nextReviewAt.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("amplia o intervalo em uma sequência de respostas seguras", () => {
    const review = calculateReviewSchedule({ easeFactor: "2.50", repetitions: 2, intervalDays: 6 }, 5, new Date("2026-08-19T00:00:00Z"));
    expect(review.repetitions).toBe(3);
    expect(review.intervalDays).toBeGreaterThan(6);
    expect(Number(review.easeFactor)).toBeGreaterThan(2.5);
  });
});

describe("calculateMasteryMetrics", () => {
  it("calcula domínio total e prioriza disciplinas abaixo do limiar de reforço", () => {
    const result = calculateMasteryMetrics(
      [{ id: 1, name: "Biologia" }, { id: 2, name: "História" }, { id: 3, name: "Física" }],
      [{ subjectId: 1, score: 90 }, { subjectId: 1, score: 70 }, { subjectId: 2, score: 40 }],
    );
    expect(result.masteryScore).toBe(67);
    expect(result.subjectMastery.find(item => item.subjectId === 1)?.score).toBe(80);
    expect(result.improvementAreas).toEqual([{ subjectId: 2, name: "História", score: 40, attempts: 1 }]);
  });
});
