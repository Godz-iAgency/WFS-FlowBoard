// @vitest-environment jsdom

import "./setup";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ElementsPanel } from "@/components/warehouse/ElementsPanel";

describe("ElementsPanel", () => {
  it("uses approved ULD-only labels and exposes the requested equipment choices", () => {
    const onSelectTool = vi.fn();
    render(
      <ElementsPanel
        zones={[]}
        assets={[]}
        selectedTool={null}
        onSelectTool={onSelectTool}
        onClearTool={vi.fn()}
        onDragPreview={vi.fn()}
        onDropTool={vi.fn()}
      />,
    );

    const uldTypes = screen.getByRole("list", { name: "ULD types" });
    for (const type of ["AAX", "LAY", "DQF", "AKE"]) expect(within(uldTypes).getByRole("button", { name: type })).toBeInTheDocument();
    expect(screen.queryByText(/ULD\s*\+\s*Dolly/i)).not.toBeInTheDocument();

    fireEvent.click(within(uldTypes).getByRole("button", { name: "LAY" }));
    expect(onSelectTool).toHaveBeenCalledWith({ category: "ULD", uldType: "LAY" });
    expect(document.querySelector('[data-asset-image="lay"]')).toBeInTheDocument();

    const equipment = screen.getByRole("list", { name: "Equipment" });
    for (const label of ["TUG", "TRAILER", "BOX TRUCK", "767 AIRCRAFT", "737 AIRCRAFT"]) {
      expect(within(equipment).getByText(label)).toBeInTheDocument();
    }

    fireEvent.click(within(equipment).getByRole("button", { name: "767 AIRCRAFT" }));
    expect(onSelectTool).toHaveBeenCalledWith({ category: "AIRCRAFT", aircraftType: "B767" });
    expect(document.querySelector('[data-asset-image="b767"]')).toBeInTheDocument();
  });

  it("keeps a selected element visible until the operator finishes placement mode", () => {
    const onClearTool = vi.fn();
    render(
      <ElementsPanel
        zones={[]}
        assets={[]}
        selectedTool={{ category: "ULD", uldType: "DQF" }}
        onSelectTool={vi.fn()}
        onClearTool={onClearTool}
        onDragPreview={vi.fn()}
        onDropTool={vi.fn()}
      />,
    );

    expect(screen.getByText("PLACEMENT MODE")).toBeInTheDocument();
    expect(screen.getByText("DQF", { selector: ".placement-mode strong" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClearTool).toHaveBeenCalledOnce();
  });
});
