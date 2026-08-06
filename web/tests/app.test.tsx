import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import { Status } from '../src/components';

const who = { user: 'ada', workspace: '11111111-1111-1111-1111-111111111111' };

beforeEach(() => vi.restoreAllMocks());

test('status is carried by a word, not by colour alone', () => {
  render(<Status value="drifted" />);

  const chip = screen.getByText('drifted');
  expect(chip).toHaveTextContent('drifted');
  expect(chip.className).toContain('warn');
});

test('the theme root sets colour as well as background', () => {
  const { container } = render(<App who={who} />);

  expect(container.querySelector('.app')).toHaveAttribute('data-theme', 'light');
});

test('switching to dark mode moves the whole app root', async () => {
  const { container } = render(<App who={who} />);

  await userEvent.click(screen.getByRole('button', { name: 'Dark' }));

  expect(container.querySelector('.app')).toHaveAttribute('data-theme', 'dark');
});

test('reconnaissance shows the mapped product once it completes', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(init?.method) === 'POST') return Response.json({ id: 'r1' });
    return Response.json({
      id: 'r1', status: 'complete',
      model: { product: 'Delivery Board', proofSurfaces: [{ id: 's', name: 'Status' }] },
      plan: { status: 'planned', outputs: [{ id: 'o1', title: 'Deliver an item', scenes: [1, 2] }] }
    });
  });
  render(<App who={who} />);

  await userEvent.click(screen.getByRole('button', { name: 'Explore' }));

  await waitFor(() => expect(screen.getByText('Delivery Board')).toBeInTheDocument());
  expect(screen.getByText('Deliver an item')).toBeInTheDocument();
});

test('a production without a master shows a placeholder, never a drawn screenshot', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ id: 'p1', status: 'capturing', video: null })
  );
  render(<App who={who} />);
  await userEvent.click(screen.getByRole('button', { name: 'Productions' }));
  await userEvent.type(screen.getByLabelText('Production'), 'p1');

  await userEvent.click(screen.getByRole('button', { name: 'Open' }));

  await waitFor(() => expect(screen.getByText(/recorded master appears here/)).toBeInTheDocument());
  expect(document.querySelector('video')).toBeNull();
});

test('drift names the scene and the target that moved', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(init?.method) === 'POST') return Response.json({ id: 'v1' });
    return Response.json({
      id: 'v1', status: 'drifted', checkedAt: '2026-08-05T12:00:00Z',
      drifted: [{ sceneId: 'create', label: 'Create record', status: 'missing', matches: 0 }]
    });
  });
  render(<App who={who} />);
  await userEvent.click(screen.getByRole('button', { name: 'Health' }));
  await userEvent.type(screen.getByLabelText('Production'), 'p1');

  await userEvent.click(screen.getByRole('button', { name: 'Re-check' }));

  await waitFor(() => expect(screen.getByText('Create record')).toBeInTheDocument());
  expect(screen.getByText('create')).toBeInTheDocument();
});

test('the library lists demos and opens one in the player', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/v1/productions')) {
      return Response.json({
        productions: [
          { id: 'p1', title: 'Deliver an item', status: 'complete', hasVideo: true, published: null },
          { id: 'p2', title: null, status: 'capturing', hasVideo: false, published: null }
        ]
      });
    }
    return Response.json({ id: 'p1', status: 'complete', video: 'https://store/p1.mp4', published: null });
  });
  render(<App who={who} />);

  await userEvent.click(screen.getByRole('button', { name: 'Library' }));
  await waitFor(() => expect(screen.getByText('Deliver an item')).toBeInTheDocument());
  await userEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);

  await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
});

test('an untitled demo is marked rather than left blank', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ productions: [{ id: 'p2', title: null, status: 'capturing', hasVideo: false, published: null }] })
  );
  render(<App who={who} />);

  await userEvent.click(screen.getByRole('button', { name: 'Library' }));

  await waitFor(() => expect(screen.getByText('untitled')).toBeInTheDocument());
});

test('an empty library says what to do next', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ productions: [] }));
  render(<App who={who} />);

  await userEvent.click(screen.getByRole('button', { name: 'Library' }));

  await waitFor(() => expect(screen.getByText(/Explore a product/)).toBeInTheDocument());
});
