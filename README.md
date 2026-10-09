# RobloxVerifieds for Chrome

Shows RobloxVerifieds info on roblox.com. Profiles get a section at the top of the About tab with the account's verified status, flags, badge history and a guess at why it's verified. Usernames around the site get a small tag if the account used to be verified, is flagged, or is banned.

It can also report verified accounts the site doesn't have yet. You can turn that off in the popup.

## Installing from a release

Grab the zip from [Releases](https://github.com/1xChloe/RobloxVerifiedsExtension/releases) and unzip it. Go to `chrome://extensions`, turn on developer mode, click "Load unpacked" and pick the unzipped folder. It won't update itself, so check back for new releases.

## Scripts

Needs Node 22.2 or newer. Run `npm install` first.

- `npm run dev` builds into `Dist` and watches for changes
- `npm run build` makes a release build
- `npm run check` type checks
- `npm run package` builds and zips it

## Layout

```
Public/            manifest.json
Scripts/           build and packaging
Src/Background/    service worker, API client, lookup cache
Src/Content/       everything that runs on roblox.com
Src/Popup/         settings popup
Src/Shared/        types and helpers the others share
```

All the Roblox selectors and class names are in `Src/Content/Roblox/RobloxDom.ts`. When Roblox changes their site, that's usually the only file that needs fixing.

Roblox re-renders constantly, so nothing gets injected just once. `PageWatcher` reruns each integration whenever the page changes, and each one only adds what's missing.

## Code style

- PascalCase for variables and file names, camelCase for functions (shorthand names are fine)
- A class per feature
- `npm run check` has to pass

## API

Uses `/api/ext/v1` on the site.

- `GET /users?ids=1,2,3` (up to 100)
- `GET /users/{id or username}`
- `POST /submit` with `{ "userId": 123 }`
- `POST /report` with `{ "verifiedUserIds": [...] }` (up to 200)

Response types are in `Src/Shared/ApiTypes.ts`.

## License

The code is here so you can check the extension is safe. It isn't open source: you can't copy it, publish it or make money from it. See [LICENSE](LICENSE).
