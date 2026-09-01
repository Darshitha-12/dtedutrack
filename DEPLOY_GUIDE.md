# BioPulse Platform — Full Deploy Guide

මේ guide එකෙන් ඔයාගේ BioPulse app එක (Next.js + PostgreSQL + Prisma + Auth.js)
online deploy කරන හැටි පියවරෙන් පියවර කියලා දෙනවා.

> **වැදගත්:** GitHub Pages / GitHub එකෙන්ම මේ app එක run කරන්න බෑ.
> GitHub යනු කෝඩ් ගබඩාවක් (repository) මිස host server එකක් නොවේ.
> Next.js API routes + PostgreSQL database තියෙන app එකකට **host platform එකක්** (Railway / Render)
> සහ **cloud database** එකක් අනිවාර්යයි.

---

## පියවර 1 — GitHub Repo එකක් හදන්න

1. [github.com](https://github.com) වල login වෙන්න.
2. **New repository** → name: `biopulse-platform` → **Create repository**.
   - `README`, `.gitignore`, `license` checkboxes **එපා** (හිස් repo එකක්).

3. PowerShell (project folder එකේ) — **ඔයාගේම terminal එකේ** මේවා run කරන්න:

```powershell
git init
git config user.name "Darshitha-12"
git config user.email "darshitha-12@users.noreply.github.com"
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/Darshitha-12/biopulse-platform.git
git push -u origin main
```

> Push එකට GitHub username + password/token අහයි.
> **Token හදන්න:** GitHub → Settings → Developer settings → **Personal access tokens** →
> *Tokens (classic)* → *Generate new token* → `repo` scope → copy.
> පස්සේ password වෙනුවට ඒ token එක අලවන්න.

**ආරක්ෂාව:** `.env` සහ `.env.local` files `gitignore` වලයි — ඒ නිසා
secret keys **push වෙන්නේ නෑ.** (ඒවා deploy වලදී env variables විදියට දානවා — පහළ බලන්න.)

---

## පියවර 2 — Cloud PostgreSQL DB එකක් හදන්න (Free — Neon)

මේ app එකට database එකක් ඕන (users, study timers, chat, channels...).
Host කරනකොට `localhost` DB එක වැඩ කරන්නේ නෑ — **cloud PostgreSQL** එකක් ඕන.

1. [neon.tech](https://neon.tech) වල signup වෙන්න (GitHub account එකෙන්ම පුළුවන්).
2. **New Project** → name: `biopulse` → region එකක් (Singapore/Asia closer) → Create.
3. Connection string එක copy කරගන්න (ඒකට `?sslmode=require` තියෙනවා):
   ```
   postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/biopulse?sslmode=require
   ```
   මේක **පස්සේ env variable** එකක් විදියට දාන්නම්.

> Neon ක්‍රියාත්මක default settings වල project Database Schema auto-migrate කරන්නේ නෑ.
> tables හදන්න පියවර 4-6 බලන්න.

---

## පියවර 3 — Host Platform එකක් තෝරන්න

| Platform | Free tier | යෝග්‍යතාව |
|---|---|---|
| **Railway** | Trial credit ~$5 | හොඳම, Next.js friendly |
| **Render** | Free web service (opsle para) | හොඳයි, ටිකක් අමාරු cron |
| Fly.io | Free credit | Advanced |

මෙතන **Railway** විදියම පෙන්නනවා.

---

## පියවර 4 — Railway Deploy

1. [railway.app](https://railway.app) signup වෙන්න → **New Project** →
   **Deploy from GitHub repo** → `Darshitha-12/biopulse-platform` තෝරන්න.
2. Project එක auto-detect කරලා build/start deploy වෙනවා.
   (Build: `npm run build`, Start: `npm run start` — පහළ verify කරන්න.)

### Env Variables දාන්න (project → Variables)

පහළ **names** විතරයි — ඔයාගේ අගයන් ඔයාම දාන්න:

| Name | අගය |
|---|---|
| `DATABASE_URL` | Neon connection string (පියවර 2) |
| `AUTH_SECRET` | ඔයාගේ existing secret |
| `NEXTAUTH_URL` | `https://<your-app>.up.railway.app` (deploy පස්සේ domain එක) |
| `NEXTAUTH_SECRET` | ඔයාගේ existing secret (AUTH_SECRET එකම) |
| `OPENAI_API_KEY` | ඔයාගේ key |
| `AI_MODEL` | `gpt-4o-mini` (තියෙන එක) |
| `GEMINI_API_KEY` | තියෙනවා නම් |
| `GEMINI_MODEL` | `gemini-3.6-flash` |
| `TELEGRAM_BOT_TOKEN` | තියෙනවා නම් |
| `TELEGRAM_CHAT_ID` | තියෙනවා නම් |
| `NTFY_TOPIC` | තියෙනවා නම් |

> AI model/temperature ආදී optional values `.env.local` එකේ තිබ්බනම් ඒවත් දාන්න
> (AI_MAX_TOKENS, AI_TEMPERATURE, AI_MAX_CONTEXT, AI_RATE_LIMIT, AI_MAX_HISTORY, AI_MAX_MESSAGE_LENGTH).

### Build/Start commands verify කරන්න
Railway settings → `npm run build` build command, `npm run start` start command
ඒ වගේම **install command:** `npm install` (postinstall එකෙන් Prisma client auto-generate වෙනවා — මම ඒක දැනටමත් package.json හි දාලා තියෙනවා).

---

## පියවර 5 — Database tables හදන්න (prisma db push)

පළමු deploy **පස්සේ** Railway console එකේ (Deployments → Run Command) run කරන්න:

```bash
npx prisma db push
```

මෙයින් PostgreSQL එකේ සියලුම tables (users, telegram_groups, group_channels,
chat_messages, study_sessions...) හැදෙනවා. **බැරි නම් app එක crash වෙනවා.**

> Neon console එකෙනුත් database එකක් හරහා schema view කරන්න පුළුවන්.

---

## පියවර 6 — Seed (optional — demo data)

production වල demo data ඕන නම් (demo users, groups, channels) Railway console එකේ:

```bash
npx prisma db seed
```

> ⚠️ **පරිස්සම්:** `seed.ts` හි `deleteMany` තියෙනවා — production එකේ දැනටමත්
> real data ආවා නම් ඒක wipe වෙනවා. Demo data වලට විතරක් use කරන්න.

---

## පියවර 7 — Domain + verify

1. Railway app එක domain එකක් automatically (`.up.railway.app`) දෙනවා.
2. `NEXTAUTH_URL` එක ඒ domain එකට update කරලා redeploy/environment apply කරන්න.
3. Browser එකෙන් open කරලා:
   - Home එක load වෙනවාද
   - Login/Register වැඩ කරනවාද
   - `/telegram` page එකෙන් groups/channels පෙනෙනවාද
   - Chat/join වැඩ කරනවාද

---

## පොදු ගැටළු

**Build fail — Prisma client:** `postinstall: prisma generate` දැනටමත් තියේවි.
නැත්නම් Railway settings `npm install` install command බව ensure කරන්න.

**"DATABASE_URL not found / P1001"** → `DATABASE_URL` env variable එක Railway variables වල
හරියට දාලා confirm කරන්න (Neon `?sslmode=require`).

**Auth login error / secret** → `AUTH_SECRET` + `NEXTAUTH_SECRET` හරියට දාන්න.
(`AUTH_SECRET` = `uVOn9NW3YqpGk+azPVCXaNwWfyC2bCOjSyBUCH879Ss=`)

**Port error:** Next.js Railway එකේ `process.env.PORT` එක use කරනවා.
`next start` ඒක auto detect කරනවා (default 3000). සාමාන්‍යයෙන් කිසිම ප්‍රශ්නයක් නෑ.

---

## අවසාන check-list

- [ ] GitHub repo එක + push
- [ ] Neon PostgreSQL (+ connection string)
- [ ] Railway account + GitHub repo link
- [ ] Railway env variables (DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL, keys)
- [ ] `npx prisma db push` (tables)
- [ ] (optional) `npx prisma db seed`
- [ ] Domain verify
