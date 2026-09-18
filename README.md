# Random Stats Guy — app

A self-contained web app. Drop these files in a repo, turn on GitHub Pages, and
members can install it to their home screen.

```
index.html              the whole app (4.1 MB — see "Why so big" below)
manifest.webmanifest    name, icons, colours for the install
sw.js                   service worker: opens with no connection
icons/                  home-screen and browser icons
```

Nothing else is needed. No build step, no dependencies, no server.

---

## Putting it live

1. **Make a repo** — call it whatever you want the URL to be, e.g. `rsg-app`.
2. **Upload these files** at the top level (not inside a folder).
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`.**
4. A minute later it's at `https://therandomstatsguy.github.io/rsg-app/`.

### Your own domain (optional)

Add a file called `CNAME` containing one line — `app.therandomstatsguy.com` —
then point that subdomain at GitHub with a CNAME record to
`therandomstatsguy.github.io`. Tick "Enforce HTTPS" in Settings → Pages once the
certificate is issued. This works fine with live data: GitHub Pages serves your
dashboards with `Access-Control-Allow-Origin: *`, so the app can read them from
any domain.

---

## What changes once it's hosted

**Live data.** This is the big one. The app fetches all six dashboards on every
launch and rebuilds its streaks, odds and fixtures from them. Publish a new
dashboard and the app is current the next time anyone opens it — no rebuild, no
republish, nothing from me.

The snapshot baked into `index.html` is now only a fallback: it's what members
see for the half-second before the live data lands, and what they see if they're
offline or your host is down.

**It installs.** On iPhone: Safari → Share → *Add to Home Screen*. On Android:
Chrome offers *Install app* on its own. It then opens full-screen with the RSG
icon and no browser chrome — indistinguishable from a native app to most people.

**It works offline.** The service worker keeps a copy of the app, so a member on
the train opens it and sees the last data they loaded rather than an error.

---

## Publishing an update

Replace `index.html`, then **bump the cache name in `sw.js`**:

```js
var CACHE = 'rsg-v1';   →   var CACHE = 'rsg-v2';
```

That one edit is what tells every installed copy to throw away the old version.
Skip it and members can sit on a stale app for days. The old cache is deleted
automatically on the next launch.

You only need a new `index.html` when the *app itself* changes — new features,
new preview write-ups, new sports wired in. Dashboard data updates need nothing.

---

## Why so big

`index.html` is 4.1 MB because it carries the offline snapshot, every club
badge, the member list and the author photos inline. It's downloaded once and
then cached, so it costs a member one download and nothing after that. Well
within GitHub Pages' limits (100 MB per file, 1 GB per site).

---

## Known limits

- **The tier gate is client-side.** Every sport's data is in the page, and the
  gating decides what to *draw*, not what to *send*. Someone who opens the page
  source can read locked content. Fixing that properly means moving auth and
  content behind a server — that's stage 2.
- **The member list is frozen** at the 348 in the export. New patrons,
  cancellations and tier changes need a fresh `members.json` and a new build.
  The list itself is safe to publish: each record is encrypted with a key
  derived from the member's own email, so it can't be read or enumerated
  without already knowing an address. No names, emails or tiers appear in
  plaintext, and no postal addresses or phone numbers were ever carried.
- **No push notifications.** iOS only allows them for installed web apps and
  they need a server to send from. Stage 3.
