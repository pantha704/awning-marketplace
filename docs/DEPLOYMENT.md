# Live demo deployment

Status: **live and verified** on 27 Nov 2026.

| | |
| --- | --- |
| App (frontend + API) | https://awning-marketplace.onrender.com |
| Backend health | https://awning-marketplace.onrender.com/api/health |
| Repository | https://github.com/pantha704/awning-marketplace |
| Host | Render, free web service, Singapore region |
| Database | MongoDB Atlas M0 (free), AWS Mumbai (`ap-south-1`) |

## Scope of this deployment

This is an **MVP demo of the working product**, not a production launch. Payments, object storage,
Redis and Elasticsearch are deliberately left on the app's built-in fallbacks, which the project
already supports for exactly this purpose. No paid accounts are required anywhere.

| Concern | Production target (SETUP_GUIDE Part B) | What this demo uses | Effect |
| --- | --- | --- | --- |
| Database | MongoDB Atlas (B2) | **Atlas M0**, database `awning` | Full persistence |
| Payments | Stripe Connect / Razorpay Route (B6) | `PAYMENT_PROVIDER=test` | Built-in test card gateway; no money moves |
| Images | AWS S3 / R2 (B5) | `STORAGE_DRIVER=local`, demo art committed to git | Catalogue art survives restarts; shop-owner uploads do not |
| Carts / cache | Redis (B3) | `CACHE_DRIVER=memory` | Carts reset when the API restarts |
| Search | Elasticsearch (B4) | `SEARCH_DRIVER=mongo` | Filters, sorting and facets work; typo tolerance does not |
| Frontend | Vercel (B9) | Served by the API from `client/dist` | One URL instead of two |

## Environment variables set on Render

```
NODE_ENV=production
JWT_SECRET=<48 random bytes, generated>
MONGO_URI=mongodb+srv://awning:****@awning.mlayrs4.mongodb.net/awning?retryWrites=true&w=majority
AUTO_SEED=true
MONGO_MEMORY_FALLBACK=false
STORAGE_DRIVER=local
CACHE_DRIVER=memory
SEARCH_DRIVER=mongo
PAYMENT_PROVIDER=test
CURRENCY=usd
PLATFORM_COMMISSION_PERCENT=10
PUBLIC_URL=https://awning-marketplace.onrender.com
CLIENT_URL=https://awning-marketplace.onrender.com
```

Build command `npm install --include=dev && npm run build`, start command `npm run start`.
The build needs dev dependencies because Vite compiles the frontend.

The first boot seeded the demo marketplace automatically (7 shops, 59 products, 173 orders,
135 reviews, 3 coupons).

## Verified against the live URL

| Function | Evidence |
| --- | --- |
| Health | `{"ok":true,"env":"production","database":"mongodb","cache":"memory","search":"mongo","storage":"local","payments":"test","currency":"usd"}` |
| Images | all 57 distinct image keys return 200; rendered search page loads 24/24 with 0 broken |
| Storefront | Home renders 8 departments, 6 approved shops, 58 products |
| Search | `?q=mug` returns 2 items via the MongoDB driver; facets `categories, brands, price`; `sort=price-asc` returns 900, 1200, 1200 |
| Suggest | `?q=ke` returns Stoneware Mug and Enamel Stovetop Kettle |
| Auth | All three demo accounts sign in and return a JWT |
| Multi-shop cart | One cart with Kettle & Crumb (1800 + 499 shipping) and Circuit Lane (8900, free shipping) = 11199 |
| Coupon | `WELCOME10` on 10700 subtotal → 1070 discount → total 10129 |
| Checkout | Order created with **one parcel per shop** |
| Test payment | Card `4242 4242 4242 4242` → `paid` |
| Vendor lifecycle | `packed` → `shipped` (BlueDart BD123456789) → `delivered`, parcel by parcel |
| Customer view | Kettle & Crumb parcel `delivered`, Circuit Lane still `placed` |
| Reviews | 5-star review accepted after delivery; product reviews went 7 → 8 |
| Admin | Analytics totals, pending shop `Saltwater Supply Co.` approved (6 → 7 approved shops), coupon `DEMO15` created |
| Invoice | `GET /api/orders/:id/invoice` → `application/pdf`, 2866 bytes, `%PDF-` |

## Browser journey suite against the live URL

`python3 scripts/e2e_smoke.py https://awning-marketplace.onrender.com photo.png` runs the project's
nine browser journeys. On the live demo **seven pass**. The two that do not:

- **Typo-tolerant search.** The journey searches a misspelling and expects results. That is an
  Elasticsearch-only capability; this deployment uses `SEARCH_DRIVER=mongo` (Part B4 skipped), so the
  journey cannot pass here by design. Everything else about search — filters, facets, six sort orders,
  suggestions — works.
- **Network flakiness in the runner.** Runs from this machine also hit `ERR_NETWORK_CHANGED` and
  `chrome-error://chromewebdata/` when the local connection flapped mid-run, which cascades into
  several journeys failing at `page.goto`. The same journeys passed on a stable run.

The suite also assumes freshly seeded data and an unapproved shop waiting in admin, so run
`npm run seed:reset` (pointed at Atlas) before it, otherwise the admin-approval journey has nothing
to approve.

## Known limits of the free tier

- The free instance **spins down after 15 minutes of inactivity**; the next request takes ~50 seconds.
  Open the URL a minute before showing it.
- Images uploaded by a shop owner at runtime land on the instance disk and are lost when the instance
  restarts. The **demo catalogue art does not have this problem**: it is generated ahead of time by
  `node scripts/export-seed-art.mjs` and committed under `server/storage/media/seed`, which is the
  folder the `local` driver reads. Adding an R2 or S3 bucket (Part B5) removes the limitation for
  uploads too; the app needs no code change, only `AWS_ENDPOINT_URL_S3` plus bucket credentials.
- Carts are in memory, so they empty when the instance restarts.

## Incident: catalogue images returned 404 (fixed 28 Nov 2026)

The first deployment wrote the generated product art to the instance disk during seeding. Render's
free filesystem is ephemeral, so when the instance recycled, the database (Atlas) still held the
image keys while the files were gone, and every `/media/seed/*` request returned 404.

Fix: the art is deterministic, so it is now generated ahead of time and tracked in git.

```bash
node scripts/export-seed-art.mjs          # writes server/storage/media/seed/*.svg
```

`.gitignore` ignores `server/storage/*` except `server/storage/media/seed/`, so the pictures ship with
the repo and the `local` driver serves them from the deployed checkout. Verified afterwards: all 57
distinct image keys the catalogue references return 200, and the rendered pages show 0 broken images.

## Going further, later

To reach the full Part B11 checklist: add Atlas (done), Upstash or Render Key Value for `REDIS_URL`,
an R2 or S3 bucket for images, Elastic Cloud or Bonsai for typo-tolerant search, Stripe test keys for
split payments, and move the frontend to Vercel with `VITE_API_URL`. No application code changes are
required for any of those.
