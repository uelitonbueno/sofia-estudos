import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  contentChunks,
  flashcards,
  materials,
  quizAttempts,
  quizQuestions,
  quizzes,
  studentProfiles,
  studentProgress,
  studySessions,
  subjects,
  summaries,
  tutorConversations,
  tutorMessages,
  type InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { calculateMasteryMetrics, calculateReviewSchedule } from "./studyLogic";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Falha ao iniciar a conexão:", error);
      _db = null;
    }
  }
  return _db;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getOrCreateStudentState(userId: number, defaultName?: string | null) {
  const db = requireDb(await getDb());
  const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
  if (!profile) {
    await db.insert(studentProfiles).values({ userId, displayName: defaultName ?? null });
  }
  const [progress] = await db.select().from(studentProgress).where(eq(studentProgress.userId, userId)).limit(1);
  if (!progress) await db.insert(studentProgress).values({ userId });

  const [freshProfile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
  const [freshProgress] = await db.select().from(studentProgress).where(eq(studentProgress.userId, userId)).limit(1);
  return { profile: freshProfile!, progress: freshProgress! };
}

export async function updateStudentProfile(
  userId: number,
  values: { displayName?: string; academicLevel?: string; goal?: string; dailyStudyMinutes?: number; onboardingCompleted?: boolean },
) {
  const db = requireDb(await getDb());
  await getOrCreateStudentState(userId);
  await db.update(studentProfiles).set(values).where(eq(studentProfiles.userId, userId));
  const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
  return profile!;
}

export async function listSubjects(userId: number, includeArchived = false) {
  const db = requireDb(await getDb());
  const where = includeArchived
    ? eq(subjects.userId, userId)
    : and(eq(subjects.userId, userId), eq(subjects.archived, false));
  return db.select().from(subjects).where(where).orderBy(desc(subjects.updatedAt));
}

export async function createSubject(userId: number, values: { name: string; description?: string; color?: string; icon?: string }) {
  const db = requireDb(await getDb());
  const result = await db.insert(subjects).values({ userId, ...values });
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, Number(result[0].insertId))).limit(1);
  return subject!;
}

export async function updateSubject(
  userId: number,
  subjectId: number,
  values: { name?: string; description?: string | null; color?: string; icon?: string; archived?: boolean },
) {
  const db = requireDb(await getDb());
  await db.update(subjects).set(values).where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId)));
  const [subject] = await db.select().from(subjects).where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId))).limit(1);
  return subject;
}

export async function deleteSubject(userId: number, subjectId: number) {
  const db = requireDb(await getDb());
  await db.delete(subjects).where(and(eq(subjects.id, subjectId), eq(subjects.userId, userId)));
}

export async function listMaterials(userId: number, subjectId?: number) {
  const db = requireDb(await getDb());
  const where = subjectId
    ? and(eq(materials.userId, userId), eq(materials.subjectId, subjectId))
    : eq(materials.userId, userId);
  return db.select().from(materials).where(where).orderBy(desc(materials.createdAt));
}

export async function getMaterial(userId: number, materialId: number) {
  const db = requireDb(await getDb());
  const [material] = await db.select().from(materials).where(and(eq(materials.id, materialId), eq(materials.userId, userId))).limit(1);
  return material;
}

export async function createMaterial(
  userId: number,
  values: Omit<typeof materials.$inferInsert, "userId">,
) {
  const db = requireDb(await getDb());
  const result = await db.insert(materials).values({ ...values, userId });
  const [material] = await db.select().from(materials).where(eq(materials.id, Number(result[0].insertId))).limit(1);
  return material!;
}

export async function updateMaterialExtraction(
  userId: number,
  materialId: number,
  values: { extractedText?: string; processingStatus: "ready" | "processing" | "completed" | "failed"; processingError?: string | null },
) {
  const db = requireDb(await getDb());
  await db.update(materials).set(values).where(and(eq(materials.id, materialId), eq(materials.userId, userId)));
}

export async function replaceMaterialChunks(userId: number, materialId: number, chunks: Array<{ content: string; keywords?: string[] }>) {
  const db = requireDb(await getDb());
  await db.delete(contentChunks).where(and(eq(contentChunks.userId, userId), eq(contentChunks.materialId, materialId)));
  if (chunks.length) {
    await db.insert(contentChunks).values(chunks.map((chunk, index) => ({
      userId,
      materialId,
      chunkIndex: index,
      content: chunk.content,
      keywords: chunk.keywords ?? null,
    })));
  }
}

export async function getMaterialChunks(userId: number, subjectId?: number) {
  const db = requireDb(await getDb());
  if (subjectId) {
    return db.select({ chunk: contentChunks, material: materials })
      .from(contentChunks)
      .innerJoin(materials, eq(contentChunks.materialId, materials.id))
      .where(and(eq(contentChunks.userId, userId), eq(materials.subjectId, subjectId)))
      .orderBy(desc(contentChunks.createdAt));
  }
  return db.select({ chunk: contentChunks, material: materials })
    .from(contentChunks)
    .innerJoin(materials, eq(contentChunks.materialId, materials.id))
    .where(eq(contentChunks.userId, userId))
    .orderBy(desc(contentChunks.createdAt));
}

export async function saveSummary(userId: number, materialId: number, format: "quick" | "complete" | "topics" | "simple", content: string) {
  const db = requireDb(await getDb());
  const result = await db.insert(summaries).values({ userId, materialId, format, content });
  const [summary] = await db.select().from(summaries).where(eq(summaries.id, Number(result[0].insertId))).limit(1);
  return summary!;
}

export async function listSummaries(userId: number, materialId: number) {
  const db = requireDb(await getDb());
  return db.select().from(summaries).where(and(eq(summaries.userId, userId), eq(summaries.materialId, materialId))).orderBy(desc(summaries.createdAt));
}

export async function createFlashcards(
  userId: number,
  subjectId: number,
  materialId: number | null,
  cards: Array<{ front: string; back: string }>,
) {
  const db = requireDb(await getDb());
  if (!cards.length) return [];
  await db.insert(flashcards).values(cards.map(card => ({ userId, subjectId, materialId, front: card.front, back: card.back })));
  return listDueFlashcards(userId, subjectId, false);
}

export async function listDueFlashcards(userId: number, subjectId?: number, onlyDue = true) {
  const db = requireDb(await getDb());
  const due = onlyDue ? lte(flashcards.nextReviewAt, new Date()) : undefined;
  const scoped = subjectId ? eq(flashcards.subjectId, subjectId) : undefined;
  const where = [eq(flashcards.userId, userId), due, scoped].filter(Boolean) as any;
  return db.select().from(flashcards).where(and(...where)).orderBy(asc(flashcards.nextReviewAt));
}

export async function reviewFlashcard(userId: number, flashcardId: number, quality: number) {
  const db = requireDb(await getDb());
  const [card] = await db.select().from(flashcards).where(and(eq(flashcards.id, flashcardId), eq(flashcards.userId, userId))).limit(1);
  if (!card) throw new Error("Flashcard não encontrado.");
  const review = calculateReviewSchedule(card, quality);
  await db.update(flashcards).set({ ...review, lastReviewedAt: new Date() }).where(eq(flashcards.id, flashcardId));
  return { intervalDays: review.intervalDays, nextReviewAt: review.nextReviewAt, quality };
}

export async function saveQuiz(
  userId: number,
  subjectId: number,
  materialId: number | null,
  title: string,
  questions: Array<{ prompt: string; options: string[]; correctAnswer: string; explanation: string; difficulty: "easy" | "medium" | "hard" }>,
) {
  const db = requireDb(await getDb());
  const quizResult = await db.insert(quizzes).values({ userId, subjectId, materialId, title });
  const quizId = Number(quizResult[0].insertId);
  if (questions.length) await db.insert(quizQuestions).values(questions.map(question => ({ ...question, quizId })));
  return getQuiz(userId, quizId);
}

export async function getQuiz(userId: number, quizId: number) {
  const db = requireDb(await getDb());
  const [quiz] = await db.select().from(quizzes).where(and(eq(quizzes.id, quizId), eq(quizzes.userId, userId))).limit(1);
  if (!quiz) return undefined;
  const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId)).orderBy(asc(quizQuestions.id));
  return { ...quiz, questions };
}

export async function listQuizzes(userId: number, subjectId?: number) {
  const db = requireDb(await getDb());
  const where = subjectId ? and(eq(quizzes.userId, userId), eq(quizzes.subjectId, subjectId)) : eq(quizzes.userId, userId);
  return db.select().from(quizzes).where(where).orderBy(desc(quizzes.createdAt));
}

export async function recordQuizAttempt(
  userId: number,
  quizId: number,
  values: { score: number; correctCount: number; totalQuestions: number; answers: Array<{ questionId: number; answer: string; isCorrect: boolean }> },
) {
  const db = requireDb(await getDb());
  await db.insert(quizAttempts).values({ userId, quizId, ...values });
}

export async function recordStudyActivity(
  userId: number,
  values: { subjectId?: number | null; materialId?: number | null; activityType: "summary" | "flashcard" | "quiz" | "tutor" | "material"; durationMinutes?: number; xpEarned?: number },
) {
  const db = requireDb(await getDb());
  const xpEarned = values.xpEarned ?? 0;
  await getOrCreateStudentState(userId);
  await db.insert(studySessions).values({ userId, ...values, xpEarned });
  if (xpEarned > 0) {
    await db.update(studentProgress).set({
      totalXp: sql`${studentProgress.totalXp} + ${xpEarned}`,
      currentLevel: sql`GREATEST(1, FLOOR((${studentProgress.totalXp} + ${xpEarned}) / 300) + 1)`,
      lastStudyAt: new Date(),
    }).where(eq(studentProgress.userId, userId));
  }
}

export async function getDashboardData(userId: number) {
  const db = requireDb(await getDb());
  const { profile, progress } = await getOrCreateStudentState(userId);
  const [subjectRows, materialRows, dueCards, recentSessions, attempts] = await Promise.all([
    listSubjects(userId),
    listMaterials(userId),
    listDueFlashcards(userId),
    db.select().from(studySessions).where(eq(studySessions.userId, userId)).orderBy(desc(studySessions.createdAt)).limit(8),
    db.select({ attempt: quizAttempts, quiz: quizzes }).from(quizAttempts).innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id)).where(eq(quizAttempts.userId, userId)),
  ]);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const studyWeek = recentSessions.filter(item => item.createdAt >= weekAgo).reduce((sum, item) => sum + item.durationMinutes, 0);
  const { masteryScore, subjectMastery, improvementAreas } = calculateMasteryMetrics(subjectRows, attempts.map(({ attempt, quiz }) => ({ subjectId: quiz.subjectId, score: attempt.score })));
  return { profile, progress, subjects: subjectRows, materials: materialRows, dueCards, recentSessions, studyWeek, masteryScore, subjectMastery, improvementAreas };
}

export async function createConversation(userId: number, subjectId: number | null, title: string) {
  const db = requireDb(await getDb());
  const result = await db.insert(tutorConversations).values({ userId, subjectId, title });
  return Number(result[0].insertId);
}

export async function getConversation(userId: number, conversationId: number) {
  const db = requireDb(await getDb());
  const [conversation] = await db.select().from(tutorConversations).where(and(eq(tutorConversations.id, conversationId), eq(tutorConversations.userId, userId))).limit(1);
  if (!conversation) return undefined;
  const messages = await db.select().from(tutorMessages).where(eq(tutorMessages.conversationId, conversationId)).orderBy(asc(tutorMessages.createdAt));
  return { ...conversation, messages };
}

export async function addTutorMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string,
  sources?: Array<{ materialId: number; title: string }>,
) {
  const db = requireDb(await getDb());
  await db.insert(tutorMessages).values({ conversationId, role, content, sources: sources ?? null });
  await db.update(tutorConversations).set({ updatedAt: new Date() }).where(eq(tutorConversations.id, conversationId));
}
