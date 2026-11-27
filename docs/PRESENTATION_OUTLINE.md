# 10-minute presentation outline

| Time | Section | Show | Say |
| --- | --- | --- | --- |
| 0:00 | Problem | Home page | A marketplace is three products in one: a store for customers, a back office for each shop, and a ledger that splits every payment. |
| 1:00 | Demo: customer | Search `headphnes` (typo), filter by brand, sort by price. Add from two shops as a guest, sign in (cart follows), apply `KETTLE15`, pay with the test card, see two parcels | Search runs in Elasticsearch; the cart lives in Redis; the server reprices everything. |
| 3:30 | Demo: shop owner | Dashboard, mark a parcel packed then shipped with tracking, payouts ledger, upload a product photo and put it on sale | Each shop sees only its parcel and its share; images go to S3. |
| 5:00 | Demo: admin | Analytics (GMV vs commission), approve the waiting shop, set a per-shop commission | Approval moves a shop's products into the search index. |
| 6:00 | Design | `docs/ARCHITECTURE.md`: money flow diagram and worked example | One order, one parcel per shop; commission fixed at order time; integers in cents; atomic stock reservation. |
| 7:30 | Challenges | Pick two: no overselling under concurrency; facets that ignore their own filter; keeping the index consistent; idempotent payment fulfilment between redirect and webhook; making every service optional for local development. |
| 9:00 | Results | `docs/TEST_RESULTS.md` | 63 API tests including a real search node, 9 browser journeys, latency table, and the honest search-engine comparison. |
| 9:30 | Next steps | | Multi-currency, returns after delivery, shop-level shipping rules, search analytics, CloudFront signed URLs, background job queue for emails. |

The individual reflection is yours to write: what you built yourself, what you learned, and what you would change.
