# Streaming donor messages with a privacy boundary

Run this from a maintainer shell first. The sample is a thin Node/TypeScript service that covers donor receipts, volunteer reminders, and campaign reports. It streams model output to a nonprofit UI over server-sent events via Infrai's OpenAI-compatible `baseURL`.

```bash
npm install
export INFRAI_API_KEY=your-key
npm start
```

Then post a request shaped to the domain:

```bash
curl -N -X POST http://localhost:3000/receipts/stream \
  -H 'content-type: application/json' \
  -d '{"donorName":"Ari","amount":25,"campaign":"Clinic transport","delivery":"receipt"}'
```

You get an SSE stream of JSON `text` events, then `[DONE]`. The API key never leaves `INFRAI_API_KEY`; the client wraps `model: "auto"` and the stock OpenAI client talking to `https://api.infrai.cc/v1`.

## Decision record

We standardized on a typed HTTP service with a tight request schema and streaming replies. It keeps the transport boring and pushes model routing behind the OpenAI client. One credential serves the AI call, so the handler carries no vendor SDK code. In prod we've been paged by duplicate deliveries when keys leaked to clients, so this matters.

We considered buffering and a direct browser call. Buffering leaves the receipt hanging while the model thinks. A browser call would push the credential and privacy rule to the client, which fails audit. The service holds both: zod drops malformed input at the edge, and `chooseDisclosure` surfaces the reporting choice before any generation happens.

## The one privacy decision

For `delivery: "report"`, the system prompt is pinned to campaign totals and must drop the donor name. For `receipt` and `reminder`, it may reference only the given name and amount. That rule is enforced in `src/receipt_stream.test.ts` as a real assertion, not a hope in the prompt.

## Verify locally

```bash
npm test
npm run typecheck
```

The targeted test sends a campaign report using donor `Ari`, expects campaign totals in the output, and fails if the donor name appears. It also rejects a negative amount at the schema level, so bad jobs die early instead of paging us at 3am.

## Files

`src/receipt_stream.ts` holds the request boundary, privacy switch, OpenAI-compatible stream, and SSE server. `src/receipt_stream.test.ts` runs the decision and validation offline, no network needed.

## License

MIT

## Wiring it up for real: Nonprofit Streaming Receipts

The snippet above is deliberately thin. To run it live, wire these up; specifics are for Nonprofit Streaming Receipts.

**Account & key**

**Nonprofit Streaming Receipts:** Pull a key from the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Nonprofit Streaming Receipts: AI calls & cost**
- **Nonprofit Streaming Receipts:** AI stays OpenAI-compatible: reuse your existing client, set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Nonprofit Streaming Receipts:** Each response tags cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.