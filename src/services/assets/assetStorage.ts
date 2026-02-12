/**
 * IndexedDB-based asset storage for generated images, thumbnails, and B-roll
 * Stores large binary data (Blobs) for AI-generated content
 */

import { GeneratedAsset } from "../../lib/types";

const DB_NAME = "podcastomatic-assets";
const DB_VERSION = 1;
const BLOBS_STORE = "asset-blobs";
const METADATA_STORE = "asset-metadata";

// In-memory cache for quick access
declare global {
  interface Window {
    __assetBlobCache?: Map<string, Blob>;
    __assetMetadataCache?: Map<string, GeneratedAsset>;
  }
}

const getBlobCache = (): Map<string, Blob> => {
  if (typeof window !== "undefined") {
    if (!window.__assetBlobCache) {
      window.__assetBlobCache = new Map();
    }
    return window.__assetBlobCache;
  }
  return new Map();
};

const getMetadataCache = (): Map<string, GeneratedAsset> => {
  if (typeof window !== "undefined") {
    if (!window.__assetMetadataCache) {
      window.__assetMetadataCache = new Map();
    }
    return window.__assetMetadataCache;
  }
  return new Map();
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create blobs store for binary data
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE);
      }

      // Create metadata store for asset info
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        const metadataStore = db.createObjectStore(METADATA_STORE, { keyPath: "id" });
        metadataStore.createIndex("type", "type", { unique: false });
        metadataStore.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
};

/**
 * Store an asset blob and its metadata
 */
export async function storeAsset(asset: GeneratedAsset, blob: Blob): Promise<void> {
  try {
    const db = await openDB();

    // Store blob
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([BLOBS_STORE], "readwrite");
      const store = transaction.objectStore(BLOBS_STORE);
      const request = store.put(blob, asset.blobKey);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    // Store metadata
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE], "readwrite");
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.put(asset);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    // Update caches
    getBlobCache().set(asset.blobKey, blob);
    getMetadataCache().set(asset.id, asset);
  } catch (err) {
    console.error("Failed to store asset:", err);
    throw err;
  }
}

/**
 * Get an asset blob by its blob key
 */
export async function getAssetBlob(blobKey: string): Promise<Blob | null> {
  // Check memory cache first
  const cache = getBlobCache();
  if (cache.has(blobKey)) {
    return cache.get(blobKey) ?? null;
  }

  try {
    const db = await openDB();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const transaction = db.transaction([BLOBS_STORE], "readonly");
      const store = transaction.objectStore(BLOBS_STORE);
      const request = store.get(blobKey);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });

    if (blob) {
      cache.set(blobKey, blob);
    }

    return blob;
  } catch (err) {
    console.error("Failed to get asset blob:", err);
    return null;
  }
}

/**
 * Get asset metadata by ID
 */
export async function getAssetMetadata(assetId: string): Promise<GeneratedAsset | null> {
  // Check memory cache first
  const cache = getMetadataCache();
  if (cache.has(assetId)) {
    return cache.get(assetId) ?? null;
  }

  try {
    const db = await openDB();
    const asset = await new Promise<GeneratedAsset | null>((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE], "readonly");
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get(assetId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });

    if (asset) {
      cache.set(assetId, asset);
    }

    return asset;
  } catch (err) {
    console.error("Failed to get asset metadata:", err);
    return null;
  }
}

/**
 * Get all assets by type
 */
export async function getAssetsByType(type: GeneratedAsset["type"]): Promise<GeneratedAsset[]> {
  try {
    const db = await openDB();
    return new Promise<GeneratedAsset[]>((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE], "readonly");
      const store = transaction.objectStore(METADATA_STORE);
      const index = store.index("type");
      const request = index.getAll(type);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  } catch (err) {
    console.error("Failed to get assets by type:", err);
    return [];
  }
}

/**
 * Delete an asset (blob and metadata)
 */
export async function deleteAsset(assetId: string): Promise<void> {
  try {
    // Get metadata first to find blob key
    const metadata = await getAssetMetadata(assetId);
    if (!metadata) return;

    const db = await openDB();

    // Delete blob
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([BLOBS_STORE], "readwrite");
      const store = transaction.objectStore(BLOBS_STORE);
      const request = store.delete(metadata.blobKey);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    // Delete metadata
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([METADATA_STORE], "readwrite");
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.delete(assetId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    // Clear from caches
    getBlobCache().delete(metadata.blobKey);
    getMetadataCache().delete(assetId);
  } catch (err) {
    console.error("Failed to delete asset:", err);
    throw err;
  }
}

/**
 * Get asset as data URL for display
 */
export async function getAssetDataUrl(blobKey: string): Promise<string | null> {
  const blob = await getAssetBlob(blobKey);
  if (!blob) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Store a generated image from a URL (fetches and stores locally)
 */
export async function storeAssetFromUrl(
  assetId: string,
  type: GeneratedAsset["type"],
  url: string,
  prompt?: string
): Promise<GeneratedAsset> {
  const response = await fetch(url);
  const blob = await response.blob();

  const blobKey = `${type}-${assetId}`;

  // Generate thumbnail for preview
  let thumbnailUrl: string | undefined;
  if (blob.type.startsWith("image/")) {
    thumbnailUrl = await generateThumbnail(blob);
  }

  const asset: GeneratedAsset = {
    id: assetId,
    type,
    prompt,
    blobKey,
    thumbnailUrl,
    createdAt: new Date().toISOString(),
  };

  await storeAsset(asset, blob);
  return asset;
}

/**
 * Generate a thumbnail data URL from an image blob
 */
async function generateThumbnail(blob: Blob, maxSize: number = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate thumbnail dimensions
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      // Draw to canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Clear all assets from storage
 */
export async function clearAllAssets(): Promise<void> {
  try {
    const db = await openDB();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([BLOBS_STORE, METADATA_STORE], "readwrite");
      const blobStore = transaction.objectStore(BLOBS_STORE);
      const metadataStore = transaction.objectStore(METADATA_STORE);

      blobStore.clear();
      metadataStore.clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    // Clear caches
    getBlobCache().clear();
    getMetadataCache().clear();
  } catch (err) {
    console.error("Failed to clear assets:", err);
    throw err;
  }
}
