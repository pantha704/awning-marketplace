import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import clsx from 'clsx';
import { Search, ShoppingBag, ChevronDown, LogOut, Package, UserRound, Store, ChartNoAxesColumn, Menu, X } from 'lucide-react';
import { selectUser, signedOut } from '../store/authSlice.js';
import { toast, cartOpened } from '../store/uiSlice.js';
import { useGetCartQuery, useSuggestQuery, useGetMetaQuery } from '../store/api.js';
import { Avatar } from './ui.jsx';

export function Logo({ light = false, className }) {
  return (
    <Link to="/" className={clsx('inline-flex shrink-0 items-center gap-2 rounded-md', className)} aria-label="Awning home">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <path d="M3 6h26v12a3.25 3.25 0 0 1-6.5 0 3.25 3.25 0 0 1-6.5 0 3.25 3.25 0 0 1-6.5 0A3.25 3.25 0 0 1 3 18z" fill="#D4402B" />
        <path d="M9.5 6H16v12a3.25 3.25 0 0 1-6.5 0zM22.5 6H29v12a3.25 3.25 0 0 1-6.5 0z" fill="#fff" />
        <rect x="3" y="5" width="26" height="3.5" rx="1" fill={light ? '#fff' : '#17181C'} />
        <rect x="6" y="25" width="20" height="3" rx="1.5" fill={light ? '#fff' : '#17181C'} />
      </svg>
      <span className={clsx('sign text-[1.55rem] leading-none', light ? 'text-white' : 'text-ink')}>Awning</span>
    </Link>
  );
}

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Search box with as-you-type suggestions from the search engine. */
function SearchBox({ className, autoFocus }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [q, setQ] = useState(location.pathname === '/search' ? params.get('q') || '' : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounced(q.trim(), 140);
  const { data } = useSuggestQuery(debounced, { skip: debounced.length < 2 });
  const items = debounced.length >= 2 ? data?.items || [] : [];
  const box = useRef(null);
  useEffect(() => { if (location.pathname === '/search') setQ(params.get('q') || ''); }, [location.pathname, params]);
  useEffect(() => {
    const close = (e) => !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (value) => {
    setOpen(false);
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search');
  };
  const onKey = (e) => {
    if (!open || !items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
    if (e.key === 'Escape') setOpen(false);
  };
  return (
    <form ref={box} role="search" className={clsx('relative', className)} onSubmit={(e) => { e.preventDefault(); if (active >= 0 && items[active]) { setOpen(false); navigate(`/p/${items[active].slug}`); } else go(q.trim()); }}>
      <label className="relative block">
        <span className="sr-only">Search products</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input type="search" value={q} autoFocus={autoFocus} placeholder="Search mugs, headphones, plants..." autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={open && items.length > 0} aria-controls="search-suggestions" aria-autocomplete="list"
          className="h-11 w-full rounded-full border border-line-strong bg-white pl-10 pr-24 text-[15px] placeholder:text-ink-faint focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10" />
        <button type="submit" className="btn absolute right-1 top-1 h-9 rounded-full bg-brand px-4 text-white hover:bg-brand-dark">Search</button>
      </label>
      {open && items.length > 0 && (
        <ul id="search-suggestions" role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-40 animate-pop overflow-hidden rounded-xl border border-line bg-white py-1.5 shadow-pop">
          {items.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === active}>
              <Link to={`/p/${item.slug}`} onClick={() => setOpen(false)} onMouseEnter={() => setActive(i)} className={clsx('flex items-center justify-between gap-3 px-4 py-2.5 text-sm', i === active && 'bg-paper')}>
                <span className="truncate font-semibold">{item.title}</span><span className="shrink-0 text-xs text-ink-faint">{item.category}</span>
              </Link>
            </li>
          ))}
          <li><button type="button" onClick={() => go(q.trim())} className="w-full px-4 py-2.5 text-left text-sm text-ink-soft hover:bg-paper">See all results for <span className="font-semibold text-ink">“{q.trim()}”</span></button></li>
        </ul>
      )}
    </form>
  );
}

function CartButton() {
  const dispatch = useDispatch();
  const bump = useSelector((s) => s.ui.cartBump);
  const { data } = useGetCartQuery();
  const count = data?.cart?.itemCount || 0;
  return (
    <button type="button" onClick={() => dispatch(cartOpened())} className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-ink/5" aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
      <ShoppingBag className="h-5 w-5" />
      {count > 0 && <span key={bump} className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 animate-bump place-items-center rounded-full bg-brand px-1 text-2xs font-bold text-white tabular">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

function UserMenu({ user }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  const item = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink-soft hover:bg-paper hover:text-ink';
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-1 rounded-full py-1 pl-1 pr-1.5 hover:bg-ink/5">
        <Avatar name={user.name} size={32} />
        <ChevronDown className={clsx('h-4 w-4 text-ink-faint transition-transform duration-100', open && 'rotate-180')} />
        <span className="sr-only">Account menu for {user.name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 animate-pop rounded-xl border border-line bg-white p-1.5 shadow-pop">
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-ink-faint">{user.email}</p>
          </div>
          <div className="pt-1.5">
            {user.role === 'vendor' && <Link role="menuitem" to="/sell" className={item}><Store className="h-4 w-4" />{user.vendorName || 'Set up your shop'}</Link>}
            {user.role === 'admin' && <Link role="menuitem" to="/admin" className={item}><ChartNoAxesColumn className="h-4 w-4" />Admin</Link>}
            {user.role !== 'admin' && <Link role="menuitem" to="/account/orders" className={item}><Package className="h-4 w-4" />Your orders</Link>}
            <Link role="menuitem" to="/account" className={item}><UserRound className="h-4 w-4" />Account and addresses</Link>
            <button role="menuitem" type="button" onClick={() => { dispatch(signedOut()); dispatch(toast.info('Signed out.')); navigate('/'); }} className={clsx(item, 'mt-1 border-t border-line pt-2.5')}><LogOut className="h-4 w-4" />Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const user = useSelector(selectUser);
  const location = useLocation();
  const meta = useGetMetaQuery();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [location.pathname, location.search]);
  const cats = meta.data?.categories || [];
  const currentCat = new URLSearchParams(location.search).get('category');
  return (
    <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur-md">
      <div className="page flex h-[68px] items-center gap-3 sm:gap-5">
        <button type="button" className="btn-ghost btn-icon -ml-2 lg:hidden" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label="Menu">{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        <Logo />
        <SearchBox className="hidden flex-1 md:block md:max-w-xl lg:max-w-2xl" />
        <nav className="ml-auto flex items-center gap-1 sm:gap-2" aria-label="Account">
          {user?.role === 'vendor' && <NavLink to="/sell" className={({ isActive }) => clsx('hidden rounded-full px-3 py-2 text-sm font-semibold sm:block', isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-ink/5')}>Your shop</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin" className={({ isActive }) => clsx('hidden rounded-full px-3 py-2 text-sm font-semibold sm:block', isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-ink/5')}>Admin</NavLink>}
          {!user && <Link to="/login" state={{ from: location }} className="btn-ghost hidden sm:inline-flex">Sign in</Link>}
          {user ? <UserMenu user={user} /> : <Link to="/register" className="btn-primary hidden sm:inline-flex">Create account</Link>}
          <CartButton />
        </nav>
      </div>
      <div className="page pb-3 md:hidden"><SearchBox /></div>
      <div className="border-y border-line bg-white">
        <nav className="page scroll-thin hidden h-11 items-center gap-1 overflow-x-auto lg:flex" aria-label="Departments">
          <NavLink to="/search" end className={() => clsx('shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold', location.pathname === '/search' && !currentCat ? 'text-brand' : 'text-ink-soft hover:text-ink')}>All</NavLink>
          {cats.map((c) => (
            <Link key={c} to={`/search?category=${encodeURIComponent(c)}`} className={clsx('shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold', currentCat === c ? 'text-brand' : 'text-ink-soft hover:text-ink')}>{c}</Link>
          ))}
          <Link to="/shops" className={clsx('ml-auto shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold', location.pathname.startsWith('/shops') ? 'text-brand' : 'text-ink-soft hover:text-ink')}>All shops</Link>
        </nav>
      </div>
      {menu && (
        <nav className="absolute inset-x-0 top-full z-30 animate-fade border-b border-line bg-white shadow-lift lg:hidden" aria-label="Mobile">
          <div className="page grid grid-cols-2 gap-1 py-3">
            {['All', ...cats].map((c) => <Link key={c} to={c === 'All' ? '/search' : `/search?category=${encodeURIComponent(c)}`} className="rounded-md px-3 py-2.5 text-[15px] font-semibold text-ink-soft hover:bg-paper">{c}</Link>)}
            <Link to="/shops" className="rounded-md px-3 py-2.5 text-[15px] font-semibold text-ink-soft hover:bg-paper">All shops</Link>
            {!user && <Link to="/login" className="rounded-md px-3 py-2.5 text-[15px] font-semibold text-brand">Sign in</Link>}
            {user?.role === 'vendor' && <Link to="/sell" className="rounded-md px-3 py-2.5 text-[15px] font-semibold text-brand">Your shop</Link>}
            {user?.role === 'admin' && <Link to="/admin" className="rounded-md px-3 py-2.5 text-[15px] font-semibold text-brand">Admin</Link>}
          </div>
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 bg-night text-white">
      <div className="awning awning-sm" style={{ '--awning': '#D4402B' }} aria-hidden="true" />
      <div className="page grid gap-8 py-12 text-sm sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-3 max-w-sm text-white/60">A marketplace of independent shops. Browse many, check out once, and every shop sends its own parcel.</p>
        </div>
        <nav aria-label="Shop" className="space-y-2">
          <p className="font-semibold">Shop</p>
          <Link to="/search" className="block text-white/60 hover:text-white">All products</Link>
          <Link to="/shops" className="block text-white/60 hover:text-white">All shops</Link>
          <Link to="/search?sort=bestselling" className="block text-white/60 hover:text-white">Bestsellers</Link>
        </nav>
        <nav aria-label="Sell" className="space-y-2">
          <p className="font-semibold">Sell</p>
          <Link to="/register?role=vendor" className="block text-white/60 hover:text-white">Open a shop</Link>
          <Link to="/sell" className="block text-white/60 hover:text-white">Shop dashboard</Link>
        </nav>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
      <Header />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}
