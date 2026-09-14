import type { Scorebook } from "./scorebook";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("basketball-scorebooks", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("books");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadBook(key: string): Promise<Scorebook | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("books").objectStore("books").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function saveBook(key: string, book: Scorebook): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("books", "readwrite");
      tx.objectStore("books").put(book, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function videoKey(file: File) {
  // Hash full contents so two cuts with the same filename cannot share a roster.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer()
  );
  return Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0")
  ).join("");
}
