import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : (null as any);

// Database Types (Simplified)
export interface Task {
  id: string;
  phase: number;
  title: string;
  date_label: string;
  detail: string;
  type: string;
  tool: string;
  assignee: string | null;
  is_done: boolean;
  is_custom: boolean;
  created_at?: string;
}

export interface Gasto {
  id: string;
  concepto: string;
  importe: number;
  cat: string;
  tipo: string;
  fecha: string;
  pagador: string;
  created_at?: string;
}

export interface MRRSnapshot {
  id: string;
  date: string;
  mrr: number;
  subs: number;
}

export interface Config {
  key: string;
  value: any;
}
