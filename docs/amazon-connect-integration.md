# Amazon Connect to FelixCRM

This repo already embeds the Amazon Connect CCP. This document adds the missing backend path for:

- discovering the S3 buckets where Amazon Connect stores recordings and Contact Lens artifacts,
- streaming real-time Contact Lens voice segments into Kinesis,
- and delivering post-call events into FelixCRM through a hardened webhook.

## What this repo now includes

- `app/api/webhooks/contact-lens/route.ts`
  - Secure ingestion endpoint for Amazon Connect / Contact Lens payloads.
  - Normalizes raw EventBridge, S3, Lambda, or already-normalized Contact Lens payloads.
  - Validates Amazon S3 pre-signed recording URLs and extracts expiration metadata.
  - Stores normalized call analytics in Supabase `call_analytics`.
  - Optionally writes a lead note summary into the CRM.
- `supabase/call_analytics.sql`
  - Schema for the `call_analytics` table used by the lead workspace.
- `scripts/aws/setup-connect-integration.ps1`
  - AWS CLI setup script for discovery plus stream/rule creation.
- `scripts/aws/contact-lens-post-call-processor.mjs`
  - Lambda handler skeleton that forwards EventBridge events into FelixCRM.

## Required FelixCRM env vars

Add these to your deployment environment:

```bash
CONTACT_LENS_WEBHOOK_SECRET=
AWS_REGION=us-east-1
```

`CONTACT_LENS_WEBHOOK_SECRET` protects `/api/webhooks/contact-lens`.

## Supabase

Run:

```sql
\i supabase/call_analytics.sql
```

or paste the SQL from `supabase/call_analytics.sql` into the Supabase SQL editor.

## S3 discovery

Amazon Connect does not push large recordings/transcripts directly into FelixCRM. It writes them into S3. Use AWS CLI to discover the current storage associations already linked to your Connect instance:

```bash
aws connect list-instance-storage-configs \
  --region us-east-1 \
  --instance-id <connect-instance-id> \
  --resource-type CALL_RECORDINGS
```

Also inspect:

```bash
CONTACT_TRACE_RECORDS
REAL_TIME_CONTACT_ANALYSIS_VOICE_SEGMENTS
REAL_TIME_CONTACT_ANALYSIS_CHAT_SEGMENTS
CHAT_TRANSCRIPTS
SCREEN_RECORDINGS
```

## Real-time streaming

For live Contact Lens voice segments, the official Amazon Connect CLI path is:

```bash
aws kinesis create-stream \
  --region us-east-1 \
  --stream-name felixcrm-contact-lens-stream \
  --stream-mode-details StreamMode=ON_DEMAND

aws connect associate-instance-storage-config \
  --region us-east-1 \
  --instance-id <connect-instance-id> \
  --resource-type REAL_TIME_CONTACT_ANALYSIS_VOICE_SEGMENTS \
  --storage-config StorageType=KINESIS_STREAM,KinesisStreamConfig={StreamArn=<kinesis-stream-arn>}
```

That feeds real-time Contact Lens voice analysis into Kinesis. FelixCRM can consume that stream separately for live dashboards.

## EventBridge trigger

Important: AWS docs do not expose an official direct event literally named `Contact Lens Post Call Analysis Ready`.

What AWS does document:

- `Contact Lens Post Call Rules Matched`
- `Contact Lens After Call Work Rules Matched`
- `Contact Lens Analysis State Change`

This repo’s setup script uses those official EventBridge detail types as the practical post-call trigger set. If you need a stricter “artifact is definitely written to S3” trigger, S3 object-created notifications are more deterministic than EventBridge alone.

## Lambda to CRM flow

1. EventBridge catches the Amazon Connect event.
2. Lambda forwards a normalized payload into FelixCRM `/api/webhooks/contact-lens`.
3. FelixCRM stores the normalized call intelligence in `call_analytics`.
4. The lead workspace reads `call_analytics` from Supabase and shows the latest call intel.

## Webhook contract

FelixCRM accepts:

```json
{
  "lead_id": "uuid",
  "contact_id": "amazon-connect-contact-id",
  "customer_phone": "7876245686",
  "duration_seconds": 321,
  "overall_sentiment": "POSITIVE",
  "recording_url": "https://...",
  "recording_url_expires_at": "2026-03-25T00:25:33.000Z",
  "recording_s3_uri": "s3://bucket/key.wav",
  "analysis_s3_uri": "s3://bucket/key.json",
  "transcript_text": "Customer said ...",
  "transcript_json": {},
  "ai_summary": "Short summary",
  "agent_talk_time_pct": 48,
  "customer_talk_time_pct": 52,
  "interruptions": 3,
  "event_source": "Contact Lens Post Call Rules Matched",
  "source_event_time": "2026-03-18T00:25:33.000Z"
}
```

The webhook also accepts raw AWS-shaped payloads and resolves:

- `contactArn` to `contact_id`
- S3 object event `bucket/key` to `recording_s3_uri`
- SigV4 S3 recording URLs to `recording_url_expires_at`
- customer phone values from common Amazon Connect `CustomerEndpoint` paths

## Example CRM record

Given a sync event like:

```json
{
  "contact_id": "a09b64c1-2e6c-4b2e-86c7-3ea2d97d1a03",
  "customer_phone": "7876245686",
  "recording_url": "https://amazon-connect-f93893c0453d.s3.us-west-2.amazonaws.com/connect/felix-outbound/CallRecordings/2026/03/17/a09b64c1-2e6c-4b2e-86c7-3ea2d97d1a03_20260317T23%3A54_UTC.wav?...",
  "recording_s3_uri": "s3://amazon-connect-f93893c0453d/connect/felix-outbound/CallRecordings/2026/03/17/a09b64c1-2e6c-4b2e-86c7-3ea2d97d1a03_20260317T23:54_UTC.wav",
  "event_source": "contact-lens-sync"
}
```

FelixCRM stores a record shaped like:

```json
{
  "lead_id": "<resolved lead uuid>",
  "contact_id": "a09b64c1-2e6c-4b2e-86c7-3ea2d97d1a03",
  "customer_phone": "7876245686",
  "recording_url": "https://amazon-connect-f93893c0453d.s3.us-west-2.amazonaws.com/connect/felix-outbound/CallRecordings/2026/03/17/a09b64c1-2e6c-4b2e-86c7-3ea2d97d1a03_20260317T23%3A54_UTC.wav?...",
  "recording_url_expires_at": "2026-03-25T00:25:33.000Z",
  "recording_s3_uri": "s3://amazon-connect-f93893c0453d/connect/felix-outbound/CallRecordings/2026/03/17/a09b64c1-2e6c-4b2e-86c7-3ea2d97d1a03_20260317T23:54_UTC.wav",
  "event_source": "contact-lens-sync",
  "raw_payload": {}
}
```

For the example URL above, FelixCRM treats the format as valid because it has:

- host `amazon-connect-f93893c0453d.s3.us-west-2.amazonaws.com`
- SigV4 query params including `X-Amz-Algorithm=AWS4-HMAC-SHA256`
- `X-Amz-Date=20260318T002533Z`
- `X-Amz-Expires=604800`

That yields an expected expiration time of `2026-03-25T00:25:33Z`.

Authenticate with either:

```bash
Authorization: Bearer <CONTACT_LENS_WEBHOOK_SECRET>
```

or:

```bash
x-felix-webhook-secret: <CONTACT_LENS_WEBHOOK_SECRET>
```
