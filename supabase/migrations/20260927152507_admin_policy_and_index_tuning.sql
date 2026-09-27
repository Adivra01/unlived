-- Public storefront reads stay anonymous; authenticated reads are restricted to admins.
drop policy "Public can view active products" on public.products;
create policy "Public can view active products" on public.products
for select to anon using (status = 'active');

drop policy "Public can view available variants of active products" on public.product_variants;
create policy "Public can view available variants of active products" on public.product_variants
for select to anon using (
  is_available and exists (
    select 1 from public.products p where p.id = product_id and p.status = 'active'
  )
);

drop policy "Public can view media for active products" on public.product_media;
create policy "Public can view media for active products" on public.product_media
for select to anon using (
  exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
create index product_media_variant_id_idx on public.product_media (variant_id);
