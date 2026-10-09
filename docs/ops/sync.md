# Sync operations — FundedNext → Google Drive

How trade, account and news data reaches the app. The producer runs in **claude.ai**, not in this repo.

## Producer: claude.ai scheduled task

| | |
|---|---|
| Name | FundedNext daily export to Drive |
| Task id | `trig_01VPNqahQjEXMkKz4wDABmRR` |
| Schedule | **00:20 Asia/Beirut, Tuesday–Saturday** (`CRON_TZ=Asia/Beirut 20 0 * * 2-6`). Each run covers the previous trading day (Mon–Fri). No runs Sun/Mon — Joe doesn't trade weekends. |
| Approvals | Runs automatically (no approval prompts) |
| Notifications | Push + email after every run |
| Connectors used | FundedNext (read only), Google Drive (`create_file`) |
| Created | 9 Oct 2026 |

Change the schedule or prompt from the scheduled task's settings in claude.ai, or ask Claude in chat.

## Google Drive

| Folder | Id |
|---|---|
| `trading-tracker/` | `1W2jqIfxGUC3GmrpVRqLRTgIMtEP2Fp-K` |
| `trading-tracker/inbox/` (producer writes here) | `105BHu-A_DxDA1W6otpt_gYBsbt3TN8DB` |
| `trading-tracker/processed/` (app moves imported files here) | `1wxxAa-bP08g6TDBmPHCRPn4JM9qR1orc` |

Owner: Joe's Google account. The app's Google service account must be given **Editor** access to `trading-tracker/` (read inbox, move files to processed).

Env: `DRIVE_INBOX_FOLDER_ID=105BHu-A_DxDA1W6otpt_gYBsbt3TN8DB`, `DRIVE_PROCESSED_FOLDER_ID=1wxxAa-bP08g6TDBmPHCRPn4JM9qR1orc`.

## File contract

`schema_version: 1` — tracker spec §4. File name `fundednext_<YYYY-MM-DD>_<HHmm>Z.json` (UTC). One file per run, always (heartbeat), with `status` `ok | partial | error`.

## Safety checks

1. **Producer checksum:** for single-cycle accounts, Σ(profit + swap + commission) must equal balance − starting balance. Mismatch → refetch once → otherwise `status: partial` with an error. The producer never edits numbers to force a match.
2. **Upload check:** returned Drive `fileSize` must equal the local byte length.
3. **Importer checksum:** the app recomputes (1) and rejects mismatching accounts.
4. **Staleness:** banner if a file is missing 26 h after an expected run (Tue–Sat). The Sat → Tue gap is normal.

## Phase 0 test (9 Oct 2026)

- File `fundednext_2026-10-09_2100Z.json` uploaded manually to the inbox (copy in `docs/specs/fixtures/`).
- 3 accounts, 99 trades: 7002880 Funded −1,344.71 (34 trades) · 3028722 P2 +1,251.91 (12) · 3027687 P1 +2,038.51 (53). All checksums matched.
- Upload size matched (31,431 bytes).

## Known data quirks (details: tracker spec §4)

- Trade time strings are server time **UTC+03:00**; unix trade fields are 3 h off. Re-check after the late-Oct/Nov clock change.
- News timestamps are true UTC.
- Past-cycle trades lack SL/TP/RR fields.
- `get_parent_account` is about payout wallets, not phases — P1 → P2 → Funded links are inferred.
- Next week's news appears only around the weekend.

## If the sync breaks

1. Check the claude.ai notification / scheduled task run log.
2. Check the inbox in Drive for an `error` or `partial` file and read its `errors[]`.
3. If FundedNext's connector disconnected: reconnect it in claude.ai, then run the task manually ("Run now").
4. Manual fallback: Settings › Imports › upload a JSON file in the contract format.
