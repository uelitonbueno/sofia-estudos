import { describe, expect, it } from "vitest";
import { shouldOfferVideoUpload } from "./materialIngestion";

describe("fallback de vídeo sem legenda", () => {
  it("oferece envio do MP4 após a falha específica de legenda pública", () => {
    expect(shouldOfferVideoUpload("Este link não possui legendas públicas disponíveis.")).toBe(true);
  });

  it("não troca a origem em erros que não são de legenda", () => {
    expect(shouldOfferVideoUpload("O arquivo ultrapassa o limite de tamanho.")).toBe(false);
  });
});
