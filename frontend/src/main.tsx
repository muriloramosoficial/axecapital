import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import AdminApp from './admin/AdminApp.tsx';

/** Rota simples: /admin abre o backoffice, qualquer outra coisa abre o escritório. */
const path = window.location.pathname.replace(/\/+$/, '');
const isAdmin = path === '/admin' || path.startsWith('/admin/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <App />}</StrictMode>,
);
