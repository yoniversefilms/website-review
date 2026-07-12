# Session 5 — New-note notification (Supabase → your inbox/GHL)

_Goal: when a reviewer leaves a note on ANY site, Yonatan gets pinged — no polling,
no "remember to run sync". One-time setup, ~10 minutes, all in the Supabase dashboard._

## How it works

Supabase **Database Webhooks** fire an HTTP POST on every `INSERT` into `public.notes`.
We point that at a **GHL Inbound Webhook** (workflow trigger), and the GHL workflow sends
the actual notification (email and/or push via the GHL mobile app). GHL is used because
you live in it and it gives you email + mobile push + automation for free — no new service.

```
reviewer saves note ──▶ Supabase (INSERT into notes)
                         └─ Database Webhook (fires on INSERT)
                              └─ POST https://services.leadconnectorhq.com/hooks/…  (GHL Inbound Webhook)
                                   └─ GHL workflow → 📧 email to you + 📱 app push
```

## Setup — part A