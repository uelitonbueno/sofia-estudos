import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/** Identidade do usuário mantida pelo fluxo de autenticação da plataforma. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const studentProfiles = mysqlTable("studentProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("displayName", { length: 160 }),
  avatarUrl: varchar("avatarUrl", { length: 1024 }),
  academicLevel: varchar("academicLevel", { length: 80 }),
  goal: text("goal"),
  dailyStudyMinutes: int("dailyStudyMinutes").default(45).notNull(),
  onboardingCompleted: boolean("onboardingCompleted").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const subjects = mysqlTable("subjects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 24 }).default("#00F5FF").notNull(),
  icon: varchar("icon", { length: 48 }).default("orbit").notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("subjects_user_idx").on(table.userId)]);

export const materials = mysqlTable("materials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: int("subjectId").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  type: mysqlEnum("type", ["pdf", "docx", "image", "audio", "video", "youtube", "text"]).notNull(),
  sourceUrl: varchar("sourceUrl", { length: 2048 }),
  storageKey: varchar("storageKey", { length: 1024 }),
  storageUrl: varchar("storageUrl", { length: 2048 }),
  fileName: varchar("fileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 160 }),
  sizeBytes: int("sizeBytes"),
  extractedText: text("extractedText"),
  processingStatus: mysqlEnum("processingStatus", ["ready", "processing", "completed", "failed"]).default("ready").notNull(),
  processingError: text("processingError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("materials_user_idx").on(table.userId),
  index("materials_subject_idx").on(table.subjectId),
]);

/** Trechos recuperáveis do material para respostas fundamentadas no conteúdo do aluno. */
export const contentChunks = mysqlTable("contentChunks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  materialId: int("materialId").notNull().references(() => materials.id, { onDelete: "cascade" }),
  chunkIndex: int("chunkIndex").notNull(),
  content: text("content").notNull(),
  keywords: json("keywords").$type<string[] | null>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("content_chunks_material_idx").on(table.materialId)]);

export const summaries = mysqlTable("summaries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  materialId: int("materialId").notNull().references(() => materials.id, { onDelete: "cascade" }),
  format: mysqlEnum("format", ["quick", "complete", "topics", "simple"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("summaries_material_idx").on(table.materialId)]);

export const flashcards = mysqlTable("flashcards", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: int("subjectId").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  materialId: int("materialId").references(() => materials.id, { onDelete: "set null" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  easeFactor: decimal("easeFactor", { precision: 4, scale: 2 }).default("2.50").notNull(),
  intervalDays: int("intervalDays").default(0).notNull(),
  repetitions: int("repetitions").default(0).notNull(),
  nextReviewAt: timestamp("nextReviewAt").defaultNow().notNull(),
  lastReviewedAt: timestamp("lastReviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("flashcards_user_review_idx").on(table.userId, table.nextReviewAt),
  index("flashcards_subject_idx").on(table.subjectId),
]);

export const quizzes = mysqlTable("quizzes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: int("subjectId").notNull().references(() => subjects.id, { onDelete: "cascade" }),
  materialId: int("materialId").references(() => materials.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const quizQuestions = mysqlTable("quizQuestions", {
  id: int("id").autoincrement().primaryKey(),
  quizId: int("quizId").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  options: json("options").$type<string[] | null>(),
  correctAnswer: text("correctAnswer").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: mysqlEnum("difficulty", ["easy", "medium", "hard"]).default("medium").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("quiz_questions_quiz_idx").on(table.quizId)]);

export const quizAttempts = mysqlTable("quizAttempts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  quizId: int("quizId").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  score: int("score").notNull(),
  correctCount: int("correctCount").notNull(),
  totalQuestions: int("totalQuestions").notNull(),
  answers: json("answers").$type<Array<{ questionId: number; answer: string; isCorrect: boolean }> | null>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const studySessions = mysqlTable("studySessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: int("subjectId").references(() => subjects.id, { onDelete: "set null" }),
  materialId: int("materialId").references(() => materials.id, { onDelete: "set null" }),
  activityType: mysqlEnum("activityType", ["summary", "flashcard", "quiz", "tutor", "material"]).notNull(),
  durationMinutes: int("durationMinutes").default(0).notNull(),
  xpEarned: int("xpEarned").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("study_sessions_user_idx").on(table.userId, table.createdAt)]);

export const studentProgress = mysqlTable("studentProgress", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  totalXp: int("totalXp").default(0).notNull(),
  currentLevel: int("currentLevel").default(1).notNull(),
  currentStreak: int("currentStreak").default(0).notNull(),
  lastStudyAt: timestamp("lastStudyAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const tutorConversations = mysqlTable("tutorConversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: int("subjectId").references(() => subjects.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const tutorMessages = mysqlTable("tutorMessages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull().references(() => tutorConversations.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  sources: json("sources").$type<Array<{ materialId: number; title: string }> | null>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("tutor_messages_conversation_idx").on(table.conversationId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type Material = typeof materials.$inferSelect;
export type Flashcard = typeof flashcards.$inferSelect;
