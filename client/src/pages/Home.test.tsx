import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newSubjectPath } from "@/lib/studyRoutes";
import Home from "./Home";

const navigate = vi.fn();

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Estudante" } }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/", navigate] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    dashboard: {
      get: {
        useQuery: () => ({
          isLoading: false,
          data: {
            profile: { displayName: null },
            progress: { totalXp: 0, currentLevel: 1, currentStreak: 0 },
            dueCards: [],
            masteryScore: 0,
            subjects: [],
            materials: [],
          },
        }),
      },
    },
  },
}));

describe("atalhos da visão geral", () => {
  beforeEach(() => navigate.mockReset());

  it("leva o usuário sem disciplinas ao formulário de criação", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getAllByRole("button", { name: "Criar disciplina" })[0]);

    expect(navigate).toHaveBeenCalledWith(newSubjectPath);
  });
});
