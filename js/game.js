// =====================================================
// game.js — экономика, характеристики, боссы, ачивки
// =====================================================

import { S, todayKey, keyOffset, mondayOf, daysBetween, parseKey } from './state.js';

// ---------- Экономика ----------

// Экономика (утверждена пользователем 2026-07-07):
// задача 10 EXP / 1 монета; привычка 5 EXP / 1 монета; босс дня 20 EXP / 3 монеты
export const ECON = {
    EXP_TASK: 10,
    EXP_HABIT: 5,
    EXP_BOSS_DAY: 20,
    EXP_BOSS_WEEK: 70,
    EXP_BOSS_MONTH: 300,
    EXP_BOSS_YEAR: 1000,
    EXP_GOAL_MONTH: 30,
    EXP_GOAL_YEAR: 100,
    COINS_TASK: 1,
    COINS_HABIT: 1,
    COINS_BOSS_DAY: 3,
    COINS_BOSS_WEEK: 10,
    COINS_BOSS_MONTH: 50,
    COINS_BOSS_YEAR: 300,
    COINS_GOAL_MONTH: 5,
    COINS_GOAL_YEAR: 10,
    COINS_LEVEL: 10
};

export const calcMaxExp = level => Math.floor(100 * Math.pow(1.2, level - 1));

// Умная сортировка задач (как в v1): босс дня всегда сверху,
// затем задачи со временем «HH:MM ...» по возрастанию, затем без времени.
export function sortTasks(list) {
    list.sort((a, b) => {
        if (!!a.boss !== !!b.boss) return a.boss ? -1 : 1;
        const ma = (a.text || '').match(/^(\d{1,2}):(\d{2})/);
        const mb = (b.text || '').match(/^(\d{1,2}):(\d{2})/);
        if (ma && mb) return (+ma[1] * 60 + +ma[2]) - (+mb[1] * 60 + +mb[2]);
        if (ma) return -1;
        if (mb) return 1;
        return 0;
    });
    return list;
}

// ---------- Характеристики ----------

// «Хороший день» для Дисциплины: есть задачи, выполнено ≥70% и убит босс дня
function goodDay(key) {
    const list = (S.tasks[key] || []).filter(t => t.text && t.text.trim());
    if (!list.length) return false;
    const done = list.filter(t => t.done).length;
    if (done / list.length < 0.7) return false;
    const boss = list.find(t => t.boss);
    return !!(boss && boss.done);
}

// Дисциплина: 7 «хороших дней» подряд = 100. Сорвался — считаем заново.
export function calcDiscipline() {
    const start = goodDay(todayKey()) ? 0 : 1; // сегодня ещё не закончено — не рвём серию
    let streak = 0;
    for (let i = start; i < 400; i++) {
        if (goodDay(keyOffset(todayKey(), -i))) streak++;
        else break;
    }
    return Math.min(100, Math.round(streak / 7 * 100));
}

// Стрик «все привычки дня выполнены N дней подряд»
export function allHabitsStreak() {
    if (!S.habits.length) return 0;
    const okDay = key => S.habits.every(h => S.habitChecks[key] && S.habitChecks[key][h.id]);
    let streak = 0;
    // сегодня может быть ещё не закончено — не рвём серию из-за него
    let start = okDay(todayKey()) ? 0 : 1;
    for (let i = start; i < 1000; i++) {
        if (okDay(keyOffset(todayKey(), -i))) streak++;
        else break;
    }
    return streak;
}

// Сила воли: средний % выполнения привычек за последние 14 дней.
// 100 — только если ВСЕ привычки выполнены каждый из 14 дней подряд.
export function calcWillpower() {
    if (!S.habits.length) return 0;
    const frac = key => {
        const c = S.habitChecks[key] || {};
        return S.habits.filter(h => c[h.id]).length / S.habits.length;
    };
    const start = frac(todayKey()) >= 1 ? 0 : 1; // незаконченное сегодня не рвёт максимум
    let sum = 0;
    for (let i = 0; i < 14; i++) sum += frac(keyOffset(todayKey(), -(i + start)));
    return Math.round(sum / 14 * 100);
}

// Стрик отдельной привычки (для огоньков в списке)
export function habitStreak(habitId) {
    let streak = 0;
    const ok = key => S.habitChecks[key] && S.habitChecks[key][habitId];
    let start = ok(todayKey()) ? 0 : 1;
    for (let i = start; i < 1000; i++) {
        if (ok(keyOffset(todayKey(), -i))) streak++;
        else break;
    }
    return streak;
}

// ---------- Стрик активности (HUD) + заморозки ----------

// Заморозок больше нет: пропущенный день можно закрыть задним числом —
// отметил вчерашнюю привычку/задачу, и серия честно восстановилась.
export function recalcActivityStreak() {
    const active = key => {
        const a = S.activity[key];
        return a && (a.t > 0 || a.h > 0);
    };
    let streak = active(todayKey()) ? 1 : 0;
    for (let i = 1; i < 2000; i++) {
        if (active(keyOffset(todayKey(), -i))) streak++;
        else break;
    }
    S.streak = streak;
    if (streak > (S.bestStreak || 0)) S.bestStreak = streak;
    return streak;
}

// ---------- Откат опыта (decay) ----------

// Грейс 2 дня, потом −5% maxExp за день (макс 14 дней),
// закреплённые уровни каждые 10 — ниже не падаем.
export function applyDecay() {
    const gap = daysBetween(S.lastSeen, todayKey());
    const result = { gap, loss: 0, levelsLost: 0 };
    if (gap > 2) {
        const missed = Math.min(gap - 2, 14);
        let loss = Math.ceil(S.maxExp * 0.05) * missed;
        result.loss = loss;
        const minLevel = Math.max(1, Math.floor(S.level / 10) * 10);
        S.exp -= loss;
        while (S.exp < 0) {
            if (S.level > minLevel) {
                S.level--;
                result.levelsLost++;
                S.maxExp = calcMaxExp(S.level);
                S.exp += S.maxExp;
            } else {
                S.exp = 0;
                break;
            }
        }
    }
    S.lastSeen = todayKey();
    return result;
}

// ---------- Боссы ----------
// Босс недели/месяца/года — просто выделенная главная цель без HP.
// Награда по умолчанию (EXP+монеты из ECON) + своя награда текстом.

export function getBoss(store, key) {
    if (!store[key]) store[key] = { text: '', reward: '', done: false };
    if (typeof store[key] === 'string') store[key] = { text: store[key], reward: '', done: false };
    return store[key];
}

// ---------- Ачивки ----------
// check(ctx) → true если разблокирована. ctx: {event, hour, gapDays}

export function anyHabitStreakAtLeast(days, minHabits) {
    const list = S.habits.filter(h => habitStreak(h.id) >= days);
    return list.length >= (minHabits || 1);
}

// Награда за ачивку — только EXP (решение пользователя, монеты не даём)
export const ACHIEVEMENTS = [
    { id: 'first_steps',   name: 'Первые шаги',        desc: 'Выполни 10 задач',                     icon: 'star',   exp: 50,
      check: () => S.totals.tasks >= 10 },
    { id: 'minion_storm',  name: 'Гроза миньонов',     desc: 'Выполни 50 задач',                     icon: 'skull',  exp: 150,
      check: () => S.totals.tasks >= 50 },
    { id: 'taskmaster',    name: 'Работяга',           desc: 'Выполни 100 задач',                    icon: 'trophy', exp: 300,
      check: () => S.totals.tasks >= 100 },
    { id: 'minion_hunter', name: 'Охотник на миньонов', desc: 'Выполни 300 задач',                   icon: 'skull',  exp: 700,
      check: () => S.totals.tasks >= 300 },
    { id: 'habit_7',       name: 'Неделя силы',        desc: 'Все привычки 7 дней подряд',           icon: 'flame',  exp: 100,
      check: () => allHabitsStreak() >= 7 },
    { id: 'habit_30',      name: 'Марафонец',          desc: 'Все привычки 30 дней подряд',          icon: 'flame',  exp: 400,
      check: () => allHabitsStreak() >= 30 },
    { id: 'habit_90',      name: 'Герой',              desc: 'Привычка 90 дней подряд',              icon: 'medal',  exp: 1000,
      check: () => anyHabitStreakAtLeast(90) },
    { id: 'discipline_max', name: 'Железная дисциплина', desc: 'Дисциплина на максимуме (100)',      icon: 'shield', exp: 300,
      check: () => calcDiscipline() >= 100 },
    { id: 'willpower_max', name: 'Стальная воля',      desc: 'Сила воли на максимуме (100)',         icon: 'bolt',   exp: 300,
      check: () => calcWillpower() >= 100 },
    { id: 'boss_week_5',   name: 'Убийца боссов',      desc: 'Одолей 5 боссов недели',               icon: 'skull',  exp: 200,
      check: () => S.trophies.bossWeek >= 5 },
    { id: 'boss_week_20',  name: 'Охотник на боссов',  desc: 'Одолей 20 боссов недели',              icon: 'skull',  exp: 700,
      check: () => S.trophies.bossWeek >= 20 },
    { id: 'boss_month',    name: 'Финальный удар',     desc: 'Одолей босса месяца',                  icon: 'skull',  exp: 300,
      check: ctx => ctx.event === 'boss_month' || S.trophies.bossMonth >= 1 },
    { id: 'streak_14',     name: 'Не разорвать',       desc: 'Серия активности 14 дней',             icon: 'flame',  exp: 300,
      check: () => (S.streak || 0) >= 14 },
    { id: 'rich_1000',     name: 'Скупой рыцарь',      desc: 'Накопи 1000 монет',                    icon: 'coin',   exp: 200,
      check: () => S.coins >= 1000 },
    { id: 'shopaholic',    name: 'Гурман наград',      desc: 'Сделай 10 покупок в магазине',         icon: 'gift',   exp: 100,
      check: () => S.totals.purchases >= 10 },
    { id: 'phoenix',       name: 'Феникс',             desc: 'Вернись после недели перерыва',        icon: 'flame',  exp: 100,
      check: ctx => ctx.event === 'return' && ctx.gapDays >= 7 },
    { id: 'level_10',      name: 'Первое свечение',    desc: 'Достигни 10 уровня',                   icon: 'star',   exp: 200,
      check: () => S.level >= 10 },
    { id: 'level_25',      name: 'Второе свечение',    desc: 'Достигни 25 уровня',                   icon: 'star',   exp: 500,
      check: () => S.level >= 25 },
    { id: 'level_100',     name: 'Спартак',            desc: 'Достигни 100 уровня',                  icon: 'crown',  exp: 2000,
      check: () => S.level >= 100 },
    { id: 'god_of_life',   name: 'Бог жизни',          desc: '3 привычки по 100 дней, 10 боссов месяца, 50+ уровень', icon: 'crown', exp: 3000,
      check: () => anyHabitStreakAtLeast(100, 3) && S.trophies.bossMonth >= 10 && S.level >= 50 }
];

// Возвращает массив только что разблокированных ачивок
export function checkAchievements(ctx) {
    const unlocked = [];
    ACHIEVEMENTS.forEach(a => {
        if (S.ach[a.id]) return;
        let ok = false;
        try { ok = a.check(ctx || {}); } catch (e) { ok = false; }
        if (ok) {
            S.ach[a.id] = todayKey();
            unlocked.push(a);
        }
    });
    return unlocked;
}

// ---------- Магазин ----------

export const SHOP_ITEMS = [
    { id: 'burger',  name: 'Бургер',           desc: 'Награда в реальной жизни',      icon: 'burger',   price: 100,  kind: 'reward' },
    { id: 'pizza',   name: 'Фаст-фуд',         desc: 'Пицца, шаурма — что угодно',    icon: 'pizza',    price: 150,  kind: 'reward' },
    { id: 'donut',   name: 'Сладкое',          desc: 'Десерт без угрызений совести',  icon: 'donut',    price: 80,   kind: 'reward' },
    { id: 'games',   name: 'Игры (2 часа)',    desc: 'Честно заработанный гейминг',   icon: 'gamepad',  price: 120,  kind: 'reward' },
    { id: 'movie',   name: 'Фильм / сериал',   desc: 'Вечер кино',                    icon: 'popcorn',  price: 150,  kind: 'reward' },
    { id: 'social',  name: 'Соцсети 30 мин',   desc: 'Тикток/ютуб без вины',          icon: 'phone',    price: 50,   kind: 'reward' },
    { id: 'bar',     name: 'Бар / пиво',       desc: 'Вечер с друзьями',              icon: 'beer',     price: 250,  kind: 'reward' },
    { id: 'hookah',  name: 'Кальян',           desc: 'Расслабиться',                  icon: 'cocktail', price: 200,  kind: 'reward' },
    { id: 'sleep',   name: 'Поспать до обеда', desc: 'Без будильника',                icon: 'bed',      price: 150,  kind: 'reward' },
    { id: 'spa',     name: 'СПА',              desc: 'Массаж, сауна, забота о себе',  icon: 'cross',    price: 300,  kind: 'reward' },
    { id: 'romance', name: 'Свидание',         desc: 'Романтический вечер',           icon: 'heart',    price: 250,  kind: 'reward' },
    { id: 'adult',   name: 'Вечер 18+',        desc: 'Без комментариев',              icon: 'plus18',   price: 350,  kind: 'reward' },
    { id: 'lazyday', name: 'День безделья',    desc: 'Полный выходной от всего',      icon: 'gift',     price: 400,  kind: 'reward' },
    { id: 'rest',    name: 'ОТДЫХ',            desc: 'День на острове — перезагрузка', icon: 'palm',    price: 500,  kind: 'reward' },
    { id: 'allday',  name: 'ДЕНЬ ВСЁ МОЖНО',   desc: 'Легендарная награда',           icon: 'crown',    price: 1000, kind: 'reward' }
];

export const CUSTOM_ICON_KEYS = ['burger', 'pizza', 'donut', 'gamepad', 'popcorn', 'phone', 'beer', 'bed', 'gift', 'cocktail', 'palm', 'cross', 'heart', 'snow'];
