import { apiError, requireApiContext } from "@/lib/server";

export const dynamic = "force-dynamic";

type CalendarRow = { id: string; title: string; due_date: string; organization: string | null };

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function fold(line: string) {
  const chunks: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 73) {
    let end = Math.min(73, rest.length);
    while (end > 1 && new TextEncoder().encode(rest.slice(0, end)).length > 73) end -= 1;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  chunks.push(rest);
  return chunks.join("\r\n ");
}

export async function GET() {
  const context = await requireApiContext();
  if (!context) return apiError("UNAUTHENTICATED", "Sign in to export your calendar.", 401);
  const result = await context.db.prepare(`SELECT id, title, due_date, organization
    FROM action_items WHERE user_id = ? AND review_state = 'confirmed'
    AND due_date IS NOT NULL AND completed_at_ms IS NULL AND archived_at_ms IS NULL
    ORDER BY due_date`).bind(context.user.userId).all<CalendarRow>();
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const events = result.results.flatMap((item) => [
    "BEGIN:VEVENT",
    `UID:${item.id}@actionmail`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${item.due_date.replaceAll("-", "")}`,
    fold(`SUMMARY:${escapeIcs(item.title)}`),
    item.organization ? fold(`DESCRIPTION:${escapeIcs(item.organization)}`) : "DESCRIPTION:Saved by ActionMail",
    "END:VEVENT",
  ]);
  const calendar = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ActionMail//Action Inbox//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "attachment; filename=actionmail-deadlines.ics",
      "Cache-Control": "private, no-store",
    },
  });
}
