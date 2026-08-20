import { invokeLLM } from "./_core/llm";
import mammoth from "mammoth";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storageGetSignedUrl, storagePut } from "./storage";
import { extractVideoAudio } from "./videoTranscription";

const FAST_MODEL = "gpt-5-mini";
const MULTIMODAL_MODEL = "gemini-3-flash-preview";

const summaryInstructions: Record<"quick" | "complete" | "topics" | "simple", string> = {
  quick: "Crie um resumo de revisão muito conciso, em até 10 linhas, com os conceitos indispensáveis.",
  complete: "Crie um resumo completo, organizado por seções, com definições, relações, exemplos e alertas de erros comuns.",
  topics: "Crie uma síntese por tópicos e subtópicos, priorizando uma estrutura hierárquica clara.",
  simple: "Explique com linguagem simples e didática, como para alguém começando a aprender o assunto, sem perder a precisão.",
};

function getText(response: Awaited<ReturnType<typeof invokeLLM>>) {
  const content = response.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("A IA não retornou conteúdo utilizável.");
  return content.trim();
}

function cleanExtractedText(text: string) {
  return text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkText(text: string, size = 1200, overlap = 180) {
  const normalized = cleanExtractedText(text);
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const end = Math.min(normalized.length, cursor + size);
    const boundary = normalized.lastIndexOf("\n", end);
    const splitAt = boundary > cursor + size * 0.55 ? boundary : end;
    const piece = normalized.slice(cursor, splitAt).trim();
    if (piece) chunks.push(piece);
    cursor = Math.max(splitAt, cursor + 1) - overlap;
    if (cursor < 0) cursor = 0;
    if (splitAt === normalized.length) break;
  }
  return chunks.slice(0, 120);
}

function extractYoutubeId(url: string) {
  const parsed = new URL(url);
  if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(parsed.hostname)) {
    throw new Error("Use um link válido do YouTube.");
  }
  const id = parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
  if (!id || !/^[a-zA-Z0-9_-]{6,20}$/.test(id)) throw new Error("Não foi possível identificar o vídeo do YouTube.");
  return id;
}

function decodeXml(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractYoutubeTranscript(youtubeUrl: string) {
  const videoId = extractYoutubeId(youtubeUrl);
  const titleResponse = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`);
  const title = titleResponse.ok ? ((await titleResponse.json()) as { title?: string }).title : undefined;

  for (const lang of ["pt", "pt-BR", "en"]) {
    const response = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}`);
    const body = await response.text();
    const lines = Array.from(body.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)).map(match => decodeXml(match[1]));
    const transcript = lines.filter(Boolean).join(" ").trim();
    if (transcript.length > 80) return { transcript, title, videoId };
  }
  throw new Error("Este link não possui legendas públicas disponíveis. Para transcrever a fala mesmo sem legenda, baixe o vídeo que você tem direito de usar e envie o arquivo MP4 na opção Arquivo.");
}

export async function extractFileContent(input: { storageKey: string; mimeType?: string | null; type: "pdf" | "docx" | "image" }) {
  const url = await storageGetSignedUrl(input.storageKey);
  if (input.type === "docx") {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Não foi possível acessar o documento DOCX enviado.");
    const buffer = Buffer.from(await response.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    return cleanExtractedText(result.value);
  }
  const isImage = input.type === "image";
  const response = await invokeLLM({
    model: MULTIMODAL_MODEL,
    maxTokens: 9000,
    messages: [
      {
        role: "system",
        content: "Você extrai conteúdo acadêmico com rigor. Transcreva e organize somente o que está presente no material. Preserve fórmulas, definições e estrutura. Não invente fatos. Retorne texto limpo em português.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Extraia o conteúdo de estudo deste material." },
          isImage
            ? { type: "image_url", image_url: { url, detail: "high" } }
            : { type: "file_url", file_url: { url, mime_type: "application/pdf" } },
        ],
      },
    ],
  });
  return cleanExtractedText(getText(response));
}

export async function transcribeStudyAudio(storageKey: string) {
  const url = await storageGetSignedUrl(storageKey);
  const response = await transcribeAudio({
    audioUrl: url,
    language: "pt",
    prompt: "Transcrição de conteúdo de estudo em português brasileiro. Preserve termos técnicos, fórmulas e nomes próprios.",
  });
  if (!("text" in response)) throw new Error(response.error || "Não foi possível transcrever o áudio.");
  return cleanExtractedText(response.text || "");
}

export async function transcribeUploadedVideo(storageKey: string) {
  const videoUrl = await storageGetSignedUrl(storageKey);
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) throw new Error("Não foi possível acessar o vídeo enviado.");
  const video = Buffer.from(await videoResponse.arrayBuffer());
  const { audio, durationSeconds } = await extractVideoAudio(video);
  const { key: audioKey } = await storagePut(`students/video-audio/${crypto.randomUUID()}.mp3`, audio, "audio/mpeg");
  const transcription = await transcribeStudyAudio(audioKey);
  return { transcription, durationSeconds };
}

export async function generateSummary(text: string, format: "quick" | "complete" | "topics" | "simple") {
  const response = await invokeLLM({
    model: FAST_MODEL,
    maxTokens: format === "complete" ? 4000 : 2200,
    messages: [
      { role: "system", content: "Você é um professor brasileiro preciso e didático. Use apenas o material de origem e sinalize lacunas quando existirem." },
      { role: "user", content: `${summaryInstructions[format]}\n\nMATERIAL DE ORIGEM:\n${text.slice(0, 30000)}` },
    ],
  });
  return getText(response);
}

type GeneratedFlashcards = { cards: Array<{ front: string; back: string }> };

export async function generateFlashcardsFromText(text: string, count: number) {
  const response = await invokeLLM({
    model: FAST_MODEL,
    maxTokens: 4000,
    messages: [
      { role: "system", content: "Você cria flashcards de alta qualidade para revisão espaçada. Cada cartão deve testar uma ideia atômica, com pergunta clara e resposta objetiva. Use exclusivamente o material fornecido." },
      { role: "user", content: `Crie exatamente ${count} flashcards com base no material:\n${text.slice(0, 28000)}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "study_flashcards",
        strict: true,
        schema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "object",
                properties: { front: { type: "string" }, back: { type: "string" } },
                required: ["front", "back"],
                additionalProperties: false,
              },
            },
          },
          required: ["cards"],
          additionalProperties: false,
        },
      },
    },
  });
  const parsed = JSON.parse(getText(response)) as GeneratedFlashcards;
  return parsed.cards.filter(card => card.front.trim() && card.back.trim()).slice(0, count);
}

type GeneratedQuiz = { title: string; questions: Array<{ prompt: string; options: string[]; correctAnswer: string; explanation: string; difficulty: "easy" | "medium" | "hard" }> };

export async function generateQuizFromText(text: string, count: number) {
  const response = await invokeLLM({
    model: FAST_MODEL,
    maxTokens: 5000,
    messages: [
      { role: "system", content: "Você é um avaliador educacional. Elabore questões de múltipla escolha corretas e justas. Cada questão deve ter quatro opções, uma resposta correta e uma explicação baseada somente no material de origem." },
      { role: "user", content: `Crie exatamente ${count} questões, distribuindo dificuldade quando possível.\n\nMATERIAL:\n${text.slice(0, 28000)}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "study_quiz",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  prompt: { type: "string" },
                  options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                  correctAnswer: { type: "string" },
                  explanation: { type: "string" },
                  difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                },
                required: ["prompt", "options", "correctAnswer", "explanation", "difficulty"],
                additionalProperties: false,
              },
            },
          },
          required: ["title", "questions"],
          additionalProperties: false,
        },
      },
    },
  });
  const quiz = JSON.parse(getText(response)) as GeneratedQuiz;
  return { ...quiz, questions: quiz.questions.filter(question => question.options.includes(question.correctAnswer)).slice(0, count) };
}

type QuizCorrection = { corrections: Array<{ questionId: number; isCorrect: boolean; feedback: string }> };

export async function gradeQuizAnswers(input: { questions: Array<{ id: number; prompt: string; correctAnswer: string; explanation: string; studentAnswer: string }> }) {
  const response = await invokeLLM({
    model: FAST_MODEL,
    maxTokens: 3000,
    messages: [
      { role: "system", content: "Você é um professor que corrige respostas de quiz. Avalie cada resposta usando a resposta esperada, explique brevemente o raciocínio e seja encorajador. Não invente conteúdo externo." },
      { role: "user", content: `Corrija estas respostas:\n${JSON.stringify(input.questions)}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "quiz_correction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            corrections: {
              type: "array",
              items: {
                type: "object",
                properties: { questionId: { type: "number" }, isCorrect: { type: "boolean" }, feedback: { type: "string" } },
                required: ["questionId", "isCorrect", "feedback"],
                additionalProperties: false,
              },
            },
          },
          required: ["corrections"],
          additionalProperties: false,
        },
      },
    },
  });
  return (JSON.parse(getText(response)) as QuizCorrection).corrections;
}

export function rankRelevantChunks(
  query: string,
  chunks: Array<{ chunk: { content: string; materialId: number }; material: { title: string } }>,
) {
  const terms = Array.from(new Set(query.toLocaleLowerCase("pt-BR").match(/[A-Za-zÀ-ÿ0-9]{3,}/g) || []));
  return chunks
    .map(item => ({
      ...item,
      score: terms.reduce((score, term) => score + (item.chunk.content.toLocaleLowerCase("pt-BR").includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .filter(item => item.score > 0)
    .slice(0, 8);
}

export async function answerTutorQuestion(input: { question: string; context: Array<{ content: string; title: string; materialId: number }> }) {
  const sourceText = input.context.length
    ? input.context.map((item, index) => `[Fonte ${index + 1}: ${item.title}]\n${item.content}`).join("\n\n")
    : "Nenhuma fonte relevante foi encontrada nos materiais do aluno.";
  const response = await invokeLLM({
    model: FAST_MODEL,
    maxTokens: 3000,
    messages: [
      { role: "system", content: "Você é o tutor SOF-IA. Responda em português brasileiro, com raciocínio didático, exemplos curtos e linguagem adequada ao aluno. Baseie a resposta estritamente nas fontes. Se as fontes forem insuficientes, diga isso claramente e indique o que estudar." },
      { role: "user", content: `PERGUNTA DO ALUNO:\n${input.question}\n\nCONTEXTO RECUPERADO:\n${sourceText}` },
    ],
  });
  return getText(response);
}
