# Production launch (M22)

Everything in the repo is ready; these steps need Joe's own accounts, so Claude can't do them. Work top to bottom: each step lists what it unblocks. Nothing here touches FundedNext.

Vercel crons are in UTC: `/api/cron/import` runs at 23:00 UTC (02:00 Beirut, about 1h40 after the 00:20 Beirut producer run) and `/api/cron/candles` at 04:00 UTC.

## 1. Supabase cloud project

1. Create a project at supabase.com (free tier, region close to Beirut, e.g. Frankfurt `eu-central-1`). Save the database password.
2. Note the **project ref** (Settings › General), the **API URL**, the **anon key** and the **service role key** (Settings › API).
3. Connection strings (Settings › Database › Connection string):
   - `DATABASE_URL`: the **transaction pooler** URI (port 6543) — what Vercel functions use.
   - `DATABASE_URL_DIRECT`: the **direct** URI (port 5432) — scripts and migrations.
4. Auth › URL configuration:
   - Site URL: `https://<your-app>.vercel.app`
   - Redirect URLs: `https://<your-app>.vercel.app/auth/callback`
5. Auth › Providers › Email: keep magic link on; turn **sign-ups off** is not needed (the database refuses every email but yours), but it's tidier.

## 2. Migrations

Either from your machine (needs the Supabase CLI via `pnpm install`):

```sh
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push
```

or add three GitHub secrets (repo › Settings › Secrets › Actions) and run **Migrate production database** from the Actions tab: `SUPABASE_ACCESS_TOKEN` (supabase.com › Account › Access tokens), `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`. After that, every merge that adds a migration pushes it automatically.

Then set the one email allowed in (SQL editor):

```sql
update private.app_config set allowed_email = 'joehaddad94@gmail.com';
```

The `journal-screenshots` bucket is created by a migration (private, 5 MB, images only).

## 3. Google service account (Drive inbox)

1. console.cloud.google.com › new project › enable **Google Drive API**.
2. IAM › Service accounts › create one (no roles) › Keys › add key › JSON. Download it.
3. In Google Drive, share the `trading-tracker/` folder with the service account's email as **Editor**.
4. The whole JSON file (one line) becomes `GOOGLE_SERVICE_ACCOUNT_JSON`.

## 4. Sentry

Create a Next.js project at sentry.io. `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are its DSN; `SENTRY_AUTH_TOKEN` is an org auth token (for source maps at build time).

## 5. Vercel

1. Import `joehaddad94/trading-hub` at vercel.com (Hobby). Root directory: `apps/web`. Framework: Next.js. Install command is picked up from pnpm.
2. Environment variables (Production and Preview):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | API URL (step 1) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key |
| `DATABASE_URL` | pooler URI (6543) |
| `DATABASE_URL_DIRECT` | direct URI (5432) |
| `ALLOWED_EMAIL` | `joehaddad94@gmail.com` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | step 3 |
| `DRIVE_INBOX_FOLDER_ID` | `105BHu-A_DxDA1W6otpt_gYBsbt3TN8DB` |
| `DRIVE_PROCESSED_FOLDER_ID` | `1wxxAa-bP08g6TDBmPHCRPn4JM9qR1orc` |
| `CRON_SECRET` | any long random string (`openssl rand -hex 32`) |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | step 4 |
| `DUKASCOPY_S3_ACCESS_KEY_ID`, `DUKASCOPY_S3_SECRET_ACCESS_KEY` | read-only AWS key for Dukascopy's bucket (step 6.3) |

3. Deploy. The free address is `https://<project>.vercel.app` (Q2). Put it back into Supabase Auth (step 1.4) if it changed.
4. Crons come from `apps/web/vercel.json` (daily only, Hobby).

Order on later merges: the migration workflow and Vercel's deploy start together. Migrations are additive (applied ones are never edited), so an app deploy that lands a minute early only lacks a column it doesn't use yet.

## 6. First data

1. Sign in at `/login` with the magic link.
2. Settings › Imports › **Sync now** imports whatever is in the Drive inbox (or wait for the 23:00 UTC cron).
3. Candles: since Oct 2026 Dukascopy's free datafeed refuses bulk downloads, so candles come from its **Requester Pays S3 bucket** (`cfg-public-proper-wallaby`, eu-west-1). Create an AWS IAM user with only `s3:GetObject` + `s3:ListBucket` on that bucket, put its key in Vercel as `DUKASCOPY_S3_ACCESS_KEY_ID` / `DUKASCOPY_S3_SECRET_ACCESS_KEY` and in `~/.aws/credentials` (`[default]`) on your machine; AWS bills the downloads (cents). Once, from the repo:

```sh
DATABASE_URL_DIRECT='<direct URI>' pnpm db:backfill-candles
```

The 04:00 UTC cron keeps them current after that.

## Done when

- The hub's sync card shows today's import and no amber banner.
- Tracker › Overview shows the 3 accounts and 99+ trades.
- Backtest Lab › Sessions shows candle coverage for US30 and NAS100 without the "Market data needs attention" banner.
