import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { SlidersHorizontal, X, SearchX, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useSearchQuery, useGetMetaQuery } from '../store/api.js';
import { ProductGrid } from '../components/ProductCard.jsx';
import { Empty } from '../components/ui.jsx';
import { plural, money } from '../lib/format.js';

const SORTS = [['relevance', 'Best match'], ['bestselling', 'Bestselling'], ['price-asc', 'Price, low to high'], ['price-desc', 'Price, high to low'], ['rating', 'Top rated'], ['newest', 'Newest']];

function Facet({ title, children }) {
  return (
    <fieldset className="border-b border-line py-5 first:pt-0">
      <legend className="mb-3 text-sm font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

function PriceFilter({ min, max, bounds, onApply }) {
  const toMajor = (v) => (v == null || v === '' ? '' : String(Math.round(v / 100)));
  const [lo, setLo] = useState(toMajor(min));
  const [hi, setHi] = useState(toMajor(max));
  useEffect(() => { setLo(toMajor(min)); setHi(toMajor(max)); }, [min, max]);
  const apply = (e) => { e.preventDefault(); onApply(lo === '' ? '' : String(Number(lo) * 100), hi === '' ? '' : String(Number(hi) * 100)); };
  return (
    <form onSubmit={apply} className="flex items-end gap-2">
      <label className="flex-1"><span className="mb-1 block text-xs text-ink-faint">Min</span><input type="number" min="0" inputMode="numeric" className="field h-9 tabular" placeholder={bounds ? String(Math.floor(bounds.min / 100)) : '0'} value={lo} onChange={(e) => setLo(e.target.value)} /></label>
      <label className="flex-1"><span className="mb-1 block text-xs text-ink-faint">Max</span><input type="number" min="0" inputMode="numeric" className="field h-9 tabular" placeholder={bounds ? String(Math.ceil(bounds.max / 100)) : ''} value={hi} onChange={(e) => setHi(e.target.value)} /></label>
      <button type="submit" className="btn-outline h-9 px-3">Go</button>
    </form>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState(false);
  const meta = useGetMetaQuery();
  const get = (k) => params.get(k) || '';
  const q = get('q');
  const category = get('category');
  const brands = useMemo(() => (get('brand') ? get('brand').split(',') : []), [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const sort = get('sort') || 'relevance';
  const page = Number(get('page')) || 1;

  const query = Object.fromEntries(['q', 'category', 'brand', 'minPrice', 'maxPrice', 'minRating', 'inStock', 'sort', 'page'].map((k) => [k, get(k)]).filter(([, v]) => v));
  const { data, isLoading, isFetching, isError } = useSearchQuery({ ...query, limit: 24 });

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries({ page: '', ...changes }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: false });
  };
  useEffect(() => { window.scrollTo({ top: 0 }); }, [page]);
  const toggleBrand = (b) => update({ brand: (brands.includes(b) ? brands.filter((x) => x !== b) : [...brands, b]).join(',') });

  const chips = [
    category && { label: category, clear: { category: '' } },
    ...brands.map((b) => ({ label: b, clear: { brand: brands.filter((x) => x !== b).join(',') } })),
    (get('minPrice') || get('maxPrice')) && { label: `${get('minPrice') ? money(Number(get('minPrice'))) : 'Any'} to ${get('maxPrice') ? money(Number(get('maxPrice'))) : 'any'}`, clear: { minPrice: '', maxPrice: '' } },
    get('minRating') && { label: `${get('minRating')} stars and up`, clear: { minRating: '' } },
    get('inStock') && { label: 'In stock', clear: { inStock: '' } },
  ].filter(Boolean);

  const facets = data?.facets;
  const filters = (
    <div>
      <Facet title="Department">
        <ul className="space-y-1">
          <li><button type="button" onClick={() => update({ category: '' })} className={clsx('w-full rounded-md px-2 py-1.5 text-left text-sm', !category ? 'bg-ink font-semibold text-white' : 'hover:bg-ink/5')}>All departments</button></li>
          {(facets?.categories?.length ? facets.categories : (meta.data?.categories || []).map((value) => ({ value }))).map((c) => (
            <li key={c.value}><button type="button" onClick={() => update({ category: category === c.value ? '' : c.value })} className={clsx('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm', category === c.value ? 'bg-ink font-semibold text-white' : 'hover:bg-ink/5')}>{c.value}{c.count != null && <span className={clsx('text-xs tabular', category === c.value ? 'text-white/70' : 'text-ink-faint')}>{c.count}</span>}</button></li>
          ))}
        </ul>
      </Facet>
      {facets?.brands?.length > 0 && (
        <Facet title="Brand">
          <ul className="scroll-thin max-h-60 space-y-1.5 overflow-y-auto pr-1">
            {facets.brands.map((b) => (
              <li key={b.value}><label className="flex cursor-pointer items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#17181C]" checked={brands.includes(b.value)} onChange={() => toggleBrand(b.value)} /><span className="flex-1">{b.value}</span><span className="text-xs tabular text-ink-faint">{b.count}</span></label></li>
            ))}
          </ul>
        </Facet>
      )}
      <Facet title="Price">
        <PriceFilter min={get('minPrice')} max={get('maxPrice')} bounds={facets?.price?.max ? facets.price : null} onApply={(minPrice, maxPrice) => update({ minPrice, maxPrice })} />
      </Facet>
      <Facet title="Customer rating">
        <div className="space-y-1">
          {[4, 3].map((r) => (
            <button key={r} type="button" onClick={() => update({ minRating: get('minRating') === String(r) ? '' : String(r) })} className={clsx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm', get('minRating') === String(r) ? 'bg-ink text-white' : 'hover:bg-ink/5')}>
              <span className="flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={clsx('h-3.5 w-3.5', i < r ? 'text-star' : 'text-line-strong')} fill="currentColor" strokeWidth={0} />)}</span>& up
            </button>
          ))}
        </div>
      </Facet>
      <Facet title="Availability">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-[#17181C]" checked={!!get('inStock')} onChange={(e) => update({ inStock: e.target.checked ? '1' : '' })} />In stock only</label>
      </Facet>
    </div>
  );

  return (
    <div className="page pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl sm:text-5xl">{q ? <>Results for “{q}”</> : category || 'All products'}</h1>
          <p className="mt-1.5 text-sm text-ink-faint" aria-live="polite">
            {data ? `${plural(data.total, 'product')}` : isLoading ? 'Searching' : ''}
            {data?.engine && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-2xs ring-1 ring-line" title="The search engine that answered">{data.engine === 'elasticsearch' ? 'Elasticsearch' : 'MongoDB search'}, {data.tookMs} ms</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-outline lg:hidden" onClick={() => setPanel(true)}><SlidersHorizontal className="h-4 w-4" />Filters{chips.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-2xs text-white">{chips.length}</span>}</button>
          <label className="flex items-center gap-2 text-sm"><span className="hidden text-ink-faint sm:inline">Sort by</span>
            <select value={sort} onChange={(e) => update({ sort: e.target.value === 'relevance' ? '' : e.target.value })} className="field h-10 w-auto pr-8 font-semibold">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((c) => <button key={c.label} type="button" onClick={() => update(c.clear)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink pl-3 pr-2 text-xs font-semibold text-white hover:bg-night-700">{c.label}<X className="h-3.5 w-3.5" aria-label="Remove filter" /></button>)}
          <button type="button" onClick={() => setParams(q ? { q } : {})} className="text-xs font-semibold text-ink-faint underline-offset-2 hover:text-ink hover:underline">Clear all</button>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">{filters}</aside>
        <div>
          <div className={clsx('transition-opacity duration-150', isFetching && !isLoading && 'opacity-55')}>
            {isError ? <Empty icon={SearchX} title="Search is unavailable">Check that the API is running, then try again.</Empty>
              : data && data.items.length === 0 ? (
                <Empty icon={SearchX} title="Nothing matches" action={chips.length > 0 && <button type="button" className="btn-outline" onClick={() => setParams(q ? { q } : {})}>Clear filters</button>}>
                  {q ? 'Check the spelling or try a more general word.' : 'Try removing a filter.'}
                </Empty>
              ) : <ProductGrid products={data?.items || []} loading={isLoading} count={12} className="lg:grid-cols-3 xl:grid-cols-4" />}
          </div>
          {data && data.pages > 1 && (
            <nav className="mt-12 flex items-center justify-center gap-3" aria-label="Pages">
              <button type="button" className="btn-outline btn-icon" disabled={page <= 1} onClick={() => update({ page: page > 2 ? String(page - 1) : '' })} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm tabular text-ink-soft">Page {data.page} of {data.pages}</span>
              <button type="button" className="btn-outline btn-icon" disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            </nav>
          )}
        </div>
      </div>

      {panel && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-night/45" onClick={() => setPanel(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label="Filters" className="absolute inset-y-0 left-0 flex w-[min(22rem,90vw)] animate-pop flex-col bg-paper shadow-pop">
            <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-2xl">Filters</h2><button type="button" className="btn-ghost btn-icon -mr-2" onClick={() => setPanel(false)} aria-label="Close filters"><X className="h-5 w-5" /></button></div>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">{filters}</div>
            <div className="border-t border-line p-4"><button type="button" className="btn-primary w-full" onClick={() => setPanel(false)}>Show {data ? plural(data.total, 'product') : 'products'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
