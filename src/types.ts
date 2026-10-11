export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export interface ArtworkMeta {
  id: string; title: string; category: string; difficulty: Difficulty;
  tags: string[]; thumbnail: string; regionCount: number;
  /** Bundled colored example; loaded only when the reference viewer is opened. */
  referenceImage?: string;
}
export interface ArtRegion { id: string; path: string; label?: string; }
export interface Artwork {
  id: string; width: number; height: number;
  /** True only when the source generator guarantees that region interiors never overlap. */
  disjointRegions?: boolean;
  regions: ArtRegion[];
  lines: { path: string; width?: number; fill?: string }[];
}
export type Tool = 'fill' | 'brush' | 'airbrush' | 'pencil' | 'texture' | 'eraser' | 'eyedropper' | 'gradient';
export interface PaintPoint { x: number; y: number; pressure: number; }
export interface PaintCommand {
  id: string; tool: Tool; color: string; secondaryColor: string;
  size: number; opacity: number; regionId?: string; points: PaintPoint[]; seed: number;
}
export interface PaintingDocument {
  id: string; artworkId: string; title: string; createdAt: number; updatedAt: number;
  commands: PaintCommand[]; favorite: boolean; preview?: string;
  artworkSnapshot?: Artwork;
  /** Gallery rows never load editable stroke history until opened. */
  isSummary?: boolean;
  commandCount?: number;
}
export interface CanvasSettings {
  tool: Tool; color: string; secondaryColor: string; size: number;
  opacity: number; guided: boolean; lockedRegionId?: string;
}
export interface CanvasCallbacks {
  onChange: (commands: PaintCommand[]) => void;
  onPickColor?: (color: string) => void;
  onRegion?: (regionId: string | undefined) => void;
  onHistory?: (canUndo: boolean, canRedo: boolean) => void;
  onZoom?: (zoom: number) => void;
}
