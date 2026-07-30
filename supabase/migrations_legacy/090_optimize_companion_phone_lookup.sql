begin;

alter table public.leads
  add column if not exists phone_digits text
  generated always as (
    nullif(
      regexp_replace(
        coalesce(phone, ''),
        '\D',
        '',
        'g'
      ),
      ''
    )
  ) stored;

create index if not exists leads_company_phone_digits_idx
  on public.leads (
    company_id,
    phone_digits
  );

comment on column public.leads.phone_digits is
  'Telefone contendo somente números, gerado automaticamente para buscas exatas e indexadas.';

comment on index public.leads_company_phone_digits_idx is
  'Acelera localização de leads por empresa e telefone normalizado, incluindo o Yolen Companion.';

commit;