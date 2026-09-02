import { z } from "zod";
import { readPublicEnvironment } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { buildWarehouseAssistantContext, buildWarehouseAssistantInput, WAREHOUSE_ASSISTANT_INSTRUCTION } from "@/lib/warehouse/assistant-context";
import { normalizeWarehouseAssistantAnswer } from "@/lib/warehouse/assistant-response";
import { BoardRepositoryError, getBoardSnapshot } from "@/lib/warehouse/repository";

export const runtime = "nodejs";
export const maxDuration = 30;

const AssistantRequest = z.object({
  message: z.string().trim().min(2).max(800),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string().trim().min(1).max(1200),
  })).max(8).default([]),
});

interface GeminiInteractionResponse {
  status?: string;
  output_text?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
}

function extractGeminiText(payload: GeminiInteractionResponse): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const text = payload.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === "text" && typeof content.text === "string")
    .map((content) => content.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || null;
}

const requestWindows = new Map<string, { startedAt: number; count: number }>();
const REQUEST_WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 8;

function retryAfterSeconds(userId: string, now = Date.now()): number | null {
  const current = requestWindows.get(userId);
  if (!current || now - current.startedAt >= REQUEST_WINDOW_MS) {
    requestWindows.set(userId, { startedAt: now, count: 1 });
    return null;
  }
  if (current.count >= REQUESTS_PER_WINDOW) {
    return Math.max(1, Math.ceil((REQUEST_WINDOW_MS - (now - current.startedAt)) / 1000));
  }
  current.count += 1;
  return null;
}

export async function POST(request: Request) {
  let requestData: unknown;
  try {
    requestData = await request.json();
  } catch {
    return Response.json({ error: "Enter a question about the warehouse floor." }, { status: 400 });
  }
  const parsed = AssistantRequest.safeParse(requestData);
  if (!parsed.success) return Response.json({ error: "Enter a question between 2 and 800 characters." }, { status: 400 });

  const environment = readPublicEnvironment();
  if (!environment.data) return Response.json({ error: "The warehouse connection is not configured." }, { status: 503 });

  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError || !claimsData?.claims) {
      return Response.json({ error: "Sign in to use the FlowBoard agent." }, { status: 401 });
    }
    const userId = claimsData.claims.sub;
    if (typeof userId !== "string") return Response.json({ error: "Sign in to use the FlowBoard agent." }, { status: 401 });
    const retryAfter = retryAfterSeconds(userId);
    if (retryAfter) {
      return Response.json(
        { error: `The FlowBoard agent is receiving several questions. Please wait ${retryAfter} seconds and try again.` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    const snapshot = await getBoardSnapshot(supabase, environment.data.warehouseCode);
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return Response.json({ error: "The FlowBoard agent is not configured yet." }, { status: 503 });
    const context = buildWarehouseAssistantContext(snapshot);
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.7-flash";
    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model,
        input: buildWarehouseAssistantInput(parsed.data.message, parsed.data.history, context),
        system_instruction: WAREHOUSE_ASSISTANT_INSTRUCTION,
        store: false,
        generation_config: { thinking_level: "low", max_output_tokens: 500 },
      }),
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    const payload = await geminiResponse.json().catch(() => ({})) as GeminiInteractionResponse;
    if (!geminiResponse.ok) {
      console.error("Gemini warehouse assistant request failed", { status: geminiResponse.status, message: payload.error?.message });
      if (geminiResponse.status === 429) {
        return Response.json({ error: "The free Gemini allowance is temporarily busy. Wait a moment and ask again." }, { status: 429 });
      }
      return Response.json({ error: "The FlowBoard agent could not answer right now. Please try again." }, { status: 502 });
    }
    const answer = extractGeminiText(payload);
    if (!answer) return Response.json({ error: "The FlowBoard agent returned no answer. Please try again." }, { status: 502 });
    return Response.json({ answer: normalizeWarehouseAssistantAnswer(answer), snapshotTime: snapshot.fetchedAt });
  } catch (error) {
    if (error instanceof BoardRepositoryError) {
      const status = error.code?.startsWith("SESSION") ? 401 : error.code?.startsWith("MEMBERSHIP") || error.code === "WAREHOUSE_UNAVAILABLE" ? 403 : 503;
      return Response.json({ error: error.message }, { status });
    }
    console.error("Warehouse assistant failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "The FlowBoard agent could not answer right now. Please try again." }, { status: 502 });
  }
}
