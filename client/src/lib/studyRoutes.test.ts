import { describe, expect, it } from "vitest";
import { newSubjectPath, shouldOpenNewSubjectForm } from "./studyRoutes";

describe("atalhos de nova disciplina", () => {
  it("leva os atalhos para uma rota que abre o formulário", () => {
    expect(newSubjectPath).toBe("/disciplinas?nova=1");
    expect(shouldOpenNewSubjectForm("nova=1")).toBe(true);
  });

  it("não abre o formulário em navegação comum para disciplinas", () => {
    expect(shouldOpenNewSubjectForm("")).toBe(false);
  });
});
