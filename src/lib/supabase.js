/**
 * @fileoverview Cliente oficial de Supabase para Rutas Sureste en el Frontend.
 * Conectado directamente al proyecto de Supabase (`developer`, ref `dldttdqpcpdtribtgzsa`)
 * y configurado con el schema aislado `rutas_sureste`.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://dldttdqpcpdtribtgzsa.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsZHR0ZHFwY3BkdHJpYnRnenNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4Njg3OTYsImV4cCI6MjA4OTQ0NDc5Nn0.ItMe0uFz0f4EOmyHS8DhN8eYoWfpaU-BbNsCPndDK2Y';
const SUPABASE_SCHEMA = import.meta.env.VITE_SUPABASE_SCHEMA || 'rutas_sureste';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: SUPABASE_SCHEMA,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Valida si un correo electrónico pertenece al dominio oficial `@soyneto.com`.
 * @param {string} email
 * @returns {boolean}
 */
export function esCorreoSoyNeto(email) {
  if (!email || typeof email !== 'string') return false;
  return email.trim().toLowerCase().endsWith('@soyneto.com');
}

