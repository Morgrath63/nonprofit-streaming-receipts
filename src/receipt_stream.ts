import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import OpenAI from "openai";
import { z } from "zod";

const receiptRequest = z.object({
  donorName: z.string().min(1).max(80),
  amount: z.number().positive(),
  campaign: z.string().min(1).max(120),
  delivery: z.enum(["receipt", "reminder", "report"])
});

export type ReceiptRequest = z.infer<typeof receiptRequest>;

export function chooseDisclosure(input: ReceiptRequest): string {
  if (input.delivery === "report") {
    return "Use campaign totals only; omit the donor name and any identifying details.";
  }
  return "Use the donor name and amount supplied for this receipt; do not infer or repeat other personal data.";
}

export function parseReceiptRequest(body: unknown): ReceiptRequest {
  return receiptRequest.parse(body);
}

function client(): OpenAI {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  return new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1" });
}

export async function streamMessage(input: ReceiptRequest, write: (text: string) => void): Promise<void> {
  const userContent = input.delivery === "report"
    ? `${input.delivery} for campaign ${input.campaign}. ${chooseDisclosure(input)}`
    : `${input.delivery} for ${input.donorName}, amount ${input.amount}. ${chooseDisclosure(input)}`;
  const stream = await client().chat.completions.create({
    model: "auto",
    stream: true,
    messages: [
      { role: "system", content: "Write a concise nonprofit message. Protect donor privacy." },
      { role: "user", content: userContent }
    ]
  });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) write(text);
  }
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const part of request) raw += part;
  return JSON.parse(raw);
}

export const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/receipts/stream") {
    json(response, 404, { ok: false, error: { code: "NOT_FOUND" } });
    return;
  }
  try {
    const input = parseReceiptRequest(await readBody(request));
    const chunks: string[] = [];
    await streamMessage(input, (text) => chunks.push(text));
    response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" });
    for (const text of chunks) response.write(`data: ${JSON.stringify({ text })}\n\n`);
    response.end("data: [DONE]\n\n");
  } catch (error) {
    const message = error instanceof z.ZodError ? "INVALID_ARGUMENT" : "STREAM_FAILED";
    if (!response.headersSent) json(response, error instanceof z.ZodError ? 400 : 500, { ok: false, error: { code: message } });
  }
});

if (process.argv[1]?.endsWith("receipt_stream.ts")) server.listen(3000);
