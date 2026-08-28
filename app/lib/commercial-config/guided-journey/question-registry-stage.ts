/**
 * Registro de perguntas — Capítulo 5 (construção guiada de cada etapa,
 * E01-E15). Opera sobre `CommercialMethodConstructionStageDraft`, a mesma
 * estrutura já usada pela Construção Assistida (Fase 2). Isso preserva o
 * editor completo existente (todos os campos em uma tela) como alternativa
 * avançada — este registro apenas oferece um caminho de "uma decisão por
 * vez" sobre os mesmos campos.
 */

import type { GuidedQuestion } from './types'
import type {
  CommercialMethodConstructionStageDraft,
} from '@/app/types/commercial-method-construction'

type Stage = CommercialMethodConstructionStageDraft

export const STAGE_QUESTIONS: GuidedQuestion<Stage>[] = [
  {
    id: 'E01',
    chapterId: 'method',
    title: 'Como sua equipe deveria chamar esse momento?',
    answerType: 'short_text',
    getValue: (stage) => stage.name,
    setValue: (stage, value) => ({ ...stage, name: value as string }),
    writesTo: 'stage.name',
  },
  {
    id: 'E02',
    chapterId: 'method',
    title: 'Por que essa etapa existe?',
    helper: 'Explique o papel dessa etapa no processo comercial como um todo.',
    answerType: 'long_text',
    getValue: (stage) => stage.purpose ?? '',
    setValue: (stage, value) => ({ ...stage, purpose: value as string }),
    writesTo: 'stage.purpose',
  },
  {
    id: 'E03_E04',
    chapterId: 'method',
    title: 'O que o vendedor precisa entender, confirmar ou conseguir quando essa etapa terminar?',
    helper: 'Descreva o resultado comercial ou entendimento necessário, não apenas uma atividade.',
    example: 'Fraco: Entender o cliente. Melhor: Entender o motivo principal do contato e o que o cliente espera resolver.',
    answerType: 'long_text',
    getValue: (stage) => stage.objective,
    setValue: (stage, value) => ({ ...stage, objective: value as string }),
    writesTo: 'stage.objective',
  },
  {
    id: 'E05',
    chapterId: 'method',
    title: 'Que fato observável prova que essa etapa foi concluída?',
    helper: 'Prefira algo que o comprador confirmou, validou, aceitou ou combinou.',
    example: 'O cliente confirmou que o requisito necessário foi atendido.',
    answerType: 'multiline_list',
    getValue: (stage) => stage.completion_criteria,
    setValue: (stage, value) => ({ ...stage, completion_criteria: value as string[] }),
    writesTo: 'stage.completion_criteria',
  },
  {
    id: 'E06',
    chapterId: 'method',
    title: 'Existe algum sinal de progresso que ainda não é suficiente para avançar?',
    answerType: 'multiline_list',
    getValue: (stage) => stage.partial_completion_criteria,
    setValue: (stage, value) => ({ ...stage, partial_completion_criteria: value as string[] }),
    writesTo: 'stage.partial_completion_criteria',
  },
  {
    id: 'E07',
    chapterId: 'method',
    title: 'Quando vale aprofundar antes de continuar?',
    answerType: 'multiline_list',
    getValue: (stage) => stage.deepen_when,
    setValue: (stage, value) => ({ ...stage, deepen_when: value as string[] }),
    writesTo: 'stage.deepen_when',
  },
  {
    id: 'E08',
    chapterId: 'method',
    title: 'Quando o vendedor já sabe o suficiente?',
    helper: 'Isso ajuda a impedir interrogatórios e perguntas sem utilidade.',
    answerType: 'multiline_list',
    getValue: (stage) => stage.sufficient_when,
    setValue: (stage, value) => ({ ...stage, sufficient_when: value as string[] }),
    writesTo: 'stage.sufficient_when',
  },
  {
    id: 'E09',
    chapterId: 'method',
    title: 'O que precisa acontecer para avançar?',
    helper: 'Atividade do vendedor não prova avanço. Use evidência do comprador sempre que a etapa depender de uma decisão dele.',
    answerType: 'multiline_list',
    getValue: (stage) => stage.advance_when,
    setValue: (stage, value) => ({ ...stage, advance_when: value as string[] }),
    writesTo: 'stage.advance_when',
  },
  {
    id: 'E10',
    chapterId: 'method',
    title: 'Existe alguma situação em que o vendedor deve esperar, sem avançar nem insistir?',
    answerType: 'multiline_list',
    getValue: (stage) => stage.wait_when,
    setValue: (stage, value) => ({ ...stage, wait_when: value as string[] }),
    writesTo: 'stage.wait_when',
  },
  {
    id: 'E11',
    chapterId: 'method',
    title: 'Quando continuar perguntando só atrapalharia?',
    helper: 'Aprofundar é investigar quando falta algo relevante. Continuar perguntando sem necessidade é repetir ou buscar detalhe que não muda a decisão.',
    answerType: 'multiline_list',
    getValue: (stage) => stage.stop_asking_when,
    setValue: (stage, value) => ({ ...stage, stop_asking_when: value as string[] }),
    writesTo: 'stage.stop_asking_when',
  },
  {
    id: 'E12',
    chapterId: 'method',
    title: 'Que perguntas podem ajudar o vendedor nesta etapa?',
    helper: 'São referências, nunca um script obrigatório.',
    answerType: 'multiline_list',
    getValue: (stage) => stage.recommended_questions,
    setValue: (stage, value) => ({ ...stage, recommended_questions: value as string[] }),
    writesTo: 'stage.recommended_questions',
  },
  {
    id: 'E13',
    chapterId: 'method',
    title: 'Quais erros sua equipe precisa evitar aqui?',
    answerType: 'multiline_list',
    getValue: (stage) => stage.common_mistakes,
    setValue: (stage, value) => ({ ...stage, common_mistakes: value as string[] }),
    writesTo: 'stage.common_mistakes',
  },
  {
    id: 'E14',
    chapterId: 'method',
    title: 'Essa etapa acontece em toda venda?',
    answerType: 'single_choice',
    options: [
      { value: 'required', label: 'Obrigatória' },
      { value: 'conditional', label: 'Condicional' },
      { value: 'optional', label: 'Opcional' },
    ],
    getValue: (stage) => stage.requirement,
    setValue: (stage, value) => ({ ...stage, requirement: value as Stage['requirement'] }),
    writesTo: 'stage.requirement',
  },
  {
    id: 'E15',
    chapterId: 'method',
    title: 'Existe alguma situação em que ela deve ser pulada?',
    answerType: 'multiline_list',
    showWhen: (stage) => stage.requirement !== 'required',
    getValue: (stage) => stage.skip_conditions,
    setValue: (stage, value) => ({ ...stage, skip_conditions: value as string[] }),
    writesTo: 'stage.skip_conditions',
  },
]
