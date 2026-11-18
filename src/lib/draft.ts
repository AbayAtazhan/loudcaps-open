import { createStore, getMany, setMany } from "idb-keyval";
import type { Doc } from "@/lib/captions/types";
import type { Project } from "@/lib/project";

const store = createStore("loudcaps-studio", "drafts");
const SOURCE = "source-v1";
const EDIT = "edit-v1";
type Draft = Omit<Project, "file">;
type Source = Pick<Project, "id" | "file">;

export async function readDraft(): Promise<Project | null> {
  const [source, draft] = await getMany<Source | Draft>([SOURCE, EDIT], store);
  if (!source || !draft || !("file" in source) || !("doc" in draft) || source.id !== draft.id) return null;
  const file = source.file instanceof File ? source.file : new File([source.file], draft.meta.name);
  return { ...draft, file };
}

export async function saveDraft({ file, ...draft }: Project): Promise<boolean> {
  await setMany([[SOURCE, { id: draft.id, file }], [EDIT, draft]], store);
  return true;
}

async function changeDraft(id: string, change: (draft: Draft, storage: IDBObjectStore) => void): Promise<boolean> {
  return store("readwrite", (storage) => new Promise((resolve, reject) => {
    const transaction = storage.transaction;
    let changed = false;
    transaction.oncomplete = () => resolve(changed);
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
    const lookup = storage.get(EDIT);
    lookup.onsuccess = () => {
      const draft = lookup.result as Draft | undefined;
      if (draft?.id !== id) return;
      change(draft, storage);
      changed = true;
    };
  }));
}

export function saveEdit(id: string, doc: Doc): Promise<boolean> {
  return changeDraft(id, (draft, storage) => storage.put({ ...draft, doc }, EDIT));
}

export function removeDraft(id: string): Promise<boolean> {
  return changeDraft(id, (_, storage) => {
    storage.delete(SOURCE);
    storage.delete(EDIT);
  });
}
