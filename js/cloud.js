// =====================================================
// cloud.js — Firebase: аккаунт и синхронизация героя
// Auth (почта+пароль) + Firestore, документ profiles/{uid}
// Герой хранится строкой JSON — надёжно для любых полей.
// =====================================================

import { FIREBASE_CONFIG } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.0/';

let _auth = null;
let _db = null;
let _mods = null;

export function cloudConfigured() {
    return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

async function init() {
    if (_mods) return _mods;
    const [appMod, authMod, fsMod] = await Promise.all([
        import(SDK + 'firebase-app.js'),
        import(SDK + 'firebase-auth.js'),
        import(SDK + 'firebase-firestore.js')
    ]);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    _auth = authMod.getAuth(app);
    _auth.languageCode = 'ru';
    _db = fsMod.getFirestore(app);
    _mods = { authMod, fsMod };
    return _mods;
}

// Человеческие сообщения об ошибках
function ruError(e) {
    const code = (e && e.code) || '';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
        return 'Неверная почта или пароль';
    if (code.includes('email-already-in-use'))
        return 'Такая почта уже зарегистрирована — нажми «Войти»';
    if (code.includes('invalid-email'))
        return 'Некорректная почта';
    if (code.includes('weak-password'))
        return 'Слишком простой пароль (минимум 6 символов)';
    if (code.includes('too-many-requests'))
        return 'Слишком много попыток — подожди пару минут';
    if (code.includes('network-request-failed'))
        return 'Нет связи с сервером — проверь интернет';
    return (e && e.message) || 'Ошибка';
}

// Приводим пользователя Firebase к формату приложения ({id, email})
const norm = u => (u ? { id: u.uid, email: u.email } : null);

// Пользователь текущей сессии (ждём восстановления сессии после загрузки)
export async function getUser() {
    try {
        const { authMod } = await init();
        if (_auth.currentUser) return norm(_auth.currentUser);
        return await new Promise(resolve => {
            let done = false;
            const unsub = authMod.onAuthStateChanged(_auth, u => {
                if (done) return;
                done = true;
                unsub();
                resolve(norm(u));
            });
            setTimeout(() => {
                if (done) return;
                done = true;
                try { unsub(); } catch (e) { /* — */ }
                resolve(norm(_auth.currentUser));
            }, 5000);
        });
    } catch (e) {
        return null;
    }
}

export async function signUp(email, password) {
    const { authMod } = await init();
    try {
        const cred = await authMod.createUserWithEmailAndPassword(_auth, email, password);
        // Firebase пускает сразу, подтверждение почты не требуется
        return { user: norm(cred.user), session: true };
    } catch (e) {
        throw new Error(ruError(e));
    }
}

export async function signIn(email, password) {
    const { authMod } = await init();
    try {
        const cred = await authMod.signInWithEmailAndPassword(_auth, email, password);
        return { user: norm(cred.user), session: true };
    } catch (e) {
        throw new Error(ruError(e));
    }
}

export async function signOut() {
    try {
        const { authMod } = await init();
        await authMod.signOut(_auth);
    } catch (e) { /* — */ }
}

// Забрать героя из облака (null — в облаке пусто)
export async function pullState(userId) {
    const { fsMod } = await init();
    const snap = await fsMod.getDoc(fsMod.doc(_db, 'profiles', userId));
    if (!snap.exists()) return null;
    const raw = snap.data().state;
    if (!raw) return null;
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        return null;
    }
}

// Немедленно отправить героя в облако
export async function pushState(userId, state) {
    const { fsMod } = await init();
    await fsMod.setDoc(fsMod.doc(_db, 'profiles', userId), {
        state: JSON.stringify(state),
        updatedAt: new Date().toISOString()
    });
}

// Отложенная отправка (дебаунс) — дергается из save()
let _pushTimer = null;
export function schedulePush(getState) {
    if (!cloudConfigured()) return;
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(async () => {
        try {
            const user = await getUser();
            if (!user) return; // гость — только localStorage
            await pushState(user.id, getState());
        } catch (e) {
            console.warn('Синхронизация не удалась (данные целы локально):', e.message || e);
        }
    }, 2000);
}
