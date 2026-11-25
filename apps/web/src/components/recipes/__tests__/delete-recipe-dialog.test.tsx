import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecipeCard } from "@/app/recipes/components/recipe-card";
import type { RecipeSummary } from "@/app/recipes/types/recipes.types";
import { DeleteRecipeDialog } from "../delete-recipe-dialog";

const SAMPLE_RECIPE: RecipeSummary = {
  id: "rec-uuid-1",
  uuid: "rec-uuid-1",
  name: "Sincronizar Facturas",
  description: "Flujo nocturno",
  status: "active",
};

describe("Eliminación de automatizaciones con confirmación", () => {
  it("despliega el diálogo de confirmación antes de eliminar y cancela sin ejecutar onConfirm", () => {
    const onRequestDelete = vi.fn();
    render(<RecipeCard recipe={SAMPLE_RECIPE} onRequestDelete={onRequestDelete} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Eliminar automatización Sincronizar Facturas" })
    );
    expect(onRequestDelete).toHaveBeenCalledWith(SAMPLE_RECIPE);

    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DeleteRecipeDialog
        isOpen={true}
        recipeName={SAMPLE_RECIPE.name}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Sincronizar Facturas");
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ejecuta onConfirm al confirmar la eliminación y muestra error si falla", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteRecipeDialog
        isOpen={true}
        recipeName={SAMPLE_RECIPE.name}
        error="No tienes permisos suficientes"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No tienes permisos suficientes");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar automatización" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
