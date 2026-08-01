import React from 'react';
import { AbsoluteFill, Composition, Html5Audio, OffthreadVideo, Sequence, interpolate, registerRoot, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export type DemoVideoProps = {
  clips: Array<{ src: string; audioSrc?: string; durationInFrames: number; title: string; description?: string }>;
  brand: { name: string; primary: string; background: string };
}

const Scene: React.FC<{ clip: DemoVideoProps['clips'][number] }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const intro = interpolate(frame, [0, 16], [0.96, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ padding: portrait ? 16 : 36, paddingBottom: portrait ? 96 : 94, background: '#091b19' }}>
    {clip.audioSrc ? <Html5Audio src={staticFile(clip.audioSrc)} volume={1} /> : null}
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: portrait ? 28 : 18, border: '1px solid #ffffff2b', boxShadow: '0 28px 90px #0009', transform: `scale(${intro})`, background: '#edf4f3' }}>
      <OffthreadVideo muted src={staticFile(clip.src)} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#edf4f3' }} />
    </div>
    <div style={{ position: 'absolute', left: portrait ? 24 : 44, right: portrait ? 24 : 44, bottom: portrait ? 22 : 24, display: 'flex', alignItems: 'center', gap: 14, color: 'white', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ width: 7, height: 42, borderRadius: 8, background: '#54c5ab' }} />
      <div><div style={{ fontSize: portrait ? 22 : 26, fontWeight: 760, letterSpacing: '-0.02em' }}>{clip.title}</div>{clip.description ? <div style={{ marginTop: 3, color: '#bcd0cc', fontSize: portrait ? 13 : 15 }}>{clip.description}</div> : null}</div>
    </div>
  </AbsoluteFill>;
};

const DemoVideo: React.FC<DemoVideoProps> = ({ clips, brand }) => {
  let offset = 0;
  return <AbsoluteFill style={{ background: brand.background }}>
    {clips.map((clip) => {
      const from = offset;
      offset += clip.durationInFrames;
      return <Sequence key={clip.src} from={from} durationInFrames={clip.durationInFrames}><Scene clip={clip} /></Sequence>;
    })}
    <div style={{ position: 'absolute', right: 30, top: 24, padding: '8px 12px', borderRadius: 999, color: 'white', background: brand.primary, font: '700 14px Inter, system-ui, sans-serif', boxShadow: '0 8px 28px #0004' }}>{brand.name}</div>
  </AbsoluteFill>;
};

const Root: React.FC = () => <Composition id="ProductDemo" component={DemoVideo} durationInFrames={300} fps={30} width={1440} height={900} defaultProps={{ clips: [], brand: { name: 'Product Demo', primary: '#116b5a', background: '#091b19' } }} />;

registerRoot(Root);
