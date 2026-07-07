// =====================================================
// pixel.js — спрайты, пиксельные иконки, движок ауры
// =====================================================

// ---------- Персонажи: paper-doll (тело + слой причёски) ----------

// Базовое тело мужчины (лысая голова, буквы кожи q/s/t, глаз d/e/f, брони u/v/x/g/y/z/k/l)
// Череп — компактный купол: причёски добавляют объём ПОВЕРХ него
const BASE_M = [
    "........ssssss........",
    "......stttttttts......",
    "....ssttttttttttss....",
    "...ssttttttttttttss...",
    "..qsssttttttttttsssq..",
    "..qsssttttttttttsssq..",
    "..qsssddddssddddsssq..",
    "..qsssdWfessdWfesssq..",
    "..qsssdeffssdeffsssq..",
    "..qssssssssssssssssq..",
    "..qsssssssmmsssssssq..",
    "...qqssssssssssssqq...",
    ".....qqssssssssqq.....",
    "........qssssq........",
    "..xxvuvvyyyyyyvvuvxx..",
    "..xvvuvvvvyyvvvvuvvx..",
    "..vvvuvvvvyyvvvvuvvv..",
    "..gyy.vvvvyyvvvv.yyg..",
    ".....uvvvvyyvvvvu.....",
    ".....uggggggggggu.....",
    ".....gyyyyzzyyyyg.....",
    ".....uvvvvuuvvvvu.....",
    ".....uvvvu..uvvvu.....",
    ".....uvvu....uvvu.....",
    "......klk....klk......",
    "......klk....klk......",
    "......kllk..kllk......",
    ".....kkllk..kllkk.....",
    ".....kkkkk..kkkkk....."
];

// Базовое тело девушки — с руками (плечи vv по бокам, кисти s в 17-м ряду)
const BASE_F = [
    "........ssssss........",
    "......stttttttts......",
    "....ssttttttttttss....",
    "...ssttttttttttttss...",
    "..qsssttttttttttsssq..",
    "..qssttttttttttttssq..",
    "..qsssddddssddddsssq..",
    "..qsssdWfessdWfesssq..",
    "..qsssdeffssdeffsssq..",
    "..qssssssssssssssssq..",
    "..qsssssssmmsssssssq..",
    "....qssssssssssssq....",
    "......qssssssssq......",
    "........qssssq........",
    "...vv.xvyyyyyyvx.vv...",
    "...vv.vvvvyyvvvv.vv...",
    "...vv.vvvvyyvvvv.vv...",
    "...ss.gvvvyyvvvg.ss...",
    ".....uggggggggggu.....",
    ".....gyyyyzzyyyyg.....",
    ".....uvvvvvvvvvvu.....",
    "....uvvvvvvvvvvvvu....",
    "...uvvvvvvvvvvvvvvu...",
    "...uuuuuuuuuuuuuuuu...",
    "......qsq....qsq......",
    "......qsq....qsq......",
    "......kkk....kkk......",
    ".....kkkk....kkkk....."
];

// Слои причёсок (буквы A/B/C — тёмный/средний/светлый тон волос)
const HAIR_M = {
    bald: { label: 'Лысый', map: [] },
    classic: { label: 'Классика', map: [
        "......ABBBBBBBBA......",
        "....ABBBBBBBBBBBBA....",
        "...ABBBBBCCCCBBBBBA...",
        "..ABBBBCCCCCCCCBBBBA..",
        "..ABBBCCCCCCCCCCBBBA..",
        "..ABB............BBA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "...A..............A...",
        ".....A..........A....." ] },
    crop: { label: 'Кроп', map: [
        ".......ABBBBBBA.......",
        ".....ABBBBBBBBBBA.....",
        "....ABBBBBBBBBBBBA....",
        "...AB............BA..." ] },
    halflong: { label: 'Полудлинная', map: [
        "......ABBBBBBBBA......",
        "....ABBBBBBBBBBBBA....",
        "...ABBBBBCCCCBBBBBA...",
        "..ABBBBCCCCCCCCBBBBA..",
        "..ABBBCCCCCCCCCCBBBA..",
        "..ABB............BBA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "...AB............BA...",
        "....B............B...." ] },
    long: { label: 'Длинная', map: [
        "......ABBBBBBBBA......",
        "....ABBBBBBBBBBBBA....",
        "...ABBBBBCCCCBBBBBA...",
        "..ABBBBCCCCCCCCBBBBA..",
        "..ABBBCCCCCCCCCCBBBA..",
        "..ABB............BBA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..AB..............BA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "...BB............BB...",
        "...B..............B..." ] }
};

const HAIR_F = {
    short: { label: 'Короткая', map: [
        "......ABBBBBBBBA......",
        "....ABBBBBBBBBBBBA....",
        "...ABBBBBCCCCBBBBBA...",
        "..ABBBBCCCCCCCCBBBBA..",
        "..ABBBCCCCCCCCCCBBBA..",
        "..ABB............BBA..",
        "..AB..............BA..",
        "...B..............B..." ] },
    classic: { label: 'Длинные', map: [
        "......ABBBBBBBBA......",
        "....ABBBBBBBBBBBBA....",
        "...ABBBBBCCCCBBBBBA...",
        "..ABBBBCCCCCCCCBBBBA..",
        "..ABBBCCCCCCCCCCBBBA..",
        "..ABBC..........CBBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "...ABB..........BBA...",
        "...ABB..........BBA...",
        "...BB............BB...",
        "...BB............BB...",
        "...B..............B..." ] },
    braids: { label: 'Косички', map: [
        "......ABBBBBBBBA......",
        "....ABBBBBBBBBBBBA....",
        "...ABBBBBCCCCBBBBBA...",
        "..ABBBBCCCCCCCCBBBBA..",
        "..ABBBCCCCCCCCCCBBBA..",
        "..ABB............BBA..",
        "...BA............AB...",
        "...AB............BA...",
        "...BA............AB...",
        "...AB............BA...",
        "...BA............AB...",
        "...AB............BA...",
        "...BA............AB...",
        "...AB............BA...",
        "....B............B....",
        "....A............A...." ] },
    bob: { label: 'Каре', map: [
        "......ABBBBBBBBA......",
        "....ABBBBBBBBBBBBA....",
        "...ABBBBBCCCCBBBBBA...",
        "..ABBBBCCCCCCCCBBBBA..",
        "..ABBBCCCCCCCCCCBBBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "..ABB............BBA..",
        "...AA............AA..." ] },
    bun: { label: 'Пучок', map: [
        ".........BBBB.........",
        "........ABBBBA........",
        "...ABBBBBBBBBBBBBBA...",
        "..ABBBBBBCCCCBBBBBBA..",
        "..ABB............BBA..",
        "...B..............B..." ] }
};

export const HAIRSTYLES = { m: HAIR_M, f: HAIR_F };

// Палитры кастомизации
export const SKIN_TONES = {
    light: { label: 'Светлая',  q: '#E2A87E', s: '#F5C9A2', t: '#FBDFC2', m: '#C97B5A' },
    tan:   { label: 'Загар',    q: '#C98D62', s: '#E0AC7E', t: '#EFC9A0', m: '#B06A4A' },
    brown: { label: 'Смуглая',  q: '#8E5B3B', s: '#A9714B', t: '#C08A61', m: '#7E4A32' },
    dark:  { label: 'Тёмная',   q: '#5D3A26', s: '#74492F', t: '#8A5A3C', m: '#55311F' }
};

export const EYE_COLORS = {
    blue:   { label: 'Голубые',    d: '#16337A', e: '#3D7BE0', f: '#A9CFF7' },
    green:  { label: 'Зелёные',    d: '#175E3B', e: '#2FA866', f: '#A8EBC8' },
    brown:  { label: 'Карие',      d: '#4A2A12', e: '#8A5B2E', f: '#D8B98A' },
    gray:   { label: 'Серые',      d: '#3A4250', e: '#7C8BA1', f: '#C9D4E0' },
    violet: { label: 'Фиолетовые', d: '#45217A', e: '#7C4DFF', f: '#C9B8FF' }
};

export const HAIR_COLORS = {
    brown:  { label: 'Каштановые', A: '#5E3220', B: '#96522F', C: '#BE7247' },
    black:  { label: 'Чёрные',     A: '#1A1A22', B: '#2E2E3A', C: '#4A4A5A' },
    blonde: { label: 'Блонд',      A: '#8F6B1D', B: '#D9A741', C: '#F2D178' },
    red:    { label: 'Рыжие',      A: '#7A2311', B: '#C0451F', C: '#E8703F' },
    pink:   { label: 'Розовые',    A: '#8F3057', B: '#C94F7C', C: '#E87DA4' }
};

const ARMOR_PAL = {
    W: '#FFFFFF',
    u: '#3E4A5E', v: '#7C8BA1', x: '#BDC9D9',
    g: '#8F5F10', y: '#D9A02B', z: '#F4D06A',
    k: '#2E2A33', l: '#4A4453'
};

export const CHARACTERS = {
    m: { name: 'Рыцарь' },
    f: { name: 'Воительница' }
};

export const DEFAULT_APPEARANCE = { hair: 'classic', hairColor: 'brown', eyeColor: 'blue', skin: 'light' };

const _spriteCache = {};

// opts: {gender, hair, hairColor, eyeColor, skin}
export function getSprite(opts, px) {
    const P = px || 8;
    const gender = opts.gender === 'f' ? 'f' : 'm';
    const styles = HAIRSTYLES[gender];
    const hair = styles[opts.hair] ? opts.hair : 'classic';
    const hairColor = HAIR_COLORS[opts.hairColor] ? opts.hairColor : 'brown';
    const eyeColor = EYE_COLORS[opts.eyeColor] ? opts.eyeColor : 'blue';
    const skin = SKIN_TONES[opts.skin] ? opts.skin : 'light';

    const cacheKey = [gender, hair, hairColor, eyeColor, skin, P].join('_');
    if (_spriteCache[cacheKey]) return _spriteCache[cacheKey];

    const base = gender === 'f' ? BASE_F : BASE_M;
    const pal = Object.assign({}, ARMOR_PAL, SKIN_TONES[skin], EYE_COLORS[eyeColor]);
    const hairPal = HAIR_COLORS[hairColor];
    const w = base[0].length, h = base.length;

    const cv = document.createElement('canvas');
    cv.width = w * P; cv.height = h * P;
    const ctx = cv.getContext('2d');

    base.forEach((row, y) => {
        for (let x = 0; x < w; x++) {
            const ch = row[x];
            if (ch === '.') continue;
            ctx.fillStyle = pal[ch];
            ctx.fillRect(x * P, y * P, P, P);
        }
    });
    (styles[hair].map || []).forEach((row, y) => {
        for (let x = 0; x < w; x++) {
            const ch = row[x];
            if (ch === '.' || !hairPal[ch]) continue;
            ctx.fillStyle = hairPal[ch];
            ctx.fillRect(x * P, y * P, P, P);
        }
    });

    _spriteCache[cacheKey] = cv;
    return cv;
}

// ---------- Иконки 12×12 ----------

export const ICONS = {
    coin: { pal: { g:'#B8860B', y:'#F2CC60', w:'#FFF3C4', z:'#8F5F10' }, map: [
        "............", "...gggggg...", "..gyyyyyyg..", ".gyywyyyyyg.", ".gywyyyyyyg.",
        ".gyyyzzyyyg.", ".gyyzyyzyyg.", ".gyyyzzyyyg.", ".gyyyyyyyyg.", "..gyyyyyyg..",
        "...gggggg...", "............" ] },
    sun: { pal: { y:'#F2CC60' }, map: [
        "............", ".....yy.....", "..y..yy..y..", "...y....y...", "....yyyy....",
        ".y.yyyyyy.y.", ".y.yyyyyy.y.", "....yyyy....", "...y....y...", "..y..yy..y..",
        ".....yy.....", "............" ] },
    calendar: { pal: { b:'#7C8BA1', w:'#E6EDF3', g:'#3FB950' }, map: [
        "............", "..w..ww..w..", ".bbbbbbbbbb.", ".bwwwwwwwwb.", ".bbbbbbbbbb.",
        ".b.g.g.g..b.", ".b........b.", ".b.g.g.g..b.", ".b........b.", ".bbbbbbbbbb.",
        "............", "............" ] },
    target: { pal: { r:'#F85149', w:'#E6EDF3' }, map: [
        "............", "....rrrr....", "..rr....rr..", ".r..rrrr..r.", ".r.r....r.r.",
        ".r.r.ww.r.r.", ".r.r.ww.r.r.", ".r.r....r.r.", ".r..rrrr..r.", "..rr....rr..",
        "....rrrr....", "............" ] },
    helmet: { pal: { v:'#7C8BA1', d:'#161D29', y:'#D9A02B' }, map: [
        "............", ".....yy.....", "...vvvvvv...", "..vvvvvvvv..", ".vvvvvvvvvv.",
        ".vvvvvvvvvv.", ".vddddddddv.", ".vvvvvvvvvv.", ".vvvvvvvvvv.", "..vv....vv..",
        "............", "............" ] },
    bag: { pal: { s:'#58A6FF', y:'#D9A02B', d:'#185FA5' }, map: [
        "............", "....y..y....", "...y....y...", "..ssssssss..", "..ssssssss..",
        "..ssddddss..", "..ssddddss..", "..ssssssss..", "..ssssssss..", "..ssssssss..",
        "............", "............" ] },
    skull: { pal: { w:'#E6EDF3', d:'#0B0E14' }, map: [
        "............", "...wwwwww...", "..wwwwwwww..", ".wwwwwwwwww.", ".wwddwwddww.",
        ".wwddwwddww.", ".wwwwwwwwww.", "..wwwdwwww..", "..wwwwwwww..", "...w.ww.w...",
        "...w.ww.w...", "............" ] },
    flame: { pal: { o:'#FF8C42', y:'#F2CC60', r:'#F85149' }, map: [
        "............", ".....o......", "....oo..o...", "....ooo.o...", "...roooooo..",
        "..rooooooo..", "..roooyyoo..", ".rooyyyyoo..", ".rooyyyyooo.", "..ooyyyyoo..",
        "...oooooo...", "............" ] },
    trophy: { pal: { y:'#F2CC60', g:'#B8860B' }, map: [
        "............", ".yyyyyyyyyy.", ".y.yyyyyy.y.", ".y.yyyyyy.y.", "..yyyyyyyy..",
        "...yyyyyy...", "....yyyy....", ".....yy.....", "....gyyg....", "...gyyyyg...",
        "............", "............" ] },
    shield: { pal: { v:'#7C8BA1', s:'#58A6FF', w:'#E6EDF3' }, map: [
        "............", ".vvvvvvvvvv.", ".vssssssssv.", ".vssswwsssv.", ".vswwwwwwsv.",
        ".vssswwsssv.", "..vssswssv..", "...vsssssv..", "...vssssv...", "....vssv....",
        ".....vv.....", "............" ] },
    bolt: { pal: { p:'#A371F7' }, map: [
        "............", "......ppp...", ".....ppp....", "....ppp.....", "...pppppp...",
        "....ppppp...", "......ppp...", ".....ppp....", "....ppp.....", "....pp......",
        "...p........", "............" ] },
    star: { pal: { y:'#F2CC60' }, map: [
        "............", ".....yy.....", ".....yy.....", "....yyyy....", ".yyyyyyyyyy.",
        "..yyyyyyyy..", "...yyyyyy...", "...yyyyyy...", "..yyy..yyy..", "..y......y..",
        "............", "............" ] },
    moon: { pal: { b:'#85B7EB' }, map: [
        "............", ".....bbbb...", "...bbbbbb...", "..bbbbb.....", "..bbbb......",
        "..bbbb......", "..bbbb......", "..bbbbb.....", "...bbbbbb...", ".....bbbb...",
        "............", "............" ] },
    lock: { pal: { g:'#8B949E', y:'#F2CC60', d:'#0B0E14' }, map: [
        "............", "....gggg....", "...g....g...", "...g....g...", "..yyyyyyyy..",
        "..yyyyyyyy..", "..yyyddyyy..", "..yyyddyyy..", "..yyyyyyyy..", "..yyyyyyyy..",
        "............", "............" ] },
    burger: { pal: { t:'#E0A040', h:'#F4C67A', g:'#58C34F', y:'#F2CC60', b:'#7A4A21' }, map: [
        "............", "...hhhhhh...", "..hhhhhhhh..", ".hhhhhhhhhh.", ".gggggggggg.",
        ".yyyyyyyyyy.", ".bbbbbbbbbb.", ".bbbbbbbbbb.", ".tttttttttt.", "..tttttttt..",
        "............", "............" ] },
    pizza: { pal: { c:'#C97B3A', y:'#F5C542', r:'#D8452E' }, map: [
        "............", ".cccccccccc.", ".yyyyyyyyyy.", "..yryyyyry..", "..yyyyyyyy..",
        "...yyryyy...", "...yyyyyy...", "....yryy....", "....yyyy....", ".....yy.....",
        ".....yy.....", "............" ] },
    donut: { pal: { p:'#F06292', s:'#FFF176', d:'#B26A3C' }, map: [
        "............", "...pppppp...", "..pspppsps..", ".ppp....ppp.", ".pp......pp.",
        ".ps......sp.", ".pp......pp.", ".ppp....ppp.", "..pspppspp..", "...pppppp...",
        "............", "............" ] },
    gamepad: { pal: { b:'#4A5568', w:'#BDC9D9', r:'#E24B4A', g:'#58C34F' }, map: [
        "............", "............", "..bbbbbbbb..", ".bbbbbbbbbb.", ".bwbbbbbbgb.",
        "wwwwbbbbgbgb", ".bwbbbbbbgb.", ".bbbbbbbbbb.", ".bb......bb.", ".bb......bb.",
        "............", "............" ] },
    popcorn: { pal: { w:'#F5F5F5', r:'#E24B4A' }, map: [
        "...ww..ww...", "..wwwwwwww..", "..wwwwwwww..", "..rwrwrwrw..", "..rwrwrwrw..",
        "..rwrwrwrw..", "..rwrwrwrw..", "..rwrwrwrw..", "..rwrwrwrw..", "...rwrwrw...",
        "............", "............" ] },
    phone: { pal: { g:'#2E3440', s:'#58A6FF', w:'#BDC9D9' }, map: [
        "............", "...gggggg...", "...gssssg...", "...gssssg...", "...gssssg...",
        "...gssssg...", "...gssssg...", "...gssssg...", "...gsswsg...", "...gggggg...",
        "............", "............" ] },
    beer: { pal: { w:'#FFF8E1', y:'#F2CC60', h:'#C9A227' }, map: [
        "............", "..wwwwww....", "..wwwwww....", "..yyyyyyhh..", "..yyyyyy.h..",
        "..yyyyyy.h..", "..yyyyyy.h..", "..yyyyyyhh..", "..yyyyyy....", "..yyyyyy....",
        "............", "............" ] },
    bed: { pal: { h:'#8B5A2B', w:'#F5F5F5', p:'#7F77DD', b:'#5A3A1B' }, map: [
        "............", "............", ".h..........", ".h..........", ".hww.ppppp..",
        ".hwwppppppp.", ".hbbbbbbbbb.", ".hbbbbbbbbb.", ".h........b.", ".h........b.",
        "............", "............" ] },
    gift: { pal: { r:'#E24B4A', y:'#F2CC60' }, map: [
        "............", "....y..y....", "....yyyy....", ".rrrryyrrrr.", ".rrrryyrrrr.",
        ".yyyyyyyyyy.", ".rrrryyrrrr.", ".rrrryyrrrr.", ".rrrryyrrrr.", ".rrrryyrrrr.",
        "............", "............" ] },
    cocktail: { pal: { w:'#BDC9D9', p:'#F06292' }, map: [
        "............", ".wwwwwwwwww.", "..wpppppww..", "...wpppw....", "....wpw.....",
        ".....w......", ".....w......", ".....w......", ".....w......", "...wwwww....",
        "............", "............" ] },
    snow: { pal: { f:'#85B7EB', w:'#D6E9FB' }, map: [
        ".....ff.....", "..f..ff..f..", "...f.ff.f...", "....wffw....", ".ffffwwffff.",
        ".ffffwwffff.", "....wffw....", "...f.ff.f...", "..f..ff..f..", ".....ff.....",
        "............", "............" ] },
    crown: { pal: { y:'#F2CC60', z:'#E24B4A', g:'#B8860B' }, map: [
        "............", "............", ".y...yy...y.", ".yy..yy..yy.", ".yyy.yy.yyy.",
        ".yyyyyyyyyy.", ".yyyyyyyyyy.", ".yzyyzzyyzy.", ".yyyyyyyyyy.", ".gggggggggg.",
        "............", "............" ] },
    palm: { pal: { g:'#3FB950', b:'#8B5A2B', y:'#F2CC60', w:'#58A6FF' }, map: [
        "............", "...g..gg....", "..ggggggg...", ".gg.gg..gg..", "....bb......",
        "....bb......", "....bb......", "...bbb......", ".yyyyyyyyy..", ".yyyyyyyyyy.",
        "..wwwwwwww..", "............" ] },
    cross: { pal: { g:'#3FB950', w:'#D6F5DE' }, map: [
        "............", "....gggg....", "....gggg....", "....gggg....", ".gggggggggg.",
        ".ggggwwgggg.", ".gggggggggg.", "....gggg....", "....gggg....", "....gggg....",
        "............", "............" ] },
    plus18: { pal: { r:'#E24B4A', w:'#FFFFFF' }, map: [
        "............", ".rrrrrrrrrr.", ".rrrrrrrrrr.", ".rwwrwwwrrr.", ".rrwrwrwrwr.",
        ".rrwrwwwwww.", ".rrwrwrwrwr.", ".rrwrwwwrrr.", ".rrrrrrrrrr.", ".rrrrrrrrrr.",
        "............", "............" ] },
    heart: { pal: { r:'#E24B4A', w:'#FF9E9C' }, map: [
        "............", "..rrr..rrr..", ".rrrrrrrrrr.", ".rwrrrrrrrr.", ".rrrrrrrrrr.",
        "..rrrrrrrr..", "...rrrrrr...", "....rrrr....", ".....rr.....", "............",
        "............", "............" ] },
    medal: { pal: { r:'#E24B4A', y:'#F2CC60', g:'#B8860B', w:'#FFF3C4' }, map: [
        "............", "....r..r....", "....r..r....", "....rrrr....", "...gyyyyg...",
        "..gyyyyyyg..", "..gyywwyyg..", "..gyyyyyyg..", "...gyyyyg...", "....gggg....",
        "............", "............" ] },
    supermedal: { pal: { r:'#58A6FF', y:'#7DD3FF', g:'#185FA5', w:'#EAF7FF' }, map: [
        "............", "....r..r....", "....r..r....", "....rrrr....", "...gyyyyg...",
        "..gyywwyyg..", "..gywwwwyg..", "..gyywwyyg..", "...gyyyyg...", "....gggg....",
        "............", "............" ] },
    flameblue: { pal: { o:'#58A6FF', y:'#EAF7FF', r:'#185FA5' }, map: [
        "............", ".....o......", "....oo..o...", "....ooo.o...", "...roooooo..",
        "..rooooooo..", "..roooyyoo..", ".rooyyyyoo..", ".rooyyyyooo.", "..ooyyyyoo..",
        "...oooooo...", "............" ] },
    gem: { pal: { p:'#7DE0FF', d:'#1E7FB8', w:'#EAFBFF' }, map: [
        "............", "..pppppppp..", ".pwppppppd..", ".pwpppppdd..", "..pppppdd...",
        "..ppppppd...", "...ppppd....", "...pppd.....", "....ppd.....", ".....p......",
        "............", "............" ] }
};

export function paintIcon(canvas, iconKey) {
    const icon = ICONS[iconKey];
    if (!icon || !canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cell = canvas.width / 12;
    icon.map.forEach((row, y) => {
        for (let x = 0; x < 12; x++) {
            const ch = row[x];
            if (ch === '.' || ch === ' ' || !icon.pal[ch]) continue;
            ctx.fillStyle = icon.pal[ch];
            ctx.fillRect(x * cell, y * cell, cell, cell);
        }
    });
}

const _iconURLs = {};
export function iconURL(iconKey) {
    if (!_iconURLs[iconKey]) {
        const cv = document.createElement('canvas');
        cv.width = 24; cv.height = 24;
        paintIcon(cv, iconKey);
        _iconURLs[iconKey] = cv.toDataURL();
    }
    return _iconURLs[iconKey];
}

// HTML-иконка (inline img из data-URL)
export function icon(iconKey, size, cls) {
    return `<img src="${iconURL(iconKey)}" class="px-icon ${cls || ''}" style="width:${size}px;height:${size}px" alt="">`;
}

export const coinIcon = (size) => icon('coin', size || 14, 'coin-ico');

// ---------- Ауры ----------

// currency: 'coins' — за монеты, 'crystals' — донат-валюта,
// 'bossday' — открывается за убитых боссов дня (price = сколько нужно)
export const AURAS = {
    gold:      { label: 'Золотая',          sw: '#E8A020', inner: 'rgba(255,225,150,', outer: 'rgba(220,130,20,',  parts: ['#FFD76A','#FFAA33','#FFF0B8'], type: 'flame', currency: 'coins',    price: 0 },
    violet:    { label: 'Сине-фиолетовая',  sw: '#7C4DFF', inner: 'rgba(140,180,255,', outer: 'rgba(108,59,217,',  parts: ['#9DB8FF','#7C4DFF','#4A90FF'], type: 'flame', currency: 'coins',    price: 900 },
    green:     { label: 'Зелёная',          sw: '#2ECC71', inner: 'rgba(160,255,200,', outer: 'rgba(15,140,80,',   parts: ['#7CFFB2','#2ECC71','#B8FFD9'], type: 'flame', currency: 'coins',    price: 900 },
    pink:      { label: 'Розовая',          sw: '#D6408B', inner: 'rgba(255,190,225,', outer: 'rgba(200,50,130,',  parts: ['#FF9ECF','#D6408B','#FFD1E8'], type: 'flame', currency: 'coins',    price: 900 },
    smoke:     { label: 'Дым',              sw: '#B9BCC9', inner: 'rgba(210,210,225,', outer: 'rgba(150,150,170,', parts: ['#D8D8E4','#B9BCC9','#EFEFF6'], type: 'smoke', currency: 'bossday',  price: 90 },
    electric:  { label: 'Электричество',    sw: '#7DF9FF', inner: 'rgba(190,240,255,', outer: 'rgba(60,140,255,',  parts: ['#BEF0FF','#7DF9FF','#FFFFFF'], type: 'bolt',  currency: 'crystals', price: 50 },
    greenbolt: { label: 'Зелёные молнии',   sw: '#3FFF6E', inner: 'rgba(180,255,200,', outer: 'rgba(20,180,90,',   parts: ['#B4FFC8','#3FFF6E','#EAFFF0'], type: 'bolt',  currency: 'crystals', price: 50 },
    hearts:    { label: 'Сердечки',         sw: '#FF5A7A', inner: 'rgba(255,150,175,', outer: 'rgba(220,50,90,',   parts: ['#FF8FA5','#FF5A7A','#FFC2CE'], type: 'heart', currency: 'crystals', price: 50 }
};

export const TIERS = [
    { min: 1,  label: 'без свечения',   glow: 0,    r: 0,   n: 0  },
    { min: 10, label: 'тусклая аура',   glow: 0.14, r: 70,  n: 10 },
    { min: 25, label: 'яркая аура',     glow: 0.28, r: 100, n: 24 },
    { min: 50, label: '«Олимпиец»',     glow: 0.45, r: 140, n: 44 }
];

export function tierForLevel(level) {
    let t = TIERS[0];
    TIERS.forEach(x => { if (level >= x.min) t = x; });
    return t;
}

// ---------- Сцена с аурой ----------

let _particles = [];
let _frame = 0;
let _loopStarted = false;
let _getScene = null; // () => {canvasId, gender, auraKey, tier, visible}

function buildBolt() {
    const segs = [];
    let dx = 0, dy = 0;
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
        dx += (Math.random() - 0.5) * 16;
        dy += 8 + Math.random() * 10;
        segs.push([dx, dy]);
    }
    return segs;
}

function spawnParticle(theme, cx, feet) {
    const type = theme.type || 'flame';
    const base = {
        type,
        life: 0,
        sway: Math.random() * Math.PI * 2,
        c: theme.parts[Math.floor(Math.random() * theme.parts.length)]
    };
    if (type === 'smoke') return Object.assign(base, {
        x: cx + (Math.random() - 0.5) * 150, y: feet - Math.random() * 40,
        vy: 0.25 + Math.random() * 0.4, r: 14 + Math.random() * 22, max: 190 + Math.random() * 70 });
    if (type === 'bolt') return Object.assign(base, {
        x: cx + (Math.random() - 0.5) * 150, y: feet - 40 - Math.random() * 170,
        max: 8 + Math.random() * 8, segs: buildBolt() });
    if (type === 'butterfly') return Object.assign(base, {
        x: cx + (Math.random() - 0.5) * 170, y: feet - 20 - Math.random() * 190,
        vy: 0.15 + Math.random() * 0.25, r: 3 + Math.random() * 2, max: 200 + Math.random() * 100 });
    if (type === 'heart') return Object.assign(base, {
        x: cx + (Math.random() - 0.5) * 130, y: feet - Math.random() * 30,
        vy: 0.35 + Math.random() * 0.5, r: 2 + Math.random(), max: 140 + Math.random() * 60 });
    if (type === 'firefly') return Object.assign(base, {
        x: cx + (Math.random() - 0.5) * 180, y: feet - 10 - Math.random() * 190,
        r: 2 + Math.random() * 2, max: 220 + Math.random() * 120, pulse: 0.15 + Math.random() * 0.2 });
    return Object.assign(base, {
        x: cx + (Math.random() - 0.5) * 120, y: feet - Math.random() * 40,
        vy: 0.5 + Math.random() * 0.9, r: 3 + Math.random() * 7,
        max: 110 + Math.random() * 70, sq: Math.random() < 0.35 });
}

function updateParticle(p) {
    p.life++;
    if (p.type === 'bolt') return;
    if (p.type === 'firefly') {
        p.x += Math.sin(p.life * 0.05 + p.sway) * 0.6;
        p.y += Math.cos(p.life * 0.045 + p.sway) * 0.5;
    } else if (p.type === 'butterfly') {
        p.y -= p.vy;
        p.x += Math.sin(p.life * 0.06 + p.sway) * 1.2;
    } else {
        p.y -= p.vy;
    }
}

const HEART_PX = ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];

function drawParticle(ctx, p, theme) {
    const k = p.life / p.max;
    const a = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8);

    if (p.type === 'smoke') {
        const x = p.x + Math.sin(p.sway + p.life * 0.05) * 14;
        const gr = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r);
        gr.addColorStop(0, theme.inner + (0.16 * a) + ')');
        gr.addColorStop(1, theme.outer + '0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, 7); ctx.fill();
        return;
    }
    if (p.type === 'bolt') {
        const fa = a * (0.4 + 0.6 * Math.random()); // мерцание
        ctx.lineJoin = 'round';
        [[4, theme.outer + (0.5 * fa) + ')'], [1.5, 'rgba(255,255,255,' + fa + ')']].forEach(pair => {
            ctx.strokeStyle = pair[1];
            ctx.lineWidth = pair[0];
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            p.segs.forEach(s => ctx.lineTo(p.x + s[0], p.y + s[1]));
            ctx.stroke();
        });
        return;
    }
    if (p.type === 'heart') {
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        gr.addColorStop(0, theme.inner + (0.35 * a) + ')');
        gr.addColorStop(1, theme.outer + '0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 5, 0, 7); ctx.fill();
        ctx.globalAlpha = a;
        ctx.fillStyle = p.c;
        const s = p.r;
        HEART_PX.forEach((row, yy) => {
            for (let xx = 0; xx < row.length; xx++) {
                if (row[xx] === 'r') ctx.fillRect(p.x + (xx - 3.5) * s, p.y + (yy - 3) * s, s, s);
            }
        });
        ctx.globalAlpha = 1;
        return;
    }
    if (p.type === 'butterfly') {
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        gr.addColorStop(0, theme.inner + (0.3 * a) + ')');
        gr.addColorStop(1, theme.outer + '0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 7); ctx.fill();
        const w = Math.abs(Math.sin(p.life * 0.4)); // взмах крыльев
        ctx.globalAlpha = a;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - 3 - 2 * w, p.y - 2, 3, 4);
        ctx.fillRect(p.x + 2 * w, p.y - 2, 3, 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(p.x - 1, p.y - 2, 1.5, 5);
        ctx.globalAlpha = 1;
        return;
    }
    if (p.type === 'firefly') {
        const pa = a * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(p.life * p.pulse)));
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        gr.addColorStop(0, theme.inner + pa + ')');
        gr.addColorStop(1, theme.outer + '0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + pa + ')';
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        return;
    }
    // flame (по умолчанию)
    const x = p.x + Math.sin(p.sway + p.life * 0.05) * 7;
    if (p.sq) {
        ctx.globalAlpha = 0.8 * a;
        ctx.fillStyle = p.c;
        const s = Math.max(2, Math.round(p.r * 0.8 / 2) * 2);
        ctx.fillRect(Math.round(x / 4) * 4, Math.round(p.y / 4) * 4, s, s);
        ctx.globalAlpha = 1;
    } else {
        const gr2 = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 2);
        gr2.addColorStop(0, theme.inner + (0.5 * a) + ')');
        gr2.addColorStop(1, theme.outer + '0)');
        ctx.fillStyle = gr2;
        ctx.beginPath(); ctx.arc(x, p.y, p.r * 2, 0, 7); ctx.fill();
    }
}

function frame() {
    requestAnimationFrame(frame);
    if (!_getScene) return;
    const sc = _getScene();
    if (!sc || !sc.visible) return;
    const cv = document.getElementById(sc.canvasId);
    if (!cv) return;

    _frame++;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const theme = AURAS[sc.auraKey] || AURAS.gold;
    const tier = sc.tier;
    const sprite = getSprite(sc.spriteOpts);
    const OX = (W - sprite.width) / 2;
    const OY = H - sprite.height - 34;
    const CX = W / 2, FEET = OY + sprite.height;
    const P = 8;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(CX, FEET + 8, 80, 14, 0, 0, 7); ctx.fill();

    const bob = Math.round(Math.sin(_frame * 0.05) * 2);

    if (tier.glow > 0) {
        const type = theme.type || 'flame';
        const pulse = tier.glow * (0.85 + 0.15 * Math.sin(_frame * 0.06));
        ctx.globalCompositeOperation = type === 'smoke' ? 'source-over' : 'lighter';
        const g = ctx.createRadialGradient(CX, FEET - 100, 10, CX, FEET - 100, tier.r);
        g.addColorStop(0, theme.inner + pulse + ')');
        g.addColorStop(0.6, theme.outer + (pulse * 0.5) + ')');
        g.addColorStop(1, theme.outer + '0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        let target = tier.n;
        if (type === 'bolt') target = Math.max(2, Math.round(tier.n / 5));
        else if (type === 'butterfly') target = Math.max(3, Math.round(tier.n / 3));
        else if (type === 'heart') target = Math.max(3, Math.round(tier.n / 2));

        while (_particles.length < target) _particles.push(spawnParticle(theme, CX, FEET));
        if (_particles.length > target) _particles.length = target;
        if (type !== 'smoke') ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < _particles.length; i++) {
            const p = _particles[i];
            updateParticle(p);
            if (p.life > p.max || p.y < 20 || p.y > H - 4) _particles[i] = spawnParticle(theme, CX, FEET);
            if (i % 5 < 3) drawParticle(ctx, _particles[i], theme);
        }
    } else {
        _particles.length = 0;
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sprite, OX, OY + bob);

    if (tier.glow > 0) {
        ctx.globalCompositeOperation = 'lighter';
        for (let j = 0; j < _particles.length; j++) {
            if (j % 5 >= 3) drawParticle(ctx, _particles[j], theme);
        }
        if (tier.n >= 24) {
            const ga = 0.5 + 0.3 * Math.sin(_frame * 0.1);
            [[8.5, 7.5], [14.5, 7.5]].forEach(ep => {
                const ex = OX + ep[0] * P, ey = OY + bob + ep[1] * P;
                const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 12);
                eg.addColorStop(0, theme.inner + ga + ')');
                eg.addColorStop(1, theme.outer + '0)');
                ctx.fillStyle = eg;
                ctx.beginPath(); ctx.arc(ex, ey, 12, 0, 7); ctx.fill();
            });
        }
        ctx.globalCompositeOperation = 'source-over';
    }
}

// Мгновенная статичная отрисовка героя (пока не подхватился анимационный цикл)
export function paintStatic(canvasId, opts) {
    const cv = document.getElementById(canvasId);
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const sprite = getSprite(opts);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const OY = cv.height - sprite.height - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(cv.width / 2, OY + sprite.height + 8, 80, 14, 0, 0, 7); ctx.fill();
    ctx.drawImage(sprite, (cv.width - sprite.width) / 2, OY);
}

export function startAuraLoop(getScene) {
    _getScene = getScene;
    if (!_loopStarted) {
        _loopStarted = true;
        requestAnimationFrame(frame);
    }
}

export function resetParticles() {
    _particles = [];
}
