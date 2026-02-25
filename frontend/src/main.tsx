import { StrictMode, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider, useToast } from './contexts/ToastContext'
import './i18n'
import './index.css'
import App from './App.tsx'

function AppProviders() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClientRef = useRef<QueryClient>(null);

  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        mutations: {
          onError: () => {
            addToast(t("common.error"), "error");
          },
        },
      },
    });
  }

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AppProviders />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
