-- Retroactively populate action_id in metadata for quick action events
-- that stored the action ID in event_type but never in metadata.action_id

UPDATE public.cycle_events
SET metadata = metadata || jsonb_build_object('action_id', event_type)
WHERE metadata->>'action_id' IS NULL
  AND event_type IN (
    -- Taxonomy IDs (Phase 2.1)
    'novo_abordagem_realizada', 'novo_ligacao_feita', 'novo_whatsapp_enviado',
    'novo_email_enviado', 'novo_telefone_incorreto',
    'contato_demonstrou_interesse', 'contato_pediu_informacoes',
    'contato_respondeu_duvida', 'contato_agendamento_realizado', 'contato_pediu_proposta',
    'respondeu_qualificacao_realizada', 'respondeu_proposta_apresentada',
    'respondeu_duvida_respondida', 'respondeu_visita_agendada', 'respondeu_negociacao_iniciada',
    'negociacao_proposta_final_enviada', 'negociacao_objecao_registrada',
    'negociacao_condicao_comercial', 'negociacao_fechamento_agendado', 'negociacao_retorno_negociacao',
    -- Legacy IDs
    'quick_approach_contact', 'quick_call_done', 'quick_whats_sent',
    'quick_email_sent', 'quick_bad_data', 'quick_showed_interest',
    'quick_asked_info', 'quick_answered_doubt', 'quick_scheduled',
    'quick_asked_proposal', 'quick_qualified', 'quick_proposal_presented',
    'quick_doubt_answered', 'quick_visit_scheduled', 'quick_negotiation_started',
    'quick_final_proposal_sent', 'quick_objection_registered',
    'quick_commercial_condition', 'quick_closing_scheduled', 'quick_proposal',
    'whatsapp', 'ligacao', 'sem_resposta'
  );
