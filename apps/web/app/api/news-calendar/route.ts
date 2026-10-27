import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const safe = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(/\r?\n/g, "\\n")
  .replaceAll(",", "\\,").replaceAll(";", "\\;");
const stamp = (value: Date) => value.toISOString().replaceAll(/[-:]/g, "").replaceAll(/\.\d{3}/g, "");

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const start = params.get("start") ?? "";
  const title = params.get("title") ?? "";
  const source = params.get("source") ?? "";
  const when = new Date(start);
  let sourceUrl: URL;
  try { sourceUrl = new URL(source); } catch { return new NextResponse(null, { status: 400 }); }
  if (!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(start)
      || Number.isNaN(when.getTime()) || !title.trim() || title.length > 180
      || source.length > 2000 || sourceUrl.protocol !== "https:") {
    return new NextResponse(null, { status: 400 });
  }
  const uid = createHash("sha256").update(`${source}|${start}`).digest("hex").slice(0, 32);
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Anatole//News Reader//FR",
    "BEGIN:VEVENT", `UID:${uid}@anatole`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(when)}`, `SUMMARY:${safe(title)}`, `DESCRIPTION:${safe(source)}`,
    "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  return new NextResponse(body, { headers: {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": "attachment; filename=anatole-conference.ics",
    "Cache-Control": "no-store",
  } });
}
