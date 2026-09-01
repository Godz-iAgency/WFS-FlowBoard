// @vitest-environment jsdom

import "./setup";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/LoginForm";

const searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/app/auth/actions", () => ({
  signIn: vi.fn(async () => ({ error: "" })),
}));

describe("LoginForm", () => {
  beforeEach(() => searchParams.delete("error"));

  it("keeps the password concealed by default and lets the user reveal it", () => {
    render(<LoginForm />);

    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("surfaces an authentication callback failure", () => {
    searchParams.set("error", "auth_callback");
    render(<LoginForm />);
    expect(screen.getByRole("alert")).toHaveTextContent("The sign-in link could not be completed");
  });
});
