create or replace function public.companion_apply_lead_enrichment(
  p_company_id uuid,
  p_user_id uuid,
  p_lead_id uuid,
  p_cycle_id uuid,
  p_field text,
  p_value text,
  p_expected_current_value text,
  p_evidence_message_ids text[],
  p_confirmed_by_human boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_cycle_status text;
  v_cycle_owner_user_id uuid;

  v_lead_email text;
  v_lead_document text;

  v_profile_exists boolean := false;
  v_profile_email text;
  v_profile_cpf text;
  v_profile_cnpj text;
  v_profile_birth_date text;
  v_profile_profession text;
  v_profile_cep text;
  v_profile_phone_mobile text;

  v_current_raw text;
  v_current_value text;
  v_expected_value text;
  v_new_value text;
  v_lead_type text;
begin
  if p_confirmed_by_human is distinct from true then
    return jsonb_build_object(
      'ok', false,
      'code', 'human_confirmation_required',
      'error', 'A atualização cadastral exige confirmação humana explícita.'
    );
  end if;

  if p_field not in (
    'email',
    'cpf',
    'cnpj',
    'birth_date',
    'profession',
    'cep',
    'phone_mobile'
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'unsupported_field',
      'error', 'Campo cadastral não suportado.'
    );
  end if;

  if
    p_evidence_message_ids is null
    or cardinality(p_evidence_message_ids) = 0
    or cardinality(p_evidence_message_ids) > 40
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_evidence',
      'error', 'A atualização exige evidência válida da conversa.'
    );
  end if;

  select cm.role
    into v_role
  from public.company_memberships cm
  where cm.company_id = p_company_id
    and cm.user_id = p_user_id
    and cm.is_active = true;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'no_company_permission',
      'error', 'Usuário sem vínculo ativo com esta empresa.'
    );
  end if;

  select
    l.email,
    l.cpf_cnpj
  into
    v_lead_email,
    v_lead_document
  from public.leads l
  where l.id = p_lead_id
    and l.company_id = p_company_id
    and l.deleted_at is null
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'lead_unavailable',
      'error', 'Lead inexistente ou indisponível.'
    );
  end if;

  select
    sc.status::text,
    sc.owner_user_id
  into
    v_cycle_status,
    v_cycle_owner_user_id
  from public.sales_cycles sc
  where sc.id = p_cycle_id
    and sc.lead_id = p_lead_id
    and sc.company_id = p_company_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'cycle_not_found',
      'error', 'Ciclo não encontrado para este lead.'
    );
  end if;

  if v_cycle_status in (
    'ganho',
    'perdido',
    'cancelado'
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'cycle_closed',
      'error', 'O ciclo comercial está encerrado.'
    );
  end if;

  if
    v_role not in ('admin', 'manager')
    and v_cycle_owner_user_id is distinct from p_user_id
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_cycle_owner',
      'error', 'Este lead não pertence à sua carteira.'
    );
  end if;

  select
    lp.email,
    lp.cpf,
    lp.cnpj,
    lp.birth_date::text,
    lp.profession,
    lp.cep,
    lp.phone_mobile
  into
    v_profile_email,
    v_profile_cpf,
    v_profile_cnpj,
    v_profile_birth_date,
    v_profile_profession,
    v_profile_cep,
    v_profile_phone_mobile
  from public.lead_profiles lp
  where lp.lead_id = p_lead_id
    and lp.company_id = p_company_id
  for update;

  v_profile_exists := found;

  v_current_raw :=
    case p_field
      when 'email' then
        coalesce(
          nullif(btrim(v_profile_email), ''),
          nullif(btrim(v_lead_email), '')
        )

      when 'cpf' then
        coalesce(
          nullif(btrim(v_profile_cpf), ''),
          case
            when length(
              regexp_replace(
                coalesce(v_lead_document, ''),
                '\D',
                '',
                'g'
              )
            ) = 11
            then v_lead_document
            else null
          end
        )

      when 'cnpj' then
        coalesce(
          nullif(btrim(v_profile_cnpj), ''),
          case
            when length(
              regexp_replace(
                coalesce(v_lead_document, ''),
                '\D',
                '',
                'g'
              )
            ) = 14
            then v_lead_document
            else null
          end
        )

      when 'birth_date' then
        v_profile_birth_date

      when 'profession' then
        nullif(
          btrim(v_profile_profession),
          ''
        )

      when 'cep' then
        nullif(
          btrim(v_profile_cep),
          ''
        )

      when 'phone_mobile' then
        nullif(
          btrim(v_profile_phone_mobile),
          ''
        )

      else null
    end;

  v_current_value :=
    case p_field
      when 'email' then
        lower(
          nullif(
            btrim(v_current_raw),
            ''
          )
        )

      when 'cpf' then
        nullif(
          regexp_replace(
            coalesce(v_current_raw, ''),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'cnpj' then
        nullif(
          regexp_replace(
            coalesce(v_current_raw, ''),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'cep' then
        nullif(
          regexp_replace(
            coalesce(v_current_raw, ''),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'phone_mobile' then
        nullif(
          regexp_replace(
            coalesce(v_current_raw, ''),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'profession' then
        nullif(
          regexp_replace(
            btrim(
              coalesce(
                v_current_raw,
                ''
              )
            ),
            '\s+',
            ' ',
            'g'
          ),
          ''
        )

      when 'birth_date' then
        nullif(
          btrim(v_current_raw),
          ''
        )

      else null
    end;

  v_expected_value :=
    case p_field
      when 'email' then
        lower(
          nullif(
            btrim(
              p_expected_current_value
            ),
            ''
          )
        )

      when 'cpf' then
        nullif(
          regexp_replace(
            coalesce(
              p_expected_current_value,
              ''
            ),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'cnpj' then
        nullif(
          regexp_replace(
            coalesce(
              p_expected_current_value,
              ''
            ),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'cep' then
        nullif(
          regexp_replace(
            coalesce(
              p_expected_current_value,
              ''
            ),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'phone_mobile' then
        nullif(
          regexp_replace(
            coalesce(
              p_expected_current_value,
              ''
            ),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'profession' then
        nullif(
          regexp_replace(
            btrim(
              coalesce(
                p_expected_current_value,
                ''
              )
            ),
            '\s+',
            ' ',
            'g'
          ),
          ''
        )

      when 'birth_date' then
        nullif(
          btrim(
            p_expected_current_value
          ),
          ''
        )

      else null
    end;

  v_new_value :=
    case p_field
      when 'email' then
        lower(
          nullif(
            btrim(p_value),
            ''
          )
        )

      when 'cpf' then
        nullif(
          regexp_replace(
            coalesce(p_value, ''),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'cnpj' then
        nullif(
          regexp_replace(
            coalesce(p_value, ''),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'cep' then
        nullif(
          regexp_replace(
            coalesce(p_value, ''),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'phone_mobile' then
        nullif(
          regexp_replace(
            coalesce(p_value, ''),
            '\D',
            '',
            'g'
          ),
          ''
        )

      when 'profession' then
        nullif(
          regexp_replace(
            btrim(
              coalesce(
                p_value,
                ''
              )
            ),
            '\s+',
            ' ',
            'g'
          ),
          ''
        )

      when 'birth_date' then
        nullif(
          btrim(p_value),
          ''
        )

      else null
    end;

  if v_new_value is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_value',
      'error', 'Valor cadastral inválido.'
    );
  end if;

  if
    p_field = 'cpf'
    and length(v_new_value) <> 11
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_value',
      'error', 'CPF inválido.'
    );
  end if;

  if
    p_field = 'cnpj'
    and length(v_new_value) <> 14
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_value',
      'error', 'CNPJ inválido.'
    );
  end if;

  if
    p_field = 'cep'
    and length(v_new_value) <> 8
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_value',
      'error', 'CEP inválido.'
    );
  end if;

  if
    p_field = 'phone_mobile'
    and (
      length(v_new_value) < 10
      or length(v_new_value) > 13
    )
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_value',
      'error', 'Telefone adicional inválido.'
    );
  end if;

  if
    v_current_value
    is distinct from
    v_expected_value
  then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_current_value',
      'error', 'O cadastro mudou desde que a sugestão foi criada. Atualize o Companion antes de confirmar.'
    );
  end if;

  if
    v_current_value
    is not distinct from
    v_new_value
  then
    return jsonb_build_object(
      'ok', true,
      'code', 'already_applied',
      'already_applied', true
    );
  end if;

  if p_field = 'email' then
    if exists (
      select 1
      from public.leads other_lead
      where other_lead.company_id = p_company_id
        and other_lead.id <> p_lead_id
        and other_lead.email_norm = v_new_value
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'email_conflict',
        'error', 'Este e-mail já pertence a outro lead da empresa.'
      );
    end if;
  end if;

  if p_field in ('cpf', 'cnpj') then
    if exists (
      select 1
      from public.leads other_lead
      where other_lead.company_id = p_company_id
        and other_lead.id <> p_lead_id
        and regexp_replace(
          coalesce(
            other_lead.cpf_cnpj,
            ''
          ),
          '\D',
          '',
          'g'
        ) = v_new_value
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'document_conflict',
        'error', 'Este documento já pertence a outro lead da empresa.'
      );
    end if;

    if exists (
      select 1
      from public.lead_profiles other_profile
      where other_profile.company_id = p_company_id
        and other_profile.lead_id <> p_lead_id
        and (
          (
            p_field = 'cpf'
            and regexp_replace(
              coalesce(
                other_profile.cpf,
                ''
              ),
              '\D',
              '',
              'g'
            ) = v_new_value
          )
          or
          (
            p_field = 'cnpj'
            and regexp_replace(
              coalesce(
                other_profile.cnpj,
                ''
              ),
              '\D',
              '',
              'g'
            ) = v_new_value
          )
        )
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'document_conflict',
        'error', 'Este documento já pertence a outro lead da empresa.'
      );
    end if;
  end if;

  v_lead_type :=
    case
      when p_field = 'cnpj' then
        'PJ'

      when length(
        regexp_replace(
          coalesce(
            v_lead_document,
            ''
          ),
          '\D',
          '',
          'g'
        )
      ) = 14 then
        'PJ'

      else
        'PF'
    end;

  begin
    if v_profile_exists then
      if p_field = 'email' then
        update public.lead_profiles
        set email = v_new_value
        where lead_id = p_lead_id
          and company_id = p_company_id;

      elsif p_field = 'cpf' then
        update public.lead_profiles
        set
          lead_type = 'PF',
          cpf = v_new_value,
          cnpj = null
        where lead_id = p_lead_id
          and company_id = p_company_id;

      elsif p_field = 'cnpj' then
        update public.lead_profiles
        set
          lead_type = 'PJ',
          cnpj = v_new_value,
          cpf = null
        where lead_id = p_lead_id
          and company_id = p_company_id;

      elsif p_field = 'birth_date' then
        update public.lead_profiles
        set birth_date =
          v_new_value::date
        where lead_id = p_lead_id
          and company_id = p_company_id;

      elsif p_field = 'profession' then
        update public.lead_profiles
        set profession = v_new_value
        where lead_id = p_lead_id
          and company_id = p_company_id;

      elsif p_field = 'cep' then
        update public.lead_profiles
        set cep = v_new_value
        where lead_id = p_lead_id
          and company_id = p_company_id;

      elsif p_field = 'phone_mobile' then
        update public.lead_profiles
        set phone_mobile = v_new_value
        where lead_id = p_lead_id
          and company_id = p_company_id;
      end if;

    else
      insert into public.lead_profiles (
        lead_id,
        company_id,
        lead_type,
        cpf,
        cnpj,
        email,
        cep,
        birth_date,
        profession,
        phone_mobile
      )
      values (
        p_lead_id,
        p_company_id,
        v_lead_type,

        case
          when p_field = 'cpf'
          then v_new_value
          else null
        end,

        case
          when p_field = 'cnpj'
          then v_new_value
          else null
        end,

        case
          when p_field = 'email'
          then v_new_value
          else null
        end,

        case
          when p_field = 'cep'
          then v_new_value
          else null
        end,

        case
          when p_field = 'birth_date'
          then v_new_value::date
          else null
        end,

        case
          when p_field = 'profession'
          then v_new_value
          else null
        end,

        case
          when p_field = 'phone_mobile'
          then v_new_value
          else null
        end
      );
    end if;

    if p_field = 'email' then
      update public.leads
      set
        email = v_new_value,
        email_norm = v_new_value,
        updated_at = now()
      where id = p_lead_id
        and company_id = p_company_id;

    elsif p_field in ('cpf', 'cnpj') then
      update public.leads
      set
        cpf_cnpj = v_new_value,
        updated_at = now()
      where id = p_lead_id
        and company_id = p_company_id;
    end if;

    insert into public.cycle_events (
      company_id,
      cycle_id,
      event_type,
      created_by,
      occurred_at,
      metadata
    )
    values (
      p_company_id,
      p_cycle_id,
      'lead_enrichment_confirmed',
      p_user_id,
      now(),
      jsonb_build_object(
        'source',
        'whatsapp_companion',
        'confirmed_by_human',
        true,
        'field',
        p_field,
        'comparison',
        case
          when v_current_value is null
          then 'missing'
          else 'different'
        end,
        'evidence_message_ids',
        to_jsonb(
          p_evidence_message_ids
        )
      )
    );

  exception
    when unique_violation then
      return jsonb_build_object(
        'ok', false,
        'code',
        case
          when p_field = 'email'
          then 'email_conflict'
          else 'document_conflict'
        end,
        'error',
        case
          when p_field = 'email'
          then 'Este e-mail já pertence a outro lead da empresa.'
          else 'Este documento já pertence a outro lead da empresa.'
        end
      );
  end;

  return jsonb_build_object(
    'ok', true,
    'code', 'applied',
    'already_applied', false
  );
end;
$$;

revoke all
on function public.companion_apply_lead_enrichment(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text[],
  boolean
)
from public, anon, authenticated;

grant execute
on function public.companion_apply_lead_enrichment(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text[],
  boolean
)
to service_role;

comment on function public.companion_apply_lead_enrichment(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text[],
  boolean
)
is
  'Aplica enriquecimento cadastral confirmado pelo usuário do Companion com lock transacional e sem persistir PII no evento de auditoria.';
