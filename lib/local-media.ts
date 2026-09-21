// Store binary media separately so a large image cannot exhaust localStorage.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('brandcurrent-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Browser media storage is unavailable.'));
  });
}
export async function storeLocalMedia(
  id: string,
  image: { data: string; mimeType: string },
) {
  const bytes = Uint8Array.from(atob(image.data), (x) => x.charCodeAt(0));
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      tx.objectStore('assets').put(
        new Blob([bytes], { type: image.mimeType }),
        id,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error(
            'Browser media storage is full. Download or remove older assets and retry.',
          ),
        );
      tx.onabort = () => reject(new Error('Media could not be saved.'));
    });
  } finally {
    db.close();
  }
  return 'local-media:' + id;
}
export async function loadLocalMedia(id: string) {
  const db = await database();
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const r = db.transaction('assets').objectStore('assets').get(id);
      r.onsuccess = () =>
        r.result instanceof Blob
          ? resolve(r.result)
          : reject(
              new Error(
                'This image is missing from browser storage. Generate it again.',
              ),
            );
      r.onerror = () => reject(new Error('Image could not be loaded.'));
    });
  } finally {
    db.close();
  }
}
export async function deleteLocalMedia(id: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite');
      tx.objectStore('assets').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Image deletion failed.'));
    });
  } finally {
    db.close();
  }
}
