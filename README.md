# Questlog

A floating block editor and notepad. Drag **QUESTS** or any empty space across the top to move the overlay. There is no separate title-bar handle or edit mode.

## Install on Windows

[**Download Questlog for Windows from the latest GitHub release.**](https://github.com/pebaum/questlog-overlay/releases/latest) Under **Assets**, run `Questlog-Setup-<version>.exe`. The offline installer includes the runtime and picks x64 or ARM64 automatically. It installs for the current user without a developer environment or administrator access. Open **Questlog** from Start. To remove it, use **Settings > Apps > Installed apps**. Uninstalling does not delete the journal.

The installer is unsigned. Windows or a managed PC may warn about or block an unknown publisher. Only download it from the official repository linked above.

## Check for updates

Right-click **Questlog** in the Windows system tray (look under **Show hidden icons** if needed), then choose **Check for updates…**. When a newer stable release is available, choose **Download installer**. Once it downloads, quit Questlog from the tray and run the installer. No uninstall is needed; your checklist, notes, timer and settings stay in place.

The check contacts GitHub only when you choose it. It doesn't send journal content, install in the background, or require a GitHub account. If you have an older build without the menu command, install the [latest release](https://github.com/pebaum/questlog-overlay/releases/latest) once.

## Use the overlay

- **Header:** `QUESTS  12:45P - WED 11.18` shows the current local time and date (`A` for AM, `P` for PM). The countdown stays on its own row.
- **Count down to a clock time:** type `11a`, `1234p`, or `12:34 PM` in the timer field, then press **Enter** or click **Play**. QUESTS uses the next local occurrence, tomorrow if today's time has passed. `12a` is midnight and `12p` is noon. Repeating a clock-time timer calculates a fresh deadline rather than reusing the old interval.
- **Blocks:** type `[]` at the start of a block to make an unchecked to-do immediately; no space is required. `-` followed by Space makes a bullet. You can also type `/todo`, `/bullet`, or `/text` followed by Space at the beginning of a new or existing block. **Enter** continues a filled bullet or to-do. On an empty bullet or to-do, **Enter** ends the list in place and leaves an unformatted paragraph. **Shift+Enter** makes a line break inside the current block.
- **Reordering:** drag the dotted handle. A translucent copy follows the pointer, and the insertion line shows where it will drop. Clicking the handle does not open a menu. **Esc** cancels a drag; **Alt+Up / Alt+Down** reorders the focused item without dragging.
- **Text:** use **Ctrl+B** for bold, **Ctrl+I** for italics, and **Ctrl+U** for underline (**Cmd** on a Mac). Select words to toggle their formatting, or use the shortcut before typing. Selecting text does not open a toolbar. Type or paste web addresses in any block or the notepad to make clickable links; destinations follow edits to the address. Paste a URL over selected words to link that label instead. Click a link to open it in your browser.
- **Timer:** enter minutes or `mm:ss` and click **▶** or press **Enter**. The ASCII bar brightens and fills from left to right. The button becomes **■** while running: click it to stop silently and return to the original duration with an empty bar. To change a running timer instead, edit the time and press **Enter**; **Esc** discards your edit. On natural completion the app pings, the full bar dims, and **▶** returns. Locking the overlay or hiding it to the tray does not stop the timer. System sound and notification settings apply. If the app is quit, it checks the saved deadline next time it opens. The preview uses an in-page chime when browser audio is available.
- The time, ASCII bar, and play/stop icon share one opacity: **35%** while idle, stopped, or finished; **100%** while running, relative to the overlay. Windows forced-colors mode keeps them at full contrast.
- **Window:** drag the top area to move, or the **bottom-right corner** to resize width and height. The window remembers its size; text wraps and long content scrolls. With the corner focused, arrow keys resize in 16 px steps. **Settings > Fit window to content** restores automatic height.
- **Settings:** the gear sets **Idle opacity** (minimum) and **Hover opacity** (maximum), each from 0–100%; the endpoints cannot cross. By default these affect the background only. Check **Fade text too** for the whole overlay. Settings stay visible while open, and the desktop tray's **Settings** command works even if you have made the panel invisible. The gear also lets you change typeface.
- New journals use **DotGothic16**: 15 px checklist text, a 20 px title, no extra row gap, 110% line height, and a 6% panel tint with full-strength 1 px dithering. The timer matches the checklist type; the notepad keeps its original size. The preview and installed app continue to store their data separately.
- DotGothic16, Noto Serif SC, and Shippori Mincho are bundled for offline use, including older journals that selected a different typeface. Their notices are in the preview source and the installed `resources/FONT-LICENSES.txt`.
- A static 4-by-4 PS1-style dither runs across the letters even while you type. At 0% opacity the letters remain dithered and the space between them stays clear. Windows forced-colors mode skips the effect.
- Click the **padlock** or press **Ctrl+Shift+Space** to pass clicks through to the app underneath. The shortcut again restores editing. If the shortcut is taken, click Questlog's notification-area icon or choose **Show & edit Questlog** from its menu. The tray menu also lets you hide, reposition, or quit the overlay.

The overlay works over ordinary windows and borderless-windowed games. Exclusive fullscreen, secure desktops (such as UAC prompts), lock screens, and other apps that enforce their own topmost layer are outside its control.

## Computer-use accessibility requirement

**Give an assistant the guide:** right-click the Questlog tray icon and choose **AI help > Copy AI instructions**. Paste that text into the assistant you choose, then tell it what you want done. This copies a brief UI guide and the actual local paths, not your notes or checklist. The other two commands in **AI help** reveal the journal or guide in File Explorer.

Windows setup places an app-scoped `AGENTS.md` in `%APPDATA%\Questlog` if one does not already exist. Tools that look for instructions in the folder they work in can discover it there. Other assistants need the copied instructions or the guide supplied explicitly. Setup also bundles the [current guide](docs/QUESTS-AI.md) in the app's `resources` directory so upgrades can refresh it without overwriting user-authored instructions. No global assistant settings are changed and no service is connected.

Every release must let a local computer-use agent operate the checklist through the same accessible controls as a person, without OCR, dragging, a private API, or edits to the live journal file. The visual dither is only a rendering effect.

Find the **QUESTS** window and its **Checklist** ordered list. Each saved block exposes its position, type, named rich-text editor and, for to-dos, checkbox state. With multiple blocks, set the handle's accessible **Reorder: [item text]** range value (1 through the number of blocks), or focus the editor and use **Alt+Up / Alt+Down**. An empty editor is named **New item** for assistive tools but displays no prompt. For duplicate text, scope to the list item (e.g. **Item 2 of 3**); its IDs do not change with text or position. The drag preview is decorative and never a second editable block. Click-through mode is read-only; use the existing shortcut or tray action to edit.

On an interactive Windows desktop, `npm run test:uia` exercises these operations against an isolated journal using Windows UI Automation. For a release, run `powershell.exe -NoProfile -File .\tests\windows-uia.ps1 -Executable "<full path to packaged Questlog.exe>"`. Neither path opens a remote debugging port or uses your actual checklist.

## Storage and backup

The installed notepad is the `notes` field in `%APPDATA%\Questlog\journal.json`; the ordered blocks are in `items`. With Questlog closed, copy this file to back up or restore the journal. `window.json` stores the panel position and optional manual dimensions. `timer.json` stores the countdown separately, so a timer never rewrites journal content. Saves use a temporary file and an atomic rename. If the journal is unreadable or has an unknown format, Questlog reports the error rather than overwriting it.

On first launch with an older journal, the original is backed up as `journal.json.v1.bak` or `journal.json.v2.bak`. Existing flat checklist items become to-do blocks with their original IDs, order and checkmarks. Earlier quest titles and objectives are flattened in order. Notes and existing appearance settings carry over; the old opacity becomes the idle value. The standalone preview keeps its own data and leaves the previous storage key intact.

## Develop

Use Node.js 24 LTS or newer and npm. From this folder:

```shell
npm ci
npm start
npm test
npm run test:desktop
npm run dist:win
```

`release` contains the Windows installer. `renderer` and `shared` are platform-independent; `desktop` owns the native window, input, tray, and storage. `npm run build` also produces `app/index.html`, a standalone interactive preview that has its **own** browser-local data. A browser cannot provide native always-on-top or click-through.

### Publish a Windows update

1. On a clean checkout, bump the stable `major.minor.patch` version in `package.json` and `package-lock.json`. Run `npm ci`, `npm test`, `npm run test:desktop`, and `npm run dist:win`. Test the packaged app with the UI Automation command above.
2. Push the release commit and a matching `v<version>` tag. Create a draft GitHub Release for that tag and attach `release/Questlog-Setup-<version>.exe` without renaming it.
3. Publish the release as **latest**, not as a prerelease. Verify that its installer downloads without signing in. The tray command reads GitHub's latest stable release; pushing code or a tag alone does not offer an update.

## Later macOS release

The same desktop code has a menu-bar icon, Command-key shortcut, and macOS Spaces handling. On a Mac, run `npm ci` and `npm run dist:mac` to build Intel and Apple Silicon DMGs. A Mac release has **not** been built or validated here. Before public distribution, test transparent windows, Spaces, fullscreen transitions, shortcuts, and menu-bar recovery on macOS, then sign with Developer ID and notarize the deliverables.
