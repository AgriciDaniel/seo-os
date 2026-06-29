export interface FileEntry<TNote> { note: TNote }
export interface FolderNode<TNote> {
  name: string;
  path: string;
  folders: FolderNode<TNote>[];
  files: FileEntry<TNote>[];
}
export interface FolderTree<TNote> {
  folders: FolderNode<TNote>[];
  files: FileEntry<TNote>[];
}

interface PathBearing { path: string }

export function buildFolderTree<TNote extends PathBearing>(notes: TNote[]): FolderTree<TNote> {
  const root: FolderTree<TNote> = { folders: [], files: [] };
  for (const note of notes) {
    const parts = note.path.split("/").filter(Boolean);
    if (parts.length <= 1) { root.files.push({ note }); continue; }
    insertIntoFolder(root, parts.slice(0, -1), [], note);
  }
  sortTree(root);
  return root;
}

function insertIntoFolder<TNote extends PathBearing>(
  current: FolderTree<TNote>,
  remainingDirs: string[],
  consumed: string[],
  note: TNote,
): void {
  if (remainingDirs.length === 0) { current.files.push({ note }); return; }
  const [head, ...rest] = remainingDirs;
  const childPath = [...consumed, head].join("/");
  let folder = current.folders.find((f) => f.name === head);
  if (!folder) {
    folder = { name: head, path: childPath, folders: [], files: [] };
    current.folders.push(folder);
  }
  insertIntoFolder(folder, rest, [...consumed, head], note);
}

function sortTree<TNote extends PathBearing>(tree: FolderTree<TNote>): void {
  tree.folders.sort((a, b) => a.name.localeCompare(b.name));
  tree.files.sort((a, b) => a.note.path.localeCompare(b.note.path));
  for (const folder of tree.folders) sortTree(folder);
}
