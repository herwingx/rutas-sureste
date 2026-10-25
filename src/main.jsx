import { StrictMode, Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[App Crash caught by ErrorBoundary]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#090d16',
            color: '#f8fafc',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <img
            src="/logo-app.png"
            alt="Tiendas Neto"
            style={{ width: 64, height: 64, borderRadius: 16, background: '#fff', padding: 4, marginBottom: 16 }}
          />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>Rutas Sureste · Tiendas Neto</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', maxWidth: 360, margin: '0 0 20px 0' }}>
            Hubo una actualización en la plataforma. Pulsa el botón para cargar la versión más reciente.
          </p>
          <button
            onClick={() => {
              if (window.caches) {
                caches.keys().then((names) => {
                  for (let name of names) caches.delete(name);
                });
              }
              window.location.reload();
            }}
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              padding: '10px 24px',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            }}
          >
            Actualizar Plataforma
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

