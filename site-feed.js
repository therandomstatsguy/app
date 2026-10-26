#!/usr/bin/env node
/* Rando -> website feed.
   Reads the snapshot baked into index.html (the same data the app's home
   screen draws from) and writes site-feed.json: the upcoming fixtures with
   their badges and colours, and the latest Stats Watch titles.

   Only public, shop-window details go in. No write-up content, odds, line-ups
   or member data ever leaves the app through this file.

   Usage:  node site-feed.js [path/to/index.html] [out.json]
*/
'use strict';
var fs = require('fs');
var crypto = require('crypto');

var SRC = process.argv[2] || 'index.html';
var OUT = process.argv[3] || 'site-feed.json';
var APP = 'https://therandomstatsguy.github.io/app/';
var MAX_FIXTURES = 60;
var MAX_PREVIEWS = 12;

var html = fs.readFileSync(SRC, 'utf8');
var snapM = html.match(/<script id="snapshot" type="application\/json">([\s\S]*?)<\/script>/);
if (!snapM) throw new Error('snapshot block not found in ' + SRC);
var SNAP = JSON.parse(snapM[1]);

var defM = html.match(/var SPORTS_DEF = (\[[\s\S]*?\]);\n/);
if (!defM) throw new Error('SPORTS_DEF not found in ' + SRC);
var SPORTS_DEF = JSON.parse(defM[1]);

/* ---- colour helpers, copied from the app so badges and text match ---- */
function _rgb(hex){
  var c = String(hex||'#888').replace('#','');
  if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  var n = parseInt(c,16);
  return [(n>>16)&255, (n>>8)&255, n&255];
}
function _hex(r,g,b){
  return '#' + [r,g,b].map(function(v){
    v = Math.max(0, Math.min(255, Math.round(v)));
    return (v < 16 ? '0' : '') + v.toString(16);
  }).join('');
}
function _lum(hex){
  var c = _rgb(hex).map(function(v){
    v /= 255;
    return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
  });
  return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
}
function readable(hex, target){
  target = target || 0.30;
  var c = _rgb(hex), i = 0;
  while (_lum(_hex(c[0],c[1],c[2])) < target && i < 24) {
    c = [c[0] + (255-c[0])*0.12, c[1] + (255-c[1])*0.12, c[2] + (255-c[2])*0.12];
    i++;
  }
  return _hex(c[0],c[1],c[2]);
}
function colGap(a, b){
  var x = _rgb(a), y = _rgb(b);
  return Math.abs(x[0]-y[0]) + Math.abs(x[1]-y[1]) + Math.abs(x[2]-y[2]);
}
function pairColors(ht, at, fallback){
  var cA = ht.c || fallback, cB = at.c || fallback;
  if (colGap(cA, cB) < 90) {
    if (at.c2 && colGap(cA, at.c2) >= 90) cB = at.c2;
    else if (ht.c2 && colGap(ht.c2, cB) >= 90) cA = ht.c2;
  }
  return [cA, cB];
}
function initials(n){
  return String(n||'').split(' ').filter(Boolean).map(function(w){return w[0];}).slice(0,2).join('').toUpperCase();
}

/* ---- team lookup, same rules as the app's teamOf() ---- */
function teamOf(sportKey, nick){
  var d = SNAP.sports[sportKey];
  if (!d || !d.teams) return null;
  if (d.teams[nick]) return d.teams[nick];
  var hit = null;
  Object.keys(d.teams).forEach(function(k){
    if (!hit && (d.teams[k].disp === nick || k.indexOf(nick) > -1)) hit = d.teams[k];
  });
  if (!hit) {
    var low = String(nick || '').toLowerCase();
    Object.keys(d.teams).forEach(function(k){
      if (hit) return;
      (d.teams[k].alias || []).forEach(function(a){
        if (!hit && String(a).toLowerCase() === low) hit = d.teams[k];
      });
    });
  }
  return hit;
}

/* badges are inlined in the app; store each once and refer to it by id */
var logos = {};
function logoId(uri){
  if (!uri) return '';
  var id = crypto.createHash('sha1').update(uri).digest('hex').slice(0, 10);
  logos[id] = uri;
  return id;
}

var SP = {};
SPORTS_DEF.forEach(function(s){ SP[s.key] = s; });

var sports = {};
SPORTS_DEF.forEach(function(s){
  sports[s.key] = {name:s.name, short:s.short, c1:s.c1, c2:s.c2, accent:readable(s.c1)};
});

var now = Date.now();
function isPast(iso){
  var ms = new Date(iso).getTime();
  return !isNaN(ms) && ms <= now;
}

/* ---- fixtures: every competition, soonest first, like fixturesAll() ---- */
var fixtures = [];
SPORTS_DEF.forEach(function(s){
  var d = SNAP.sports[s.key];
  if (!d) return;
  (d.fixtures || []).forEach(function(f, i){
    if (!f.iso || isPast(f.iso)) return;
    var ht = teamOf(s.key, f.home) || {}, at = teamOf(s.key, f.away) || {};
    var pc = pairColors(ht, at, readable(s.c1));
    function side(t, nick, disp){
      return {
        name: disp || nick,
        ab: t.ab || initials(disp || nick),
        logo: logoId(t.logo),
        flag: t.flag || ''
      };
    }
    fixtures.push({
      sport: s.key,
      comp: f.comp || '',
      iso: f.iso,
      home: side(ht, f.home, f.homeDisp),
      away: side(at, f.away, f.awayDisp),
      cA: pc[0], cB: pc[1],
      venue: f.venue || '',
      href: APP + '#/game/' + s.key + '/' + i
    });
  });
});
fixtures.sort(function(a, b){ return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0; });
fixtures = fixtures.slice(0, MAX_FIXTURES);

/* ---- previews: titles only, ordered like previewsAll() ---- */
function sameClub(a, b){
  a = String(a || '').toLowerCase().trim();
  b = String(b || '').toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;
  return (' ' + b + ' ').indexOf(' ' + a + ' ') > -1 || (' ' + a + ' ').indexOf(' ' + b + ' ') > -1;
}
function nextKo(p){
  var d = SNAP.sports[p.sport];
  if (!d || !d.fixtures || !(p.games || []).length) return Infinity;
  var best = Infinity;
  d.fixtures.forEach(function(f){
    var t = Date.parse(f.iso || '');
    if (!t || t <= now || t >= best) return;
    var H = f.homeDisp || f.home || '', A = f.awayDisp || f.away || '';
    var tH = teamOf(p.sport, f.home) || {}, tA = teamOf(p.sport, f.away) || {};
    var hit = p.games.some(function(g){
      return (sameClub(g.home, H) || sameClub(g.home, tH.full)) &&
             (sameClub(g.away, A) || sameClub(g.away, tA.full));
    });
    if (hit) best = t;
  });
  return best;
}
var previews = (SNAP.previews || []).map(function(p, i){
  var g = p.games && p.games[0];
  var s = SP[p.sport] || {};
  return {
    _k: nextKo(p), _t: Date.parse(p.posted || '') || 0, _i: i,
    sport: p.sport || '',
    sportName: p.sportName || s.name || '',
    title: p.title || '',
    posted: p.posted || '',
    sub: g ? (g.home + ' v ' + g.away + (p.games.length > 1 ? ' + ' + (p.games.length - 1) + ' more' : '')) : '',
    c1: s.c1 || '#14d6c0', c2: s.c2 || '#14d6c0',
    href: APP + '#/preview/' + i
  };
}).sort(function(a, b){
  var au = a._k < Infinity, bu = b._k < Infinity;
  if (au !== bu) return au ? -1 : 1;
  if (au && a._k !== b._k) return a._k - b._k;
  return b._t - a._t || a._i - b._i;
}).slice(0, MAX_PREVIEWS).map(function(p){
  delete p._k; delete p._t; delete p._i;
  return p;
});

/* only keep badges the kept fixtures use */
var used = {};
fixtures.forEach(function(f){ if (f.home.logo) used[f.home.logo] = 1; if (f.away.logo) used[f.away.logo] = 1; });
Object.keys(logos).forEach(function(id){ if (!used[id]) delete logos[id]; });

var feed = {
  generated: new Date().toISOString(),
  snapshot: SNAP.generated || '',
  app: APP,
  sports: sports,
  fixtures: fixtures,
  previews: previews,
  logos: logos
};
fs.writeFileSync(OUT, JSON.stringify(feed));
console.log('wrote ' + OUT + ': ' + fixtures.length + ' fixtures, ' + previews.length +
  ' previews, ' + Object.keys(logos).length + ' badges, ' +
  Math.round(fs.statSync(OUT).size / 1024) + ' KB');
