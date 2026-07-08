// =====================================================
// app.js — UI: рендеры экранов, события, анимации
// =====================================================

import { S, load, save, uid, todayKey, keyOffset, mondayOf, parseKey, dayTasks,
         removeTemplateTasks, overwriteFromCloud,
         MONTHS, MONTHS_NOM, WEEKDAYS, WEEKDAYS_SHORT, pad } from './state.js';
import { cloudConfigured, getUser, signIn, signUp, signOut, pullState, pushState } from './cloud.js';
import { icon, coinIcon, getSprite, paintStatic, AURAS, TIERS, tierForLevel,
         startAuraLoop, resetParticles, CHARACTERS,
         HAIRSTYLES, SKIN_TONES, EYE_COLORS, HAIR_COLORS } from './pixel.js';
import { ECON, calcMaxExp, sortTasks, calcDiscipline, calcWillpower, allHabitsStreak,
         habitStreak, recalcActivityStreak, applyDecay, getBoss,
         ACHIEVEMENTS, checkAchievements, SHOP_ITEMS, CUSTOM_ICON_KEYS } from './game.js';
import { weekBots, botCurrentExp } from './top.js';

// ---------- Хелперы ----------

const $ = id => document.getElementById(id);
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let currentView = 'view-today';
let viewDayKey = todayKey();          // просматриваемый день на экране «Сегодня»
let viewMonday = mondayOf(todayKey());
let pickedIcon = CUSTOM_ICON_KEYS[0];
let shopAura = 'gold';                // предпросмотр свечения в магазине
let shopTier = 3;
let cloudUser = null;                 // текущий пользователь Supabase (null = гость)

// ---------- Анимации: флоаты, тосты, модалки ----------

function floatText(txt, cls, ev, dy) {
    const el = document.createElement('div');
    el.className = 'float ' + (cls || '');
    el.innerHTML = txt;
    if (ev && ev.clientX) {
        el.style.left = ev.clientX + 'px';
        el.style.top = (ev.clientY - 16 + (dy || 0)) + 'px';
    } else {
        el.style.left = '50%';
        el.style.top = `calc(18% + ${dy || 0}px)`;
    }
    $('float-container').appendChild(el);
    setTimeout(() => el.remove(), 1500);
}

function toast(iconKey, title, sub) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${icon(iconKey, 28)}<div class="toast-body"><div class="toast-title">${title}</div><div class="toast-sub">${sub}</div></div>`;
    $('toast-container').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4000);
}

function modal(html) {
    const root = $('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="modal">${html}<button class="btn btn-primary modal-close">Продолжить</button></div>`;
    root.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
    return overlay;
}

// ---------- Экономика ----------

function unlockCheck(ctx) {
    const list = checkAchievements(ctx);
    list.forEach(a => {
        toast(a.icon, 'Ачивка: ' + a.name, `+${a.exp} EXP`);
        gainExp(a.exp);
    });
    if (list.length) {
        renderHUD();
        save();
        if (currentView === 'view-character') renderCharacter();
    }
}

function gainCoins(n, ev) {
    S.coins += n;
    // монеты вылетают с задержкой и ниже, чтобы не накладываться на +EXP
    setTimeout(() => floatText(`+${n} ${coinIcon(18)}`, 'float-coin', ev, 28), 250);
    renderHUD();
}

function gainExp(n, ev) {
    S.exp += n;
    // недельный опыт — для Топ-50
    const mk = mondayOf(todayKey());
    S.weekExp[mk] = (S.weekExp[mk] || 0) + n;
    const wkKeys = Object.keys(S.weekExp).sort();
    while (wkKeys.length > 6) delete S.weekExp[wkKeys.shift()];
    floatText(`+${n} EXP`, 'float-exp', ev);
    let leveled = false;
    while (S.exp >= S.maxExp) {
        S.exp -= S.maxExp;
        S.level++;
        S.maxExp = calcMaxExp(S.level);
        S.coins += ECON.COINS_LEVEL;
        leveled = true;
    }
    if (leveled) {
        resetParticles();
        modal(`<div class="modal-icon">${icon('star', 72)}</div>
            <h2 class="modal-title glow-gold">LEVEL UP!</h2>
            <div class="modal-badge">Уровень ${S.level}</div>
            <p class="muted">+${ECON.COINS_LEVEL} монет за новый уровень</p>`);
        unlockCheck({ event: 'level' });
    }
    renderHUD();
    renderSideChar();
    save();
}

// Антифарм: награда один раз за ключ
function award(key, exp, ev) {
    if (S.rewarded[key]) return false;
    S.rewarded[key] = true;
    gainExp(exp, ev);
    return true;
}

function bumpActivity(kind, dateKey) {
    const key = dateKey || todayKey();
    if (!S.activity[key]) S.activity[key] = { t: 0, h: 0 };
    S.activity[key][kind]++;
    recalcActivityStreak();
}

// ---------- Боссы (без HP — ручная победа) ----------

const BOSS_META = {
    week:  { icon: 'skull', exp: ECON.EXP_BOSS_WEEK,  coins: ECON.COINS_BOSS_WEEK,  title: 'БОСС НЕДЕЛИ ПОВЕРЖЕН!',  achEvent: 'boss_week',  trophy: 'bossWeek' },
    month: { icon: 'skull', exp: ECON.EXP_BOSS_MONTH, coins: ECON.COINS_BOSS_MONTH, title: 'БОСС МЕСЯЦА ПОВЕРЖЕН!',  achEvent: 'boss_month', trophy: 'bossMonth' },
    year:  { icon: 'crown', exp: ECON.EXP_BOSS_YEAR,  coins: ECON.COINS_BOSS_YEAR,  title: 'БОСС ГОДА ПОВЕРЖЕН!',    achEvent: 'boss_year',  trophy: 'bossYear' }
};

function bossStore(type) {
    return type === 'week' ? S.weekFocus : type === 'month' ? S.monthBoss : S.yearBoss;
}

function killBoss(type, key, ev) {
    const boss = getBoss(bossStore(type), key);
    if (boss.done || !boss.text.trim()) return;
    const rKey = type[0] + '_' + key;
    if (S.bossRewarded[rKey]) return;
    S.bossRewarded[rKey] = true;
    boss.done = true;
    S.trophies[BOSS_META[type].trophy]++;
    const m = BOSS_META[type];
    modal(`<div class="modal-icon">${icon(m.icon, 72)}</div>
        <h2 class="modal-title ${type === 'year' ? 'glow-gold' : 'glow-red'}">${m.title}</h2>
        <p>«${esc(boss.text)}»</p>
        <p class="muted">+${m.exp} EXP · +${m.coins} монет</p>`);
    gainExp(m.exp, ev);
    S.coins += m.coins;
    unlockCheck({ event: m.achEvent });
    renderHUD();
    save();
}

// Карточка босса недели/месяца/года
function bossCardHTML(type, key, label) {
    const boss = getBoss(bossStore(type), key);
    const m = BOSS_META[type];
    const canKill = boss.text.trim() && !boss.done;
    return `<div class="card boss-card ${type === 'year' ? 'boss-year' : ''} ${boss.done ? 'boss-dead' : ''}">
        <div class="boss-line">${icon(m.icon, 32)}
            <div class="boss-body">
                <div class="card-label">${label} ${boss.done ? '— повержен!' : ''}</div>
                <input class="input boss-input" data-act="boss-text" data-type="${type}" data-key="${key}" value="${esc(boss.text)}" placeholder="Главная цель — это босс..." ${boss.done ? 'disabled' : ''}>
                <div class="boss-foot">
                    <span class="muted small">дроп: +${m.exp} EXP · +${m.coins} ${coinIcon(12)}</span>
                    ${boss.done
                        ? `<span class="boss-done-tag">${icon('trophy', 14)} повержен</span>`
                        : `<button class="btn btn-kill" data-act="boss-kill" data-type="${type}" data-key="${key}" ${canKill ? '' : 'disabled'}>${icon('skull', 14)} Босс повержен!</button>`}
                </div>
            </div>
        </div>
    </div>`;
}

// ---------- HUD и сайдбар ----------

function renderHUD() {
    $('hud-level').innerText = 'LVL ' + S.level;
    $('hud-exp-text').innerText = `${S.exp} / ${S.maxExp}`;
    $('hud-exp-fill').style.width = Math.min(100, S.exp / S.maxExp * 100) + '%';
    $('hud-coins').innerHTML = `${coinIcon(16)} ${S.coins}`;
}

function spriteOpts() {
    return {
        gender: S.gender,
        hair: S.appearance.hair,
        hairColor: S.appearance.hairColor,
        eyeColor: S.appearance.eyeColor,
        skin: S.appearance.skin
    };
}

function renderSideChar() {
    const cv = $('side-char-canvas');
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const sprite = getSprite(spriteOpts(), 3);
    ctx.drawImage(sprite, (cv.width - sprite.width) / 2, cv.height - sprite.height);
    $('side-char-lvl').innerText = 'LVL ' + S.level;
    $('side-char-tier').innerText = tierForLevel(S.level).label;
}

function buildNavIcons() {
    document.querySelectorAll('.nav-ico').forEach(el => {
        el.innerHTML = icon(el.dataset.ico, 20);
    });
}

// ---------- Общие шаблоны строк ----------

function taskRow(t, dateKey) {
    return `<div class="row task-row${t.done ? ' done' : ''}${t.boss ? ' boss' : ''}" data-id="${t.id}" data-date="${dateKey}">
        <button class="check${t.done ? ' on' : ''}" data-act="task-toggle" aria-label="Выполнить"></button>
        <input class="row-text" data-act="task-edit" value="${esc(t.text)}" placeholder="Задача (можно с временем: 07:00 ...)">
        ${t.boss ? `<span class="boss-mark" title="Мини-босс дня">${icon('skull', 16)}</span>` : ''}
        <button class="row-btn" data-act="task-boss" title="Сделать мини-боссом дня">${icon('crown', 14)}</button>
        <button class="row-btn row-del" data-act="task-del" title="Удалить">×</button>
    </div>`;
}

function barHTML(pct, cls) {
    return `<div class="bar ${cls || ''}"><div class="bar-fill" style="width:${pct}%"></div></div>`;
}

// ---------- Экран «Сегодня» (с навигацией по дням) ----------

function renderToday() {
    const key = viewDayKey;
    const d = parseKey(key);
    const isToday = key === todayKey();
    const tasks = sortTasks(dayTasks(key));
    const realTasks = tasks.filter(t => t.text.trim());
    const doneCount = realTasks.filter(t => t.done).length;
    const checks = S.habitChecks[key] || {};
    const habitsDone = S.habits.filter(h => checks[h.id]).length;
    const bossTask = tasks.find(t => t.boss);
    const pct = realTasks.length ? Math.round(doneCount / realTasks.length * 100) : 0;

    $('view-today').innerHTML = `
    <div class="today-head">
        <div class="today-nav">
            <button class="btn btn-sm" data-act="day-prev" title="Предыдущий день">←</button>
            <div class="today-nav-date">
                <div class="today-date px-font">${d.getDate()} ${MONTHS[d.getMonth()]}</div>
                <div class="muted">${WEEKDAYS[d.getDay()]}${isToday ? ' · сегодня' : ''}</div>
            </div>
            <button class="btn btn-sm" data-act="day-next" title="Следующий день">→</button>
            ${isToday ? '' : '<button class="btn btn-sm btn-ghost-inline" data-act="day-today">к сегодня</button>'}
        </div>
        <div class="today-progress">
            <span class="muted">Задачи: ${doneCount}/${realTasks.length} · Привычки: ${habitsDone}/${S.habits.length} · ${icon('flame', 13)} серия: ${S.streak || 0} дн.</span>
            ${barHTML(pct, 'bar-exp')}
        </div>
    </div>

    ${isToday || bossTask ? `<div class="card boss-card ${bossTask ? (bossTask.done ? 'boss-dead' : '') : 'boss-empty'}">
        ${bossTask
            ? `<div class="boss-line">${icon('skull', 32)}<div>
                 <div class="card-label">Мини-босс дня ${bossTask.done ? '— повержен!' : ''}</div>
                 <div class="boss-text">${esc(bossTask.text)}</div>
               </div>
               <span class="boss-drop muted">дроп: +${ECON.EXP_BOSS_DAY} EXP, +${ECON.COINS_BOSS_DAY} ${coinIcon(13)}</span></div>`
            : `<div class="boss-line">${icon('skull', 32)}<div>
                 <div class="card-label">Мини-босс дня</div>
                 <div class="muted">Отметь короной ${icon('crown', 13)} главную задачу — за неё двойной дроп</div>
               </div></div>`}
    </div>` : ''}

    <div class="grid-2">
        <div class="card">
            <div class="card-head"><span class="card-label">Задачи</span><span class="reward-tag">+${ECON.EXP_TASK} EXP</span></div>
            <div id="today-tasks">${tasks.map(t => taskRow(t, key)).join('')}</div>
            <div class="add-row">
                <input id="new-task-input" class="input" placeholder="Новая задача (напр.: 07:00 Подъём)...">
                <button class="btn" data-act="task-add">+</button>
            </div>
        </div>
        <div class="card">
            <div class="card-head"><span class="card-label">Привычки${isToday ? '' : ' — ' + d.getDate() + ' ' + MONTHS[d.getMonth()]}</span><span class="reward-tag">+${ECON.EXP_HABIT} EXP</span></div>
            ${isToday ? '' : '<p class="muted small" style="margin-bottom:8px;">Забыл отметить? Можно задним числом — серия восстановится.</p>'}
            <div id="today-habits">
                ${S.habits.map(h => {
                    const on = checks[h.id];
                    const streak = habitStreak(h.id);
                    const superMedals = Math.floor((S.habitMedals[h.id] || 0) / 13);
                    const flameIco = superMedals > 0 ? 'flameblue' : 'flame';
                    return `<div class="row${on ? ' done' : ''}" data-id="${h.id}">
                        <button class="check${on ? ' on' : ''}" data-act="habit-toggle"></button>
                        <span class="row-label">${esc(h.text)}</span>
                        ${superMedals > 0 ? `<span class="super-tag" title="Супер-медаль: 13 медалей подряд">${icon('supermedal', 15)}${superMedals > 1 ? '×' + superMedals : ''}</span>` : ''}
                        ${streak >= 2 ? `<span class="streak-tag${superMedals > 0 ? ' streak-blue' : ''}">${icon(flameIco, 13)}${streak}</span>` : ''}
                        <button class="row-btn row-del" data-act="habit-del">×</button>
                    </div>`;
                }).join('')}
            </div>
            <div class="add-row">
                <input id="new-habit-input" class="input" placeholder="Новая привычка...">
                <button class="btn" data-act="habit-add">+</button>
            </div>
        </div>
    </div>`;
}

// ---------- Экран «Неделя» ----------

function renderWeek() {
    const curMonday = mondayOf(todayKey());
    const isCurrent = viewMonday === curMonday;
    const mondayDate = parseKey(viewMonday);
    const endDate = parseKey(keyOffset(viewMonday, 6));

    let daysHTML = '';
    for (let i = 0; i < 7; i++) {
        const key = keyOffset(viewMonday, i);
        const d = parseKey(key);
        const tasks = sortTasks(dayTasks(key));
        const isToday = key === todayKey();
        daysHTML += `<div class="card day-card${isToday ? ' today' : ''}">
            <div class="day-card-head"><span class="px-font day-num">${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}</span>${isToday ? '<span class="today-tag">сегодня</span>' : ''}</div>
            <div>${tasks.map(t => taskRow(t, key)).join('')}</div>
            <button class="btn btn-ghost" data-act="week-task-add" data-date="${key}">+ задача</button>
        </div>`;
    }

    $('view-week').innerHTML = `
    <div class="week-head">
        <button class="btn" data-act="week-prev">←</button>
        <div class="px-font week-title">${mondayDate.getDate()} ${MONTHS[mondayDate.getMonth()]} — ${endDate.getDate()} ${MONTHS[endDate.getMonth()]}</div>
        <button class="btn" data-act="week-next">→</button>
        ${isCurrent ? '' : '<button class="btn btn-ghost-inline" data-act="week-now">К текущей</button>'}
    </div>

    ${bossCardHTML('week', viewMonday, 'Босс недели')}

    <div class="week-grid">${daysHTML}</div>

    <details class="card templates">
        <summary class="card-label">Повторяющиеся задачи (шаблоны)</summary>
        <p class="muted small" style="margin-top:8px;">Появляются в выбранные дни начиная с сегодняшнего. Время в названии («07:00 Подъём») ставит задачу на своё место в списке. Удаление шаблона чистит только будущие дни — история сохраняется.</p>
        <div class="tpl-list">
        ${S.templates.map(t => `<div class="row" data-id="${t.id}">
            <span class="row-label">${esc(t.text)}</span>
            <span class="muted small">${t.days.map(dn => WEEKDAYS_SHORT[dn]).join(', ')}</span>
            <button class="row-btn row-del" data-act="tpl-del">×</button>
        </div>`).join('')}
        </div>
        <div class="add-row">
            <input id="new-tpl-input" class="input" placeholder="Название (напр.: 18:00 Зал)...">
        </div>
        <div class="tpl-days">
            ${[1,2,3,4,5,6,0].map(dn => `<label class="day-toggle"><input type="checkbox" value="${dn}"><span>${WEEKDAYS_SHORT[dn]}</span></label>`).join('')}
            <button class="btn" data-act="tpl-add">+ Добавить</button>
        </div>
    </details>`;
}

// ---------- Экран «Цели» ----------

function goalRow(g, type) {
    return `<div class="row${g.done ? ' done' : ''}" data-id="${g.id}" data-type="${type}">
        <button class="check${g.done ? ' on' : ''}" data-act="goal-toggle"></button>
        <input class="row-text" data-act="goal-edit" value="${esc(g.text)}" placeholder="Цель...">
        <button class="row-btn row-del" data-act="goal-del">×</button>
    </div>`;
}

function renderGoals() {
    const d = new Date();
    const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const year = String(d.getFullYear());
    const mGoals = S.monthGoals[ym] || [];
    const yGoals = S.yearGoals[year] || [];

    $('view-goals').innerHTML = `
    <div class="grid-2">
        <div>
            ${bossCardHTML('month', ym, 'Босс месяца — ' + MONTHS_NOM[d.getMonth()])}
            <div class="card">
                <div class="card-head"><span class="card-label">Цели месяца</span><span class="reward-tag">+${ECON.EXP_GOAL_MONTH} EXP · +${ECON.COINS_GOAL_MONTH} ${coinIcon(11)}</span></div>
                <div>${mGoals.map(g => goalRow(g, 'month')).join('')}</div>
                <div class="add-row">
                    <input id="new-month-goal" class="input" placeholder="Новая цель месяца...">
                    <button class="btn" data-act="goal-add" data-type="month">+</button>
                </div>
            </div>
        </div>
        <div>
            ${bossCardHTML('year', year, 'БОСС ГОДА — ' + year)}
            <div class="card">
                <div class="card-head"><span class="card-label">Цели года</span><span class="reward-tag">+${ECON.EXP_GOAL_YEAR} EXP · +${ECON.COINS_GOAL_YEAR} ${coinIcon(11)}</span></div>
                <div>${yGoals.map(g => goalRow(g, 'year')).join('')}</div>
                <div class="add-row">
                    <input id="new-year-goal" class="input" placeholder="Новая цель года...">
                    <button class="btn" data-act="goal-add" data-type="year">+</button>
                </div>
            </div>
        </div>
    </div>`;
}

// ---------- Аккаунт и синхронизация ----------

function accountCardHTML() {
    if (!cloudConfigured()) return '';
    if (cloudUser) {
        return `<div class="card">
            <div class="card-head"><span class="card-label">Аккаунт</span><span class="muted small">синхронизация включена</span></div>
            <p class="small">${esc(cloudUser.email)} — герой сохраняется в облако и доступен с любого устройства.</p>
            <div class="acc-row">
                <button class="btn btn-sm" data-act="acc-logout">Выйти</button>
                <span class="muted small" id="acc-status"></span>
            </div>
        </div>`;
    }
    return `<div class="card">
        <div class="card-head"><span class="card-label">Аккаунт</span><span class="muted small">гость — герой только в этом браузере</span></div>
        <p class="muted small" style="margin-bottom:10px;">Войди, чтобы играть одним героем с телефона и компьютера.</p>
        <div class="acc-form">
            <input id="acc-email" class="input" type="email" placeholder="Почта" autocomplete="email">
            <input id="acc-pass" class="input" type="password" placeholder="Пароль (мин. 6 символов)" autocomplete="current-password">
        </div>
        <div class="acc-row">
            <button class="btn btn-sm btn-primary" data-act="acc-login">Войти</button>
            <button class="btn btn-sm" data-act="acc-signup">Регистрация</button>
            <span class="muted small" id="acc-status"></span>
        </div>
    </div>`;
}

function accStatus(msg, isError) {
    const el = $('acc-status');
    if (el) {
        el.innerText = msg;
        el.style.color = isError ? 'var(--red)' : 'var(--green)';
    }
}

// После входа: облако главнее локального; если облако пустое — заливаем локального героя
async function syncOnLogin() {
    try {
        const cloudState = await pullState(cloudUser.id);
        if (cloudState && cloudState.created) {
            overwriteFromCloud(cloudState);
            recalcActivityStreak();
            toast('star', 'Герой загружен из облака', esc(S.charName || ''));
        } else {
            await pushState(cloudUser.id, S);
            toast('star', 'Герой сохранён в облако', 'Теперь он с тобой на любом устройстве');
        }
        rerender();
    } catch (e) {
        accStatus('Ошибка синхронизации: ' + (e.message || e), true);
    }
}

async function initCloud() {
    if (!cloudConfigured()) return;
    cloudUser = await getUser();
    if (currentView === 'view-character') renderCharacter();
}

// ---------- Экран «Персонаж» ----------

function statBlock(iconKey, name, value, hint, cls) {
    return `<div class="stat-block">
        <div class="stat-head">${icon(iconKey, 22)}<span>${name}</span><span class="stat-val px-font">${value}</span></div>
        ${barHTML(value, cls)}
        <div class="muted small">${hint}</div>
    </div>`;
}

function trophyCell(iconKey, value, label) {
    return `<div class="trophy">
        ${icon(iconKey, 30)}
        <div class="trophy-val px-font">${value}</div>
        <div class="muted small">${label}</div>
    </div>`;
}

function habitTotalDone(habitId) {
    let n = 0;
    Object.values(S.habitChecks).forEach(day => { if (day[habitId]) n++; });
    return n;
}

function renderCharacter() {
    const tier = tierForLevel(S.level);
    const disc = calcDiscipline();
    const will = calcWillpower();
    const hStreak = allHabitsStreak();
    const unlockedCount = ACHIEVEMENTS.filter(a => S.ach[a.id]).length;
    const T = S.trophies;

    $('view-character').innerHTML = `
    <div class="char-grid">
        <div class="card">
            <div class="card-head"><span class="card-label">${esc(S.charName || CHARACTERS[S.gender].name)}</span><span class="muted small">${CHARACTERS[S.gender].name} · LVL ${S.level} · ${tier.label}</span></div>
            <div class="scene-wrap"><canvas id="char-scene" width="360" height="330"></canvas></div>
            <button class="btn btn-sm btn-ghost-inline" data-act="edit-char" style="margin-top:12px; width:100%;">Изменить внешность</button>
            ${S.ownedAuras.length > 1 ? `
            <div class="owned-aura-row">
                <span class="muted small">Аура:</span>
                ${S.ownedAuras.map(k => `<button class="aura-btn aura-btn-sm${S.aura === k ? ' active' : ''}" data-act="aura-equip" data-k="${k}" style="background:${AURAS[k].sw}" title="${AURAS[k].label}"></button>`).join('')}
            </div>` : `<p class="muted small" style="margin-top:10px;">Новые цвета свечения — в Магазине.</p>`}
        </div>

        <div class="char-right">
            <div class="card">
                <div class="card-label">Характеристики</div>
                ${statBlock('shield', 'Дисциплина', disc, '7 дней подряд: выполнено 70%+ задач дня и убит мини-босс — 100. Сорвался день — счёт заново.', 'bar-disc')}
                ${statBlock('bolt', 'Сила воли', will, hStreak > 0 ? `Средний % привычек за 14 дней. Сейчас винстрик всех привычек: ${hStreak} дн. 100 — только при 14+ днях подряд.` : 'Средний % выполнения привычек за 14 дней. 100 — все привычки 14 дней подряд без пропуска.', 'bar-will')}
            </div>
            <div class="card">
                <div class="card-label">Трофеи</div>
                <div class="trophy-grid">
                    ${trophyCell('medal', T.medals, 'Медали привычек')}
                    ${trophyCell('flame', T.bestHabitStreak, 'Лучший стрик привычек')}
                    ${trophyCell('sun', S.bestStreak || 0, 'Лучшая серия дней')}
                    ${trophyCell('skull', T.bossDay, 'Боссов дня')}
                    ${trophyCell('shield', T.bossWeek, 'Боссов недели')}
                    ${trophyCell('calendar', T.bossMonth, 'Боссов месяца')}
                    ${trophyCell('crown', T.bossYear, 'Боссов года')}
                    ${trophyCell('star', S.totals.tasks, 'Задач выполнено')}
                    ${trophyCell('bolt', S.totals.habits, 'Привычек выполнено')}
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-head"><span class="card-label">Привычки — прогресс</span><span class="muted small">медаль ${icon('medal', 14)} за каждые 7 дней подряд</span></div>
        ${S.habits.length === 0 ? '<p class="muted small">Добавь привычки на экране «Сегодня».</p>' : ''}
        ${S.habits.map(h => {
            const streak = habitStreak(h.id);
            const toMedal = streak % 7;
            const total = habitTotalDone(h.id);
            const medals = S.habitMedals[h.id] || 0;
            const superMedals = Math.floor(medals / 13);
            const flameIco = superMedals > 0 ? 'flameblue' : 'flame';
            return `<div class="habit-stat">
                <span class="habit-stat-name">${esc(h.text)}</span>
                ${superMedals > 0 ? `<span class="super-tag" title="Супер-медаль: 13 медалей">${icon('supermedal', 16)}${superMedals > 1 ? '×' + superMedals : ''}</span>` : ''}
                <span class="streak-tag${superMedals > 0 ? ' streak-blue' : ''}">${icon(flameIco, 13)}${streak}</span>
                <span class="muted small" title="Медалей у привычки">${icon('medal', 13)}${medals}</span>
                <div class="habit-stat-bar">${barHTML(Math.round(toMedal / 7 * 100), 'bar-will')}</div>
                <span class="muted small">${streak > 0 && toMedal === 0 ? 'медаль!' : `до медали ${7 - toMedal} дн.`}</span>
                <span class="muted small habit-stat-total">всего: ${total}</span>
            </div>`;
        }).join('')}
    </div>

    <div class="card">
        <div class="card-head"><span class="card-label">Ачивки</span><span class="muted small">${unlockedCount} / ${ACHIEVEMENTS.length}</span></div>
        <div class="ach-grid">
            ${ACHIEVEMENTS.map(a => {
                const got = S.ach[a.id];
                return `<div class="ach${got ? ' got' : ''}" title="${esc(a.desc)}">
                    ${icon(got ? a.icon : 'lock', 32)}
                    <div class="ach-name">${a.name}</div>
                    <div class="muted small">${got ? got : a.desc}</div>
                    <div class="ach-reward ach-reward-exp">+${a.exp} EXP</div>
                </div>`;
            }).join('')}
        </div>
    </div>

    ${accountCardHTML()}`;

    paintStatic('char-scene', spriteOpts());
}

// ---------- Экран «Топ-50 недели» ----------

// Анимированные аватарки топа: свечение ЧЕСТНО зависит от уровня —
// 1–9 нет, 10+ едва тлеет, 25+ заметное + глаза, 50+ полыхает.
const GLOW_STRENGTH = [0, 0.14, 0.36, 0.68];
const GLOW_SHADOW = ['', '2px', '5px', '9px'];
const GLOW_PARTS = [0, 2, 4, 8];
const GLOW_ALPHA = [0, 0.45, 0.7, 0.95];

const _glowCache = {};
function glowBgFor(auraKey, ti, w, h) {
    const key = auraKey + '_' + ti + '_' + w + 'x' + h;
    if (_glowCache[key]) return _glowCache[key];
    const a = AURAS[auraKey] || AURAS.gold;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const s = GLOW_STRENGTH[ti];
    const g = ctx.createRadialGradient(w / 2, h / 2 + 4, 2, w / 2, h / 2 + 4, w * 0.72);
    g.addColorStop(0, a.inner + s + ')');
    g.addColorStop(0.55, a.outer + (s * 0.55) + ')');
    g.addColorStop(1, a.outer + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    _glowCache[key] = cv;
    return cv;
}

let lbItems = [];
let lbTick = 0;
let lbLoopStarted = false;

function lbSpawnPart(w, h) {
    return { x: 6 + Math.random() * (w - 12), y: h - 6 - Math.random() * 18, vy: 0.15 + Math.random() * 0.3, life: 0, max: 60 + Math.random() * 60 };
}

// Мини-молния для аур типа bolt
function genMiniBolt(w, h) {
    const pts = [];
    let x = 8 + Math.random() * (w - 16);
    let y = 4 + Math.random() * (h * 0.35);
    pts.push([x, y]);
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
        x += (Math.random() - 0.5) * 10;
        y += 6 + Math.random() * 7;
        pts.push([x, y]);
    }
    return pts;
}

// Пиксельное мини-сердце 5×5
const HEART_MINI = ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'];

let _puffCache = null;
function smokePuff() {
    if (_puffCache) return _puffCache;
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(215,215,228,0.55)');
    g.addColorStop(1, 'rgba(160,160,175,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
    _puffCache = cv;
    return cv;
}

function lbDrawItem(item, animate) {
    const { cv, ctx, sprite, aura, ti, type } = item;
    const a = AURAS[aura] || AURAS.gold;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (ti > 0) {
        ctx.drawImage(item.glowBg, 0, 0);

        if (type === 'bolt') {
            // молнии: редкие вспышки вместо частиц
            if (animate) {
                if (item.boltLife > 0) item.boltLife--;
                else if (--item.boltTimer <= 0) {
                    item.boltPts = genMiniBolt(cv.width, cv.height);
                    item.boltLife = 7;
                    item.boltTimer = 20 + Math.random() * 45;
                }
            }
            if (item.boltLife > 0 && item.boltPts) {
                const fa = (item.boltLife / 7) * (0.5 + 0.5 * Math.random()) * GLOW_ALPHA[ti];
                ctx.lineJoin = 'round';
                [[3, a.outer + (fa * 0.7) + ')'], [1.2, 'rgba(255,255,255,' + fa + ')']].forEach(pair => {
                    ctx.strokeStyle = pair[1];
                    ctx.lineWidth = pair[0];
                    ctx.beginPath();
                    ctx.moveTo(item.boltPts[0][0], item.boltPts[0][1]);
                    item.boltPts.forEach(pt => ctx.lineTo(pt[0], pt[1]));
                    ctx.stroke();
                });
            }
        } else {
            const vyk = type === 'smoke' ? 0.55 : type === 'heart' ? 0.8 : 1;
            item.parts.forEach(p => {
                if (animate) {
                    p.y -= p.vy * vyk; p.life++;
                    if (p.life > p.max || p.y < 4) Object.assign(p, lbSpawnPart(cv.width, cv.height));
                }
                const k = p.life / p.max;
                const alpha = Math.max(0, (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75) * GLOW_ALPHA[ti]);
                ctx.globalAlpha = alpha;
                if (type === 'smoke') {
                    ctx.drawImage(smokePuff(), p.x - 8, p.y - 8);
                } else if (type === 'heart') {
                    ctx.fillStyle = a.parts[p.ci];
                    const s = p.ci === 0 ? 2 : 1; // часть сердечек покрупнее
                    HEART_MINI.forEach((row, hy) => {
                        for (let hx = 0; hx < 5; hx++) {
                            if (row[hx] === 'r') ctx.fillRect(p.x + (hx - 2) * s, p.y + (hy - 2) * s, s, s);
                        }
                    });
                } else {
                    ctx.fillStyle = a.parts[p.ci];
                    ctx.fillRect(Math.round(p.x / 2) * 2, Math.round(p.y / 2) * 2, 2, 2);
                }
            });
            ctx.globalAlpha = 1;
        }
    }
    ctx.drawImage(sprite, item.ox, item.oy);
    if (ti >= 2) {
        const ga = Math.min(0.9, (0.35 + 0.3 * Math.sin(lbTick * 0.07)) * (ti === 3 ? 1.3 : 1));
        [[8.5, 7.5], [14.5, 7.5]].forEach(ep => {
            const ex = item.ox + ep[0] * 2, ey = item.oy + ep[1] * 2;
            const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 5);
            eg.addColorStop(0, a.inner + ga + ')');
            eg.addColorStop(1, a.outer + '0)');
            ctx.fillStyle = eg;
            ctx.beginPath(); ctx.arc(ex, ey, 5, 0, 7); ctx.fill();
        });
    }
}

function lbFrame() {
    requestAnimationFrame(lbFrame);
    if (currentView !== 'view-top' || !lbItems.length) return;
    lbTick++;
    if (lbTick % 2) return; // ~30 кадров/с — хватает и не греет телефон
    lbItems.forEach(item => lbDrawItem(item, true));
}

function buildLbItems(all) {
    lbItems = [];
    document.querySelectorAll('#view-top .lb-av').forEach(cv => {
        const p = all[Number(cv.dataset.i)];
        const sprite = getSprite(p.opts, 2);
        const ti = TIERS.indexOf(tierForLevel(p.level));
        const a = AURAS[p.aura] || AURAS.gold;
        const parts = [];
        for (let i = 0; i < GLOW_PARTS[ti]; i++) {
            const pt = lbSpawnPart(cv.width, cv.height);
            pt.life = Math.random() * pt.max;
            pt.ci = Math.floor(Math.random() * a.parts.length);
            parts.push(pt);
        }
        cv.style.filter = ti > 0 ? `drop-shadow(0 0 ${GLOW_SHADOW[ti]} ${a.sw})` : '';
        const item = {
            cv, ctx: cv.getContext('2d'), sprite, aura: p.aura, ti, parts,
            type: a.type || 'flame',
            boltPts: genMiniBolt(cv.width, cv.height), boltLife: 5, boltTimer: 10 + Math.random() * 40,
            glowBg: ti > 0 ? glowBgFor(p.aura, ti, cv.width, cv.height) : null,
            ox: (cv.width - sprite.width) / 2,
            oy: cv.height - sprite.height - 2
        };
        lbItems.push(item);
        lbDrawItem(item, false); // первый кадр сразу, даже без анимации
    });
    if (!lbLoopStarted) {
        lbLoopStarted = true;
        requestAnimationFrame(lbFrame);
    }
}

function lbRow(p, rank) {
    const rankCls = rank === 1 ? ' lb-gold' : rank === 2 ? ' lb-silver' : rank === 3 ? ' lb-bronze' : '';
    const achList = p.achList || [];
    const shown = achList.slice(0, 6);
    return `<div class="lb-row${p.me ? ' lb-me' : ''}">
        <span class="lb-rank px-font${rankCls}">${rank}</span>
        <canvas class="lb-av px" width="56" height="70" data-i="${p._i}"></canvas>
        <div class="lb-info">
            <div class="lb-nick">${esc(p.nick)}${p.me ? ' <span class="lb-you">— ты</span>' : ''}</div>
            <div class="lb-ach-row">
                ${shown.length ? shown.map(x => `<span title="${esc(x.name)}">${icon(x.icon, 14)}</span>`).join('') : '<span class="muted small">без ачивок</span>'}
                ${achList.length > 6 ? `<span class="muted small">+${achList.length - 6}</span>` : ''}
            </div>
        </div>
        <span class="lb-lvl px-font">LVL ${p.level}</span>
        <span class="lb-exp px-font">${p.weekExp} EXP</span>
    </div>`;
}

function renderTop() {
    const mk = mondayOf(todayKey());
    const me = {
        me: true,
        nick: S.charName || CHARACTERS[S.gender].name,
        weekExp: S.weekExp[mk] || 0,
        level: S.level,
        achCount: ACHIEVEMENTS.filter(a => S.ach[a.id]).length,
        aura: S.aura,
        opts: spriteOpts()
    };
    me.achList = ACHIEVEMENTS.filter(a => S.ach[a.id]);
    // боты набирают опыт постепенно в течение недели — живая гонка
    const bots = weekBots().map(b => Object.assign({}, b, { weekExp: botCurrentExp(b) }));
    const all = [...bots, me].sort((a, b) => (b.weekExp - a.weekExp) || (a.me ? -1 : 1));
    all.forEach((p, i) => { p._i = i; });
    const myRank = all.indexOf(me) + 1;
    const top = all.slice(0, 50);
    const monday = parseKey(mk);
    const sunday = parseKey(keyOffset(mk, 6));

    $('view-top').innerHTML = `
    <div class="card">
        <div class="card-head">
            <span class="card-label">Топ-50 недели</span>
            <span class="muted small">${monday.getDate()} ${MONTHS[monday.getMonth()]} — ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}</span>
        </div>
        <p class="muted small">Рейтинг по опыту, набранному за эту неделю. В понедельник — новый сезон и новые соперники. Твоё место: <b class="lb-you">#${myRank}</b></p>
        <div class="lb-list">
            ${top.map((p, i) => lbRow(p, i + 1)).join('')}
            ${myRank > 50 ? `<div class="lb-gap muted small">··· ещё ${myRank - 51} игроков ···</div>${lbRow(me, myRank)}` : ''}
        </div>
    </div>`;

    // аватарки: первый кадр + анимация
    buildLbItems(all);
}

// ---------- Экран «Магазин» ----------

function shopCardHTML(item, isCustom) {
    return `<div class="shop-card${item.id === 'allday' ? ' legendary' : ''}" data-id="${item.id}"${isCustom ? ' data-custom="1"' : ''}>
        <button class="row-btn row-del shop-del" data-act="${isCustom ? 'shop-custom-del' : 'shop-hide'}" title="Убрать из магазина">×</button>
        ${icon(item.icon, 56)}
        <div class="shop-name">${esc(item.name)}</div>
        <div class="muted small shop-desc">${esc(item.desc || 'Своя награда')}</div>
        <button class="btn shop-buy" data-act="shop-buy">${item.price} ${coinIcon(13)} · Купить</button>
    </div>`;
}

// Владение аурой (дым открывается автоматически за боссов дня)
function auraOwned(k) {
    if (S.ownedAuras.includes(k)) return true;
    const a = AURAS[k];
    if (a.currency === 'bossday' && S.trophies.bossDay >= a.price) {
        S.ownedAuras.push(k);
        save();
        return true;
    }
    return false;
}

function auraPriceLabel(a) {
    if (a.currency === 'crystals') return `${a.price} ${icon('gem', 12)}`;
    if (a.currency === 'bossday') return `${a.price} боссов дня`;
    return `${a.price} ${coinIcon(11)}`;
}

function renderShop() {
    const previewAura = AURAS[shopAura];
    const owned = auraOwned(shopAura);
    const visibleItems = SHOP_ITEMS.filter(i => !S.hiddenShop.includes(i.id));
    const hiddenCount = SHOP_ITEMS.length - visibleItems.length;

    let buyLine;
    if (owned) {
        buyLine = S.aura === shopAura ? '<span class="muted small">— надета</span>' : `<button class="btn btn-sm" data-act="aura-equip" data-k="${shopAura}">Надеть</button>`;
    } else if (previewAura.currency === 'bossday') {
        buyLine = `<span class="muted small">открывается за боссов дня: <b>${S.trophies.bossDay} / ${previewAura.price}</b> ${icon('skull', 13)}</span>`;
    } else if (previewAura.currency === 'crystals') {
        buyLine = `<button class="btn btn-sm shop-buy" data-act="shop-aura-buy" data-k="${shopAura}">Купить за ${previewAura.price} ${icon('gem', 12)}</button>
                   <span class="muted small">кристаллы — донат-валюта (скоро)</span>`;
    } else {
        buyLine = `<button class="btn btn-sm shop-buy" data-act="shop-aura-buy" data-k="${shopAura}">Купить за ${previewAura.price} ${coinIcon(12)}</button>`;
    }

    $('view-shop').innerHTML = `
    <div class="card">
        <div class="card-head"><span class="card-label">Магазин наград</span><span class="hud-chip hud-coins">${coinIcon(16)} ${S.coins}</span></div>
        <p class="muted small">Монеты за задачи и уровни → удовольствия в реальной жизни. Без чувства вины — ты заработал. Не нужна стандартная награда — убери её крестиком.</p>
        <div class="shop-grid">
            ${visibleItems.map(i => shopCardHTML(i, false)).join('')}
            ${S.customRewards.map(i => shopCardHTML(i, true)).join('')}
        </div>
        ${hiddenCount > 0 ? `<button class="btn btn-ghost-inline btn-sm" data-act="shop-restore" style="margin-top:12px;">Вернуть убранные награды (${hiddenCount})</button>` : ''}
    </div>

    <div class="card">
        <div class="card-head"><span class="card-label">Свечение героя</span>
            <span class="hud-chip" title="Кристаллы — донат-валюта">${icon('gem', 15)} ${S.crystals}</span></div>
        <div class="aura-shop">
            <div class="scene-wrap scene-wrap-shop"><canvas id="shop-scene" width="320" height="300"></canvas></div>
            <div class="aura-shop-right">
                <p class="muted small">Сила свечения растёт сама: тусклая с 10 уровня, яркая с 25, «Олимпиец» с 50 — её нельзя купить. Цвет — за монеты, дым — за 90 боссов дня, молнии и сердечки — за кристаллы.</p>
                <div class="muted small" style="margin: 8px 0 4px;">Предпросмотр яркости:</div>
                <div class="tier-row">
                    ${['10+', '25+', '50+'].map((lb, i) =>
                        `<button class="btn btn-sm tier-btn${shopTier === i + 1 ? ' active' : ''}" data-act="shop-tier" data-i="${i + 1}">${lb}</button>`).join('')}
                </div>
                <div class="muted small" style="margin: 8px 0 4px;">Цвет ауры:</div>
                <div class="aura-row">
                    ${Object.keys(AURAS).map(k => {
                        const a = AURAS[k];
                        const own = auraOwned(k);
                        return `<div class="aura-cell">
                            <button class="aura-btn${shopAura === k ? ' active' : ''}${own ? '' : ' locked'}" data-act="shop-aura" data-k="${k}" style="background:${a.sw}" title="${a.label}">${own ? '' : icon('lock', 16)}</button>
                            <span class="muted small">${own ? a.label : auraPriceLabel(a)}</span>
                        </div>`;
                    }).join('')}
                </div>
                <div class="aura-buy-line">
                    <b>${previewAura.label}</b>
                    ${buyLine}
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-label">Своя награда</div>
        <div class="custom-form">
            <input id="custom-name" class="input" placeholder="Название (например: Суши)">
            <input id="custom-price" class="input" type="number" min="10" step="10" placeholder="Цена">
        </div>
        <div class="icon-picker">
            ${CUSTOM_ICON_KEYS.map(k => `<button class="icon-pick${pickedIcon === k ? ' active' : ''}" data-act="pick-icon" data-k="${k}">${icon(k, 32)}</button>`).join('')}
        </div>
        <button class="btn" data-act="custom-add">+ Добавить в магазин</button>
    </div>

    <div class="card">
        <div class="card-label">История покупок</div>
        <div class="history">
            ${S.purchases.length === 0 ? '<p class="muted small">Пока пусто. Заработай монеты и купи первую награду!</p>'
              : S.purchases.slice(0, 20).map(p => `<div class="history-row"><span>${esc(p.name)}</span><span class="muted small">−${p.price} ${coinIcon(11)} · ${p.d}</span></div>`).join('')}
        </div>
    </div>`;

    paintStatic('shop-scene', spriteOpts());
}

// ---------- Создание персонажа (заглушка регистрации) ----------

function openCreator(isFirst) {
    const draft = {
        name: S.charName || '',
        gender: S.gender,
        hair: S.appearance.hair,
        hairColor: S.appearance.hairColor,
        eyeColor: S.appearance.eyeColor,
        skin: S.appearance.skin
    };

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
    <div class="modal creator">
        ${isFirst ? '' : '<button class="row-btn creator-close" title="Закрыть">×</button>'}
        <h2 class="modal-title glow-gold creator-title">${isFirst ? 'Создание персонажа' : 'Внешность героя'}</h2>
        ${isFirst ? '<p class="muted small">Регистрация появится позже — пока герой живёт в этом браузере.</p>' : ''}
        <div class="creator-grid">
            <div class="creator-preview"><canvas id="creator-canvas" width="200" height="250" class="px"></canvas></div>
            <div class="creator-form">
                <input id="creator-name" class="input" maxlength="16" placeholder="Ник героя..." value="${esc(draft.name)}">
                <div class="creator-row" id="cr-gender"></div>
                <div class="creator-label muted small">Причёска</div>
                <div class="creator-row" id="cr-hair"></div>
                <div class="creator-label muted small">Цвет волос</div>
                <div class="creator-row" id="cr-haircolor"></div>
                <div class="creator-label muted small">Цвет глаз</div>
                <div class="creator-row" id="cr-eyes"></div>
            </div>
        </div>
        <button class="btn btn-primary" id="creator-save">${isFirst ? 'Создать героя' : 'Сохранить'}</button>
    </div>`;
    $('modal-root').appendChild(overlay);

    const paint = () => {
        // если стиль не существует для выбранного пола — берём классику
        if (!HAIRSTYLES[draft.gender][draft.hair]) draft.hair = 'classic';

        overlay.querySelector('#cr-gender').innerHTML =
            `<button class="btn btn-sm cr-opt${draft.gender === 'm' ? ' active' : ''}" data-cr="gender" data-v="m">Мужской</button>
             <button class="btn btn-sm cr-opt${draft.gender === 'f' ? ' active' : ''}" data-cr="gender" data-v="f">Женский</button>`;

        overlay.querySelector('#cr-hair').innerHTML = Object.keys(HAIRSTYLES[draft.gender]).map(k =>
            `<button class="btn btn-sm cr-opt${draft.hair === k ? ' active' : ''}" data-cr="hair" data-v="${k}">${HAIRSTYLES[draft.gender][k].label}</button>`).join('');

        overlay.querySelector('#cr-haircolor').innerHTML = Object.keys(HAIR_COLORS).map(k =>
            `<button class="cr-swatch${draft.hairColor === k ? ' active' : ''}" data-cr="hairColor" data-v="${k}" style="background:${HAIR_COLORS[k].B}" title="${HAIR_COLORS[k].label}"></button>`).join('');

        overlay.querySelector('#cr-eyes').innerHTML = Object.keys(EYE_COLORS).map(k =>
            `<button class="cr-swatch${draft.eyeColor === k ? ' active' : ''}" data-cr="eyeColor" data-v="${k}" style="background:${EYE_COLORS[k].e}" title="${EYE_COLORS[k].label}"></button>`).join('');

        const cv = overlay.querySelector('#creator-canvas');
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#0b0e14';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.ellipse(cv.width / 2, cv.height - 10, 60, 10, 0, 0, 7); ctx.fill();
        const sprite = getSprite(draft, 8);
        ctx.drawImage(sprite, (cv.width - sprite.width) / 2, cv.height - sprite.height - 14);
    };

    overlay.addEventListener('click', e => {
        const opt = e.target.closest('[data-cr]');
        if (opt) {
            draft[opt.dataset.cr] = opt.dataset.v;
            paint();
            return;
        }
        if (e.target.closest('.creator-close')) overlay.remove();
        if (e.target.closest('#creator-save')) {
            const nameInput = overlay.querySelector('#creator-name');
            S.charName = nameInput.value.trim() || CHARACTERS[draft.gender].name;
            S.gender = draft.gender;
            S.appearance = { hair: draft.hair, hairColor: draft.hairColor, eyeColor: draft.eyeColor, skin: draft.skin };
            S.created = true;
            resetParticles();
            save();
            overlay.remove();
            rerender();
        }
    });

    paint();
}

// ---------- Роутер и общий рендер ----------

const RENDERERS = {
    'view-today': renderToday,
    'view-week': renderWeek,
    'view-goals': renderGoals,
    'view-top': renderTop,
    'view-character': renderCharacter,
    'view-shop': renderShop
};

function showView(id) {
    currentView = id;
    resetParticles();
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === id));
    RENDERERS[id]();
}

function rerender() {
    RENDERERS[currentView]();
    renderHUD();
    renderSideChar();
}

// ---------- События ----------

function findRow(el) { return el.closest('.row, .task-row'); }

function onTaskToggle(el, ev) {
    const row = findRow(el);
    const date = row.dataset.date, id = row.dataset.id;
    const task = (S.tasks[date] || []).find(t => t.id === id);
    if (!task) return;
    task.done = !task.done;
    if (task.done && task.text.trim()) {
        const first = award(`${date}_${id}`, ECON.EXP_TASK, ev);
        if (first) {
            gainCoins(ECON.COINS_TASK, ev);
            S.totals.tasks++;
            bumpActivity('t', date);
            if (task.boss) {
                const bossFirst = award(`${date}_bossday`, ECON.EXP_BOSS_DAY, ev);
                if (bossFirst) {
                    gainCoins(ECON.COINS_BOSS_DAY, ev);
                    S.trophies.bossDay++;
                    toast('skull', 'Мини-босс дня повержен!', `+${ECON.EXP_BOSS_DAY} EXP · +${ECON.COINS_BOSS_DAY} монеты`);
                    unlockCheck({ event: 'boss_day' });
                }
            }
            unlockCheck({ event: 'task', hour: new Date().getHours() });
        }
    }
    save();
    rerender();
}

function onHabitToggle(el, ev) {
    const row = findRow(el);
    const id = row.dataset.id;
    const key = viewDayKey;
    if (!S.habitChecks[key]) S.habitChecks[key] = {};
    const oldStreak = habitStreak(id);
    const now = !S.habitChecks[key][id];
    if (now) S.habitChecks[key][id] = true;
    else delete S.habitChecks[key][id];

    if (now) {
        const first = award(`${key}_${id}`, ECON.EXP_HABIT, ev);
        if (first) {
            gainCoins(ECON.COINS_HABIT, ev);
            S.totals.habits++;
            bumpActivity('h', key);
            // Медаль за каждые 7 дней стрика привычки (как в v1)
            const newStreak = habitStreak(id);
            if (newStreak > oldStreak && newStreak > 0 && newStreak % 7 === 0) {
                S.trophies.medals++;
                S.habitMedals[id] = (S.habitMedals[id] || 0) + 1;
                const habit = S.habits.find(h => h.id === id);
                toast('medal', 'Медаль!', `«${habit ? habit.text : ''}» — ${newStreak} дней подряд! +100 EXP`);
                gainExp(100, ev);
                // 13 медалей = СУПЕР-МЕДАЛЬ, огонёк привычки становится голубым
                if (S.habitMedals[id] % 13 === 0) {
                    modal(`<div class="modal-icon">${icon('supermedal', 72)}</div>
                        <h2 class="modal-title glow-gold">СУПЕР-МЕДАЛЬ!</h2>
                        <p>«${esc(habit ? habit.text : '')}» — 13 медалей подряд!</p>
                        <p class="muted">Огонёк привычки теперь голубой. +250 EXP</p>`);
                    gainExp(250, ev);
                }
            }
            unlockCheck({ event: 'habit', hour: new Date().getHours() });
        }
    }
    const s = allHabitsStreak();
    if (s > S.trophies.bestHabitStreak) S.trophies.bestHabitStreak = s;
    recalcActivityStreak();
    save();
    rerender();
}

function bindEvents() {
    document.querySelector('.sidebar').addEventListener('click', e => {
        const btn = e.target.closest('[data-view]');
        if (btn) showView(btn.dataset.view);
    });

    const content = document.querySelector('.content');

    content.addEventListener('click', e => {
        const el = e.target.closest('[data-act]');
        if (!el) return;
        const act = el.dataset.act;
        const row = findRow(el);

        if (act === 'task-toggle') onTaskToggle(el, e);
        else if (act === 'habit-toggle') onHabitToggle(el, e);

        else if (act === 'day-prev') { viewDayKey = keyOffset(viewDayKey, -1); renderToday(); }
        else if (act === 'day-next') { viewDayKey = keyOffset(viewDayKey, 1); renderToday(); }
        else if (act === 'day-today') { viewDayKey = todayKey(); renderToday(); }

        else if (act === 'task-boss') {
            const date = row.dataset.date, id = row.dataset.id;
            (S.tasks[date] || []).forEach(t => { t.boss = (t.id === id) ? !t.boss : false; });
            save(); rerender();
        }
        else if (act === 'task-del') {
            const date = row.dataset.date, id = row.dataset.id;
            S.tasks[date] = (S.tasks[date] || []).filter(t => t.id !== id);
            save(); rerender();
        }
        else if (act === 'task-add') {
            const input = $('new-task-input');
            const text = input.value.trim();
            if (!text) return;
            dayTasks(viewDayKey).push({ id: uid(), text, done: false, boss: false });
            save(); rerender();
            $('new-task-input').focus();
        }
        else if (act === 'week-task-add') {
            dayTasks(el.dataset.date).push({ id: uid(), text: '', done: false, boss: false });
            save(); rerender();
        }
        else if (act === 'habit-del') {
            S.habits = S.habits.filter(h => h.id !== row.dataset.id);
            save(); rerender();
        }
        else if (act === 'habit-add') {
            const input = $('new-habit-input');
            const text = input.value.trim();
            if (!text) return;
            S.habits.push({ id: uid(), text });
            save(); rerender();
        }
        else if (act === 'week-prev') { viewMonday = keyOffset(viewMonday, -7); renderWeek(); }
        else if (act === 'week-next') { viewMonday = keyOffset(viewMonday, 7); renderWeek(); }
        else if (act === 'week-now') { viewMonday = mondayOf(todayKey()); renderWeek(); }

        else if (act === 'tpl-del') {
            const tpl = S.templates.find(t => t.id === row.dataset.id);
            if (tpl) removeTemplateTasks(tpl);
            S.templates = S.templates.filter(t => t.id !== row.dataset.id);
            save(); renderWeek();
        }
        else if (act === 'tpl-add') {
            const input = $('new-tpl-input');
            const text = input.value.trim();
            const days = Array.from(document.querySelectorAll('.tpl-days input:checked')).map(cb => Number(cb.value));
            if (!text || !days.length) return;
            S.templates.push({ id: uid(), text, days });
            // вставляем в уже открытые сегодня/будущие дни
            const today = todayKey();
            Object.keys(S.tplInjected).forEach(key => {
                if (key >= today && S.tplInjected[key]) {
                    const weekday = parseKey(key).getDay();
                    if (days.includes(weekday)) {
                        S.tasks[key].push({ id: uid(), text, done: false, boss: false, tpl: S.templates[S.templates.length - 1].id });
                    }
                }
            });
            save(); renderWeek();
        }
        else if (act === 'boss-kill') {
            killBoss(el.dataset.type, el.dataset.key, e);
            rerender();
        }
        else if (act === 'goal-toggle') {
            const type = row.dataset.type, id = row.dataset.id;
            const d = new Date();
            const key = type === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : String(d.getFullYear());
            const store = type === 'month' ? S.monthGoals : S.yearGoals;
            const goal = (store[key] || []).find(g => g.id === id);
            if (!goal) return;
            goal.done = !goal.done;
            if (goal.done && goal.text.trim()) {
                const exp = type === 'month' ? ECON.EXP_GOAL_MONTH : ECON.EXP_GOAL_YEAR;
                const coins = type === 'month' ? ECON.COINS_GOAL_MONTH : ECON.COINS_GOAL_YEAR;
                if (award(`goal_${key}_${id}`, exp, e)) gainCoins(coins, e);
            }
            save(); rerender();
        }
        else if (act === 'goal-del') {
            const type = row.dataset.type;
            const d = new Date();
            const key = type === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : String(d.getFullYear());
            const store = type === 'month' ? S.monthGoals : S.yearGoals;
            store[key] = (store[key] || []).filter(g => g.id !== row.dataset.id);
            save(); rerender();
        }
        else if (act === 'goal-add') {
            const type = el.dataset.type;
            const d = new Date();
            const key = type === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : String(d.getFullYear());
            const store = type === 'month' ? S.monthGoals : S.yearGoals;
            const input = $(type === 'month' ? 'new-month-goal' : 'new-year-goal');
            const text = input.value.trim();
            if (!text) return;
            if (!store[key]) store[key] = [];
            store[key].push({ id: uid(), text, done: false });
            save(); rerender();
        }
        else if (act === 'edit-char') {
            openCreator(false);
        }
        else if (act === 'aura-equip') {
            const k = el.dataset.k;
            if (S.ownedAuras.includes(k)) {
                S.aura = k;
                resetParticles();
                save(); rerender();
            }
        }
        else if (act === 'shop-tier') {
            shopTier = Number(el.dataset.i);
            resetParticles();
            renderShop();
        }
        else if (act === 'shop-aura') {
            shopAura = el.dataset.k;
            resetParticles();
            renderShop();
        }
        else if (act === 'shop-aura-buy') {
            const k = el.dataset.k;
            const aura = AURAS[k];
            if (S.ownedAuras.includes(k)) return;
            const wallet = aura.currency === 'crystals' ? S.crystals : S.coins;
            if (wallet < aura.price) {
                el.classList.add('no-money');
                setTimeout(() => el.classList.remove('no-money'), 500);
                return;
            }
            if (aura.currency === 'crystals') S.crystals -= aura.price;
            else S.coins -= aura.price;
            S.ownedAuras.push(k);
            S.aura = k;
            S.purchases.unshift({ d: todayKey(), name: 'Аура: ' + aura.label, price: aura.price });
            S.totals.purchases++;
            resetParticles();
            toast('star', 'Новая аура!', `${aura.label} — надета`);
            unlockCheck({ event: 'buy' });
            save(); renderHUD(); renderShop();
        }
        else if (act === 'shop-hide') {
            const card = el.closest('.shop-card');
            if (!S.hiddenShop.includes(card.dataset.id)) S.hiddenShop.push(card.dataset.id);
            save(); renderShop();
        }
        else if (act === 'shop-restore') {
            S.hiddenShop = [];
            save(); renderShop();
        }
        else if (act === 'shop-buy') {
            const card = el.closest('.shop-card');
            const id = card.dataset.id;
            const item = card.dataset.custom
                ? S.customRewards.find(r => r.id === id)
                : SHOP_ITEMS.find(i => i.id === id);
            if (!item) return;
            if (S.coins < item.price) {
                el.classList.add('no-money');
                setTimeout(() => el.classList.remove('no-money'), 500);
                return;
            }
            S.coins -= item.price;
            S.purchases.unshift({ d: todayKey(), name: item.name, price: item.price });
            if (S.purchases.length > 50) S.purchases.length = 50;
            S.totals.purchases++;
            modal(`<div class="modal-icon">${icon(item.icon, 72)}</div>
                <h2 class="modal-title glow-gold">Награда получена!</h2>
                <p>${esc(item.name)}</p>
                <p class="muted">Ты честно это заработал. Наслаждайся!</p>`);
            unlockCheck({ event: 'buy' });
            save(); renderHUD(); renderShop();
        }
        else if (act === 'shop-custom-del') {
            const card = el.closest('.shop-card');
            S.customRewards = S.customRewards.filter(r => r.id !== card.dataset.id);
            save(); renderShop();
        }
        else if (act === 'pick-icon') {
            pickedIcon = el.dataset.k;
            renderShop();
        }
        else if (act === 'custom-add') {
            const name = $('custom-name').value.trim();
            const price = parseInt($('custom-price').value, 10);
            if (!name || !price || price < 10) return;
            S.customRewards.push({ id: 'cr_' + uid(), name, price, icon: pickedIcon, kind: 'reward' });
            save(); renderShop();
        }
        else if (act === 'acc-login' || act === 'acc-signup') {
            const email = ($('acc-email').value || '').trim();
            const pass = $('acc-pass').value || '';
            if (!email || pass.length < 6) {
                accStatus('Укажи почту и пароль от 6 символов', true);
                return;
            }
            accStatus(act === 'acc-login' ? 'Входим...' : 'Регистрируем...');
            (async () => {
                try {
                    const data = act === 'acc-login'
                        ? await signIn(email, pass)
                        : await signUp(email, pass);
                    if (!data.session) {
                        accStatus('Аккаунт создан! Подтверди почту по письму и нажми «Войти».');
                        return;
                    }
                    cloudUser = data.user;
                    await syncOnLogin();
                } catch (err) {
                    accStatus((err.message || 'Ошибка'), true);
                }
            })();
        }
        else if (act === 'acc-logout') {
            (async () => {
                await signOut();
                cloudUser = null;
                toast('shield', 'Вышел из аккаунта', 'Герой остаётся в этом браузере');
                rerender();
            })();
        }
    });

    content.addEventListener('change', e => {
        const el = e.target.closest('[data-act]');
        if (!el) return;
        const act = el.dataset.act;
        const row = findRow(el);

        if (act === 'task-edit') {
            const task = (S.tasks[row.dataset.date] || []).find(t => t.id === row.dataset.id);
            if (task) {
                task.text = el.value;
                save();
                rerender(); // пересортировка по времени
            }
        }
        else if (act === 'goal-edit') {
            const type = row.dataset.type;
            const d = new Date();
            const key = type === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : String(d.getFullYear());
            const store = type === 'month' ? S.monthGoals : S.yearGoals;
            const goal = (store[key] || []).find(g => g.id === row.dataset.id);
            if (goal) { goal.text = el.value; save(); }
        }
        else if (act === 'boss-text') {
            const boss = getBoss(bossStore(el.dataset.type), el.dataset.key);
            boss.text = el.value;
            save(); rerender();
        }
    });

    content.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const id = e.target.id;
        if (id === 'new-task-input') content.querySelector('[data-act="task-add"]').click();
        else if (id === 'new-habit-input') content.querySelector('[data-act="habit-add"]').click();
        else if (id === 'new-month-goal') content.querySelector('[data-act="goal-add"][data-type="month"]').click();
        else if (id === 'new-year-goal') content.querySelector('[data-act="goal-add"][data-type="year"]').click();
        else if (id === 'custom-name' || id === 'custom-price') content.querySelector('[data-act="custom-add"]').click();
    });
}

// ---------- Старт ----------

function init() {
    load();
    // Миграция: раздаём медали привычкам по текущим стрикам (habitMedals появился позже)
    if (!Object.keys(S.habitMedals).length && S.trophies.medals > 0) {
        S.habits.forEach(h => {
            const m = Math.floor(habitStreak(h.id) / 7);
            if (m > 0) S.habitMedals[h.id] = m;
        });
    }
    const decay = applyDecay();
    recalcActivityStreak();

    buildNavIcons();
    renderHUD();
    renderSideChar();
    showView('view-today');
    bindEvents();

    startAuraLoop(() => {
        if (currentView === 'view-shop') {
            return {
                canvasId: 'shop-scene',
                spriteOpts: spriteOpts(),
                auraKey: shopAura,
                tier: TIERS[shopTier],
                visible: true
            };
        }
        return {
            canvasId: 'char-scene',
            spriteOpts: spriteOpts(),
            auraKey: S.aura,
            tier: tierForLevel(S.level),
            visible: currentView === 'view-character'
        };
    });

    // Первый запуск — создание персонажа
    if (!S.created) openCreator(true);

    // Аккаунт: проверяем сессию в фоне
    initCloud();

    if (decay.loss > 0) {
        modal(`<div class="modal-icon">${icon('moon', 72)}</div>
            <h2 class="modal-title">Пока тебя не было...</h2>
            <p class="muted">${decay.gap} дн. без планера. Опыт откатился на <b>−${decay.loss} EXP</b>${decay.levelsLost ? ` (−${decay.levelsLost} ур.)` : ''}.</p>
            <p class="muted small">Грейс — 2 дня. Возвращайся чаще!</p>`);
    }
    if (decay.gap >= 7) {
        unlockCheck({ event: 'return', gapDays: decay.gap });
    }
    save();
}

init();
