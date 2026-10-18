'use client';

// Supabase のクライアントと、黙って匿名ログインする仕組み（依頼10）。
//   - サイトを開いたら、まだログインしていなければ匿名ログインする（画面には何も出さない）
//   - 失敗したら「オフライン」。全体に見せたものは未ログインでも読めるので、見るだけはできる
//   - 匿名ユーザーは後でメール／Google に引き継げる（Supabase の linkIdentity / updateUser。今回は画面を作らない）
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabaseConfig';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export type AuthStatus = 'loading' | 'ready' | 'offline';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
}

let state: AuthState = { status: 'loading', userId: null };
const listeners = new Set<() => void>();
const SERVER_STATE: AuthState = { status: 'loading', userId: null };

function setState(next: AuthState) {
  if (next.status === state.status && next.userId === state.userId) return;
  state = next;
  listeners.forEach((l) => l());
}

let pending: Promise<string | null> | null = null;

/** ログイン済みの利用者 id を返す。まだなら黙って匿名ログインする。できなければ null（オフライン） */
export function ensureSession(): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (state.status === 'ready' && state.userId) return Promise.resolve(state.userId);
  if (pending) return pending;
  pending = (async () => {
    try {
      const sb = supabase();
      const { data } = await sb.auth.getSession();
      let id = data.session?.user.id ?? null;
      if (!id) {
        const res = await sb.auth.signInAnonymously();
        if (res.error) throw res.error;
        id = res.data.user?.id ?? null;
      }
      if (!id) throw new Error('no user');
      setState({ status: 'ready', userId: id });
      return id;
    } catch {
      setState({ status: 'offline', userId: null });
      return null;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** 今わかっている自分の id（まだならnull）。描画中に使うときは useAuth を使う */
export function myUserId(): string | null {
  return state.userId;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** ログインの状態（画面用）。匿名ログインは components/AuthBoot が開いたときに始める */
export function useAuth(): AuthState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

/** もう一度つなぐ（オフラインの表示から） */
export function retrySession(): Promise<string | null> {
  setState({ status: 'loading', userId: null });
  return ensureSession();
}
