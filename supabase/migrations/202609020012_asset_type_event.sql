-- Record ULD and truck type replacements as their own audited operation.
alter type public.event_type add value if not exists 'ASSET_TYPE_CHANGED' after 'ROTATED';
