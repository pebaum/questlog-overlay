# Questlog

A floating block editor and notepad. Drag **QUESTS** or any empty space across the top to move the overlay. There is no separate title-bar handle or edit mode.

## Install on Windows

[**Download Questlog for Windows from the latest GitHub release.**](https://github.com/pebaum/questlog-overlay/releases/latest) Under **Assets**, run `Questlog-Setup-<version>.exe`. The offline installer includes the runtime and picks x64 or ARM64 automatically. It installs for the current user without a developer environment or administrator access. Open **Questlog** from Start. To remove it, use **Settings > Apps > Installed apps**. Uninstalling does not delete the journal.

The installer is not Windows Authenticode-signed. Windows or a managed PC may warn about or block an unknown publisher. Download the first installer from the official repository linked above. After installation, Questlog verifies future in-app downloads with its own pinned release-signing key.

## Check for updates

Starting with 0.15.0, the installed Windows app periodically checks GitHub for a newer stable release. When one is available, a small **download icon** appears beside **QUESTS**. Click it to download while you keep writing. When the icon changes to **Restart & update**, click it and confirm when you're ready. Questlog saves your journal, applies the verified update and reopens; a running timer keeps its original deadline. You can also use the Questlog tray menu. There's no update icon when you're current.

Checks don't send your notes or checklist, and they don't require a GitHub account. The browser preview never checks for or installs desktop updates. If you're on 0.14.0 or earlier, install the [latest Windows release](https://github.com/pebaum/questlog-overlay/releases/latest) once to get in-app updates.

## Use the overlay

- **Header:** `QUESTS  12:45P - WED 11.18` shows the current local time and date (`A` for AM, `P` for PM). The countdown stays on its own row.
- **Count down to a clock time:** type `11a`, `1234p`, or `12:34 PM` in the timer field, then press **Enter** or click **Play**. QUESTS uses the next local occurrence, tomorrow if today's time has passed. `12a` is midnight and `12p` is noon. Repeating a clock-time timer calculates a fresh deadline rather than reusing the old interval.
- **Blocks:** type `[]` at the start of a block to make an unchecked to-do immediately; no space is required. `-` followed by Space makes a bullet. You can also type `/todo`, `/bullet`, or `/text` followed by Space at the beginning of a new or existing block. **Enter** continues a filled bullet or to-do. On an empty bullet or to-do, **Enter** ends the list in place and leaves an unformatted paragraph. **Shift+Enter** makes a line break inside the current block.
- **Reordering:** drag the dotted handle. A translucent copy follows the pointer, and the insertion line shows where it will drop. Clicking the handle does not open a menu. **Esc** cancels a drag; **Alt+Up / Alt+Down** reorders the focused item without dragging.
- **Numbered lists:** type `1.` then Space (or `/numbered` then Space) at the start of a block. Enter continues the list; Enter on an empty numbered item returns to plain text. Consecutive numbered items renumber when moved, and a new list after another kind of block starts at 1.
- **Text:** use **Ctrl+B** for bold, **Ctrl+I** for italics, and **Ctrl+U** for underline (**Cmd** on a Mac). Select words to toggle their formatting, or use the shortcut before typing. Selecting text does not open a toolbar. Type or paste web addresses in any block or the notepad to make clickable links; destinations follow edits to the address. Paste a URL over selected words to link that label instead. Click a link to open it in your browser.
- **Timer:** enter minutes or `mm:ss` and click **▶** or press **Enter**. The ASCII bar brightens and fills from left to right. The button becomes **■** while running: click it to stop silently and return to the original duration with an empty bar. To change a running timer instead, edit the time and press **Enter**; **Esc** discards your edit. On natural completion the app pings, the full bar dims, and **▶** returns. Locking the overlay or hiding it to the tray does not stop the timer. System sound and notification settings apply. If the app is quit, it checks the saved deadline next time it opens. The preview uses an in-page chime when browser audio is available.
- The time, ASCII bar, and play/stop icon share one opacity: **35%** while idle, stopped, or finished; **100%** while running, relative to the overlay. Windows forced-colors mode keeps them at full contrast.
- **Window:** drag the top area to move, or the **bottom-right corner** to resize width and height. The window remembers its size; text wraps and long content scrolls. With the corner focused, arrow keys resize in 16 px steps. **Settings > Fit window to content** restores automatic height.
- **Minimize:** click **−** to keep the full title bar (including the clock and controls) and the usable countdown while hiding the checklist and notes. The width stays the same. Click **□** to restore the previous size; hovering doesn't undo a manual minimize.
- **Auto-hide:** choose what stays on screen when the pointer leaves: **Show icon** leaves a small Questlog icon; **Keep title and timer** leaves the full-width header and usable countdown; **Off** keeps the panel expanded. Hover over the icon or header to see your notes again. Auto-hide is off by default and waits while you're editing or using Settings. The timer keeps running. The idle/hover opacity sliders and **Fade text too** work independently with all three choices.
- **Colors:** in Settings, choose **Background color** for the panel tint and **Text color** for the entire overlay, including existing notes, links and new items. These are global preferences, not text formatting. Opacity is independent; at 0% the background stays clear.
- **Settings:** the gear sets **Idle opacity** (minimum) and **Hover opacity** (maximum), each from 0–100%; the endpoints cannot cross. By default these affect the background only. Check **Fade text too** for the whole overlay. Settings stay visible while open, and the desktop tray's **Settings** command works even if you have made the panel invisible. The gear also lets you change typeface.
- New journals use **DotGothic16**: 15 px checklist text, a 20 px title, no extra row gap, 110% line height, and a 6% panel tint with full-strength 1 px dithering. The timer matches the checklist type; the notepad keeps its original size. The preview and installed app continue to store their data separately.
- DotGothic16, Noto Serif SC, and Shippori Mincho are bundled for offline use, including older journals that selected a different typeface. Their notices are in the preview source and the installed `resources/FONT-LICENSES.txt`.
- A static 4-by-4 PS1-style dither runs across the letters even while you type. At 0% opacity the letters remain dithered and the space between them stays clear. Windows forced-colors mode skips the effect.
- Click the **padlock** or press **Ctrl+Shift+Space** to pass clicks through to the app underneath. The shortcut again restores editing. If the shortcut is taken, click Questlog's notification-area icon or choose **Show & edit Questlog** from its menu. The tray menu also lets you hide, reposition, or quit the overlay.

The overlay works over ordinary windows and borderless-windowed games. Exclusive fullscreen, secure desktops (such as UAC prompts), lock screens, and other apps that enforce their own topmost layer are outside its control.

### Screenshots and screen sharing

The installed Windows overlay turns on capture protection before displaying the journal. You still see it locally, including while editing or locked. In a whole-screen share or screenshot that honors [Windows capture exclusion](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity), viewers see the window underneath; some capture methods or older Windows versions show a blank or black area instead. There is no setting to turn on.

The **browser preview is not protected**. Windows cannot guarantee exclusion from every recorder or an external camera. Before sharing sensitive notes in Teams, check the **recipient's view** with a harmless test item. If you haven't confirmed the result, choose **Hide panel** from the tray or quit Questlog before sharing.

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
2. After the **final** build, run `powershell.exe -NoProfile -File .\scripts\sign-update.ps1 -Version <version>` on the release-signing Windows account. The dedicated non-exportable key signs the version, installer name and SHA-256. Only its public key is in source. Losing the private key requires a new manual bootstrap; don't silently replace the pin.
3. Push the release commit and matching `v<version>` tag. Attach both `Questlog-Setup-<version>.exe` **and** `Questlog-Setup-<version>.exe.sig` to a draft GitHub release. Publish as **latest**, not as a prerelease, after verifying the uploads. Both assets must be downloadable without signing in. A tag alone does not offer an update.

## Later macOS release

The same desktop code has a menu-bar icon, Command-key shortcut, and macOS Spaces handling. On a Mac, run `npm ci` and `npm run dist:mac` to build Intel and Apple Silicon DMGs. A Mac release has **not** been built or validated here. Before public distribution, test transparent windows, Spaces, fullscreen transitions, shortcuts, and menu-bar recovery on macOS, then sign with Developer ID and notarize the deliverables.
