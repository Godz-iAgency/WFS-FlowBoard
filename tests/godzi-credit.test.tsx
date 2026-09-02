// @vitest-environment jsdom

import "./setup";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GodziCredit } from "@/components/GodziCredit";

afterEach(cleanup);

describe("GodziCredit", () => {
  it.each(["login", "header"] as const)("shows the GODZ-i build credit in the %s placement", (variant) => {
    render(<GodziCredit variant={variant} />);

    expect(screen.getByLabelText("Built by GODZ-i")).toHaveClass(`godzi-credit--${variant}`);
    expect(screen.getByText("Built by")).toBeInTheDocument();
    expect(screen.getByText("GODZ-i")).toBeInTheDocument();
  });
});
