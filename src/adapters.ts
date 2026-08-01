export interface NarrationSegment { id: string; text: string; locale: string; outputPath: string }
export interface NarrationProvider { synthesize(segment: NarrationSegment): Promise<{ path: string; durationSeconds: number }> }
export interface RemoteBrowserAdapter { connect(endpoint: string): Promise<{ wsEndpoint: string; close(): Promise<void> }> }

export class SilentNarrationProvider implements NarrationProvider {
  async synthesize(): Promise<never> {
    throw new Error('Voiceover requested but no narration provider is configured');
  }
}
