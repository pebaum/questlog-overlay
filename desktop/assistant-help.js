export function assistantHelp(journalPath, guidePath, clipboard, shell) {
  return {
    label: 'AI help',
    submenu: [
      { label: 'Copy AI instructions', click: () => clipboard.writeText([
        'For tasks I request in QUESTS, use the local QUESTS window and its accessibility controls.',
        `Desktop guide: ${guidePath}`,
        `Journal location: ${journalPath} (the notepad is the notes field; the ordered checklist is items).`,
        'For the notepad, enable Settings > Show notepad if needed. To add a to-do, type in New item or press Enter at the end of the last block, then type [].',
        'Use the UI for edits; do not overwrite the live JSON file. Only access the content needed for my request. Do not send it elsewhere.'
      ].join('\n')) },
      { label: 'Show journal in folder', click: () => shell.showItemInFolder(journalPath) },
      { label: 'Show AI guide in folder', click: () => shell.showItemInFolder(guidePath) }
    ]
  };
}
