# In-app Tauri updater: implementation guide

Wallpaper Picker UI's **Tauri 2** updater design, with a reusable implementation and maintenance guide. Reuse its consent, ownership and admission rules, but derive another app's installer identity, data paths and eligibility independently. Do not copy this app's signing key or registry constants. Native upgrade acceptance is still pending; “final” describes the implemented design, not a completed end-to-end installer trial.

## Current status

| Area | Result / boundary |
| --- | --- |
| Released baseline | **3.6.4**, tag `v3.6.4` points to commit `3617b40e1c80c2548d46bf3fcc5f9bc0a66bc48e`; subsequent release-bot main commit changes only the flake. |
| Public release | [v3.6.4](https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/tag/v3.6.4), ID `411146018`, non-prerelease. Nine assets: latest.json; NSIS/AppImage/deb/rpm and four signatures. No MSI. |
| Policy | In-app installation only for proven default-location/current-user Windows x64 NSIS. Linux in-app installation disabled. |
| Release gates | 306 Bun tests/37 files; 193 components/26 files; 53 Windows Rust tests; five locales/116 keys; strict release-script TS, build/lint/Rust fmt/check/test; Svelte 0 errors/0 warnings. CI `38331712510`: four jobs; release `38331958570`: two builds/final verifier passed. |
| Artifact evidence | Published NSIS verified with production key/minisign-verify 0.2.4: corruption rejected, authenticated version 3.6.4, extracted x64 PE version 3.6.4, NSS/no UNK marker. |
| **Not verified** | **Actual native upgrade, installer completion/reopen and data preservation through the real About button.** Mocks/signatures/handoff are not that acceptance. |

Temporary 3.6.2/3.6.3 release pages/assets retired; tags remain history. Do not restore MSI direct-asset constructors/test badges. This guide authorizes no publication, re-keying, installer launch, normal-host inspection or migration.

## 1. Architecture and UX

```text
root/session -> language readiness -> one nonblocking startup check
native get_update_support -> controller -> frozen state -> Home notice
                                                       -> About panel
Home action: About navigation only; dismissal retains candidate
About: Update <displayed version> is ordinary installation consent
  shared lock -> fresh policy -> download/signature verification
              -> fresh policy -> exclusive work/draft reservation
              -> policy/version recheck under lease -> native install
Windows: installer handoff/exit/reopen (acceptance pending)
Linux: maintained latch/cleanup/relaunch code, not authorized
```

Construction/SSR inert, native imports lazy. One startup-check attempt per native non-development process after language readiness, without waiting for network completion. Policy can deny the feed request; this is not a guarantee of one HTTP request in every installation. No automatic retry/download/install/restart. Home notices each version once, including off-Home detection; dismiss/remount never disposes resources.

About retains versions, text-only notes, progress, consent/failure/manual guidance. One labelled Update spans split SDK download/install under one lock; no ordinary second Install button. Tauri supports static JSON/separate APIs.[1][2] A work/draft denial after download retains the verified payload; finishing or saving never auto-resumes installation—another same-version Update click is required.

## 2. Code map

Repository-relative; `U` = `src/lib/utils/updating`, `UI` = `src/lib/components/updating`. Adjacent tests are maintained contracts.

| Responsibility | Sources / tests |
| --- | --- |
| Wire/state/resource | `src/types/updateTypes.ts`; `U/native-wire.fixture.ts` reads actual Rust serializer expectation. |
| Controller/recovery | `U/controller/controller.ts`; controller/availability/lifecycle/orchestration tests. |
| Singleton/SDK boundary | `U/updating.ts`, `U/native/native.ts` and tests including fresh-worker installed SDK. |
| Session | `U/session/{session.ts,runtime.ts}` and tests. |
| UI | `UI/{panel.svelte,home-notice.svelte,global-updater.svelte,presentation.ts}`; panel/notice/global/flow/check-only tests; root/Home/About routes. |
| Work/draft | `src/lib/utils/applicationWork/applicationWork.ts` and applicationWork/lifetimes tests; `src/lib/components/settings/Input/{commandDraft.ts,input.svelte}` and draft/input/reset tests; Settings actions/API owners. |
| Persistence | `src/lib/api/config/{mutationOrdering.ts,read/read.ts,update/update.ts,clear.ts,ensure/ensure.ts}`; utils ensureDirs/logger and tests. |
| Native policy | `src-tauri/src/get_update_support/{mod.rs,windows.rs,windows/native.rs,tests.rs,windows_tests.rs}`; plugin/command registration in `src-tauri/src/lib.rs`. |
| Config/release | `src-tauri/tauri.conf.json`, `src-tauri/capabilities/permissions.json`, package/Cargo manifests/locks; `.github/workflows/{ci.yml,release.yml}`; `scripts/release-contract/{contract.ts,audit.ts,github.ts,verify.ts}` and tests; `scripts/version/version.mjs`. |

## 3. Install matrix: availability is not authority

Wire: mode/platform/architecture/installer/checkTarget/target/reason, no paths/handles. Install requires **self-managed + supported + x86_64 + exact complete tuple**, not merely feed key.

| Installation | Check target | Install / guidance |
| --- | --- | --- |
| Proven default current-user Windows x64 NSIS | `windows-x86_64-nsis` | Same install target; consent/verification/admission/refreshed evidence. |
| Recognized unapproved/custom/elevated/coexisting NSIS | Exact NSIS check | Target null; manual releases page. |
| Legacy Windows MSI | `windows-x86_64-msi` | Always manual. Feed lacks MSI; migration guidance persists without candidate/check success. No NSIS conversion. |
| Correlated Linux x64 AppImage, writable/read-only | `linux-x86_64-appimage` | Always manual; target null; native-validation-pending or literal app-image-read-only. |
| Debian/RPM | None | Package manager; policy, not claimed plugin incompatibility. |
| Nix/NixOS/Home Manager | None | Flake/configuration update; no /nix/store replacement. Repacked deb still Nix-owned. |
| Browser/dev/unsupported/unknown or contradictory bundle/platform | None | No native update effects. |

Malformed/explicit-null/mismatching checkTarget denies. Only **absent legacy** checkTarget can fall back through otherwise complete install approval. Refresh provenance before publishing acquired metadata and before native phases; no cross-installer fallback.

Windows read-only evidence: marker; exact `%LOCALAPPDATA%\Wallpaper Picker UI`; product/ARP version/registration/views; canonical image/file identity; no machine registration/ARP collision/related MSI; non-reparse local ancestors/replacement rights/current-user ownership/no hardlinks; exclusive relevant process/Restart Manager scope. Missing/error/truncated/type-invalid evidence denies. No registry writes, uninstall execution, writable probes, termination/elevation. Snapshot approval is not atomic replacement proof.

Derive keys/quoting from **current generated NSIS template**, not identifier/stale output. Current CLI uses Restart Manager for exact executable, not historical basename/SID helpers.

AppImage: correlate marker, absolute APPIMAGE/APPDIR, canonical executable/type-2 header. Stale variables/writable bits do not prove ownership or ACL/create/rename/rollback. Runnable bundle isn't registration evidence.[7]

## 4. Consent, locks and safety

- Register **exact shared promise/lock synchronously before publication**; subscribers reenter immediately. Defer native work. Concurrent checks join; update/install only joins explicitly confirmed same-version intent. Missing/unconfirmed/different/conflicting intent denies/busy.
- Capture consent before awaits/publication; compare resource version before admission and again under leased policy refresh. Frozen metadata doesn't freeze resource/caller.
- beginWork before prerequisites/queueing; finally-release after native work/logging/cleanup/publication. Use `return await queuedPromise`. Include dialogs/commands/thumbnail directory-creating reads/corrupt-config repairs.
- tryReserveInstall denies work/dirty inputs, sets private reservation before publication, returns real release lease. Counts/booleans aren't authorization. API denies new admissions; global inert/status UI complements guards. Consume synthetic events/mounts/pending dialog continuations.
- Missing adapter denies; hold lease through successful handoff/relaunch, release before failure publication even if cleanup rejects. No auto-save/discard/resume.
- Command draft survives Settings unmount. Confirmed matching-revision persistence or explicit discard releases ownership; older Save can't clear newer edits. Reset/delete invalidates old acknowledgements, not discard.

Cold reads/recovery/Save/Delete share ordered persistence through diagnostics. updateConfig/clearConfig truthfully acknowledge persistence. Nested reads require exact active owner; logger/prerequisites use owner-aware/local read-only sources. Never queue behind the mutation awaiting logging, publish repair fallback as persisted cache early, or add global busy bypass.

## 5. Resources and failures

SDK Update owns native Update/bytes; close releases them.[2] One private owner; expose frozen metadata/progress/support/safe phase-category, not rawJson/IDs/paths/methods. Normalize permitted nullable notes/date only; malformed metadata still needs cleanup.

1. Started/Progress validate safe integers/clamp percent/keep unknown totals indeterminate; ignore stale operation callbacks.
2. **Finished is not verification**: locked Rust invokes it before signature verification. Await download success before ready-to-install. Check 15,000 ms; download default 600,000 ms with positive-safe-integer validation. Request bounds aren't AbortSignal/full-lifecycle cancellation.
3. Bound adapter calls `install({ restartAfterInstall: true })`. Windows exits on installer launch: no frontend relaunch/concurrent close; returning mock proves handoff only.[2] Dormant Linux code latches install before cleanup/relaunch; explicit recovery reacquires admission, never reinstalls/checks/downloads. Process relaunch supported.[3]
4. Failed close retains **quarantine**; cleanup before next support/feed operation. Never overwrite ownership, infer success from invalid-ID, or immediately retry in cleanup-failure catch.
5. Locked 2.13.2 may close bytes then fail Update without clearing bytes field. Adapter clears confirmed releases only; disposal after all close. Reinspect private-field dependency on upgrades; no vendor/global prototype patches.

Separate support/check/download/install/cleanup/restart failures; categories don't authorize actions. Text notes, public GitHub HTTPS; no credentials/backend/proxy/telemetry, raw manifests/signed redirect URLs in UI/logs. Best-effort diagnostics can't break recovery.

## 6. Config, capabilities and signing

Locked API/core **2.12.1**, JS/Rust updater **2.13.2**, process **2.3.1**, CLI **2.12.2**, tauri-build **2.7.1**, tauri-utils **2.10.1**. Inspect installed JS/locked Rust, align plugin major/minor; newer examples/v1 active/dialog config aren't the contract.

```text
identifier                           dev.matuz.wallpaper-picker-ui
bundle.targets                       nsis, appimage, deb, rpm
bundle.createUpdaterArtifacts        true
bundle.windows.nsis.installMode      currentUser
bundle.windows.allowDowngrades       false
plugins.updater.allowDowngrades      false
plugins.updater.requireSignedVersion true
plugins.updater.pubkey               existing production public key
```

Feed: <https://github.com/Rodrigo-Matuz/wallpaper-picker-ui/releases/latest/download/latest.json>. Exact required keys windows-x86_64-nsis/linux-x86_64-appimage; generic Windows alias equals NSIS URL/signature. Deb/rpm entries don't override managed denial.

NSIS bundle installMode = user/system scope; updater Windows installMode = passive/basicUi/quiet interaction. Don't confuse/add elevation/quiet fallback.[1][5]

**Keep capabilities unchanged.** updater:default exposes full workflow, not provenance/consent enforcement.[1][4][6] Read-only get_update_support supplies eligibility; controller gates maintained actions. Apps defending against arbitrary compromised-webview plugin calls need explicit native enforcement, not assumed frontend security.

Updater requires signing.[1] Private key/password only approved secrets, never source/docs/chat. Rotation breaks deployed trust; another app's initial key generation requires approval/absolute paths outside source control. Preserve downgrade controls/signed-version enforcement: decode base64 Minisign key/signature, verify payload/global signature **before** trusting comment version, then match announced version. JSON/signature presence is not authenticity; old signatures missing a signed version are rejected. Payload signatures do not authenticate every JSON field, including release notes/date; treat notes as untrusted text, never executable HTML. Minisign updater signing is also separate from optional OS/Authenticode signing and does not by itself remove SmartScreen warnings.

CLI 2.9.6 can't patch tauri-utils 2.10.1 marker; 2.12.2 matches. Patch warning fails provenance. Inspect packaged executable NSS/no UNK, not bare binary restored by bundler; don't weaken classification.

## 7. Release procedure

1. Release/publication authorization; main push CI only. `bun run version <x.y.z>` syncs package/Tauri/Cargo versions; Cargo regenerates root lock version; review unrelated changes/run gates.
2. Authorized v* tag builds explicit Windows nsis/Linux deb,rpm,appimage, signatures/**draft**. Preserve key/identity/HTTPS. updaterJsonPreferNsis aligns alias. Flake hash uses exactly one matching local deb; productName/upload names differ from binary name.
3. Wait entire matrix/final verify_release: parallel manifest merges non-atomic. Fail missing entries, never repair/publish. GET-only verifier needs contents: write for draft visibility, persist-credentials: false; no release writes.
4. Exact version/tag/filenames/URLs/alias/inventory, byte-preserved sidecar equality; reject MSI assets/keys/encoded URLs. Bound pages/time/streamed bytes, strip auth on allowlisted redirects. **Consistency isn't cryptography.**
5. Verify real payload/key/authenticated version/corruption rejection, packaged version/architecture/marker; native acceptance passed or pending. Sidecar size/hash isn't enough.
6. Put the committed `RELEASE.md` into the draft body explicitly: tauri-action does not automatically read that file. Manually publish only with authorization, then read back public notes, exact asset identities and the latest feed. Keep notes self-contained, with runtime limitations rather than ignored evidence links.
7. Retire temporary releases only when separately approved. Publish and verify the replacement first so the latest feed remains available, then remove the exact old release IDs and confirm the release/tag API and individual assets return 404. Deleting release pages/assets is separate from deleting Git tags; retain source history unless tag removal is explicitly requested.

## 8. Tests and boundaries

Repo root during authorized review; no launch:

```bash
bun install --frozen-lockfile
bun run check:translations
bun run lint
bun run check
bun run test
bun run test:components
bun run build
bunx --no-install tsc --noEmit --strict --skipLibCheck --target ESNext --module ESNext --moduleResolution bundler --types bun scripts/release-contract/*.ts
cargo fmt --all --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Authorized Windows build-only compatibility check; unsigned/no launch:

```bash
bun run tauri build --bundles nsis --ci --no-sign --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

Never persist override/call unsigned builds signed acceptance.

| Layer | Required evidence / limit |
| --- | --- |
| Controller | Policy/wire, shared-promise reentry, consent mutation, stale progress/Finished, signature rejection/no admission, blocked retry/quarantine, Windows no frontend restart/Linux no reinstall. Native mocked. |
| Session/UI | Once/nonblocking/language readiness/off-Home/dismiss/remount, labelled consent/MSI no-candidate guidance, resolver/fallback/draft/admission. Not native. |
| Safety | Deferred Save/Delete/repair/logging/directory recursion, failed writes/revision ordering/owner release. Real helpers/logger; FS/IPC mocked. |
| SDK | Fresh-worker real Update/mocked IPC: disposal/null metadata/bound restart. Parent fails worker nonzero; don't add counts. |
| Rust | Serializer/pure provider; Windows collector excluded from tests. Compile isn't real Win32 verification. |
| Packaging | Matrix/manifest/signed bytes/version/marker, not reopen. |
| Product | Actual About signed upgrade/reopened identity/data: **pending**. |

Bun isolate discovery ./src ./scripts; Git ignore doesn't exclude archives. History outside project. Explicit deferred signals/finally-release, not guessed microtasks. Rust tests separate files/modules.

## 9. Manual acceptance and recovery

Separately approved disposable install/VM or explicitly user-operated test. **No normal-host substitution/direct injected plugin IPC.** Arrange approved signed newer candidate/feed, don't change trust/invent releases. Same-version check isn't upgrade acceptance; older UI needs manual bootstrap.

- [ ] Record package/version/family/scope/default path/executable/identifier, candidate provenance, ownership and backup/reinstall route.
- [ ] Resolve/back up Tauri `BaseDirectory.Config` + `WallpaperPickerUI/config.json` and `BaseDirectory.AppData` + `thumbnails/map.json`/images; preserve Windows `%APPDATA%\WallpaperPickerUI` and `%APPDATA%\dev.matuz.wallpaper-picker-ui` roots as applicable, command/wallpaper path/source files. Actual map uses BaseDirectory.AppData; don't follow stale paths.ts AppLocalData comment. Dev shares data, not isolation.
- [ ] Synthetic settings/map/image/wallpaper values/hashes; one nonblocking check, zero native mutation on startup/notice/dismiss/About navigation.
- [ ] Actual default-current-user NSIS eligibility. Dirty draft survives navigation/work denies install; save/finish never auto-resumes; explicit same-version retry reuses verification.
- [ ] Actual About Update: handoff/exit/installer reopen; read **new version/exact executable/install identity/registration**, not title.
- [ ] Compare settings/language/command/wallpaper/map/images/data; no reset/duplicates/coexistence. Evidence required; partial compound criteria unchecked.
- [ ] Approved offline/target/signature/access/work/handoff/reopen failures and explicit recovery; no elevation/capability expansion/conversion to pass.
- [ ] Approved backup/manual reinstall; downgrade denial may require uninstall/reinstall, not promised rollback. Never execute registry uninstall strings automatically.

MSI: backup/close/manual uninstall/NSIS from trusted releases page/data verification. AppImage manual; future enablement needs effective ACL/temp-device/rename/rollback/relaunch acceptance. Debian/RPM/Nix external.

## 10. Implementation order when porting to another Tauri app

1. **Decide the contract first.** Answer the questions below and pick the supported installer/architecture/scope matrix. Availability, downloading and installation are distinct permissions. Start denied when provenance is unknown.
2. **Wire compatible Tauri 2 plugins.** Add matching JavaScript/Rust updater and process dependencies, register the Rust plugins, and grant only the capabilities needed by the trusted window. Follow the official setup links and inspect the actual locked APIs. This project does not use a separate backend.
3. **Establish identity and trust.** Preserve the installed app/data identity, generate the new app's initial signing key with approved custody, embed only its public key, and configure an HTTPS static feed. Pin installer mode and signed-version/downgrade policy.
4. **Implement read-only provenance.** Match the current generated installer registration and bundled marker. Keep check-only targets separate from install targets. Test missing, conflicting, incomplete and denied evidence before allowing an installer handoff.
5. **Implement the private resource/controller boundary with RED → GREEN.** Cover exact consent, synchronous lock registration, resource acquisition/cleanup/quarantine, awaited signature verification and per-phase failure/recovery. Keep SDK resources out of reactive public state.
6. **Connect real application-work and draft ownership.** Include indirect writes, queued persistence, diagnostics, dialogs and background thumbnail work. Test exclusive reservation and truthful persistence before enabling installation; counts alone are insufficient.
7. **Mount passive UI last.** Add one nonblocking startup attempt, once-per-version notification, persistent version-labelled About action, translated manual/failed/blocked states and progress. Route changes and notice dismissal must not become consent or discard drafts/resources.
8. **Verify packages and the product separately.** Build signed drafts, verify the complete manifest and payload cryptography, then perform an authorized real About-button upgrade in an owned installation. Read back the reopened version, identity and data. Record any unverified acceptance explicitly before an authorized release.

## 11. Questions for another app

- Formats/scopes/architectures allowed? Read-only provenance/custom/legacy/coexisting ambiguity?
- Notify-only startup/version consent/route-dismiss draft lifetime/bootstrap when target disappears?
- Indirect writes/dialogs/commands/queues? Reservation covers all? Truthful Save/revision identity?
- Resource/quarantine/promise owner, irreversible-install recovery, Windows installer vs process restart?
- Key custody/rotation, HTTPS channel/signed-version floor/downgrade/recovery? Updater vs OS signing/SmartScreen?
- Frontend safeguards sufficient or native security gate? Minimal capabilities/redacted diagnostics?
- Identity/data preservation/dev sharing? Authorized disposable acceptance/newer candidate/backups?
- Mock/SDK/package/product evidence distinction? Complete draft reviewer/publish authority?

## Conventions and sources

Preserve aliases, naming, theme and generated components; the controller owns orchestration. Do not silently alter the user-configured wallpaper shell-command trust model or broaden filesystem capabilities. Scoped plugin file read/write grants do not imply every custom Rust command or exists/mkdir operation is restricted identically. Dot-notation i18n parity **plus resolver/fallback**, English eng/eager JSON default handling/language-ready gate. Bindable let/derived translator; no repo-wide lint autofix rewriting props. App-owned opaque Sonner/inset close/wrapping/actions, accessible status/focus. Logger debug guard/owner reads aren't reservation-writing bypass.

Local code establishes behavior; locked SDK compatibility. Official links successfully retrieved while authoring; moving examples aren't automatic-update authorization.

[1] Updater setup, signing and static feeds: https://v2.tauri.app/plugin/updater/
[2] Updater JavaScript API: https://v2.tauri.app/reference/javascript/updater/
[3] Process plugin and relaunch: https://v2.tauri.app/plugin/process/
[4] Capabilities overview: https://v2.tauri.app/security/capabilities/
[5] Windows installers / NSIS: https://v2.tauri.app/distribute/windows-installer/
[6] Plugin permissions: https://v2.tauri.app/learn/security/using-plugin-permissions/
[7] AppImage distribution: https://v2.tauri.app/distribute/appimage/
