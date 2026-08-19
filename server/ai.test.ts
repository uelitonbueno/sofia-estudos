import { describe, expect, it } from "vitest";
import { chunkText, rankRelevantChunks } from "./ai";

describe("chunkText", () => {
  it("divide conteúdo extenso em trechos sem perder o início e o final", () => {
    const original = `Introdução à fotossíntese.\n${"A clorofila absorve energia luminosa para produzir glicose. ".repeat(90)}\nConclusão sobre a etapa clara.`;
    const chunks = chunkText(original, 260, 40);

    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks[0]).toContain("Introdução à fotossíntese");
    expect(chunks.at(-1)).toContain("Conclusão sobre a etapa clara");
    expect(chunks.every(chunk => chunk.length > 0)).toBe(true);
  });
});

describe("rankRelevantChunks", () => {
  const chunks = [
    { chunk: { content: "A mitocôndria produz ATP por respiração celular.", materialId: 11 }, material: { title: "Biologia celular" } },
    { chunk: { content: "A Revolução Francesa começou em 1789 e alterou a política europeia.", materialId: 12 }, material: { title: "História moderna" } },
    { chunk: { content: "O ATP armazena energia para as reações da célula.", materialId: 13 }, material: { title: "Metabolismo" } },
  ];

  it("prioriza os trechos que têm correspondência com a dúvida do estudante", () => {
    const relevant = rankRelevantChunks("Como a mitocôndria produz ATP na célula?", chunks);

    expect(relevant).toHaveLength(2);
    expect(relevant[0]?.material.title).toBe("Biologia celular");
    expect(relevant.map(item => item.material.title)).not.toContain("História moderna");
  });

  it("não inventa contexto quando não há relação lexical", () => {
    const relevant = rankRelevantChunks("qual é a capital da argentina", chunks);
    expect(relevant).toEqual([]);
  });
});
