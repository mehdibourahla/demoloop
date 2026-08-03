import React from 'react';
import { AbsoluteFill, Composition, Html5Audio, OffthreadVideo, Sequence, interpolate, registerRoot, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

type Presentation = {
  camera: { type: 'none' | 'crop' | 'pan' | 'zoom'; scale?: number; to?: { x: number; y: number; width: number; height: number } };
  transitionWeight: 'light' | 'meaningful' | 'major';
  caption: { mode: 'none' | 'lower-third'; safeArea?: 'top' | 'bottom' | 'left' | 'right' };
};

export type DemoVideoProps = {
  clips: Array<{ src: string; audioSrc?: string; durationInFrames: number; title: string; description?: string; purpose: string; presentation: Presentation }>;
  brand: { name: string; primary: string; background: string };
  music?: { src: string; level: number; fadeInFrames: number; fadeOutFrames: number };
};

const Scene: React.FC<{ clip: DemoVideoProps['clips'][number] }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const introFrames = clip.presentation.transitionWeight === 'major' ? 18 : clip.presentation.transitionWeight === 'meaningful' ? 10 : 5;
  const intro = interpolate(frame, [0, introFrames], [0.985, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cameraScale = clip.presentation.camera.type === 'zoom' ? clip.presentation.camera.scale ?? 1.15 : 1;
  const scale = interpolate(frame, [0, Math.max(1, clip.durationInFrames - 1)], [intro, cameraScale], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const captionTop = clip.presentation.caption.safeArea === 'top';
  return <AbsoluteFill style={{ background: clip.presentation.caption.mode === 'none' ? '#000' : '#07111f', overflow: 'hidden' }}>
    {clip.audioSrc ? <Html5Audio src={staticFile(clip.audioSrc)} volume={1} /> : null}
    <OffthreadVideo muted src={staticFile(clip.src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`, transformOrigin: 'center', background: '#07111f' }} />
    {clip.presentation.caption.mode === 'lower-third' ? <div style={{ position: 'absolute', left: width * 0.04, right: width * 0.2, top: captionTop ? height * 0.035 : undefined, bottom: captionTop ? undefined : height * 0.035, padding: `${Math.max(10, height * 0.014)}px ${Math.max(14, width * 0.014)}px`, borderRadius: 14, color: 'white', background: '#06101dda', borderLeft: `6px solid ${clip.purpose === 'proof' || clip.purpose === 'result' ? '#34d399' : clip.presentation.transitionWeight === 'major' ? '#f59e0b' : '#60a5fa'}`, fontFamily: 'Inter, system-ui, sans-serif', boxShadow: '0 12px 40px #0007' }}>
      <div style={{ fontSize: Math.max(19, width * 0.018), fontWeight: 760, lineHeight: 1.1 }}>{clip.title}</div>
      {clip.description ? <div style={{ marginTop: 5, color: '#d7e1ec', fontSize: Math.max(12, width * 0.011), lineHeight: 1.25 }}>{clip.description}</div> : null}
    </div> : null}
  </AbsoluteFill>;
};

const DemoVideo: React.FC<DemoVideoProps> = ({ clips, brand, music }) => {
  const { durationInFrames } = useVideoConfig();
  let offset = 0;
  return <AbsoluteFill style={{ background: brand.background }}>
    {music ? <Html5Audio src={staticFile(music.src)} volume={(frame) => {
      const fadeIn = music.fadeInFrames ? Math.min(1, frame / music.fadeInFrames) : 1;
      const remaining = durationInFrames - frame;
      const fadeOut = music.fadeOutFrames ? Math.min(1, remaining / music.fadeOutFrames) : 1;
      return music.level * fadeIn * fadeOut;
    }} loop /> : null}
    {clips.map((clip) => {
      const from = offset;
      offset += clip.durationInFrames;
      return <Sequence key={`${clip.src}-${from}`} from={from} durationInFrames={clip.durationInFrames}><Scene clip={clip} /></Sequence>;
    })}
  </AbsoluteFill>;
};

const Root: React.FC = () => <Composition id="ProductDemo" component={DemoVideo} durationInFrames={300} fps={30} width={1440} height={900} defaultProps={{ clips: [], brand: { name: 'Product Demo', primary: '#2563eb', background: '#08111f' } }} />;
registerRoot(Root);
