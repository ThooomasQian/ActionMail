import type { DraftAction } from "./actionmail-types";

type Intent =
  | "pay"
  | "renew"
  | "respond"
  | "submit"
  | "complete"
  | "schedule"
  | "call"
  | "sign"
  | "upload"
  | "return"
  | "attend"
  | "confirm"
  | "contact"
  | "compare"
  | "review"
  | "dispute"
  | "write"
  | "send"
  | "visit"
  | "cancel";

type Segment = { text: string; lineIndex: number };
type Amount = { amountMinor: number; currency: string };
type Candidate = {
  intent: Intent;
  kind: "directive" | "payment-label";
  title: string;
  dueDate: string | null;
  amount: Amount | null;
  sourceQuote: string;
  lineIndex: number;
  score: number;
};

const ENGLISH_VERBS =
  "pay|renew|respond|reply|submit|complete|schedule|book|call|sign|upload|return|attend|confirm|contact|compare|review|dispute|write|send|visit|cancel";
const CHINESE_VERBS =
  "支付|缴费|付款|续订|续费|回复|答复|提交|完成|预约|致电|拨打|签字|签署|上传|归还|参加|确认|联系|比较|核对|检查|审阅|复核|申诉|争议|填写|寄回|发送|访问|取消";
const PAYMENT_LABEL = /\b(?:minimum payment due|amount due(?:\s+by)?|balance due(?:\s+by)?)\b|(?:应付|应缴|待缴)(?:金额|款项|费用)?/i;
const PAYMENT_DATE_LABEL = /\bpayment due date\b|\bamount due by\b|(?:缴费|支付|付款)?截止(?:日期|日)?/i;
const NON_ACTION_PAYMENT_LABEL = /\b(?:past due amount|change due|due from|due to|failure-to-pay|monthly payment|scheduled payment|payment history|payments received|previous payments?|other credits?)\b/i;
const NEGATIVE_DIRECTIVE = /\b(?:no (?:further )?action (?:is )?required|do not need to|don['’]t need to|already (?:paid|completed|submitted))\b|(?:无需|无须|不需要|已经(?:支付|缴费|付款|完成|提交))/i;
const OPTIONAL_CONTEXT = /\b(?:if you|when you|you can|for more information|to see (?:all|whether)|payment options?)\b|(?:如果您|如需|可选择|可以)/i;
const PAYMENT_SUBSTEP = /\b(?:on your payment|check or money order|schedule payments?|payment options?)\b/i;
const PAYMENT_DETAIL = /\b(?:social security number|tax year|form number|payment stub|check|money order|remittance)\b/i;
const CONTACT_INSTRUCTION_DETAIL = /\b(?:us|me|your|at|about|regarding|for|to)\b|(?:请联系|联系电话)/i;
const NON_ACTION_SUPPORT = /\b(?:billing inquiries?|correspondence to|customer service|lost or stolen|contact information)\b/i;
const NON_ACTION_HEADING = /^(?:contact information|confirm receipt|payment options?|billing summary|projected payments)$/i;
const GENERIC_ORGANIZATION = /\b(?:page|account|statement|notice|form|model|sample|summary|payment information|projected payments|loan terms|closing disclosure|transactions?|important changes?|payday|vehicle title|disclosures?|clauses?|estimated taxes|mortgage insurance|contact information|customer service|homeowner(?:['’]?s|\s+s) association dues?)\b/i;
const ORGANIZATION_HINT = /\b(?:bank|credit union|department|service|services|agency|authority|university|college|school|hospital|clinic|energy|water|utility|utilities|lending|association|company|corporation|corp\.?|inc\.?|llc|foundation|council|bureau|administration|revenue)\b|(?:公司|银行|学校|大学|医院|诊所|物业|管理处|管理局|政府|税务局|中心|协会|航空|铁路|能源|水务)/i;
const ORGANIZATION_SENTENCE = /\b(?:you|your|we|they|must|need|should|will|may|can|could|require|pay|include|change)\b/i;

const intentMap: Record<string, Intent> = {
  pay: "pay", payment: "pay", renew: "renew", respond: "respond", reply: "respond",
  submit: "submit", complete: "complete", schedule: "schedule", book: "schedule",
  call: "call", sign: "sign", upload: "upload", return: "return", attend: "attend",
  confirm: "confirm", contact: "contact", compare: "compare", review: "review",
  dispute: "dispute", write: "write", send: "send", visit: "visit", cancel: "cancel",
  支付: "pay", 缴费: "pay", 付款: "pay", 续订: "renew", 续费: "renew",
  回复: "respond", 答复: "respond", 提交: "submit", 完成: "complete",
  预约: "schedule", 致电: "call", 拨打: "call", 签字: "sign", 签署: "sign",
  上传: "upload", 归还: "return", 参加: "attend", 确认: "confirm",
  联系: "contact", 比较: "compare", 核对: "compare", 检查: "review", 审阅: "review",
  复核: "review", 申诉: "dispute", 争议: "dispute", 填写: "complete",
  寄回: "return", 发送: "send", 访问: "visit", 取消: "cancel",
};

function validIso(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

const monthNames: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function findDate(text: string, reference = new Date()): string | null {
  const chinese = text.match(/\b((?:19|20)\d{2})年(\d{1,2})月(\d{1,2})[日号]?/);
  if (chinese) return validIso(Number(chinese[1]), Number(chinese[2]), Number(chinese[3]));

  const iso = text.match(/\b((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const named = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+((?:19|20)\d{2}))?\b/i);
  if (named) {
    const month = monthNames[named[1].toLowerCase()];
    let year = named[3] ? Number(named[3]) : reference.getFullYear();
    const candidate = validIso(year, month, Number(named[2]));
    if (!named[3] && candidate && candidate < reference.toISOString().slice(0, 10)) year += 1;
    return validIso(year, month, Number(named[2]));
  }

  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|(?:19|20)\d{2})\b/);
  if (!us) return null;
  const parsedYear = Number(us[3]);
  const year = us[3].length === 2 ? (parsedYear >= 70 ? 1900 + parsedYear : 2000 + parsedYear) : parsedYear;
  return validIso(year, Number(us[1]), Number(us[2]));
}

function findAmount(text: string): Amount | null {
  const symbol = text.match(/([$€£¥￥])\s?([\d,]+(?:\.\d{1,2})?)/);
  if (symbol) {
    const raw = Number(symbol[2].replaceAll(",", ""));
    if (!Number.isFinite(raw) || raw < 0) return null;
    const currency = ({ $: "USD", "€": "EUR", "£": "GBP", "¥": "CNY", "￥": "CNY" }[symbol[1]] ?? "USD");
    return { amountMinor: Math.round(raw * 100), currency };
  }

  const code = text.match(/\b(USD|EUR|GBP|CAD|AUD|CNY|RMB)\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (code) {
    const raw = Number(code[2].replaceAll(",", ""));
    if (!Number.isFinite(raw) || raw < 0) return null;
    const currency = /^(?:CNY|RMB)$/i.test(code[1]) ? "CNY" : code[1].toUpperCase();
    return { amountMinor: Math.round(raw * 100), currency };
  }

  const chinese = text.match(/(?:人民币\s*)?(?:[¥￥Y]\s*)?([\d,]+(?:\.\d{1,2})?)\s*(万)?\s*(?:元|块(?:钱)?)/i);
  if (!chinese) return null;
  const raw = Number(chinese[1].replaceAll(",", "")) * (chinese[2] ? 10_000 : 1);
  return Number.isFinite(raw) && raw >= 0 ? { amountMinor: Math.round(raw * 100), currency: "CNY" } : null;
}

function intentForVerb(verb: string): Intent | null {
  return intentMap[verb.toLowerCase()] ?? intentMap[verb] ?? null;
}

function classifyDirective(sentence: string): { intent: Intent; strength: number } | null {
  if (NEGATIVE_DIRECTIVE.test(sentence)) return null;

  const leading = sentence.match(new RegExp(`^(?:[-•*▪‣–—|\\s]+)?(?:action required[:\\s-]*)?(?:please\\s+|kindly\\s+)?(${ENGLISH_VERBS})\\b`, "i"));
  if (leading) {
    const visibleStart = sentence.replace(/^[-•*▪‣–—|\s]+/, "");
    const hasDirectiveMarker = /^(?:action required|please|kindly)\b/i.test(visibleStart);
    if (!hasDirectiveMarker && /^[a-z]/.test(visibleStart)) return null;
    return { intent: intentForVerb(leading[1]) ?? "review", strength: /please|action required/i.test(sentence) ? 9 : 8 };
  }

  const modal = sentence.match(new RegExp(`\\b(?:you|customer|borrower|recipient|member|tenant|student)\\s+(?:must|need(?:s)?\\s+to|should|are\\s+required\\s+to)\\s+(${ENGLISH_VERBS})\\b`, "i"));
  if (modal) return { intent: intentForVerb(modal[1]) ?? "review", strength: 9 };

  const requested = sentence.match(new RegExp(`\\b(?:please|kindly|we\\s+(?:need|ask)\\s+you\\s+to)\\s+(${ENGLISH_VERBS})\\b`, "i"));
  if (requested) return { intent: intentForVerb(requested[1]) ?? "review", strength: 9 };

  const purpose = sentence.match(new RegExp(`^to\\s+[^,]{1,100},\\s*(?:please\\s+)?(${ENGLISH_VERBS})\\b`, "i"));
  if (purpose) return { intent: intentForVerb(purpose[1]) ?? "review", strength: 8 };

  const chineseLeading = sentence.match(new RegExp(`^(?:[-•*▪‣–—|\\s]+)?(?:请|务必|尽快)?(${CHINESE_VERBS})`));
  if (chineseLeading) return { intent: intentForVerb(chineseLeading[1]) ?? "review", strength: sentence.includes("请") ? 9 : 8 };

  const chineseRequested = sentence.match(new RegExp(`(?:请|务必|需要|须|应当|应于|应在|请于|请在|请尽快)[^。！？]{0,100}?(${CHINESE_VERBS})`));
  if (chineseRequested) return { intent: intentForVerb(chineseRequested[1]) ?? "review", strength: 9 };

  return null;
}

function cleanTitle(sentence: string): string {
  const compact = sentence.replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
  const withoutPrefix = compact
    .replace(/^(?:[-•*▪‣–—]\s*)+/, "")
    .replace(/^(?:action required[:\s-]*|please\s+|kindly\s+|you (?:must|should|need to|are required to)\s+)/i, "");
  const title = withoutPrefix.split(/(?<=[.!?])\s|;\s/)[0].replace(/[.!?]+$/, "").trim();
  const clipped = title.slice(0, 160);
  return clipped ? clipped[0].toUpperCase() + clipped.slice(1) : "Review this document";
}

function cleanOrganization(line: string): string {
  return line.replace(/[^\p{L}\p{N}&.,'() -]/gu, " ").replace(/\s+/g, " ").trim();
}

function organizationFrom(lines: string[], nearLine: number): string | null {
  let best: { value: string; score: number } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const value = cleanOrganization(lines[index]);
    if (value.length < 3 || value.length > 100) continue;
    if (ORGANIZATION_SENTENCE.test(value)) continue;
    if (/\b(?:yes|no)\b/i.test(value)) continue;
    if (/\d{3,}/.test(value) || findAmount(value) || findDate(value)) continue;
    const hasHint = ORGANIZATION_HINT.test(value);
    if (GENERIC_ORGANIZATION.test(value) && !/\bbank\b/i.test(value)) continue;
    const titleCase = /^[A-Z][\p{L}&.'-]*(?:\s+(?:of|the|and|&|[A-Z][\p{L}&.'-]*)){0,7}$/u.test(value);
    if (!hasHint && !titleCase) continue;
    const distance = Math.abs(index - nearLine);
    const score = (hasHint ? 10 : 3) + (index <= nearLine ? 2 : 0) + Math.max(0, 5 - distance / 8);
    if (!best || score > best.score) best = { value, score };
  }
  return best?.value ?? null;
}

function expandSegment(segment: Segment, lines: string[]): string {
  const text = segment.text.trim();
  if (/[.!?。！？]$/.test(text) || text.length > 140 || segment.lineIndex + 1 >= lines.length) return text;
  const next = lines[segment.lineIndex + 1].trim();
  if (!next || next.length > 180 || /^(?:page\s+\d+|[$€£¥￥]|\d{5,})\b/i.test(next)) return text;
  return `${text} ${next}`.replace(/\s+/g, " ").slice(0, 900);
}

function focusDirectiveText(text: string): string {
  const marker = text.match(new RegExp(`\\b(?:you\\s+(?:must|should|need(?:s)?\\s+to|are\\s+required\\s+to)|please|kindly|we\\s+(?:need|ask)\\s+you\\s+to)\\s+(?:${ENGLISH_VERBS})\\b`, "i"));
  if (marker?.index !== undefined && marker.index > 0) return text.slice(marker.index).trim();
  const chineseMarker = text.match(new RegExp(`(?:请|务必|需要|须|应当|应于|应在|请于|请在|请尽快)[^。！？]{0,100}?(?:${CHINESE_VERBS})`));
  if (chineseMarker?.index !== undefined && chineseMarker.index > 0) return text.slice(chineseMarker.index).trim();
  return text.trim();
}

function inContactInformationTable(lines: string[], index: number): boolean {
  for (let cursor = index; cursor >= Math.max(0, index - 40); cursor -= 1) {
    if (/^contact information$/i.test(lines[cursor].trim())) return true;
    if (/^page\s+\d+/i.test(lines[cursor].trim())) break;
  }
  return false;
}

function contextWindow(lines: string[], index: number): string[] {
  return lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3));
}

function findPaymentDateInText(text: string): string | null {
  return findDate(text);
}

function paymentDate(lines: string[], index: number): string | null {
  const own = findPaymentDateInText(lines[index]);
  if (own) return own;
  for (const line of contextWindow(lines, index)) {
    if (PAYMENT_DATE_LABEL.test(line)) {
      const date = findPaymentDateInText(line);
      if (date) return date;
    }
  }
  return null;
}

function paymentAmount(lines: string[], index: number): Amount | null {
  const own = findAmount(lines[index]);
  if (own) return own;
  for (const line of contextWindow(lines, index)) {
    if ((PAYMENT_LABEL.test(line) && !PAYMENT_DATE_LABEL.test(line)) || /^\s*(?:[$€£¥￥]|(?:USD|EUR|GBP|CAD|AUD|CNY|RMB)\b)/i.test(line)) {
      const amount = findAmount(line);
      if (amount) return amount;
    }
  }
  return null;
}

function sourceWithFields(lines: string[], index: number, dueDate: string | null, amount: Amount | null, baseText = lines[index]): string {
  const selected = [baseText];
  for (const line of contextWindow(lines, index)) {
    if (line === lines[index] || baseText.includes(line)) continue;
    if ((dueDate && findPaymentDateInText(line) === dueDate) || (amount && findAmount(line)?.amountMinor === amount.amountMinor)) selected.push(line);
  }
  return [...new Set(selected)].join(" ").replace(/\s+/g, " ").slice(0, 500);
}

function paymentTitle(line: string): string {
  if (/minimum payment due/i.test(line)) return "Pay the minimum payment";
  if (/(?:应缴|待缴)/.test(line)) return "支付应缴费用";
  return "Pay the amount due";
}

function paymentTopic(title: string): string {
  return title
    .toLowerCase()
    .replace(/[$€£¥￥]\s?[\d,.]+/g, " ")
    .replace(/\b\d{1,4}(?:[-/.]\d{1,2}){1,2}\b/g, " ")
    .replace(/\b(?:please|pay|payment|the|an?|amount|balance|minimum|due|of|by|before|on|to|avoid|penalty|interest)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function samePaymentEvent(item: Candidate, candidate: Candidate): boolean {
  const bothHaveAmounts = Boolean(item.amount && candidate.amount);
  const bothHaveDates = Boolean(item.dueDate && candidate.dueDate);
  if (bothHaveAmounts && item.amount?.amountMinor !== candidate.amount?.amountMinor) return false;
  if (bothHaveDates && item.dueDate !== candidate.dueDate) return false;

  const sameAmount = bothHaveAmounts;
  const sameDate = bothHaveDates;
  const adjacent = Math.abs(item.lineIndex - candidate.lineIndex) <= 2;
  const firstTopic = paymentTopic(item.title);
  const secondTopic = paymentTopic(candidate.title);
  const sameTopic = Boolean(firstTopic && secondTopic && firstTopic === secondTopic);

  if (sameAmount && (sameDate || (!bothHaveDates && (adjacent || sameTopic)))) return true;
  if (sameDate && (!bothHaveAmounts && (adjacent || sameTopic))) return true;

  return adjacent
    && item.kind === "payment-label"
    && candidate.kind === "payment-label"
    && (!item.amount || !candidate.amount)
    && (!item.dueDate || !candidate.dueDate);
}

function mergeCandidates(candidates: Candidate[]): Candidate[] {
  const merged: Candidate[] = [];
  for (const candidate of candidates.sort((a, b) => a.lineIndex - b.lineIndex || b.score - a.score)) {
    const duplicate = merged.find((item) => {
      if (item.intent === "pay" && candidate.intent === "pay") {
        return samePaymentEvent(item, candidate);
      }
      return item.intent === candidate.intent && cleanTitle(item.title).toLowerCase() === cleanTitle(candidate.title).toLowerCase();
    });
    if (!duplicate) {
      merged.push({ ...candidate });
      continue;
    }
    let enriched = false;
    if (!duplicate.dueDate && candidate.dueDate) {
      duplicate.dueDate = candidate.dueDate;
      enriched = true;
    }
    if (!duplicate.amount && candidate.amount) {
      duplicate.amount = candidate.amount;
      enriched = true;
    }
    if (candidate.kind === "directive" && duplicate.kind === "payment-label") {
      duplicate.kind = "directive";
      duplicate.title = candidate.title;
      duplicate.lineIndex = Math.min(duplicate.lineIndex, candidate.lineIndex);
      duplicate.sourceQuote = candidate.sourceQuote;
      enriched = false;
    }
    duplicate.score = Math.max(duplicate.score, candidate.score);
    if (enriched && duplicate.sourceQuote !== candidate.sourceQuote && duplicate.sourceQuote.length < 350) {
      duplicate.sourceQuote = `${duplicate.sourceQuote} ${candidate.sourceQuote}`.slice(0, 500);
    }
  }
  return merged;
}

export function extractActionCandidates(input: string, reference = new Date()): DraftAction[] {
  const normalized = input.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  if (!normalized) return [];
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const segments: Segment[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const pieces = lines[lineIndex]
      .split(/(?<=[.!?。！？])\s+/)
      .map((piece) => piece.trim())
      .filter((piece) => piece.length >= 4 && piece.length <= 900);
    for (const text of pieces) segments.push({ text, lineIndex });
  }

  const candidates: Candidate[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!PAYMENT_LABEL.test(line) || NON_ACTION_PAYMENT_LABEL.test(line)) continue;
    const dueDate = paymentDate(lines, lineIndex);
    const amount = paymentAmount(lines, lineIndex);
    candidates.push({
      intent: "pay",
      kind: "payment-label",
      title: paymentTitle(line),
      dueDate,
      amount,
      sourceQuote: sourceWithFields(lines, lineIndex, dueDate, amount),
      lineIndex,
      score: 6 + (dueDate ? 2 : 0) + (amount ? 2 : 0),
    });
  }

  for (const segment of segments) {
    if (NON_ACTION_HEADING.test(segment.text.trim())) continue;
    const expandedText = expandSegment(segment, lines);
    const directive = classifyDirective(expandedText);
    if (!directive) continue;
    const focusedText = focusDirectiveText(expandedText);
    let dueDate = findDate(focusedText, reference);
    let amount = directive.intent === "pay" ? findAmount(focusedText) : null;
    if (directive.intent === "pay") {
      dueDate ??= paymentDate(lines, segment.lineIndex);
      amount ??= paymentAmount(lines, segment.lineIndex);
    }
    if (!dueDate && !amount) {
      if (/^\s*if you\b/i.test(focusedText)) continue;
      if (NON_ACTION_SUPPORT.test(focusedText)) continue;
      const previousContext = lines.slice(Math.max(0, segment.lineIndex - 2), segment.lineIndex).join("\n");
      if (OPTIONAL_CONTEXT.test(previousContext)) continue;
      if (directive.intent === "contact" && !CONTACT_INSTRUCTION_DETAIL.test(focusedText)) continue;
      if (directive.intent === "contact" && inContactInformationTable(lines, segment.lineIndex)) continue;
      if (["write", "schedule", "send", "visit", "return"].includes(directive.intent) && PAYMENT_SUBSTEP.test(focusedText)) continue;
      if (/^[A-Za-z]/.test(focusedText) && focusedText.replace(/[^A-Za-z]+/g, " ").trim().length < 10) continue;
    }
    const fieldSource = sourceWithFields(lines, segment.lineIndex, dueDate, amount, focusedText);
    candidates.push({
      intent: directive.intent,
      kind: "directive",
      title: cleanTitle(focusedText),
      dueDate,
      amount,
      sourceQuote: fieldSource,
      lineIndex: segment.lineIndex,
      score: directive.strength + (dueDate ? 2 : 0) + (amount ? 2 : 0),
    });
  }

  const merged = mergeCandidates(candidates);
  const hasPaymentAction = merged.some((candidate) => candidate.intent === "pay");
  return merged
    .filter((candidate) => !(hasPaymentAction && candidate.intent !== "pay" && PAYMENT_DETAIL.test(candidate.title)))
    .sort((a, b) => b.score - a.score || a.lineIndex - b.lineIndex)
    .slice(0, 6)
    .map((candidate, rank) => ({
      clientKey: `candidate-${candidate.lineIndex}-${rank}`,
      title: candidate.title,
      organization: organizationFrom(lines, candidate.lineIndex),
      dueDate: candidate.dueDate,
      amountMinor: candidate.amount?.amountMinor ?? null,
      currency: candidate.amount?.currency ?? null,
      confidence: Math.min(96, 52 + candidate.score * 4),
      sourceQuote: candidate.sourceQuote,
    }));
}

export const SAMPLE_DOCUMENT = `North Harbor Energy
Account notice — September 2026

Your current balance is $184.72. Please pay the outstanding balance by September 24, 2026 to avoid a late fee.

To keep paperless billing active, confirm your email address before October 2, 2026. If you have already completed these steps, no further action is required.`;
