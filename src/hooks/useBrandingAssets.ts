import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "../stores/authStore";
import { getApiBase, authFetch } from "../lib/api";
import type { PodcastBrandingAsset, BrandingAssetCategory } from "../lib/types";

export function useBrandingAssets() {
  const { currentPodcastId } = useAuthStore();
  const [assets, setAssets] = useState<PodcastBrandingAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    if (!currentPodcastId) {
      setAssets([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await authFetch(
        `${getApiBase()}/api/podcasts/${currentPodcastId}/branding-assets`
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch branding assets");
      }

      const { assets: assetList } = await res.json();
      setAssets(assetList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch branding assets");
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPodcastId]);

  const uploadAsset = useCallback(
    async (
      file: File,
      name: string,
      category: BrandingAssetCategory
    ): Promise<PodcastBrandingAsset | null> => {
      if (!currentPodcastId) return null;

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", name);
        formData.append("category", category);

        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/branding-assets`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!res.ok) {
          const result = await res.json();
          throw new Error(result.error || "Failed to upload branding asset");
        }

        const { asset } = await res.json();
        setAssets((prev) => [...prev, asset]);
        return asset;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload branding asset");
        return null;
      }
    },
    [currentPodcastId]
  );

  const updateAsset = useCallback(
    async (
      assetId: string,
      updates: { name?: string; category?: BrandingAssetCategory; displayOrder?: number }
    ): Promise<PodcastBrandingAsset | null> => {
      if (!currentPodcastId) return null;

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/branding-assets/${assetId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          }
        );

        if (!res.ok) {
          const result = await res.json();
          throw new Error(result.error || "Failed to update branding asset");
        }

        const { asset } = await res.json();
        setAssets((prev) => prev.map((a) => (a.id === assetId ? asset : a)));
        return asset;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update branding asset");
        return null;
      }
    },
    [currentPodcastId]
  );

  const deleteAsset = useCallback(
    async (assetId: string): Promise<boolean> => {
      if (!currentPodcastId) return false;

      try {
        const res = await authFetch(
          `${getApiBase()}/api/podcasts/${currentPodcastId}/branding-assets/${assetId}`,
          { method: "DELETE" }
        );

        if (!res.ok) {
          const result = await res.json();
          throw new Error(result.error || "Failed to delete branding asset");
        }

        setAssets((prev) => prev.filter((a) => a.id !== assetId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete branding asset");
        return false;
      }
    },
    [currentPodcastId]
  );

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  return {
    assets,
    isLoading,
    error,
    uploadAsset,
    updateAsset,
    deleteAsset,
    fetchAssets,
  };
}
