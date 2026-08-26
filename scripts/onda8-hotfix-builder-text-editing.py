from pathlib import Path


def replace_exact(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    file.write_text(text.replace(old, new, 1))


Path('app/lib/commercial-config/text-editing.ts').write_text("""export function editingTextToLines(value: string): string[] {
  return value.split('\\n')
}

export function editingLinesToText(value: readonly string[]): string {
  return value.join('\\n')
}

export function normalizeTextListsForPersistence<T>(value: T): T {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return value
        .map((item) => item.trim())
        .filter((item) => item.length > 0) as T
    }

    return value.map((item) => normalizeTextListsForPersistence(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeTextListsForPersistence(item),
      ]),
    ) as T
  }

  return value
}

export function isLatestEditRevision(
  saveRevision: number,
  currentRevision: number,
): boolean {
  return saveRevision === currentRevision
}
""")

Path('app/admin/configuracao-comercial/EditableLinesTextarea.tsx').write_text("""'use client'

import * as React from 'react'

import {
  editingLinesToText,
  editingTextToLines,
} from '@/app/lib/commercial-config/text-editing'

type Props = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange'
> & {
  value: string[]
  onChange: (value: string[]) => void
}

export default function EditableLinesTextarea({
  value,
  onChange,
  ...props
}: Props) {
  return (
    <textarea
      {...props}
      value={editingLinesToText(value)}
      onChange={(event) => onChange(editingTextToLines(event.currentTarget.value))}
    />
  )
}
""")

builder = 'app/admin/configuracao-comercial/CommercialMethodBuilder.tsx'
replace_exact(
    builder,
    "import * as React from 'react'\n\nimport {\n",
    "import * as React from 'react'\n\nimport EditableLinesTextarea from './EditableLinesTextarea'\nimport {\n  isLatestEditRevision,\n  normalizeTextListsForPersistence,\n} from '@/app/lib/commercial-config/text-editing'\n\nimport {\n",
)
replace_exact(
    builder,
    "function linesToArray(value: string): string[] {\n  return value\n    .split('\\n')\n    .map((item) => item.trim())\n    .filter(Boolean)\n}\n\nfunction arrayToLines(value: string[]): string {\n  return value.join('\\n')\n}\n\n",
    "",
)
replace_exact(
    builder,
    "      <textarea\n        rows={rows}\n        value={arrayToLines(value)}\n        onChange={(event) => onChange(linesToArray(event.target.value))}\n        style={{ ...inputStyle, resize: 'vertical' }}\n        placeholder=\"Uma resposta por linha\"\n      />",
    "      <EditableLinesTextarea\n        rows={rows}\n        value={value}\n        onChange={onChange}\n        style={{ ...inputStyle, resize: 'vertical' }}\n        placeholder=\"Uma resposta por linha\"\n      />",
)
replace_exact(
    builder,
    "  const [savedAt, setSavedAt] = React.useState<string | null>(null)\n",
    "  const [savedAt, setSavedAt] = React.useState<string | null>(null)\n  const editRevisionRef = React.useRef(0)\n",
)
replace_exact(
    builder,
    "  const updateData = React.useCallback(\n    (updater: (data: CommercialMethodBuilderData) => CommercialMethodBuilderData) => {\n      setDraft((current) => ({",
    "  const updateData = React.useCallback(\n    (updater: (data: CommercialMethodBuilderData) => CommercialMethodBuilderData) => {\n      editRevisionRef.current += 1\n      setDraft((current) => ({",
)
replace_exact(
    builder,
    "      const payload = nextDraft ?? draft\n      setSaving(true)",
    "      const saveRevision = editRevisionRef.current\n      const payload = normalizeTextListsForPersistence(nextDraft ?? draft)\n      setSaving(true)",
)
replace_exact(
    builder,
    "        setDraft({\n          current_step: json.draft.current_step,\n          completed_steps: json.draft.completed_steps,\n          ready_for_method: json.draft.ready_for_method,\n          data: json.draft.data,\n        })\n        setDirty(false)\n        setSavedAt(json.draft.updated_at)",
    "        if (isLatestEditRevision(saveRevision, editRevisionRef.current)) {\n          setDirty(false)\n          setSavedAt(json.draft.updated_at)\n        }",
)
replace_exact(
    builder,
    "    setDraft(nextDraft)\n    setDirty(true)\n    setIssues([])\n    await saveDraft(nextDraft)\n  }\n\n  async function goBackStep()",
    "    editRevisionRef.current += 1\n    setDraft(nextDraft)\n    setDirty(true)\n    setIssues([])\n    await saveDraft(nextDraft)\n  }\n\n  async function goBackStep()",
)
replace_exact(
    builder,
    "    setDraft(nextDraft)\n    setDirty(true)\n    setIssues([])\n    await saveDraft(nextDraft)\n  }\n\n  async function markReady()",
    "    editRevisionRef.current += 1\n    setDraft(nextDraft)\n    setDirty(true)\n    setIssues([])\n    await saveDraft(nextDraft)\n  }\n\n  async function markReady()",
)
replace_exact(
    builder,
    "    setDraft(nextDraft)\n    setDirty(true)\n    await saveDraft(nextDraft)\n  }\n\n  if (loading)",
    "    editRevisionRef.current += 1\n    setDraft(nextDraft)\n    setDirty(true)\n    await saveDraft(nextDraft)\n  }\n\n  if (loading)",
)
replace_exact(
    builder,
    "                  onClick={() => {\n                    setDraft((current) => ({ ...current, current_step: block.step, ready_for_method: false }))\n                    setDirty(true)\n                  }}",
    "                  onClick={() => {\n                    editRevisionRef.current += 1\n                    setDraft((current) => ({ ...current, current_step: block.step, ready_for_method: false }))\n                    setDirty(true)\n                  }}",
)
replace_exact(
    builder,
    "          {saving\n            ? 'Salvando...'\n            : savedAt\n              ? `Rascunho salvo ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(savedAt))}`\n              : 'Rascunho ainda não salvo'}",
    "          {saving\n            ? 'Salvando...'\n            : dirty\n              ? 'Alterações serão salvas automaticamente'\n              : savedAt\n                ? `Rascunho salvo ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(savedAt))}`\n                : 'Rascunho ainda não salvo'}",
)

buyer = 'app/admin/configuracao-comercial/BuyerDecisionArchitecture.tsx'
replace_exact(
    buyer,
    "import * as React from 'react'\n\nimport {\n",
    "import * as React from 'react'\n\nimport EditableLinesTextarea from './EditableLinesTextarea'\n\nimport {\n",
)
replace_exact(
    buyer,
    "function cleanLines(value: string): string[] {\n  return value\n    .split('\\n')\n    .map((item) => item.trim())\n    .filter(Boolean)\n}\n\n",
    "",
)
replace_exact(
    buyer,
    "    <textarea\n      rows={rows}\n      value={value.join('\\n')}\n      onChange={(event) => onChange(cleanLines(event.target.value))}\n      placeholder={placeholder}\n      style={{ ...inputStyle, resize: 'vertical' }}\n    />",
    "    <EditableLinesTextarea\n      rows={rows}\n      value={value}\n      onChange={onChange}\n      placeholder={placeholder}\n      style={{ ...inputStyle, resize: 'vertical' }}\n    />",
)

assisted = 'app/admin/configuracao-comercial/AssistedMethodConstruction.tsx'
replace_exact(
    assisted,
    "import * as React from 'react'\n\nimport BuyerDecisionArchitecture",
    "import * as React from 'react'\n\nimport EditableLinesTextarea from './EditableLinesTextarea'\nimport BuyerDecisionArchitecture",
)
replace_exact(
    assisted,
    "import {\n  appendConstructionStage,",
    "import {\n  isLatestEditRevision,\n  normalizeTextListsForPersistence,\n} from '@/app/lib/commercial-config/text-editing'\nimport {\n  appendConstructionStage,",
)
replace_exact(
    assisted,
    "function cleanLines(value: string): string[] {\n  return value\n    .split('\\n')\n    .map((item) => item.trim())\n    .filter(Boolean)\n}\n\n",
    "",
)
replace_exact(
    assisted,
    "      <textarea\n        rows={4}\n        value={value.join('\\n')}\n        onChange={(event) => onChange(cleanLines(event.target.value))}\n        placeholder=\"Um item por linha\"\n        style={{ ...inputStyle, resize: 'vertical' }}\n      />",
    "      <EditableLinesTextarea\n        rows={4}\n        value={value}\n        onChange={onChange}\n        placeholder=\"Um item por linha\"\n        style={{ ...inputStyle, resize: 'vertical' }}\n      />",
)
replace_exact(
    assisted,
    "  const [serverIssues, setServerIssues] = React.useState<string[]>([])\n",
    "  const [serverIssues, setServerIssues] = React.useState<string[]>([])\n  const editRevisionRef = React.useRef(0)\n",
)
replace_exact(
    assisted,
    "  ) => {\n    setSaving(true)\n    setError(null)",
    "  ) => {\n    const saveRevision = editRevisionRef.current\n    const persistedDraft = normalizeTextListsForPersistence(nextDraft)\n    setSaving(true)\n    setError(null)",
)
replace_exact(
    assisted,
    "        body: JSON.stringify({ status: nextStatus, construction: nextDraft }),",
    "        body: JSON.stringify({ status: nextStatus, construction: persistedDraft }),",
)
replace_exact(
    assisted,
    "      setWorkspace(json.construction)\n      setDraft(json.construction?.construction ?? nextDraft)\n      setStatus(json.construction?.status ?? nextStatus)\n      setDirty(false)",
    "      if (isLatestEditRevision(saveRevision, editRevisionRef.current)) {\n        setWorkspace(json.construction)\n        setStatus(json.construction?.status ?? nextStatus)\n        setDirty(false)\n      }",
)
replace_exact(
    assisted,
    "  function updateDraft(updater: (current: CommercialMethodConstructionDraft) => CommercialMethodConstructionDraft) {\n    setDraft((current) => current ? updater(current) : current)",
    "  function updateDraft(updater: (current: CommercialMethodConstructionDraft) => CommercialMethodConstructionDraft) {\n    editRevisionRef.current += 1\n    setDraft((current) => current ? updater(current) : current)",
)

Path('app/admin/configuracao-comercial/commercial-method-builder-text-editing.test.mjs').write_text("""import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { JSDOM } from 'jsdom'

import {
  editingLinesToText,
  editingTextToLines,
  isLatestEditRevision,
  normalizeTextListsForPersistence,
} from '@/app/lib/commercial-config/text-editing'

const REQUIRED_SENTENCES = [
  'Acesso livre à musculação',
  'Aulas coletivas incluídas no plano',
  'O cliente quer emagrecer e melhorar sua qualidade de vida.',
  'Preço mensal de R$ 149,90 no cartão.',
  'Até 10% de desconto sem aprovação do gestor.',
  'O cliente confirmou que deseja contratar o Plano Start Anual.',
  'Quando ainda faltar informação que possa mudar a recomendação.',
]

test('editingTextToLines preserves spaces, accents, punctuation and trailing whitespace while typing', () => {
  for (const sentence of REQUIRED_SENTENCES) {
    assert.equal(editingLinesToText(editingTextToLines(sentence)), sentence)
  }

  assert.deepEqual(editingTextToLines('Acesso '), ['Acesso '])
  assert.equal(editingLinesToText(editingTextToLines('Acesso  ')), 'Acesso  ')
})

test('multiline list preserves internal spaces and Enter while editing', () => {
  const text = [
    'Acesso livre à musculação',
    'Aulas coletivas incluídas',
    'Avaliação física inicial',
    'Atendimento de segunda a sábado',
  ].join('\\n')

  assert.deepEqual(editingTextToLines(text), [
    'Acesso livre à musculação',
    'Aulas coletivas incluídas',
    'Avaliação física inicial',
    'Atendimento de segunda a sábado',
  ])
  assert.equal(editingLinesToText(editingTextToLines(`${text}\\n`)), `${text}\\n`)
})

test('persistence normalization trims only the save snapshot and keeps each line as one item', () => {
  const editing = {
    benefits: editingTextToLines(
      'Acesso livre à musculação  \\nAulas coletivas incluídas\\n\\nAvaliação física inicial',
    ),
    nested: {
      notes: editingTextToLines('Preço mensal de R$ 149,90 no cartão.  '),
    },
  }

  const persisted = normalizeTextListsForPersistence(editing)

  assert.deepEqual(persisted.benefits, [
    'Acesso livre à musculação',
    'Aulas coletivas incluídas',
    'Avaliação física inicial',
  ])
  assert.deepEqual(persisted.nested.notes, ['Preço mensal de R$ 149,90 no cartão.'])
  assert.equal(editing.benefits[0], 'Acesso livre à musculação  ')
})

test('latest local edit wins over a stale autosave response', () => {
  let revision = 0
  let localText = ''
  let dirty = false

  const edit = (text) => {
    revision += 1
    localText = text
    dirty = true
  }

  edit('Acesso ')
  const saveRevision = revision
  const staleServerText = 'Acesso'

  edit('Acesso livre à musculação')

  if (isLatestEditRevision(saveRevision, revision)) {
    localText = staleServerText
    dirty = false
  }

  assert.equal(localText, 'Acesso livre à musculação')
  assert.equal(dirty, true)
  assert.equal(isLatestEditRevision(saveRevision, revision), false)
})

test('production components share lossless textarea editing and do not intercept keyboard events', async () => {
  const files = await Promise.all([
    readFile('app/admin/configuracao-comercial/CommercialMethodBuilder.tsx', 'utf8'),
    readFile('app/admin/configuracao-comercial/BuyerDecisionArchitecture.tsx', 'utf8'),
    readFile('app/admin/configuracao-comercial/AssistedMethodConstruction.tsx', 'utf8'),
  ])
  const combined = files.join('\\n')

  for (const source of files) assert.match(source, /EditableLinesTextarea/)
  assert.doesNotMatch(combined, /function (?:cleanLines|linesToArray)/)
  assert.doesNotMatch(combined, /preventDefault|onKeyDown|onKeyUp|onKeyPress/)
  assert.match(files[0], /isLatestEditRevision/)
  assert.match(files[2], /isLatestEditRevision/)
  assert.doesNotMatch(files[0], /setDraft\(\{\s*current_step:\s*json\.draft/s)
  assert.doesNotMatch(files[2], /setDraft\(json\.construction\?\.construction/)
})

test('DOM textarea accepts natural typing, trailing space, paste, Enter and middle edits without losing focus', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
  })

  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.navigator = dom.window.navigator
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement
  globalThis.Event = dom.window.Event
  globalThis.KeyboardEvent = dom.window.KeyboardEvent
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { default: EditableLinesTextarea } = await import('./EditableLinesTextarea.tsx')
  const { act } = React

  function Harness() {
    const [value, setValue] = React.useState([])
    return React.createElement(EditableLinesTextarea, {
      value,
      onChange: setValue,
      'aria-label': 'editor',
    })
  }

  const container = document.getElementById('root')
  const root = createRoot(container)
  await act(async () => root.render(React.createElement(Harness)))
  const textarea = document.querySelector('textarea')
  const nativeSetter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLTextAreaElement.prototype,
    'value',
  ).set

  async function input(nextValue, selection = nextValue.length) {
    await act(async () => {
      nativeSetter.call(textarea, nextValue)
      textarea.setSelectionRange(selection, selection)
      textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }

  async function type(text) {
    for (const character of text) {
      await input(`${textarea.value}${character}`)
    }
  }

  textarea.focus()
  await type('Acesso ')
  assert.equal(textarea.value, 'Acesso ')
  assert.equal(document.activeElement, textarea)

  await type('livre à musculação')
  assert.equal(textarea.value, 'Acesso livre à musculação')
  assert.equal(document.activeElement, textarea)

  for (const key of [' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace', 'Delete', 'Enter', 'Tab']) {
    const event = new dom.window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    })
    textarea.dispatchEvent(event)
    assert.equal(event.defaultPrevented, false, `${key} must not be intercepted`)
  }

  for (const combo of [
    { key: 'a', metaKey: true },
    { key: 'c', metaKey: true },
    { key: 'v', metaKey: true },
    { key: 'x', metaKey: true },
    { key: 'a', ctrlKey: true },
    { key: 'v', ctrlKey: true },
    { key: 'ArrowLeft', shiftKey: true },
  ]) {
    const event = new dom.window.KeyboardEvent('keydown', {
      ...combo,
      bubbles: true,
      cancelable: true,
    })
    textarea.dispatchEvent(event)
    assert.equal(event.defaultPrevented, false, `${combo.key} shortcut must not be intercepted`)
  }

  const pasteEvent = new dom.window.Event('paste', { bubbles: true, cancelable: true })
  textarea.dispatchEvent(pasteEvent)
  assert.equal(pasteEvent.defaultPrevented, false)

  const pasted = 'Musculação livre\\nAulas coletivas\\nAvaliação física'
  await input(pasted)
  assert.equal(textarea.value, pasted)

  await input('Acesso musculação', 7)
  const inserted = 'livre à '
  const middle = `Acesso ${inserted}musculação`
  await input(middle, 7 + inserted.length)
  assert.equal(textarea.value, 'Acesso livre à musculação')
  assert.equal(textarea.selectionStart, 7 + inserted.length)
  assert.equal(document.activeElement, textarea)

  await input('Linha um\\nLinha dois')
  assert.equal(textarea.value, 'Linha um\\nLinha dois')

  await act(async () => root.unmount())
  dom.window.close()
})
""")

print('Hotfix patch generated successfully.')
