import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

const createInterviewSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i),
  timeZone: z.string().min(1),
  applicantName: z.string().trim().min(1),
  applicantEmail: z.string().email(),
  jobTitle: z.string().trim().optional(),
});

function parseTwelveHourTime(timeValue: string): { hours: number; minutes: number } {
  const match = timeValue.trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i);
  if (!match) {
    throw new Error("Invalid time format. Expected HH:MM AM/PM.");
  }

  const rawHours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();
  const normalizedHours = rawHours % 12 + (period === "PM" ? 12 : 0);
  return { hours: normalizedHours, minutes };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function buildDateTimeInTimeZone(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const { hours, minutes } = parseTwelveHourTime(time);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(utcGuess);
  const map = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const tzDateUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  const intendedUtc = Date.UTC(year, month - 1, day, hours, minutes, 0);
  const offsetMs = intendedUtc - tzDateUtc;
  return new Date(intendedUtc + offsetMs).toISOString();
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = createInterviewSchema.parse(await request.json());

    const clientId = requiredEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
    const redirectUri = requiredEnv("GOOGLE_REDIRECT_URI");
    const refreshToken = requiredEnv("GOOGLE_REFRESH_TOKEN");

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const startDateTime = buildDateTimeInTimeZone(payload.date, payload.time, payload.timeZone);
    const endDateTime = new Date(new Date(startDateTime).getTime() + 30 * 60 * 1000).toISOString();

    const eventResponse = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        summary: `Interview${payload.jobTitle ? ` - ${payload.jobTitle}` : ""} - ${payload.applicantName}`,
        description: `Interview scheduled via Felix CRM by user ${user.id}.`,
        start: {
          dateTime: startDateTime,
          timeZone: payload.timeZone,
        },
        end: {
          dateTime: endDateTime,
          timeZone: payload.timeZone,
        },
        attendees: [{ email: payload.applicantEmail }],
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const meetLink = eventResponse.data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ?? eventResponse.data.hangoutLink ?? "";
    if (!meetLink) {
      throw new Error("Interview created, but no Meet link was returned.");
    }

    return NextResponse.json({
      meetLink,
      eventId: eventResponse.data.id,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to schedule interview." }, { status: 500 });
  }
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clientId = requiredEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
    const redirectUri = requiredEnv("GOOGLE_REDIRECT_URI");
    const refreshToken = requiredEnv("GOOGLE_REFRESH_TOKEN");

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const eventsResponse = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 25,
      q: "Interview",
    });

    const interviews = (eventsResponse.data.items ?? [])
      .filter((event) => typeof event.summary === "string" && event.summary.toLowerCase().includes("interview"))
      .map((event) => ({
        id: event.id ?? "",
        title: event.summary ?? "Interview",
        start: event.start?.dateTime ?? event.start?.date ?? "",
        meetLink:
          event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ??
          event.hangoutLink ??
          "",
        attendees: (event.attendees ?? [])
          .map((attendee) => attendee.email ?? "")
          .filter((email) => Boolean(email)),
      }));

    return NextResponse.json({ interviews });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load interviews." }, { status: 500 });
  }
}
