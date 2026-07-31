# Fase 2 — contrato da configuração comercial versionada

## Estado

Contrato funcional aprovado em 2026-07-30 com:

```text
APROVADO MODELO FUNCIONAL FASE 2
```

Este documento define a fundação de dados da Fase 2. A migration permanece
versionada no repositório e não deve ser aplicada ao Supabase antes da revisão e
de uma autorização específica de integração e aplicação.

## Problema resolvido

O Companion V2 precisa conhecer a empresa antes de avaliar uma conversa. O
schema anterior possuía catálogo de produtos, pipelines e resultados de
análises, mas não possuía:

- contexto comercial oficial da empresa;
- método de venda e seus critérios;
- conhecimento comercial dos produtos;
- diretrizes para avaliar o vendedor;
- fatos oficiais utilizáveis pela inteligência;
- guias contextuais de objeções;
- versão exata do conhecimento utilizado em cada diagnóstico futuro.

Sem essa camada, o motor V2 seria genérico e poderia preencher lacunas por
inferência indevida.

## Princípios vinculantes

1. Método comercial e etapa do CRM são estruturas independentes.
2. `products` continua sendo o único catálogo operacional de produtos.
3. A empresa configura sua estratégia, mas não altera regras globais de
   segurança da Yolen.
4. A inteligência usa exclusivamente uma versão `published`.
5. Versões `published` e `archived` são imutáveis.
6. Qualquer alteração comercial exige um novo rascunho e uma nova versão.
7. Somente administrador ativo da própria empresa cria, edita, exclui rascunho,
   publica ou arquiva.
8. Membro ativo lê somente a versão publicada da própria empresa.
9. Ausência de configuração ou perfil não autoriza a inteligência a inventar.
10. Esta fase não altera o motor, a interface, a extensão ou o CRM.

## Estruturas

### `company_commercial_config_versions`

É a raiz versionada do conhecimento comercial.

| Campo | Significado |
|---|---|
| `company_id` | Empresa proprietária da configuração |
| `version_number` | Sequência monotônica gerada pelo banco por empresa |
| `contract_version` | Versão do contrato estrutural; inicialmente `phase-2-v1` |
| `status` | `draft`, `published` ou `archived` |
| `business_description` | O que a empresa faz e vende |
| `target_audience` | Público que a empresa atende |
| `value_proposition` | Valor que a empresa pode afirmar oficialmente |
| `commercial_method_name` | Nome do método adotado pela empresa |
| `commercial_method_description` | Lógica geral do método |
| `communication_tone` | Diretriz de comunicação esperada |
| `required_behaviors` | Condutas que o vendedor deve adotar |
| `prohibited_behaviors` | Condutas que a Yolen deve sinalizar |
| `created_by` | Administrador que iniciou a versão |
| `published_by` | Administrador que publicou |
| `archived_by` | Administrador que arquivou ou substituiu |
| datas de auditoria | Criação, atualização, publicação e arquivamento |

Regras:

- uma empresa possui no máximo um rascunho;
- uma empresa possui no máximo uma versão publicada;
- o número da versão é atribuído pelo banco;
- a versão nasce obrigatoriamente como `draft`;
- não existe retorno de `archived` para outro estado;
- rascunho pode ser excluído;
- versão publicada ou arquivada não pode ser excluída.

### `company_commercial_method_steps`

Representa as etapas ordenadas do método de venda.

Cada etapa possui:

- ordem;
- nome;
- objetivo;
- critérios de conclusão;
- perguntas recomendadas;
- indicação se a etapa é obrigatória.

As etapas não possuem vínculo automático com `pipeline_stages`. Exemplo válido:

```text
Método: Diagnosticar
CRM: Respondeu
```

O lead pode continuar na mesma coluna enquanto a conversa avança ou corrige uma
etapa do método.

### `company_commercial_product_profiles`

Acrescenta conhecimento comercial ao produto existente em `products`.

Cada perfil registra:

- públicos indicados;
- necessidades atendidas;
- benefícios;
- diferenciais comprováveis;
- limitações;
- condições contratuais;
- condições de pagamento;
- afirmações permitidas;
- afirmações proibidas.

O vínculo composto `(company_id, product_id)` impede que uma configuração use
produto de outra empresa.

Não existe um segundo cadastro de produtos. Nome, categoria, preço e status
continuam em `products`.

### `company_commercial_facts`

Armazena fatos oficiais que a inteligência pode utilizar.

Cada fato possui categoria, chave, valor, origem opcional e estado ativo. São
exemplos:

- horário de atendimento;
- área de cobertura;
- política de cancelamento;
- condição operacional aprovada;
- informação institucional verificável.

Fato ausente não pode ser preenchido por suposição.

### `company_commercial_objection_guides`

Define como compreender uma objeção, e não uma resposta decorada.

Cada guia possui:

- ordem;
- objeção;
- sinais que ajudam a reconhecê-la;
- perguntas de descoberta;
- abordagem recomendada;
- limites da resposta;
- estado ativo.

A Yolen deve utilizar o guia como orientação contextual. O guia não substitui a
análise da conversa nem autoriza afirmações que não existam na configuração.

## Fluxo de versão

```text
draft → published → archived
```

### Rascunho

- visível somente para administrador ativo da empresa;
- pode receber contexto, etapas, perfis, fatos e objeções;
- pode ser alterado ou excluído;
- não alimenta a inteligência.

### Publicação

A publicação ocorre em uma transação protegida por empresa.

Antes de publicar, o banco exige:

- contexto, público, proposta de valor, método e tom preenchidos;
- ao menos um comportamento obrigatório;
- ao menos um comportamento proibido;
- ao menos uma etapa do método;
- critérios de conclusão na etapa;
- perfil comercial para cada produto ativo existente naquele momento;
- necessidades e benefícios em cada perfil;
- ausência de itens vazios nas listas comerciais.

Ao publicar:

1. o banco serializa a operação por empresa;
2. a versão publicada anterior é arquivada;
3. o novo rascunho torna-se publicado;
4. autor e horário ficam registrados;
5. alterações futuras no conteúdo são bloqueadas.

### Arquivamento

- mantém todo o conteúdo para auditoria;
- fica visível apenas para administrador;
- não pode ser editado, reativado ou excluído;
- não alimenta novos diagnósticos.

## Ausência de conhecimento

O futuro motor deverá declarar limitações sem inventar.

| Situação | Limitação esperada |
|---|---|
| Empresa sem versão publicada | `method_not_configured` |
| Produto criado depois da versão publicada e ainda sem perfil | `product_information_missing` |
| Fato necessário não cadastrado | registrar informação ausente |
| Guia de objeção inexistente | analisar apenas pelas evidências da conversa |

Esses códigos pertencem ao contrato da inteligência. A Fase 2 apenas garante que
o conhecimento configurável exista e seja auditável.

## Segurança multiempresa

As cinco tabelas:

- possuem `company_id` obrigatório;
- usam RLS habilitado e forçado;
- negam todos os privilégios ao papel `anon`;
- recebem privilégios explícitos para `authenticated`;
- combinam privilégios SQL com políticas de linha;
- usam `company_memberships` como fonte de autorização;
- não usam `user_metadata` do JWT;
- não reconhecem administrador de outra empresa como administrador local;
- possuem chaves compostas contra vínculos entre empresas;
- possuem índices alinhados às consultas das políticas.

### Matriz de acesso

| Perfil | Rascunho | Publicada | Arquivada | Escrever |
|---|---:|---:|---:|---:|
| Administrador ativo da empresa | Sim | Sim | Sim | Somente rascunho e transições válidas |
| Gerente ativo da empresa | Não | Sim | Não | Não |
| Membro ativo da empresa | Não | Sim | Não | Não |
| Usuário de outra empresa | Não | Não | Não | Não |
| `anon` | Não | Não | Não | Não |
| Backend `service_role` | Conforme operação interna | Sim | Sim | Protegido também por constraints e triggers |

## Imutabilidade

A proteção não depende somente da futura interface.

Triggers de banco impedem:

- editar conteúdo publicado;
- editar conteúdo arquivado;
- inserir, editar ou excluir filhos de versão publicada ou arquivada;
- trocar empresa, identidade, número ou autoria de uma versão;
- relacionar filho com configuração de outra empresa;
- relacionar perfil com produto de outra empresa;
- voltar uma versão arquivada para publicação.

Mesmo uma operação interna com `service_role` continua sujeita às regras de
imutabilidade dos triggers.

## Compatibilidade com mudanças futuras

- A Fase 3 poderá criar a interface sobre essas tabelas sem alterar o contrato.
- O motor da Fase 5 registrará futuramente o `config_version_id` utilizado.
- Um produto criado depois de uma publicação exigirá novo rascunho para receber
  perfil.
- Mudanças de estratégia não reescrevem diagnósticos históricos.

## Aplicação e rollback

A migration deve ser aplicada somente depois da integração e de uma autorização
específica. O procedimento obrigatório será:

1. confirmar que o histórico remoto termina em `20260730170515`;
2. confirmar que as cinco tabelas ainda não existem;
3. aplicar `20260731000105` como uma única transação;
4. executar os advisors de segurança e desempenho;
5. validar tabelas, constraints, índices, triggers, grants e políticas;
6. testar isolamento e imutabilidade com dados sintéticos dentro de transação;
7. desfazer a transação dos dados sintéticos.

Se a migration falhar, a própria transação deve devolver o schema ao estado
anterior.

Se for necessário recuar logo depois da aplicação e antes de existir qualquer
configuração real, o rollback será uma nova migration revisada que remove, em
ordem inversa, políticas, triggers, tabelas, funções privadas e a constraint
composta adicionada a `products`.

Depois que existir versão publicada real, as tabelas não deverão ser apagadas.
O rollback operacional será manter o Companion em `v1`, impedir o uso da nova
tela e corrigir o schema por migration progressiva, preservando a auditoria.

## Validação técnica

O teste descartável da Fase 2 cobre:

- criação das cinco tabelas;
- RLS habilitado e forçado;
- grants explícitos e ausência de acesso `anon`;
- escrita exclusiva de administrador;
- leitura de rascunho apenas por administrador;
- leitura publicada por membro e gerente;
- isolamento entre empresas;
- FK composta de produto;
- uma versão rascunho e uma publicada por empresa;
- numeração automática;
- bloqueio de publicação incompleta;
- bloqueio quando produto ativo não possui perfil;
- arquivamento automático da versão anterior;
- imutabilidade de versão publicada e arquivada;
- imutabilidade dos registros filhos, inclusive via `service_role`.

Os dados do teste são sintéticos e o banco é descartado ao final. Nenhuma linha
de produção é copiada ou modificada.

## Fora do escopo

- tela de configuração;
- dados reais de qualquer empresa;
- prompt ou chamada de IA;
- motor de diagnóstico V2;
- alteração no Companion V1;
- rota de ingestão;
- extensão;
- mudança automática no CRM;
- aplicação da migration ao Supabase antes de nova autorização.
