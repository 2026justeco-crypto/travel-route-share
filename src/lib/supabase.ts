'use client';

// Supabase のクライアントと、黙って匿名ログインする仕組み（依頼10）。
//   - サイトを開いたら、まだログインしていなければ匿名ログインする（画面には何も出さない）
//   - 失敗したら「オフライン」。全体に見せたものは未ログインでも読めるので、見るだけはできる
//   - 匿名ユーザーは後でメール／Google に引き継げる（Supabase の linkIdentity / updateUser。今回は画面を作らない）
//   - 端末に残ったセッションの利用者がサーバーで消されていたら（user_not_found 等）、セッションを捨てて匿名ログインし直す（依頼13）
import {
  createClient,
  isAuthApiError,
  isAuthSessionMissingError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabaseConfig';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    // 使っている途中でセッションが切れた（更新できない＝利用者が消された等）ら、黙って匿名ログインし直す
    client.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT' || pending || !state.userId) return;
      setState({ status: 'loading', userId: null });
      setTimeout(() => {
        void ensureSession().then((id) => {
          if (id) window.dispatchEvent(new Event('trs:data-changed'));
        });
      }, 0);
    });
  }
  return client;
}

/** もう使えないセッション（利用者が消された・セッションが無い・トークンが壊れている）を示すエラーか。通信の失敗は含めない */
const DEAD_SESSION_CODES = new Set([
  'user_not_found',
  'session_not_found',
  'session_expired',
  'bad_jwt',
  'refresh_token_not_found',
  'refresh_token_already_used',
]);
function isDeadSession(e: unknown): boolean {
  if (isAuthSessionMissingError(e)) return true;
  if (!isAuthApiError(e)) return false;
  return (!!e.code && DEAD_SESSION_CODES.has(e.code)) || e.status === 401 || e.status === 403;
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
      const { data, error: sessionErr } = await sb.auth.getSession();
      let id = sessionErr && isDeadSession(sessionErr) ? null : (data.session?.user.id ?? null);
      if (id) {
        // 端末に残っていたセッションが、まだサーバーで使えるかを確かめる（利用者が消されていたら捨てる）。
        // 通信の失敗のときは捨てない（オフラインでも見るだけはできるように）
        const { error: userErr } = await sb.auth.getUser();
        if (userErr && isDeadSession(userErr)) {
          await sb.auth.signOut({ scope: 'local' }).catch(() => {});
          id = null;
        }
      }
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

/**
 * 「すべてのデータを消す」の後（依頼14）：この端末のセッションを捨てる（サーバーの利用者はもう消えているので scope は local）。
 * 先に状態を「未ログイン」にしておき、上の SIGNED_OUT で黙って匿名ログインし直さないようにする
 * （次に旅行を見たり作ったりしたとき、新しい匿名ユーザーで始まる）
 */
export async function signOutAfterDelete() {
  setState({ status: 'loading', userId: null });
  await supabase()
    .auth.signOut({ scope: 'local' })
    .catch(() => {});
}

/** もう一度つなぐ（オフラインの表示から） */
export function retrySession(): Promise<string | null> {
  setState({ status: 'loading', userId: null });
  return ensureSession();
}
