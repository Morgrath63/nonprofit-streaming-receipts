import assert from "node:assert/strict";
import { chooseDisclosure, parseReceiptRequest } from "./receipt_stream.ts";

const report = parseReceiptRequest({ donorName: "Ari", amount: 25, campaign: "Clinic transport", delivery: "report" });
assert.match(chooseDisclosure(report), /campaign totals only/);
assert.doesNotMatch(chooseDisclosure(report), /Ari/);

assert.throws(() => parseReceiptRequest({ donorName: "Ari", amount: -1, campaign: "Clinic transport", delivery: "receipt" }));
console.log("receipt privacy decision and request boundary passed");
