import assert from "node:assert/strict";
import test from "node:test";

import { extractActionCandidates, findDate, SAMPLE_DOCUMENT } from "../lib/extract-actions.ts";

const reference = new Date("2026-09-11T12:00:00Z");

test("extracts two distinct actions from the built-in notice", () => {
  const actions = extractActionCandidates(SAMPLE_DOCUMENT, reference);
  assert.equal(actions.length, 2);
  assert.deepEqual(
    actions.map(({ dueDate, amountMinor, currency }) => ({ dueDate, amountMinor, currency })),
    [
      { dueDate: "2026-09-24", amountMinor: 18_472, currency: "USD" },
      { dueDate: "2026-10-02", amountMinor: null, currency: null },
    ],
  );
  assert.equal(actions[0].organization, "North Harbor Energy");
});

test("collapses duplicate and conflicting IRS payment mentions", () => {
  const text = `Department of the Treasury
Internal Revenue Service
• Pay the amount due of $1,075.21 by February 20, 2018, to avoid penalty and interest.
Amount due by February 20, 2018
Amount due: $1,075.21
If we don’t hear from you, pay $1,075.21 by February 20, 2017, to avoid penalty and interest.
The minimum penalty is $210 or 100% of the tax required to be shown on the return that you didn’t pay on time.`;
  const actions = extractActionCandidates(text, reference);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].dueDate, "2018-02-20");
  assert.equal(actions[0].amountMinor, 107_521);
  assert.match(actions[0].title, /^Pay the amount due/i);
  assert.equal(actions[0].organization, "Internal Revenue Service");
});

test("understands a CFPB statement label with a two-digit year", () => {
  const text = `XXX Bank Credit Card Account Statement
Minimum Payment Due $53.00
Payment Due Date 4/20/12
Late Payment Warning: If we do not receive your minimum payment by the date above, you may have to pay an $8 late fee.`;
  const actions = extractActionCandidates(text, reference);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].title, "Pay the minimum payment");
  assert.equal(actions[0].dueDate, "2012-04-20");
  assert.equal(actions[0].amountMinor, 5_300);
  assert.equal(actions[0].organization, "XXX Bank Credit Card Account Statement");

  const ambiguousMonthYear = extractActionCandidates(`XXX Bank
Minimum Payment Due $53.00
Payment Due Date 4/2012`, reference);
  assert.equal(ambiguousMonthYear[0].dueDate, null);
});

test("keeps separate payment directives for different bills and due dates", () => {
  const actions = extractActionCandidates(`City Utilities
Please pay the electricity bill by September 20, 2026.
Please pay the water bill by October 5, 2026.`, reference);
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((action) => action.dueDate).sort(), ["2026-09-20", "2026-10-05"]);
});

test("does not turn an automatic withdrawal or returned-payment fee into a user task", () => {
  const text = `Willow Lending
On Nov 12, 2016, we will attempt to withdraw a payment of $80 from your account.
If this payment is not successful, we will add a $10 returned payment fee to your balance.
Contact us about your payment options.`;
  const actions = extractActionCandidates(text, reference);
  assert.equal(actions.length, 1);
  assert.match(actions[0].title, /^Contact us/i);
  assert.equal(actions[0].amountMinor, null);
  assert.equal(actions[0].organization, "Willow Lending");
});

test("ignores financial table labels but keeps a real comparison instruction", () => {
  const text = `Closing Disclosure
Projected Payments
Monthly Payment $1,050.26 $967.91
Due from Borrower at Closing $189,784.74
Total Due to Seller at Closing $180,085.00
Ficus Bank
Compare this document with your Loan Estimate.
Contact Information
Contact Joe S.
Contact NMLS/ License ID`;
  const actions = extractActionCandidates(text, reference);
  assert.equal(actions.length, 1);
  assert.match(actions[0].title, /^Compare this document/i);
  assert.equal(actions[0].amountMinor, null);
  assert.equal(actions[0].organization, "Ficus Bank");
});

test("returns no action for receipts, historical balances, or explanatory Chinese prose", () => {
  const receipt = `CONTOSO
SUBTOTAL $1,699.96
TAX $110.50
TOTAL $1,810.46
CHANGE DUE $0.00`;
  const prose = "网络支付并无本质的区别，因为每一个手机号码和邮件地址背后都会对应着一个账户。";
  assert.deepEqual(extractActionCandidates(receipt, reference), []);
  assert.deepEqual(extractActionCandidates(prose, reference), []);
});

test("extracts Chinese directives, yuan suffixes, OCR Y noise, and ten-thousand units", () => {
  const text = `海棠物业管理有限公司
请于2026年9月30日前支付物业费168元。
另请在2026年10月5日前确认停车信息。`;
  const actions = extractActionCandidates(text, reference);
  assert.equal(actions.length, 2);
  assert.equal(actions[0].dueDate, "2026-09-30");
  assert.equal(actions[0].amountMinor, 16_800);
  assert.equal(actions[0].currency, "CNY");
  assert.equal(actions[0].organization, "海棠物业管理有限公司");
  assert.equal(extractActionCandidates("请支付Y53.0元。", reference)[0].amountMinor, 5_300);
  assert.equal(extractActionCandidates("请支付注册资本50万元。", reference)[0].amountMinor, 50_000_000);
});

test("rejects invalid dates and maps two-digit years with a stable pivot", () => {
  assert.equal(findDate("Due 4/20/12", reference), "2012-04-20");
  assert.equal(findDate("Due 4/20/75", reference), "1975-04-20");
  assert.equal(findDate("Due 2/30/2026", reference), null);
});
