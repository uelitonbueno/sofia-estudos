import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MAX_VIDEO_DURATION_SECONDS = 30 * 60;
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

export function validateVideoForTranscription(input: { sizeBytes: number; durationSeconds: number }) {
  if (input.sizeBytes > MAX_VIDEO_BYTES) throw new Error("O vídeo ultrapassa o limite de 15 MB para transcrição.");
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) throw new Error("Não foi possível identificar a duração do vídeo.");
  if (input.durationSeconds > MAX_VIDEO_DURATION_SECONDS) throw new Error("Para transcrever com segurança, envie um vídeo de até 30 minutos.");
}

export function audioExtractionArgs(inputPath: string, outputPath: string) {
  return ["-v", "error", "-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", outputPath];
}

function run(binary: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const process = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", chunk => { stdout += chunk.toString(); });
    process.stderr.on("data", chunk => { stderr += chunk.toString(); });
    process.on("error", error => reject(error));
    process.on("close", code => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${binary} encerrou com código ${code}`)));
  });
}

async function getVideoDurationSeconds(inputPath: string) {
  const output = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath]);
  return Number.parseFloat(output.trim());
}

export async function extractVideoAudio(video: Buffer) {
  if (video.byteLength > MAX_VIDEO_BYTES) throw new Error("O vídeo ultrapassa o limite de 15 MB para transcrição.");
  const workspace = join(tmpdir(), `sofia-video-${crypto.randomUUID()}`);
  const inputPath = join(workspace, "input.mp4");
  const outputPath = join(workspace, "audio.mp3");

  try {
    await mkdir(workspace, { recursive: true });
    await writeFile(inputPath, video);
    const durationSeconds = await getVideoDurationSeconds(inputPath);
    validateVideoForTranscription({ sizeBytes: video.byteLength, durationSeconds });
    await run("ffmpeg", audioExtractionArgs(inputPath, outputPath));
    const audio = await readFile(outputPath);
    if (!audio.byteLength) throw new Error("O vídeo não possui uma faixa de áudio utilizável.");
    if (audio.byteLength > 16 * 1024 * 1024) throw new Error("O áudio extraído excede o limite de transcrição. Envie um vídeo mais curto.");
    return { audio, durationSeconds };
  } catch (error) {
    if (error instanceof Error && /áudio|vídeo|duração|limite|transcri/i.test(error.message)) throw error;
    throw new Error("Não foi possível extrair o áudio deste vídeo MP4. Verifique se o arquivo está íntegro e possui som.");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
