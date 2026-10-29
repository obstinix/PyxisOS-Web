import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../src/App';
import { runtime } from '../src/core/system';
import { wm } from '../src/core/windows';
import { HOME } from '../src/core/path';

beforeAll(() => {
  // jsdom lacks these browser APIs.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  runtime.resetForTests();
});

async function bootToDesktop() {
  render(<App />);
  const enter = await screen.findByRole('button', { name: /enter desktop/i }, { timeout: 5000 });
  await act(async () => {
    fireEvent.click(enter);
  });
  await screen.findByRole('dialog', { name: 'System Center' });
}

async function runInTerminal(input: HTMLElement, command: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value: command } });
    fireEvent.keyDown(input, { key: 'Enter' });
  });
}

describe('desktop integration', () => {
  it('boots, signs in, and shows System Center with diagnostics', async () => {
    await bootToDesktop();
    const center = screen.getByRole('dialog', { name: 'System Center' });
    await waitFor(() => expect(within(center).getByText(/\d+ pass · \d+ warn/)).toBeTruthy());
    expect(screen.getByRole('navigation', { name: 'Dock' })).toBeTruthy();
  });

  it('runs terminal commands that change the shared filesystem', async () => {
    await bootToDesktop();
    await act(async () => {
      wm.open('terminal');
    });
    const input = await screen.findByLabelText('Terminal command input');
    await runInTerminal(input, 'mkdir projects-demo');
    await runInTerminal(input, 'echo "integration" > projects-demo/test.txt');
    await runInTerminal(input, 'cat projects-demo/test.txt');
    const log = screen.getByRole('log', { name: 'Terminal output' });
    await waitFor(() => expect(log.textContent).toContain('integration'));
    expect(runtime.fs.readFile(`${HOME}/projects-demo/test.txt`)).toBe('integration\n');

    await runInTerminal(input, 'clear');
    await waitFor(() => expect(log.textContent).not.toContain('integration'));

    // The file manager sees the terminal's changes without a reload.
    await act(async () => {
      wm.open('files', { path: `${HOME}/projects-demo` });
    });
    const files = await screen.findByRole('grid', { name: /projects-demo/ });
    expect(within(files).getByText('test.txt')).toBeTruthy();

    // ...and updates live when the terminal removes the file.
    await runInTerminal(input, 'rm projects-demo/test.txt');
    await waitFor(() => expect(within(files).queryByText('test.txt')).toBeNull());
  });

  it('opens files in the editor and saves edits back to the filesystem', async () => {
    await bootToDesktop();
    runtime.fs.writeFile(`${HOME}/Documents/edit-me.txt`, 'before');
    await act(async () => {
      wm.open('editor', { path: `${HOME}/Documents/edit-me.txt` });
    });
    const area = (await screen.findByLabelText('Editing edit-me.txt')) as HTMLTextAreaElement;
    expect(area.value).toBe('before');
    await act(async () => {
      fireEvent.change(area, { target: { value: 'after' } });
    });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(area, { key: 's', ctrlKey: true });
    });
    expect(runtime.fs.readFile(`${HOME}/Documents/edit-me.txt`)).toBe('after');
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());

    // External change from another app reloads a clean document.
    await act(async () => {
      runtime.fs.writeFile(`${HOME}/Documents/edit-me.txt`, 'changed elsewhere');
    });
    await waitFor(() => expect(area.value).toBe('changed elsewhere'));
  });

  it('launcher searches and opens applications', async () => {
    await bootToDesktop();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    });
    const search = await screen.findByLabelText('Search applications and files');
    await act(async () => {
      fireEvent.change(search, { target: { value: 'monitor' } });
    });
    await act(async () => {
      fireEvent.keyDown(search, { key: 'Enter' });
    });
    expect(await screen.findByRole('dialog', { name: 'System Monitor' })).toBeTruthy();
    expect(screen.queryByLabelText('Search applications and files')).toBeNull();
  });

  it('closes windows from the title bar', async () => {
    await bootToDesktop();
    const center = screen.getByRole('dialog', { name: 'System Center' });
    await act(async () => {
      fireEvent.click(within(center).getByRole('button', { name: 'Close' }));
    });
    expect(screen.queryByRole('dialog', { name: 'System Center' })).toBeNull();
    expect(wm.windows).toHaveLength(0);
  });
});
