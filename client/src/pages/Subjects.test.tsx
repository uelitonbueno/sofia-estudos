import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Subjects from "./Subjects";

vi.mock("wouter", () => ({ useSearch: () => "nova=1" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ subjects: { list: { invalidate: vi.fn() } }, dashboard: { get: { invalidate: vi.fn() } } }),
    subjects: {
      list: { useQuery: () => ({ data: [], isLoading: false }) },
      create: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      remove: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

describe("formulário de nova disciplina", () => {
  it("abre automaticamente ao chegar pela rota de criação", () => {
    render(<Subjects />);

    expect(screen.getByLabelText("Nome")).toBeTruthy();
    expect(screen.getByPlaceholderText("Ex.: Biologia")).toBeTruthy();
  });
});
