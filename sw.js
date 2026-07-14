// Service Worker: офлайн-режим планера
// Стратегия: сеть в приоритете (обновления подхватываются сразу),
// при отсутствии сети — отдаём из кэша.

const CACHE = 'planner-v2-10';

const CORE = [
    './',
    './index.html',
    './style.css',
    './js/app.js',
    './js/state.js',
    './js/game.js',
    './js/pixel.js',
    './js/config.js',
    './js/cloud.js',
    './js/top.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(CORE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);
    const isFont = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');

    // Шрифты: кэш в приоритете (они не меняются)
    if (isFont) {
        e.respondWith(
            caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, copy));
                return res;
            }))
        );
        return;
    }

    // Своё: сеть в приоритете, кэш как офлайн-запас
    if (url.origin === self.location.origin) {
        e.respondWith(
            fetch(e.request).then(res => {
                const copy = res.clone();
                caches.open(CACHE).then(c => c.put(e.request, copy));
                return res;
            }).catch(() =>
                caches.match(e.request, { ignoreSearch: true })
                    .then(hit => hit || caches.match('./index.html'))
            )
        );
    }
});
