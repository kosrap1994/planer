// =====================================================
// top.js — Топ-50 недели: генерация ботов-соперников
// Сид = понедельник недели → у всех одинаковые боты,
// каждый понедельник — новая сотня.
// =====================================================

import { todayKey, mondayOf } from './state.js';
import { HAIRSTYLES, HAIR_COLORS, EYE_COLORS, SKIN_TONES } from './pixel.js';
import { ACHIEVEMENTS } from './game.js';

function hashStr(s) {
    let h = 1779033703;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
}

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const LAT_A = ['Shadow', 'Dark', 'Neo', 'Pixel', 'Iron', 'Cyber', 'Night', 'Storm', 'Fire', 'Ice', 'Mega', 'Turbo', 'Magic', 'Wild', 'Silent', 'Crazy', 'Lucky', 'Ghost', 'Super', 'Alpha'];
const LAT_B = ['Knight', 'Wolf', 'Hunter', 'Master', 'Lord', 'Queen', 'King', 'Dragon', 'Ninja', 'Hero', 'Slayer', 'Fox', 'Cat', 'Rider', 'Boss', 'Girl', 'Man', 'Star', 'Blade', 'Core'];
const RU_NAMES = ['Дима', 'Саша', 'Максим', 'Лера', 'Аня', 'Кирилл', 'Оля', 'Настя', 'Игорь', 'Женя', 'Витя', 'Никита', 'Соня', 'Паша', 'Рома', 'Юля', 'Артём', 'Даша', 'Глеб', 'Ксюша', 'Тоха', 'Серго', 'Марго', 'Костян', 'Вован'];

function makeNick(rng, used) {
    for (let tries = 0; tries < 20; tries++) {
        let nick;
        if (rng() < 0.45) {
            nick = RU_NAMES[Math.floor(rng() * RU_NAMES.length)];
            if (rng() < 0.5) nick += Math.floor(rng() * 998) + 1;
        } else {
            nick = LAT_A[Math.floor(rng() * LAT_A.length)] + LAT_B[Math.floor(rng() * LAT_B.length)];
            if (rng() < 0.35) nick += Math.floor(rng() * 98) + 1;
        }
        if (!used.has(nick)) {
            used.add(nick);
            return nick;
        }
    }
    return 'Player' + Math.floor(rng() * 9999);
}

function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
}

const CRYSTAL_AURAS = ['electric', 'greenbolt', 'hearts'];
const COIN_AURAS = ['gold', 'violet', 'green', 'pink'];

let _cache = { key: null, bots: null };

export function weekBots() {
    const mk = mondayOf(todayKey());
    if (_cache.key === mk) return _cache.bots;

    const rng = mulberry32(hashStr('top50_' + mk));
    const used = new Set();
    const bots = [];

    for (let i = 0; i < 100; i++) {
        // Опыт за неделю: много «середняков», немного гигантов (до ~4200)
        const weekExp = Math.round(20 + 4200 * Math.pow(rng(), 2.4));
        const level = Math.max(1, Math.min(99, Math.round(weekExp / 70 + rng() * 30)));

        const gender = rng() < 0.5 ? 'm' : 'f';
        const opts = {
            gender,
            hair: pick(rng, Object.keys(HAIRSTYLES[gender])),
            hairColor: pick(rng, Object.keys(HAIR_COLORS)),
            eyeColor: pick(rng, Object.keys(EYE_COLORS)),
            skin: pick(rng, Object.keys(SKIN_TONES))
        };

        // Ауры: топы щеголяют донатными, середина — купленными за монеты
        let aura = 'gold';
        if (level >= 50 && rng() < 0.65) aura = pick(rng, CRYSTAL_AURAS);
        else if (level >= 35 && rng() < 0.35) aura = 'smoke';
        else aura = pick(rng, COIN_AURAS);

        const achCount = Math.min(ACHIEVEMENTS.length, Math.floor(level / 6) + Math.floor(rng() * 4));
        // конкретные ачивки бота: перемешиваем список и берём achCount штук
        const idx = ACHIEVEMENTS.map((_, n) => n);
        for (let n = idx.length - 1; n > 0; n--) {
            const j = Math.floor(rng() * (n + 1));
            [idx[n], idx[j]] = [idx[j], idx[n]];
        }
        const achList = idx.slice(0, achCount).map(n => ACHIEVEMENTS[n]);

        bots.push({ nick: makeNick(rng, used), weekExp, level, achCount, achList, aura, opts });
    }

    bots.sort((a, b) => b.weekExp - a.weekExp);

    // Витрина: самые топовые ОБЯЗАНЫ сверкать донатом.
    // Ранги 1–8 — кристальные ауры (молнии/сердечки), 9–16 — дым вперемешку с кристаллами.
    bots.forEach((b, i) => {
        if (i < 8) {
            b.aura = CRYSTAL_AURAS[i % CRYSTAL_AURAS.length];
            b.level = Math.max(b.level, 55);
        } else if (i < 16) {
            b.aura = (i % 2 === 0) ? 'smoke' : CRYSTAL_AURAS[Math.floor(rng() * CRYSTAL_AURAS.length)];
            b.level = Math.max(b.level, 40);
        }
    });

    _cache = { key: mk, bots };
    return bots;
}
