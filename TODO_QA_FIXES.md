# TODO — QA fixes (session 2026-05-07/08)

Незакрытые шаги после фиксов багов из `פוליבט_-_מערכת_הימורים_prompts (2).zip`.

## ВАЖНО: cron на supabase edge function сломан (401)

`pg_cron` (sync-hot-set-markets, backfill-open-bets) дёргает edge function но получает 401 уже сутки. Причина: `vault.decrypted_secrets.service_role_key` хранит NEW Supabase API формат `sb_secret_…` (41 chars), а edge function сравнивает с auto-инжектированным `Deno.env.SUPABASE_SERVICE_ROLE_KEY` (legacy JWT, eyJhbG…). Mismatch → 401. Это значит, что фикс trending-RPC в edge function НИКОГДА не выполнялся.

**Решение принято**: trending-логика перенесена в `services/market-tracker/` (Heroku worker, имеет прямой service-role доступ). Edge function fallback остаётся, но неактивен пока cron не починят.

### Деплой market-tracker

```bash
cd services/market-tracker
git push heroku main
heroku logs --app polybet-market-tracker --tail | grep syncTrendingRankings
```

Через ~5 мин (первый tick) проверить:

```sql
SELECT
  COUNT(*) FILTER (WHERE trending_rank IS NOT NULL) AS ranked,
  COUNT(*) FILTER (WHERE volume_24hr IS NOT NULL) AS with_v24
FROM events;
```

Ожидание: `ranked` ≈ 50-100.

### Опциональный фикс edge function cron auth

Если хочется починить edge function cron (для других mode='hot_set' задач — markets sync через market-tracker уже работает, но edge function мог делать что-то ещё):

```sql
-- Вариант A: подмена на legacy JWT (Settings → API → service_role secret legacy)
UPDATE vault.secrets SET secret = '<legacy JWT eyJ…>' WHERE name='service_role_key';

-- Вариант B: random CRON_SECRET (требует Dashboard → Edge Functions → Manage Secrets → CRON_SECRET=<value>)
UPDATE vault.secrets SET secret = '<random>' WHERE name='service_role_key';
```

## Verify (через ~5 мин после деплоя market-tracker)

Trending rankings должны заполниться:

```sql
SELECT
  COUNT(*) FILTER (WHERE trending_rank IS NOT NULL) AS ranked,
  COUNT(*) FILTER (WHERE volume_24hr IS NOT NULL) AS with_v24
FROM events;
```

Ожидание: `ranked` ≈ 50–100, `with_v24` ≈ 50–100.

Если оба остались 0 после следующего cron — проверить логи edge function `sync-polymarket-markets` на ошибку RPC `set_events_trending_rankings`. Возможные причины: дрейф конвенции `events.slug` относительно `/events?featured=true&order=volume24hr`.

## Push

```bash
git log origin/main..HEAD --oneline
git push origin main
```

3 коммита впереди:
- `abf5eb9` fix(sync): preserve real Polymarket prices instead of substituting 0.5
- `f891ecd` fix(feed): My Bets tab shows only open bets, matching In-Play drawer
- `38e2930` fix(saved): cascade-delete child market favourites when removing event

## Frontend deploy

После push — задеплоить фронт (vercel/прод-окружение), чтобы фиксы Bugs 2–5 дошли до пользователей.

## Manual smoke test после деплоя

1. **Bug 1** — открыть resolved-рынок, убедиться, что проигрывающий исход показывает 0%, а не 50%.
2. **Bug 2/3** — поставить ставку, дождаться settle, проверить:
   - ставка ушла из My Bets;
   - баланс вернулся (если выиграно);
   - тост-уведомление с результатом.
3. **Bug 4** — сохранить Event, открыть Saved tab, убедиться, что показывается одна EventCard, не россыпь markets.
4. **Bug 5** — сохранить Event с парой market-favourites внутри, удалить Event-favorite, обновить страницу — внутренние markets тоже должны исчезнуть.
5. **Bug 6** — открыть Trending tab, сравнить топ событий с `https://polymarket.com/markets/all?_s=trending`.

## Удалить этот файл после полной верификации
