// =====================================================
// state.js — состояние, персист в localStorage, даты
// =====================================================

const KEY = 'planner-v2-state';

export const pad = n => String(n).padStart(2, '0');

export function keyOf(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey() {
    return keyOf(new Date());
}

export function parseKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function keyOffset(baseKey, days) {
    const d = parseKey(baseKey);
    d.setDate(d.getDate() + days);
    return keyOf(d);
}

export function mondayOf(key) {
    const d = parseKey(key);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return keyOf(d);
}

export function daysBetween(aKey, bKey) {
    return Math.round((parseKey(bKey) - parseKey(aKey)) / 86400000);
}

export const MONTHS = ['Января','Февраля','Марта','Апреля','Мая','Июня','Июля','Августа','Сентября','Октября','Ноября','Декабря'];
export const MONTHS_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export const WEEKDAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
export const WEEKDAYS_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

export const uid = () => Math.random().toString(36).substr(2, 9);

function initial() {
    return {
        v: 4,
        level: 1, exp: 0, maxExp: 100, coins: 0, crystals: 0,
        gender: 'm', aura: 'gold', ownedAuras: ['gold'],
        created: false,   // персонаж ещё не создан — показать окно создания
        charName: '',
        appearance: { hair: 'classic', hairColor: 'brown', eyeColor: 'blue', skin: 'light' },
        customRewards: [], purchases: [], hiddenShop: [],
        habits: [
            { id: 'h1', text: 'Зарядка' },
            { id: 'h2', text: 'Прогулка 5к шагов' },
            { id: 'h3', text: 'Не курить' }
        ],
        habitChecks: {},   // 'YYYY-MM-DD' -> {habitId: true}
        // Стартовые задачи-онбординг на сегодня
        tasks: {
            [todayKey()]: [
                { id: uid(), text: 'Изучить планер', done: false, boss: false },
                { id: uid(), text: 'Установить шаблоны в меню «Неделя»', done: false, boss: false },
                { id: uid(), text: 'Посетить «Магазин»', done: false, boss: false }
            ]
        },                 // 'YYYY-MM-DD' -> [{id, text, done, boss, tpl}]
        templates: [],     // [{id, text, days:[1..0]}]
        tplInjected: {},   // 'YYYY-MM-DD' -> true
        weekFocus: {},     // mondayKey -> {text, reward, done}
        monthBoss: {},     // 'YYYY-MM' -> {text, reward, done}
        yearBoss: {},      // 'YYYY' -> {text, reward, done}
        monthGoals: {},    // 'YYYY-MM' -> [{id,text,done}]
        yearGoals: {},     // 'YYYY' -> [{id,text,done}]
        rewarded: {},      // антифарм: `${date}_${id}` -> true
        bossRewarded: {},  // 'w_<monday>' / 'm_<ym>' / 'y_<year>' -> true
        ach: {},           // achievementId -> dateKey
        activity: {},      // 'YYYY-MM-DD' -> {t: n, h: n}
        totals: { tasks: 0, habits: 0, purchases: 0 },
        trophies: { medals: 0, bossDay: 0, bossWeek: 0, bossMonth: 0, bossYear: 0, bestHabitStreak: 0 },
        habitMedals: {},   // habitId -> число медалей (13 медалей = супер-медаль)
        lastSeen: todayKey(),
        streak: 0,
        bestStreak: 0
    };
}

export let S = null;

export function load() {
    let parsed = null;
    try {
        parsed = JSON.parse(localStorage.getItem(KEY));
    } catch (e) { /* повреждённый кэш — начинаем заново */ }
    S = Object.assign(initial(), parsed || {});
    // подстрахуем вложенные объекты
    const base = initial();
    ['habits','customRewards','purchases','templates','hiddenShop'].forEach(k => { if (!Array.isArray(S[k])) S[k] = base[k]; });
    if (typeof S.crystals !== 'number') S.crystals = 0;
    if (!S.appearance || typeof S.appearance !== 'object') S.appearance = base.appearance;
    ['hair','hairColor','eyeColor','skin'].forEach(k => { if (!S.appearance[k]) S.appearance[k] = base.appearance[k]; });
    if (typeof S.charName !== 'string') S.charName = '';
    ['habitChecks','tasks','tplInjected','weekFocus','monthBoss','yearBoss','monthGoals','yearGoals','rewarded','bossRewarded','ach','activity','totals','trophies','habitMedals'].forEach(k => {
        if (!S[k] || typeof S[k] !== 'object') S[k] = base[k];
    });
    if (!S.ownedAuras) S.ownedAuras = ['gold'];
    Object.keys(base.trophies).forEach(k => { if (typeof S.trophies[k] !== 'number') S.trophies[k] = 0; });
    // Миграция боссов v1→v2: строки → объекты {text, reward, done}
    [['weekFocus', 'w_'], ['monthBoss', 'm_'], ['yearBoss', 'y_']].forEach(([store, prefix]) => {
        Object.keys(S[store]).forEach(kk => {
            if (typeof S[store][kk] === 'string') {
                S[store][kk] = { text: S[store][kk], reward: '', done: !!S.bossRewarded[prefix + kk] };
            }
        });
    });
    return S;
}

let saveTimer = null;
export function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        localStorage.setItem(KEY, JSON.stringify(S));
    }, 300);
}

// Задачи дня с автодобавлением из шаблонов.
// Как в v1: шаблоны вставляются только в сегодня и будущее, один раз на день.
export function dayTasks(key) {
    if (!S.tasks[key]) S.tasks[key] = [];
    if (!S.tplInjected[key] && key >= todayKey()) {
        const weekday = parseKey(key).getDay();
        S.templates.forEach(t => {
            if (t.days.includes(weekday)) {
                S.tasks[key].push({ id: uid(), text: t.text, done: false, boss: false, tpl: t.id });
            }
        });
        S.tplInjected[key] = true;
    }
    return S.tasks[key];
}

// Удаление шаблона: чистим только БУДУЩИЕ дни (строго после сегодня)
// и только невыполненные задачи — история не трогается (как в v1).
export function removeTemplateTasks(tpl) {
    const today = todayKey();
    Object.keys(S.tasks).forEach(key => {
        if (key > today) {
            S.tasks[key] = S.tasks[key].filter(t => !((t.tpl === tpl.id || t.text === tpl.text) && !t.done));
        }
    });
}
