export type ReviewCardState = { easeFactor: number | string; repetitions: number; intervalDays: number };

export function calculateReviewSchedule(card: ReviewCardState, quality: number, now = new Date()) {
  const oldEase = Number(card.easeFactor);
  const easeFactor = Math.max(1.3, oldEase + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const repetitions = quality < 3 ? 0 : card.repetitions + 1;
  const intervalDays = quality < 3 ? 1 : repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(card.intervalDays * easeFactor));
  const nextReviewAt = new Date(now.getTime() + intervalDays * 86_400_000);
  return { easeFactor: easeFactor.toFixed(2), repetitions, intervalDays, nextReviewAt };
}

export type SubjectForMastery = { id: number; name: string };
export type QuizAttemptForMastery = { subjectId: number; score: number };

export function calculateMasteryMetrics(subjects: SubjectForMastery[], attempts: QuizAttemptForMastery[]) {
  const results = new Map<number, { total: number; score: number }>();
  for (const attempt of attempts) {
    const current = results.get(attempt.subjectId) || { total: 0, score: 0 };
    results.set(attempt.subjectId, { total: current.total + 1, score: current.score + attempt.score });
  }
  const subjectMastery = subjects.map(subject => {
    const result = results.get(subject.id);
    return { subjectId: subject.id, name: subject.name, score: result ? Math.round(result.score / result.total) : 0, attempts: result?.total || 0 };
  });
  const masteryScore = attempts.length ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length) : 0;
  const improvementAreas = subjectMastery.filter(item => item.attempts > 0 && item.score < 75).sort((a, b) => a.score - b.score).slice(0, 3);
  return { masteryScore, subjectMastery, improvementAreas };
}
