import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { Watch } from '../src/screens/Watch';

beforeEach(() => vi.restoreAllMocks());

const RECEIPT = {
  title: 'Deliver an item', commit: '8f2c1a9', environment: 'https://staging.example.com',
  dirty: false, recordedAt: '2026-08-04T14:03:00Z', agentScore: 8.4, accepted: true
};

test('a shared demo shows its master and the receipt', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ video: 'https://store/master.mp4', receipt: RECEIPT })
  );

  render(<Watch token="tok" />);

  await waitFor(() => expect(screen.getByText('Deliver an item')).toBeInTheDocument());
  expect(screen.getByText('8f2c1a9')).toBeInTheDocument();
  expect(screen.getByText('https://staging.example.com')).toBeInTheDocument();
  expect(document.querySelector('video')).toBeInTheDocument();
});

test('a demo recorded from a dirty tree says so on the receipt', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ video: 'https://store/master.mp4', receipt: { ...RECEIPT, dirty: true } })
  );

  render(<Watch token="tok" />);

  await waitFor(() => expect(screen.getByText(/uncommitted changes/)).toBeInTheDocument());
});

test('a revoked link says the demo is unavailable rather than failing silently', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));

  render(<Watch token="gone" />);

  await waitFor(() => expect(screen.getByText(/not available/)).toBeInTheDocument());
});
