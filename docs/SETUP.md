# The Royals — how the site is wired

Everything outside the code: which services hold what, and what to do when
something breaks. No secrets live here. Where a credential is needed, this says
where to find it, not what it is.

---

## The short version

| thing | where it lives |
|---|---|
| Site hosting | Vercel, project `the-royals` |
| Code | GitHub, `LorenzoBrentReedVarca/The-Royals`, branch `main` |
| Domain registrar | **OnlyDomains** (back-end registrar shows as Instra) |
| DNS | **Vercel** (`ns1`/`ns2.vercel-dns.com`) |
| Guest accounts | Supabase, project ref `atzkuodhsooszjavlqgw`, named "Royals" |
| Outgoing email | Resend, sending as `no-reply@theroyalseminentlounge.com` |

Pushing to `main` deploys to production automatically. There is no build step —
the HTML, CSS and JS are served as written.

---

## Domain

Registered at **OnlyDomains**, not Hostinger. Nameserver changes are made there,
under the domain's DNS Settings → "Delegate to Your Name Servers". The panel has
been known to report success without submitting; the registry is the only source
of truth:

```bash
curl -s "https://rdap.verisign.com/com/v1/domain/theroyalseminentlounge.com"
```

DNS itself is hosted by **Vercel**, so records are managed with the CLI rather
than a control panel:

```bash
vercel dns ls theroyalseminentlounge.com
vercel dns add theroyalseminentlounge.com <name> <type> <value>
```

The site answers on three hostnames. `theroyalseminentlounge.com` is the real
one; `www` and `the-kings-seven.vercel.app` both issue a permanent redirect to
it, configured in `vercel.json`. The Vercel hostname cannot be removed — every
project keeps one for life — so the redirect is the only way to stop it being a
second copy of the site.

---

## Guest accounts (Supabase)

Project ref `atzkuodhsooszjavlqgw`. The publishable key sits in
`assets/js/auth.js` and is safe there — it is meant to be read by the browser
and grants only what Row Level Security allows. The **secret** key
(`sb_secret_…`) must never appear in any file the browser can load.

Configured state:

- **Confirm email**: on. New guests must click a link before they can sign in.
- **Site URL**: `https://theroyalseminentlounge.com` — no wildcard; the field
  rejects them.
- **Redirect URLs**: the domain and `www` with `/**`, plus the old Vercel
  hostname and localhost. The Vercel entry stays because confirmation links
  already sent still point at it.

`supabase/config.toml` mirrors all of this so it is reviewable in git, but
**Supabase does not read it**. Changing that file does nothing until:

```bash
supabase config push --project-ref atzkuodhsooszjavlqgw
```

---

## Email (Resend)

Domain `theroyalseminentlounge.com` is verified with Resend, region Tokyo
(`ap-northeast-1`). DKIM and the SPF records live on the `send` subdomain, which
is why they do not clash with any SPF record on the root domain.

Supabase sends through Resend over SMTP. The settings live at
Authentication → Emails → SMTP Settings:

| field | value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` — the literal word, not an email address |
| Password | a Resend API key |
| Sender email | `no-reply@theroyalseminentlounge.com` |
| Sender name | The Royals |

### The trap that will catch you

**Supabase blanks the password field every time that page is saved.** If you
edit the sender, the port, or anything else and do not re-paste the API key in
the same edit, sending breaks silently. The symptom is `535 "Authentication
credentials invalid"` in the auth logs. This has caused every email outage so
far.

### Reading the actual error

Guessing wastes hours. The real reason is always written down:

- **Supabase → Logs → Auth** — the mail server's own rejection string
- **Resend → Emails** — every send attempt Resend received. Empty means
  Supabase never authenticated.

Errors seen and what they meant:

| error | cause |
|---|---|
| `535 "Invalid username"` | username was an email address, not `resend` |
| `535 "Authentication credentials invalid"` | API key wrong, or blanked on save |
| `550 "You can only send testing emails…"` | sender was `onboarding@resend.dev`, which only ever reaches the account owner |

---

## Email templates

`supabase/templates/confirm-signup.html` and `reset-password.html` are the
source of truth, but **Supabase serves whatever is pasted into its dashboard**.
Editing the file changes nothing until it is pasted into
Authentication → Emails.

Subjects in use:

- Confirm signup — `Confirm your account at The Royals`
- Reset Password — `Reset your password — The Royals`

They are built as email rather than as web pages: tables for layout, colours
inlined on every cell, and a button that is a table cell with a background
rather than a styled link, because Outlook discards padding on anchors. Cinzel
and Cormorant load only where `@import` is honoured (Apple Mail, iOS); Gmail and
Outlook fall back to Georgia and Times New Roman.

Templates not yet branded: Magic Link, Invite user, Reauthentication, Change
Email Address. None of them fire today, because nothing in the site requests
them.

---

## What the account does, and does not, do

Working: sign up, confirm by email, sign in, sign out, forgotten-password
recovery, and the booking form filling itself in for a signed-in guest. The
phone number is not asked for at sign-up, so the first booking is where it is
learned and stored on the user.

**Not built, but promised on the account page:** "Your past and upcoming tables
in one place." Reservations are not stored anywhere — the booking form opens
WhatsApp with the details written into a message, and the host team confirms
each one personally. Showing past tables would need a `reservations` table with
row-level security and a change to how booking works. That is a decision about
how the venue runs, not just a feature.

"First word on event nights and table drops" is also unbuilt; it needs a mailing
list.

---

## Rotating the Resend key

The key in use has **Full access**, which can send as the venue, read the email
logs, and delete the verified domain. A **Sending access** key can only send.

1. Resend → API Keys → Create, permission **Sending access**
2. Paste into Supabase → Authentication → Emails → SMTP Settings → Password
3. Save — changing nothing else
4. Delete the old key in Resend

---

## Checking it works

```bash
# does signup send mail?
curl -s -X POST "https://atzkuodhsooszjavlqgw.supabase.co/auth/v1/signup" \
  -H "apikey: <publishable key from assets/js/auth.js>" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"a-long-enough-password"}'

# where do confirmation links land?
curl -s -o /dev/null -w "%{redirect_url}\n" \
  "https://atzkuodhsooszjavlqgw.supabase.co/auth/v1/verify?token=probe&type=signup" \
  -H "apikey: <publishable key>"
```

A signup creates a real user. Remove test accounts afterwards at
Authentication → Users.
