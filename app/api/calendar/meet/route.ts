import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type DemoInsertRow = {
  lead_id?: string;
  lead_name: string;
  selected_date: string;
  selected_time: string;
  meet_link: string;
  rep_id: string;
  rep_email?: string | null;
};

const createMeetEventSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i),
  timeZone: z.string().min(1),
  leadId: z.string().uuid().optional(),
  leadName: z.string().trim().optional(),
  leadEmail: z.string().email().optional(),
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
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

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

async function saveDemoRecord(row: DemoInsertRow) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase database configuration is missing.");
  }

  const response = await fetch(new URL("/rest/v1/demos", supabaseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify([row]),
  });

  if (!response.ok) {
    const rawMessage = await response.text();
    const parsedMessage = (() => {
      try {
        const parsed = JSON.parse(rawMessage) as { code?: string; message?: string };
        return parsed;
      } catch {
        return null;
      }
    })();

    if (parsedMessage?.code === "PGRST205") {
      return {
        persisted: false as const,
        warning: "Google Meet created, but scheduled demo persistence is unavailable because the Supabase demos table has not been created yet.",
      };
    }

    throw new Error(parsedMessage?.message || rawMessage || "Failed to save scheduled demo.");
  }

  return { persisted: true as const };
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = createMeetEventSchema.parse(await request.json());

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
      sendUpdates: "none",
      requestBody: {
        summary: `Sales Demo${payload.leadName ? ` - ${payload.leadName}` : ""}`,
        description: `Scheduled via Felix CRM by user ${user.id}.`,
        start: {
          dateTime: startDateTime,
          timeZone: payload.timeZone,
        },
        end: {
          dateTime: endDateTime,
          timeZone: payload.timeZone,
        },
        attendees: payload.leadEmail ? [{ email: payload.leadEmail }] : undefined,
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    const meetEntryPoint = eventResponse.data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;
    const meetLink = meetEntryPoint ?? eventResponse.data.hangoutLink ?? "";

    if (!meetLink) {
      throw new Error("Google Calendar event was created, but no Meet link was returned.");
    }

    const saveResult = await saveDemoRecord({
      lead_id: payload.leadId,
      lead_name: payload.leadName?.trim() || "Unknown Lead",
      selected_date: payload.date,
      selected_time: payload.time,
      meet_link: meetLink,
      rep_id: user.id,
      rep_email: user.email ?? null,
    });

    return NextResponse.json(
      {
        meetLink,
        eventId: eventResponse.data.id,
        ...(saveResult.persisted ? {} : { warning: saveResult.warning }),
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to create Google Calendar event.";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
