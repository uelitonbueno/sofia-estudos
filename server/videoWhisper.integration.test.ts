import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
  transcribeAudio: vi.fn(),
  extractVideoAudio: vi.fn(),
}));

vi.mock("./storage", () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl, storagePut: mocks.storagePut }));
vi.mock("./_core/voiceTranscription", () => ({ transcribeAudio: mocks.transcribeAudio }));
vi.mock("./videoTranscription", () => ({ extractVideoAudio: mocks.extractVideoAudio }));

import { transcribeUploadedVideo } from "./ai";

describe("transcribeUploadedVideo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.storageGetSignedUrl.mockImplementation(async key => key === "students/materials/aula.mp4" ? "https://storage.example/video.mp4" : "https://storage.example/extracted.mp3");
    mocks.storagePut.mockResolvedValue({ key: "students/video-audio/extracted.mp3", url: "/manus-storage/extracted.mp3" });
    mocks.extractVideoAudio.mockResolvedValue({ audio: Buffer.from("audio-compactado"), durationSeconds: 42 });
    mocks.transcribeAudio.mockResolvedValue({ text: "Transcrição do vídeo sem legenda." });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }));
  });

  it("baixa o vídeo, extrai o áudio, armazena-o e envia a faixa ao Whisper", async () => {
    const result = await transcribeUploadedVideo("students/materials/aula.mp4");

    expect(mocks.storageGetSignedUrl).toHaveBeenNthCalledWith(1, "students/materials/aula.mp4");
    expect(mocks.extractVideoAudio).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(mocks.storagePut).toHaveBeenCalledWith(expect.stringMatching(/^students\/video-audio\//), Buffer.from("audio-compactado"), "audio/mpeg");
    expect(mocks.storageGetSignedUrl).toHaveBeenNthCalledWith(2, "students/video-audio/extracted.mp3");
    expect(mocks.transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: "https://storage.example/extracted.mp3" }));
    expect(result).toEqual({ transcription: "Transcrição do vídeo sem legenda.", durationSeconds: 42 });
  });
});
