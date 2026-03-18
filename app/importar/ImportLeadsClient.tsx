'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type ListRow = { id: string; name: string }

type ImportResult = {
  total_rows?: number
  valid_rows?: number
  created?: number
  updated?: number
  ignored?: number
  errors?: Array<{ row?: number; message?: string } | string>
  warnings?: Array<{ row?: number; message?: string } | string>
}

export default function ImportLeadsClient({
  lists,
  defaultListId,
}: {
  lists: ListRow[]
  defaultListId?: string | null
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string>('')

  const [listId, setListId] = useState('')
  const [newListName, setNewListName] = useState('')

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgType, setMsgType] = useState<'ok' | 'err' | null>(null)

  useEffect(() => {
    if (!defaultListId) return
    if (lists.some((l) => l.id === defaultListId)) setListId(defaultListId)
  }, [defaultListId, lists])

  const canImport = useMemo(() => {
    if (loading) return false
    if (!file) return false
    if (!listId && !newListName.trim()) return false
    return true
  }, [file, listId, newListName, loading])

  const pickFile = () => fileRef.current?.click()

  const clearFile = () => {
    setFile(null)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const importar = async () => {
    setMsg(null)
    setMsgType(null)
    setResult(null)

    if (!file) {
      setMsgType('err')
      setMsg('Selecione um arquivo .xlsx')
      return
    }
    if (!listId && !newListName.trim()) {
      setMsgType('err')
      setMsg('Selecione uma lista/carteira ou crie uma nova.')
      return
    }

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)

      if (listId) fd.append('list_id', listId)
      if (newListName.trim()) fd.append('new_list_name', newListName.trim())

      const res = await fetch('/api/import/leads', { method: 'POST', body: fd })
      const json = (await res.json()) as any

      if (!res.ok) {
        setMsgType('err')
        setMsg(json?.error ?? 'Erro ao importar')
        return
      }

      setResult(json as ImportResult)
      setMsgType('ok')
      setMsg('Importação concluída.')
    } catch (e: any) {
      setMsgType('err')
      setMsg(e?.message ?? 'Erro ao importar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        padding: 16,
        border: '1px solid #333',
        borderRadius: 12,
        background: '#0f0f0f',
        color: 'white',
      }}
    >
      {/* File input hidden */}
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          setFile(f)
          setFileName(f?.name ?? '')
          setResult(null)
          setMsg(null)
          setMsgType(null)
        }}
      />

      <div style={{ display: 'grid', gap: 12 }}>
        {/* Linha 1: arquivo */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={pickFile}
            disabled={loading}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #333',
              background: '#111',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Procurar…
          </button>

          {!fileName ? (
            <span style={{ fontSize: 12, opacity: 0.75 }}>Nenhum arquivo selecionado</span>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, opacity: 0.85 }}>{fileName}</span>
              <button
                type="button"
                onClick={clearFile}
                disabled={loading}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: '1px solid #333',
                  background: 'transparent',
                  color: '#9aa',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                Remover
              </button>
            </div>
          )}

          {loading ? <span style={{ fontSize: 12, opacity: 0.8 }}>Processando…</span> : null}
        </div>

        {/* Linha 2: lista/carteira */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            style={{
              minWidth: 320,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #333',
              background: '#111',
              color: 'white',
            }}
            disabled={loading}
          >
            <option value="">Selecionar lista/carteira…</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>

          <span style={{ opacity: 0.6, fontSize: 12 }}>ou</span>

          <input
            placeholder="Criar nova lista/carteira (nome)"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            style={{
              flex: 1,
              minWidth: 260,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #333',
              background: '#111',
              color: 'white',
            }}
            disabled={loading}
          />
        </div>

        {/* Mensagem */}
        {msg ? (
          <div
            style={{
              padding: 10,
              borderRadius: 12,
              border: '1px solid #333',
              background: '#111',
              color: msgType === 'err' ? '#fca5a5' : '#86efac',
              fontSize: 13,
            }}
          >
            {msg}
          </div>
        ) : null}

        {/* CTA */}
        <button
          onClick={importar}
          disabled={!canImport}
          style={{
            width: 220,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #333',
            background: canImport ? '#111' : '#1a1a1a',
            color: canImport ? 'white' : '#777',
            cursor: canImport ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? 'Importando…' : 'Importar'}
        </button>

        {/* Resultado */}
        {result ? (
          <div
            style={{
              marginTop: 6,
              padding: 12,
              border: '1px solid #222',
              borderRadius: 12,
              background: '#111',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.95 }}>
              Total: <b>{result.total_rows ?? '-'}</b> • Válidas: <b>{result.valid_rows ?? '-'}</b> • Criados:{' '}
              <b>{result.created ?? '-'}</b> • Atualizados: <b>{result.updated ?? '-'}</b>
              {typeof result.ignored === 'number' ? (
                <>
                  {' '}
                  • Ignorados: <b>{result.ignored}</b>
                </>
              ) : null}
            </div>

            {result.errors?.length ? (
              <div style={{ border: '1px solid #333', borderRadius: 12, padding: 10 }}>
                <div style={{ color: '#fca5a5', fontSize: 13, marginBottom: 6 }}>
                  Erros: <b>{result.errors.length}</b>
                </div>

                <div style={{ maxHeight: 160, overflow: 'auto', fontSize: 12, opacity: 0.9 }}>
                  {result.errors.slice(0, 50).map((e, idx) => {
                    const text =
                      typeof e === 'string' ? e : `Linha ${e.row ?? '?'}: ${e.message ?? 'Erro'}`
                    return (
                      <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid #222' }}>
                        {text}
                      </div>
                    )
                  })}
                  {result.errors.length > 50 ? (
                    <div style={{ paddingTop: 8, opacity: 0.7 }}>
                      Mostrando 50 de {result.errors.length}.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {result.warnings?.length ? (
              <div style={{ border: '1px solid #333', borderRadius: 12, padding: 10 }}>
                <div style={{ color: '#fde68a', fontSize: 13, marginBottom: 6 }}>
                  Avisos: <b>{result.warnings.length}</b>
                </div>

                <div style={{ maxHeight: 140, overflow: 'auto', fontSize: 12, opacity: 0.9 }}>
                  {result.warnings.slice(0, 50).map((w, idx) => {
                    const text =
                      typeof w === 'string' ? w : `Linha ${w.row ?? '?'}: ${w.message ?? 'Aviso'}`
                    return (
                      <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid #222' }}>
                        {text}
                      </div>
                    )
                  })}
                  {result.warnings.length > 50 ? (
                    <div style={{ paddingTop: 8, opacity: 0.7 }}>
                      Mostrando 50 de {result.warnings.length}.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
