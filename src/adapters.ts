export interface NarrationSegment { id: string; text: string; locale: string; outputPath: string; previousText?: string; nextText?: string }
export interface NarrationProvider { synthesize(segment: NarrationSegment): Promise<{ path: string; durationSeconds: number }> }
