export interface CollectedItem {
  id: string;
  name: string;
  description: string;
  image: Blob;
  width: number;
  height: number;
  createdAt: string;
}

export interface CollectionSettings {
  id: "collection-settings";
  scaleLevel: number;
  globalScale: number;
}

export const DEFAULT_COLLECTION_SETTINGS: CollectionSettings = {
  id: "collection-settings",
  scaleLevel: 0,
  globalScale: 1,
};
