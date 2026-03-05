export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
      <div style={{ width: '100%', padding: 40, color: 'white' }}>
        <h1 style={{ textAlign: 'center', marginBottom: 8 }}>Pipeline Comercial</h1>
  
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            marginTop: 10,
            marginBottom: 30,
          }}
        >
          <a href="/leads" style={btnStyleActive}>Pipeline</a>
          <a href="/prioridade" style={btnStyle}>Prioridade</a>
          <a href="/relatorios" style={btnStyle}>Relatórios</a>
        </div>
  
        {children}
      </div>
    )
  }
  
  const btnStyle: React.CSSProperties = {
    color: '#9aa',
    textDecoration: 'none',
    fontSize: 13,
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #333',
    background: 'transparent',
  }
  
  const btnStyleActive: React.CSSProperties = {
    ...btnStyle,
    color: 'white',
    background: '#111',
  }
  