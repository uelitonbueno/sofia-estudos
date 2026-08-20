import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import {
  answerTutorQuestion,
  chunkText,
  extractFileContent,
  extractYoutubeTranscript,
  generateFlashcardsFromText,
  generateQuizFromText,
  generateSummary,
  gradeQuizAnswers,
  rankRelevantChunks,
  transcribeStudyAudio,
  transcribeUploadedVideo,
} from "./ai";
import * as db from "./db";

const subjectInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().trim().max(48).optional(),
});

const materialType = z.enum(["pdf", "docx", "image", "audio", "video", "youtube", "text"]);
const summaryFormat = z.enum(["quick", "complete", "topics", "simple"]);

function inferMaterialType(mimeType: string, name: string) {
  const normalized = mimeType.toLowerCase();
  const extension = name.split(".").pop()?.toLowerCase();
  if (normalized === "application/pdf" || extension === "pdf") return "pdf" as const;
  if (normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx") return "docx" as const;
  if (normalized.startsWith("image/")) return "image" as const;
  if (normalized.startsWith("audio/")) return "audio" as const;
  if (normalized === "video/mp4" || extension === "mp4") return "video" as const;
  if (normalized.startsWith("video/")) throw new Error("Para processamento por IA, envie vídeos no formato MP4.");
  throw new Error("Formato não suportado. Use PDF, DOCX, imagem, áudio ou vídeo.");
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw new Error("Arquivo inválido.");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > 15 * 1024 * 1024) {
    throw new Error("O arquivo deve ter até 15 MB.");
  }
  return { mimeType: match[1], buffer };
}

function keywordsFromText(text: string) {
  const ignore = new Set(["para", "como", "com", "uma", "que", "dos", "das", "por", "não", "mais", "são", "este", "essa", "sobre", "entre"]);
  const words = text.toLocaleLowerCase("pt-BR").match(/[A-Za-zÀ-ÿ]{4,}/g) || [];
  return Array.from(new Set(words.filter(word => !ignore.has(word)))).slice(0, 12);
}

async function processMaterialForStudy(userId: number, materialId: number) {
  const material = await db.getMaterial(userId, materialId);
  if (!material) throw new Error("Material não encontrado.");
  await db.updateMaterialExtraction(userId, materialId, { processingStatus: "processing", processingError: null });
  try {
    let text = material.extractedText || "";
    if (material.type === "youtube") {
      if (!material.sourceUrl) throw new Error("O link do YouTube não está disponível.");
      const result = await extractYoutubeTranscript(material.sourceUrl);
      text = result.transcript;
    } else if (material.type === "audio") {
      if (!material.storageKey) throw new Error("O áudio não está disponível.");
      text = await transcribeStudyAudio(material.storageKey);
    } else if (material.type === "video") {
      if (!material.storageKey) throw new Error("O vídeo não está disponível.");
      const result = await transcribeUploadedVideo(material.storageKey);
      text = result.transcription;
    } else if (["pdf", "docx", "image"].includes(material.type)) {
      if (!material.storageKey) throw new Error("O arquivo não está disponível.");
      text = await extractFileContent({ storageKey: material.storageKey, mimeType: material.mimeType, type: material.type as "pdf" | "docx" | "image" });
    }
    if (text.trim().length < 25) throw new Error("Não foi possível extrair conteúdo suficiente deste material.");
    const chunks = chunkText(text).map(content => ({ content, keywords: keywordsFromText(content) }));
    await db.updateMaterialExtraction(userId, materialId, { extractedText: text, processingStatus: "completed", processingError: null });
    await db.replaceMaterialChunks(userId, materialId, chunks);
    await db.recordStudyActivity(userId, { subjectId: material.subjectId, materialId, activityType: "material", durationMinutes: 2, xpEarned: 10 });
    return { materialId, textLength: text.length, chunks: chunks.length, status: "completed" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar o material.";
    await db.updateMaterialExtraction(userId, materialId, { processingStatus: "failed", processingError: message });
    throw new Error(message);
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  profile: router({
    get: protectedProcedure.query(({ ctx }) => db.getOrCreateStudentState(ctx.user.id, ctx.user.name)),
    update: protectedProcedure.input(z.object({
      displayName: z.string().trim().min(2).max(160).optional(),
      academicLevel: z.string().trim().max(80).optional(),
      goal: z.string().trim().max(2000).optional(),
      dailyStudyMinutes: z.number().int().min(10).max(720).optional(),
      onboardingCompleted: z.boolean().optional(),
    })).mutation(({ ctx, input }) => db.updateStudentProfile(ctx.user.id, input)),
  }),
  dashboard: router({
    get: protectedProcedure.query(({ ctx }) => db.getDashboardData(ctx.user.id)),
  }),
  subjects: router({
    list: protectedProcedure.input(z.object({ includeArchived: z.boolean().optional() }).optional()).query(({ ctx, input }) => db.listSubjects(ctx.user.id, input?.includeArchived)),
    create: protectedProcedure.input(subjectInput).mutation(({ ctx, input }) => db.createSubject(ctx.user.id, input)),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), values: subjectInput.partial().extend({ archived: z.boolean().optional() }) })).mutation(({ ctx, input }) => db.updateSubject(ctx.user.id, input.id, input.values)),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await db.deleteSubject(ctx.user.id, input.id);
      return { success: true };
    }),
  }),
  materials: router({
    list: protectedProcedure.input(z.object({ subjectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => db.listMaterials(ctx.user.id, input?.subjectId)),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => db.getMaterial(ctx.user.id, input.id)),
    createText: protectedProcedure.input(z.object({ subjectId: z.number().int().positive(), title: z.string().trim().min(2).max(240), text: z.string().trim().min(25).max(50000) })).mutation(async ({ ctx, input }) => {
      const material = await db.createMaterial(ctx.user.id, { subjectId: input.subjectId, title: input.title, type: "text", extractedText: input.text, processingStatus: "ready" });
      return processMaterialForStudy(ctx.user.id, material.id);
    }),
    importYoutube: protectedProcedure.input(z.object({ subjectId: z.number().int().positive(), title: z.string().trim().max(240).optional(), url: z.string().url().max(2048) })).mutation(async ({ ctx, input }) => {
      const material = await db.createMaterial(ctx.user.id, { subjectId: input.subjectId, title: input.title || "Vídeo do YouTube", type: "youtube", sourceUrl: input.url, processingStatus: "ready" });
      return { material, processing: await processMaterialForStudy(ctx.user.id, material.id) };
    }),
    upload: protectedProcedure.input(z.object({ subjectId: z.number().int().positive(), title: z.string().trim().min(2).max(240), fileName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(3).max(160), dataUrl: z.string().min(20) })).mutation(async ({ ctx, input }) => {
      const decoded = decodeDataUrl(input.dataUrl);
      if (decoded.mimeType !== input.mimeType) throw new Error("O tipo declarado do arquivo não confere com o conteúdo enviado.");
      const type = inferMaterialType(input.mimeType, input.fileName);
      const safeName = input.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
      const uploaded = await storagePut(`students/${ctx.user.id}/materials/${crypto.randomUUID()}-${safeName}`, decoded.buffer, input.mimeType);
      const material = await db.createMaterial(ctx.user.id, {
        subjectId: input.subjectId,
        title: input.title,
        type,
        storageKey: uploaded.key,
        storageUrl: uploaded.url,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: decoded.buffer.byteLength,
        processingStatus: "ready",
      });
      return material;
    }),
    process: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => processMaterialForStudy(ctx.user.id, input.id)),
  }),
  study: router({
    summaries: router({
      list: protectedProcedure.input(z.object({ materialId: z.number().int().positive() })).query(({ ctx, input }) => db.listSummaries(ctx.user.id, input.materialId)),
      generate: protectedProcedure.input(z.object({ materialId: z.number().int().positive(), format: summaryFormat })).mutation(async ({ ctx, input }) => {
        const material = await db.getMaterial(ctx.user.id, input.materialId);
        if (!material?.extractedText) throw new Error("Processe o material antes de gerar um resumo.");
        const content = await generateSummary(material.extractedText, input.format);
        await db.recordStudyActivity(ctx.user.id, { subjectId: material.subjectId, materialId: material.id, activityType: "summary", durationMinutes: 4, xpEarned: 15 });
        return db.saveSummary(ctx.user.id, material.id, input.format, content);
      }),
    }),
    flashcards: router({
      due: protectedProcedure.input(z.object({ subjectId: z.number().int().positive().optional(), onlyDue: z.boolean().optional() }).optional()).query(({ ctx, input }) => db.listDueFlashcards(ctx.user.id, input?.subjectId, input?.onlyDue ?? true)),
      generate: protectedProcedure.input(z.object({ materialId: z.number().int().positive(), count: z.number().int().min(3).max(30).default(10) })).mutation(async ({ ctx, input }) => {
        const material = await db.getMaterial(ctx.user.id, input.materialId);
        if (!material?.extractedText) throw new Error("Processe o material antes de criar flashcards.");
        const cards = await generateFlashcardsFromText(material.extractedText, input.count);
        await db.createFlashcards(ctx.user.id, material.subjectId, material.id, cards);
        await db.recordStudyActivity(ctx.user.id, { subjectId: material.subjectId, materialId: material.id, activityType: "flashcard", durationMinutes: 4, xpEarned: 20 });
        return { created: cards.length, cards };
      }),
      review: protectedProcedure.input(z.object({ flashcardId: z.number().int().positive(), quality: z.number().int().min(0).max(5) })).mutation(async ({ ctx, input }) => {
        const review = await db.reviewFlashcard(ctx.user.id, input.flashcardId, input.quality);
        await db.recordStudyActivity(ctx.user.id, { activityType: "flashcard", durationMinutes: 1, xpEarned: input.quality >= 3 ? 5 : 2 });
        return review;
      }),
    }),
    quizzes: router({
      list: protectedProcedure.input(z.object({ subjectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => db.listQuizzes(ctx.user.id, input?.subjectId)),
      get: protectedProcedure.input(z.object({ quizId: z.number().int().positive() })).query(({ ctx, input }) => db.getQuiz(ctx.user.id, input.quizId)),
      generate: protectedProcedure.input(z.object({ materialId: z.number().int().positive(), count: z.number().int().min(3).max(20).default(5) })).mutation(async ({ ctx, input }) => {
        const material = await db.getMaterial(ctx.user.id, input.materialId);
        if (!material?.extractedText) throw new Error("Processe o material antes de criar um quiz.");
        const generated = await generateQuizFromText(material.extractedText, input.count);
        const quiz = await db.saveQuiz(ctx.user.id, material.subjectId, material.id, generated.title, generated.questions);
        await db.recordStudyActivity(ctx.user.id, { subjectId: material.subjectId, materialId: material.id, activityType: "quiz", durationMinutes: 5, xpEarned: 20 });
        return quiz;
      }),
      submit: protectedProcedure.input(z.object({ quizId: z.number().int().positive(), answers: z.array(z.object({ questionId: z.number().int().positive(), answer: z.string().max(4000) })) })).mutation(async ({ ctx, input }) => {
        const quiz = await db.getQuiz(ctx.user.id, input.quizId);
        if (!quiz) throw new Error("Quiz não encontrado.");
        const answerMap = new Map(input.answers.map(answer => [answer.questionId, answer.answer.trim().toLocaleLowerCase("pt-BR")]));
        const answers = quiz.questions.map(question => ({
          questionId: question.id,
          answer: answerMap.get(question.id) || "",
          isCorrect: (answerMap.get(question.id) || "") === question.correctAnswer.trim().toLocaleLowerCase("pt-BR"),
        }));
        const corrections = await gradeQuizAnswers({
          questions: quiz.questions.map(question => ({ id: question.id, prompt: question.prompt, correctAnswer: question.correctAnswer, explanation: question.explanation, studentAnswer: answerMap.get(question.id) || "" })),
        });
        const correctionByQuestion = new Map(corrections.map(correction => [correction.questionId, correction]));
        const evaluatedAnswers = answers.map(answer => ({ ...answer, isCorrect: correctionByQuestion.get(answer.questionId)?.isCorrect ?? answer.isCorrect }));
        const correctCount = evaluatedAnswers.filter(answer => answer.isCorrect).length;
        const score = Math.round((correctCount / Math.max(quiz.questions.length, 1)) * 100);
        await db.recordQuizAttempt(ctx.user.id, quiz.id, { score, correctCount, totalQuestions: quiz.questions.length, answers: evaluatedAnswers });
        await db.recordStudyActivity(ctx.user.id, { subjectId: quiz.subjectId, materialId: quiz.materialId, activityType: "quiz", durationMinutes: quiz.questions.length, xpEarned: 10 + correctCount * 5 });
        return { score, correctCount, totalQuestions: quiz.questions.length, answers: evaluatedAnswers, explanations: quiz.questions.map(question => ({ questionId: question.id, correctAnswer: question.correctAnswer, explanation: correctionByQuestion.get(question.id)?.feedback || question.explanation })) };
      }),
    }),
  }),
  tutor: router({
    conversation: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(({ ctx, input }) => db.getConversation(ctx.user.id, input.conversationId)),
    ask: protectedProcedure.input(z.object({ conversationId: z.number().int().positive().optional(), subjectId: z.number().int().positive().nullable().optional(), question: z.string().trim().min(3).max(4000) })).mutation(async ({ ctx, input }) => {
      const chunks = await db.getMaterialChunks(ctx.user.id, input.subjectId ?? undefined);
      const relevant = rankRelevantChunks(input.question, chunks);
      const conversationId = input.conversationId || await db.createConversation(ctx.user.id, input.subjectId ?? null, input.question.slice(0, 90));
      await db.addTutorMessage(conversationId, "user", input.question);
      const context = relevant.map(item => ({ content: item.chunk.content, title: item.material.title, materialId: item.chunk.materialId }));
      const answer = await answerTutorQuestion({ question: input.question, context });
      const sources = Array.from(new Map(context.map(item => [item.materialId, { materialId: item.materialId, title: item.title }])).values());
      await db.addTutorMessage(conversationId, "assistant", answer, sources);
      await db.recordStudyActivity(ctx.user.id, { subjectId: input.subjectId ?? null, activityType: "tutor", durationMinutes: 3, xpEarned: 8 });
      return { conversationId, answer, sources };
    }),
  }),
});

export type AppRouter = typeof appRouter;
