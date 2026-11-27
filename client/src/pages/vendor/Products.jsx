import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import clsx from 'clsx';
import { Plus, Search, ImagePlus, X, ArrowLeft, ArrowRight, Trash2, ExternalLink, Package } from 'lucide-react';
import { useGetVendorProductsQuery, useGetVendorProductQuery, useCreateProductMutation, useUpdateProductMutation, useDeleteProductMutation, useUploadProductImagesMutation, useSetProductImagesMutation, useGetMetaQuery } from '../../store/api.js';
import { toast } from '../../store/uiSlice.js';
import { ProductImage } from '../../components/bits.jsx';
import { Confirm, Empty, ErrorNote, Field, PageLoader, Segmented, Skeleton, Spinner, StatusTag } from '../../components/ui.jsx';
import { money, errorMessage, fromNow, assetUrl } from '../../lib/format.js';

export function ProductsList() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { data, isLoading } = useGetVendorProductsQuery({ ...(status && { status }), ...(q && { q }) });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl">Products</h2>
        <Link to="/sell/products/new" className="btn-primary"><Plus className="h-4 w-4" />Add product</Link>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Segmented size="sm" label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'active', label: 'On sale' }, { value: 'draft', label: 'Drafts' }, { value: 'archived', label: 'Archived' }]} />
        <label className="relative block w-full max-w-xs"><span className="sr-only">Search your products</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" /><input type="search" className="field pl-9" placeholder="Search your products" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-faint"><th className="px-4 py-3 font-semibold">Product</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 text-right font-semibold">Price</th><th className="px-3 py-3 text-right font-semibold">Stock</th><th className="px-3 py-3 text-right font-semibold">Sold</th><th className="px-4 py-3 text-right font-semibold">Updated</th></tr></thead>
          <tbody className="divide-y divide-line">
            {isLoading && Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-10" /></td></tr>)}
            {data?.items.map((p) => (
              <tr key={p.id} className="hover:bg-paper/60">
                <td className="px-4 py-2.5"><Link to={`/sell/products/${p.id}`} className="flex items-center gap-3"><ProductImage src={p.image} className="h-11 w-11 shrink-0 rounded-md" /><span className="font-semibold hover:underline">{p.title}</span></Link></td>
                <td className="px-3 py-2.5"><StatusTag status={p.status}>{p.status === 'active' ? 'On sale' : undefined}</StatusTag></td>
                <td className="px-3 py-2.5 text-right tabular">{money(p.price)}</td>
                <td className={clsx('px-3 py-2.5 text-right font-semibold tabular', p.stock === 0 ? 'text-brand' : p.stock <= 5 && 'text-star-deep')}>{p.stock}</td>
                <td className="px-3 py-2.5 text-right tabular text-ink-soft">{p.soldCount}</td>
                <td className="px-4 py-2.5 text-right text-xs text-ink-faint">{fromNow(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <div className="p-6"><Empty icon={Package} title={status || q ? 'No products match' : 'No products yet'} action={!status && !q && <Link to="/sell/products/new" className="btn-primary"><Plus className="h-4 w-4" />Add your first product</Link>}>Products start as drafts. Add a photo, then put them on sale.</Empty></div>}
      </div>
    </div>
  );
}

const toMajor = (minor) => (minor ? (minor / 100).toFixed(2).replace(/\.00$/, '') : '');
const toMinor = (major) => Math.round(Number(String(major).replace(',', '.') || 0) * 100);
const emptyForm = { title: '', description: '', category: '', brand: '', tags: '', price: '', compareAtPrice: '', stock: '10', attributes: [] };

function Photos({ product }) {
  const dispatch = useDispatch();
  const [upload, uploading] = useUploadProductImagesMutation();
  const [setImages] = useSetProductImagesMutation();
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const keys = product.imageKeys;
  const send = async (files) => {
    const list = [...files].slice(0, 6 - keys.length);
    if (!list.length) return dispatch(toast.error('A product can have up to 6 photos.'));
    try { await upload({ id: product.id, files: list }).unwrap(); } catch (err) { dispatch(toast.error(errorMessage(err))); }
  };
  const save = async (next) => { try { await setImages({ id: product.id, keys: next }).unwrap(); } catch (err) { dispatch(toast.error(errorMessage(err))); } };
  const move = (i, dir) => { const next = [...keys]; [next[i], next[i + dir]] = [next[i + dir], next[i]]; save(next); };
  return (
    <section className="panel p-5">
      <h3 className="text-xl">Photos</h3>
      <p className="hint">Up to 6. The first photo is the one shoppers see in search. JPG, PNG or WebP.</p>
      <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-3">
        {product.images.map((src, i) => (
          <li key={keys[i]} className="group relative">
            <img src={assetUrl(src)} alt="" className="aspect-square w-full rounded-lg object-cover ring-1 ring-line" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-ink px-1.5 py-0.5 text-2xs font-bold text-white">Cover</span>}
            <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <span className="flex gap-1">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="grid h-7 w-7 place-items-center rounded-md bg-white/95 shadow disabled:opacity-30" aria-label="Move earlier"><ArrowLeft className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={i === keys.length - 1} onClick={() => move(i, 1)} className="grid h-7 w-7 place-items-center rounded-md bg-white/95 shadow disabled:opacity-30" aria-label="Move later"><ArrowRight className="h-3.5 w-3.5" /></button>
              </span>
              <button type="button" onClick={() => save(keys.filter((_, n) => n !== i))} className="grid h-7 w-7 place-items-center rounded-md bg-white/95 text-brand shadow" aria-label="Remove photo"><X className="h-3.5 w-3.5" /></button>
            </div>
          </li>
        ))}
        {keys.length < 6 && (
          <li>
            <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
              className={clsx('grid aspect-square w-full place-items-center rounded-lg border-2 border-dashed text-xs font-semibold text-ink-soft transition-colors', over ? 'border-ink bg-paper' : 'border-line-strong hover:border-ink')}>
              {uploading.isLoading ? <Spinner className="h-5 w-5" /> : <span className="flex flex-col items-center gap-1"><ImagePlus className="h-5 w-5" />Add photos</span>}
            </button>
            <input ref={input} type="file" accept=".jpg,.jpeg,.png,.webp" multiple className="sr-only" tabIndex={-1} onChange={(e) => { send(e.target.files); e.target.value = ''; }} />
          </li>
        )}
      </ul>
    </section>
  );
}

export function ProductEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { shop } = useOutletContext();
  const meta = useGetMetaQuery();
  const { data, isLoading } = useGetVendorProductQuery(id, { skip: isNew });
  const [create, createState] = useCreateProductMutation();
  const [update, updateState] = useUpdateProductMutation();
  const [updateStatus, statusState] = useUpdateProductMutation(); // separate, so a refused status change shows as a toast only
  const [remove, removeState] = useDeleteProductMutation();
  const [form, setForm] = useState(emptyForm);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const product = data?.product;

  useEffect(() => {
    if (!product) return;
    setForm({ title: product.title, description: product.description, category: product.category, brand: product.brand, tags: product.tags.join(', '), price: toMajor(product.price), compareAtPrice: toMajor(product.rawCompareAtPrice), stock: String(product.stock), attributes: product.attributes });
    setDirty(false);
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isNew && isLoading) return <PageLoader />;
  const error = createState.error || updateState.error;
  const fieldError = (n) => error?.data?.details?.find((d) => d.field === n || d.field.startsWith(`${n}.`))?.message;
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setDirty(true); };
  const body = () => ({
    title: form.title, description: form.description, category: form.category || undefined, brand: form.brand,
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean), price: toMinor(form.price), compareAtPrice: toMinor(form.compareAtPrice),
    stock: Number(form.stock || 0), attributes: form.attributes.filter((a) => a.name.trim() && a.value.trim()),
  });
  const save = async (e) => {
    e?.preventDefault();
    try {
      if (isNew) {
        const res = await create(body()).unwrap();
        dispatch(toast.success('Draft saved. Add photos, then put it on sale.'));
        navigate(`/sell/products/${res.product.id}`, { replace: true });
      } else {
        await update({ id, ...body() }).unwrap();
        setDirty(false);
        dispatch(toast.success('Saved.'));
      }
    } catch { /* shown */ }
  };
  const setStatus = async (status) => {
    try {
      if (dirty) await update({ id, ...body() }).unwrap();
      await updateStatus({ id, status }).unwrap();
      setDirty(false);
      dispatch(toast.success(status === 'active' ? 'On sale. Shoppers can find it now.' : status === 'archived' ? 'Archived. It is hidden from shoppers.' : 'Moved back to drafts.'));
    } catch (err) { dispatch(toast.error(errorMessage(err))); }
  };
  const destroy = async () => {
    try { const r = await remove(id).unwrap(); dispatch(toast.success(r.archived ? 'This product has orders, so it was archived instead of deleted.' : 'Product deleted.')); navigate('/sell/products'); }
    catch (err) { dispatch(toast.error(errorMessage(err))); }
  };
  const attr = (i, k, v) => { const next = form.attributes.map((a, n) => (n === i ? { ...a, [k]: v } : a)); setForm({ ...form, attributes: next }); setDirty(true); };
  const discount = toMinor(form.compareAtPrice) > toMinor(form.price) && toMinor(form.price) > 0 ? Math.round((1 - toMinor(form.price) / toMinor(form.compareAtPrice)) * 100) : 0;

  return (
    <form onSubmit={save}>
      <Link to="/sell/products" className="text-sm font-semibold text-ink-faint hover:text-ink">All products</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><h2 className="text-3xl">{isNew ? 'New product' : form.title || 'Untitled'}</h2>{product && <StatusTag status={product.status}>{product.status === 'active' ? 'On sale' : undefined}</StatusTag>}</div>
        <div className="flex flex-wrap gap-2">
          {product?.status === 'active' && <Link to={`/p/${product.slug}`} className="btn-ghost"><ExternalLink className="h-4 w-4" />View</Link>}
          {product && product.status !== 'active' && <button type="button" className="btn-buy" disabled={statusState.isLoading || shop.status !== 'approved'} title={shop.status !== 'approved' ? 'Your shop must be approved first' : undefined} onClick={() => setStatus('active')}>Put on sale</button>}
          {product?.status === 'active' && <button type="button" className="btn-outline" onClick={() => setStatus('draft')}>Take off sale</button>}
          <button type="submit" className="btn-primary" disabled={(!dirty && !isNew) || createState.isLoading || updateState.isLoading}>{(createState.isLoading || updateState.isLoading) && <Spinner />}{isNew ? 'Save draft' : 'Save changes'}</button>
        </div>
      </div>
      <ErrorNote className="mt-4">{error && errorMessage(error)}</ErrorNote>

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <section className="panel space-y-4 p-5">
            <Field label="Title" error={fieldError('title')}><input className="field h-11 text-base font-semibold" value={form.title} onChange={set('title')} placeholder="What is it?" /></Field>
            <Field label="Description" hint="What it is, what it is made of, who it is for."><textarea className="field min-h-36" value={form.description} onChange={set('description')} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department" error={fieldError('category')}><select className="field" value={form.category} onChange={set('category')}><option value="">Choose</option>{(meta.data?.categories || []).map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Brand" hint="Shoppers can filter by brand."><input className="field" value={form.brand} onChange={set('brand')} /></Field>
            </div>
            <Field label="Search words" hint="Comma separated. Extra words shoppers might type, for example: gift, coffee, ceramic."><input className="field" value={form.tags} onChange={set('tags')} /></Field>
          </section>
          <section className="panel p-5">
            <h3 className="text-xl">Specifications</h3>
            <p className="hint">Shown as a table on the product page.</p>
            <ul className="mt-3 space-y-2">
              {form.attributes.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <input className="field w-40" placeholder="Name" value={a.name} onChange={(e) => attr(i, 'name', e.target.value)} aria-label="Specification name" />
                  <input className="field flex-1" placeholder="Value" value={a.value} onChange={(e) => attr(i, 'value', e.target.value)} aria-label="Specification value" />
                  <button type="button" className="btn-ghost btn-icon shrink-0" onClick={() => { setForm({ ...form, attributes: form.attributes.filter((_, n) => n !== i) }); setDirty(true); }} aria-label="Remove"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            {form.attributes.length < 12 && <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => { setForm({ ...form, attributes: [...form.attributes, { name: '', value: '' }] }); setDirty(true); }}><Plus className="h-3.5 w-3.5" />Add a row</button>}
          </section>
        </div>
        <div className="space-y-5 lg:sticky lg:top-36">
          {product ? <Photos product={product} /> : <section className="panel p-5 text-sm text-ink-faint"><h3 className="text-xl text-ink">Photos</h3><p className="mt-1">Save the draft first, then add photos here.</p></section>}
          <section className="panel space-y-4 p-5">
            <h3 className="text-xl">Price and stock</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price" error={fieldError('price')}><input className="field tabular" inputMode="decimal" value={form.price} onChange={set('price')} placeholder="0.00" /></Field>
              <Field label="Was price" hint={discount ? `Shows as -${discount}%` : 'Optional'}><input className="field tabular" inputMode="decimal" value={form.compareAtPrice} onChange={set('compareAtPrice')} placeholder="0.00" /></Field>
            </div>
            <Field label="In stock" error={fieldError('stock')}><input className="field tabular" type="number" min="0" value={form.stock} onChange={set('stock')} /></Field>
            {toMinor(form.price) > 0 && <p className="rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">You receive about <b className="tabular text-ink">{money(Math.round(toMinor(form.price) * (1 - (shop.effectiveCommission ?? 10) / 100)))}</b> per sale after the {shop.effectiveCommission ?? 10}% marketplace commission, plus shipping.</p>}
          </section>
          {product && <button type="button" className="btn-ghost w-full text-brand hover:text-brand" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Delete product</button>}
        </div>
      </div>
      <Confirm open={confirm} onClose={() => setConfirm(false)} onConfirm={destroy} busy={removeState.isLoading} title="Delete this product?" confirmLabel="Delete">
        Products that have been ordered are archived instead, so past orders and invoices stay intact.
      </Confirm>
    </form>
  );
}
