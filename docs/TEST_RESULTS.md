# Test results

Measured on 20 November 2026 in a small Linux container: **1 vCPU** (shared by the API, MongoDB 8, Redis 8 and
the search node), 3 GB RAM, Node.js 22. The search node was **OpenSearch 2.19**, because Elasticsearch itself could
not be downloaded in that environment; the app talks to both through the same REST API, and the request format is
also checked by a unit test. A laptop will be faster on every number below.

## 1. API, unit and search tests: 63 of 63 pass

```bash
npm test                                             # 57 tests
TEST_ELASTICSEARCH_URL=http://localhost:9200 npm test   # 63 tests, including a real search node
```

```
 Test Files  3 passed (3)
      Tests  63 passed (63)
   Duration  6.28s
```

The suite boots the real Express app against a real MongoDB. Nothing is mocked. It also passes with real Redis
(`TEST_CACHE_DRIVER=redis npm test`).

| Area | Tests | What is proven |
| --- | --- | --- |
| Auth and roles | 5 | Duplicate email, weak password and self-made admins rejected; password hash never returned; each role kept out of the others' areas; address book |
| Vendor onboarding and products | 6 | Shop application held for approval; pending shops can draft but not sell; product validation; admin approval takes effect on the owner's next request (cached session dropped); image upload, reorder and deletion from storage; one shop cannot touch another's product |
| Search, filters, sorting | 6 | Words in title, brand or description; category, brand, price and stock filters; price and newest sorts; facets that ignore their own filter; suggestions; pagination; drafts hidden; owners can preview |
| Cart in Redis | 4 | Guest carts per browser; server-side pricing; quantity capped at stock; sold-out products refused; guest cart merged at sign-in; shipping per shop with free-shipping threshold |
| Coupons | 3 | Unknown, expired and duplicate codes; shop coupon applies only to that shop; marketplace coupon capped and spread in proportion to the cent |
| Checkout and split payment | 8 | Address and empty-cart checks; stock reserved at order creation; declined and expired cards; another user's order refused; paying twice changes nothing; **commission and shop share correct to the cent for two shops with different rates**; coupon use counted and limited per customer; payouts released when the shop connects; **two buyers racing for the last units: one 201, one 409**; abandoned and expired orders return their stock |
| Order lifecycle | 4 | Each shop sees only its parcel; one step at a time; tracking required to ship; customer sees per-parcel progress and no commission figures; customer cancels an unpacked parcel: refund and restock |
| Reviews | 3 | Only after delivery, never for a cancelled parcel; one per customer (edits); product and shop ratings update; rating filter; shop replies |
| PDF invoices | 1 | Customer invoice and per-shop invoice are valid PDFs; other users and signed-out requests refused |
| Analytics | 2 | Shop dashboard figures; admin totals that exclude cancelled parcels |
| Admin controls | 4 | Suspending a shop removes its products from search and carts; disabling an account takes effect immediately; per-parcel economics in the order list; sold products archived, not deleted |
| Unit | 11 | Discount allocation and commission maths; order status; Elasticsearch query builder (typo tolerance, post-filter facets) and response parsing; wire format against a stand-in server (API key header, NDJSON bulk); generated product art |
| Real search node | 6 | Answers from the engine; **typo tolerance** (`stonware mgu` finds Stoneware Coffee Mug); description and brand matches; filters, price sort, facets, stock and rating; suggestions; archived products leave the index |

## 2. Browser journeys: 9 of 9 pass

```bash
python3 scripts/e2e_smoke.py http://localhost:4000 photo.png
```

Real Chromium (Playwright) against the production build, with MongoDB, Redis and the search node active.

```
PASS  search: typo-tolerant suggestions, brand filter and price sort  (2.6s)
PASS  guest cart: add from two shops, drawer shows per-shop shipping  (1.4s)
PASS  sign-in merges the guest cart; invalid and shop-specific coupons  (1.3s)
PASS  checkout: declined card, then test card; order splits into one parcel per shop  (1.4s)
PASS  customer cancels one parcel before packing and opens the PDF invoice  (0.7s)
PASS  shop owner packs and ships with tracking (lifecycle)  (2.1s)
PASS  shop owner creates a product, uploads a photo, puts it on sale; it is searchable  (1.5s)
PASS  admin sees analytics, approves a shop (it opens), creates a coupon  (2.1s)
PASS  phone width: filters drawer works and nothing overflows  (0.9s)

9/9 journeys passed; no uncaught page errors
```

## 3. Performance

Sequential requests against the demo marketplace (59 products, 173 orders, 135 reviews), everything on one core.

| Endpoint | Requests | p50 | p95 | p99 |
| --- | --- | --- | --- | --- |
| `GET /api/catalog/home` (Redis cached) | 300 | 1.8 ms | 5.9 ms | 10.3 ms |
| `GET /api/catalog/search`, text query (search node) | 300 | 28.2 ms | 49.8 ms | 76.1 ms |
| `GET /api/catalog/search`, filters + facets + sort (search node) | 300 | 16.1 ms | 31.5 ms | 45.5 ms |
| `GET /api/catalog/suggest` (search node) | 300 | 8.2 ms | 16.9 ms | 29.8 ms |
| `GET /api/catalog/products/:slug` | 300 | 4.9 ms | 11.5 ms | 21.3 ms |
| `GET /api/cart` (Redis, repriced on every read) | 300 | 3.3 ms | 11.5 ms | 21.3 ms |
| `GET /api/auth/me` (session cached in Redis) | 300 | 1.2 ms | 3.1 ms | 5.4 ms |
| `GET /api/vendor/dashboard?days=90` | 100 | 11.7 ms | 24.2 ms | 33.5 ms |
| `GET /api/admin/analytics?days=90` (13 aggregations) | 100 | 31.6 ms | 47.0 ms | 63.0 ms |

Search engine comparison on the same data:

| Search request | Search node p50 | MongoDB fallback p50 |
| --- | --- | --- |
| Text query | 28.2 ms | 22.1 ms |
| Filters + facets + sort | 16.1 ms | 18.9 ms |
| Suggestions | 8.2 ms | 3.1 ms |

Read this honestly: with 59 products, MongoDB is as fast or faster, and the JVM shares the single core. What the
search engine adds is **quality**: relevance ranking, typo tolerance (`headphnes`, `stonware` both work; the MongoDB
fallback returns nothing for them) and as-you-type matching. Its advantage in speed appears with catalogs in the
tens of thousands, where regular-expression search in MongoDB cannot use indexes.

### Frontend bundle (production build)

| Chunk | Gzip |
| --- | --- |
| Storefront app code (home, search, product page, header, cart drawer) | about 19 KB |
| Shared chunk: React, React DOM, Redux Toolkit, router, icons, shared components | about 93 KB |
| CSS | 9 KB |
| Each signed-in area (account, checkout, shop, admin) | 2 to 9 KB, loaded on demand |

## 4. Fallback paths

| Scenario | Result |
| --- | --- |
| No Redis | Carts and caches in memory; full test suite passes |
| No search node | MongoDB search with the same filters, sorting and facets; full test suite passes |
| Placeholders left in `server/.env` | Treated as unset; local storage and the test payment gateway |
| `npm run doctor`, default local setup | PASS for node, env, mongodb, redis, urls; WARN for jwt (before setup), elasticsearch, s3, payments; no FAIL |

## Not covered by automated tests

- Calls to S3, Stripe and Razorpay need real credentials. Their request code paths are exercised by `npm run doctor`
  and the manual checklist in `SETUP_GUIDE.md` step B11.
- The Docker image and the Render and Vercel deployments were not run from this environment.
