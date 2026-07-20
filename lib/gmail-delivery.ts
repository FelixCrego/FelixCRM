import { google } from "googleapis";

function required(name: string) { const v = process.env[name]?.trim(); if (!v) throw new Error(`Missing ${name}`); return v; }
function b64url(value: string) { return Buffer.from(value).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,''); }
export async function sendGmail(input: { to: string; subject: string; text: string; replyTo?: string | null }) {
  const oauth = new google.auth.OAuth2(required('GOOGLE_CLIENT_ID'), required('GOOGLE_CLIENT_SECRET'), required('GOOGLE_REDIRECT_URI'));
  oauth.setCredentials({ refresh_token: required('GOOGLE_REFRESH_TOKEN') });
  const headers = [`To: ${input.to}`, `Subject: ${input.subject.replace(/[\r\n]/g,' ')}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"'];
  if (input.replyTo) headers.splice(1,0,`Reply-To: ${input.replyTo}`);
  const raw = b64url([...headers,'',input.text].join('\r\n'));
  const result = await google.gmail({version:'v1',auth:oauth}).users.messages.send({userId:'me',requestBody:{raw}});
  return { messageId: result.data.id ?? null, threadId: result.data.threadId ?? null };
}
