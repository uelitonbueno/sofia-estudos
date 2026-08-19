import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, MAX_VIDEO_DURATION_SECONDS, audioExtractionArgs, extractVideoAudio, validateVideoForTranscription } from "./videoTranscription";

const execFileAsync = promisify(execFile);

describe("pipeline de transcrição de vídeo", () => {
  it("gera um comando que remove imagem e normaliza uma faixa de áudio para o Whisper", () => {
    expect(audioExtractionArgs("/tmp/video.mp4", "/tmp/audio.mp3")).toEqual([
      "-v", "error", "-y", "-i", "/tmp/video.mp4", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", "/tmp/audio.mp3",
    ]);
  });

  it("rejeita arquivos grandes e vídeos acima do limite de duração", () => {
    expect(() => validateVideoForTranscription({ sizeBytes: MAX_VIDEO_BYTES + 1, durationSeconds: 60 })).toThrow("15 MB");
    expect(() => validateVideoForTranscription({ sizeBytes: 1024, durationSeconds: MAX_VIDEO_DURATION_SECONDS + 1 })).toThrow("30 minutos");
  });

  it("extrai uma faixa MP3 utilizável de um vídeo MP4 com áudio", async () => {
    const inputPath = `/tmp/sofia-video-test-${crypto.randomUUID()}.mp4`;
    try {
      await execFileAsync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=16000", "-t", "1", "-c:a", "aac", inputPath]);
      const result = await extractVideoAudio(await readFile(inputPath));
      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.audio.byteLength).toBeGreaterThan(1000);
    } finally {
      await rm(inputPath, { force: true });
    }
  });
});
