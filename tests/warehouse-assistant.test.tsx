// @vitest-environment jsdom

import "./setup";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WarehouseAssistant } from "@/components/warehouse/WarehouseAssistant";

afterEach(() => vi.unstubAllGlobals());

describe("WarehouseAssistant", () => {
  it("asks the authenticated floor endpoint and displays its live answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ answer: "AKE is in Lane 2, Slot 3, destined for DFW.", snapshotTime: "2026-09-01T16:00:00.000Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<WarehouseAssistant open onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Ask about the floor"), { target: { value: "Where is AKE?" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask Agent" }));

    await waitFor(() => expect(screen.getByText(/AKE is in Lane 2/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText(/Live data checked/)).toBeInTheDocument();

    rerender(<WarehouseAssistant open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<WarehouseAssistant open onClose={vi.fn()} />);
    expect(screen.getByText(/AKE is in Lane 2/)).toBeInTheDocument();
  });
});
