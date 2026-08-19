import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Materials from "./Materials";

const mutation = { isPending: false, mutate: vi.fn() };

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ materials: { list: { invalidate: vi.fn() } }, dashboard: { get: { invalidate: vi.fn() } } }),
    subjects: { list: { useQuery: () => ({ data: [] }) } },
    materials: {
      list: { useQuery: () => ({ data: [], isLoading: false }) },
      process: { useMutation: () => mutation },
      upload: { useMutation: () => mutation },
      createText: { useMutation: () => mutation },
      importYoutube: { useMutation: () => mutation },
    },
  },
}));

describe("fallback de YouTube na tela de materiais", () => {
  it("apresenta um atalho explícito para o envio de MP4 autorizado", async () => {
    const user = userEvent.setup();
    render(<Materials />);

    await user.click(screen.getByRole("button", { name: "YouTube" }));
    expect(screen.getByRole("button", { name: "Enviar MP4" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Enviar MP4" }));
    expect(screen.getByText(/vídeos MP4 de até 15 MB/i)).toBeTruthy();
  });

  it("abre no modo YouTube pela rota direta", () => {
    window.history.pushState({}, "", "/materiais?fonte=youtube");
    render(<Materials />);

    expect(screen.getByPlaceholderText("Cole a URL do YouTube com legendas públicas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar MP4" })).toBeTruthy();
  });
});
