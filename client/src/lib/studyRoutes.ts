export const newSubjectPath = "/disciplinas?nova=1";

export function shouldOpenNewSubjectForm(search: string) {
  return new URLSearchParams(search).get("nova") === "1";
}
