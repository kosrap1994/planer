// =====================================================
// cloud.js — Supabase: аккаунт и синхронизация героя
// Таблица profiles2 (id = auth.users.id, state jsonb)
// =====================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let _client = null;

export function cloudConfigured() {
    return SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;
}

async function getClient() {
    if (!cloudConfigured()) return null;
    if (!_client) {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
        _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                storage: window.localStorage,
                storageKey: 'planner-v2-auth',
                autoRefreshToken: true,
                persistSession: true
            }
        });
    }
    return _client;
}

export async function getUser() {
    try {
        const c = await getClient();
        if (!c) return null;
        const { data } = await c.auth.getUser();
        return data.user || null;
    } catch (e) {
        return null;
    }
}

export async function signUp(email, password) {
    const c = await getClient();
    const { data, error } = await c.auth.signUp({ email, password });
    if (error) throw error;
    return data; // {user, session} — session=null, если включено подтверждение почты
}

export async function signIn(email, password) {
    const c = await getClient();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const c = await getClient();
    if (c) await c.auth.signOut();
}

// Забрать героя из облака (null — в облаке пусто)
export async function pullState(userId) {
    const c = await getClient();
    const { data, error } = await c.from('profiles2').select('state').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data ? data.state : null;
}

// Немедленно отправить героя в облако
export async function pushState(userId, state) {
    const c = await getClient();
    const { error } = await c.from('profiles2').upsert({
        id: userId,
        state,
        updated_at: new Date().toISOString()
    });
    if (error) throw error;
}

// Отложенная отправка (дебаунс) — дергается из save()
let _pushTimer = null;
export function schedulePush(getState) {
    if (!cloudConfigured()) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(async () => {
        try {
            const c = await getClient();
            if (!c) return;
            const { data } = await c.auth.getUser();
            if (!data.user) return; // гость — только localStorage
            await pushState(data.user.id, getState());
        } catch (e) {
            console.warn('Синхронизация не удалась (данные целы локально):', e.message || e);
        }
    }, 2000);
}
