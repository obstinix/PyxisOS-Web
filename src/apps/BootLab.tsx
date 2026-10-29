import { useEffect, useState } from 'react';
import { AppProps } from './types';
import { useStore } from '../core/store';
import { runtime } from '../core/system';
import { prefersReducedMotion, settingsStore } from '../core/settings';
import { events } from '../core/events';
import { Icon } from '../shell/icons';
import { Badge, confirmDialog } from '../shell/ui';

interface Stage {
  id: string;
  title: string;
  component: string;
  source: string;
  detail: string[];
  responsibility: string;
  failure?: { label: string; effect: string };
}

/**
 * Stages of the native PyxisOS x86_64 boot path, summarised from
 * docs/architecture/boot-flow.md in obstinix/PyxisOS (reviewed 2026-10-29).
 * Playback is an educational model; nothing here executes on hardware.
 */
const STAGES: Stage[] = [
  {
    id: 'firmware',
    title: 'Firmware',
    component: 'BIOS / UEFI CSM / QEMU',
    source: '—',
    responsibility: 'Power-on self test and loading the bootloader.',
    detail: ['Hands control to a Multiboot-compliant bootloader.'],
  },
  {
    id: 'loader',
    title: 'Multiboot bootloader',
    component: 'GRUB (Multiboot)',
    source: 'boot/multiboot.h',
    responsibility: 'Loads the kernel ELF at 1 MiB and enters it in 32-bit protected mode.',
    detail: ['Jumps to _start with eax = 0x2BADB002 (Multiboot magic) and ebx pointing at the Multiboot info structure.'],
    failure: { label: 'Bad Multiboot magic', effect: 'The kernel cannot trust the boot information; the memory map is unavailable and initialisation must stop.' },
  },
  {
    id: 'longmode',
    title: 'Long Mode transition',
    component: 'arch/x86_64/boot/boot.S',
    source: 'arch/x86_64/boot/header.S, boot.S',
    responsibility: 'Validates the CPU and switches to 64-bit Long Mode.',
    detail: [
      'CPUID support check by toggling EFLAGS bit 21.',
      'Long Mode probe: cpuid 0x80000001, EDX bit 29.',
      'Identity-maps the lower 64 MiB with 32 × 2 MiB huge pages (PML4 → PDPT → PD).',
      'Sets CR4.PAE, loads CR3, sets EFER.LME via wrmsr, then CR0.PG and CR0.PE.',
      'Loads the 64-bit GDT and far-jumps to long_mode_start.',
    ],
    failure: { label: 'CPU without Long Mode', effect: "boot.S prints 'E' to the VGA buffer and halts the CPU." },
  },
  {
    id: 'kmain',
    title: 'kernel_main',
    component: 'kernel/core/main.c',
    source: 'kernel/core/main.c',
    responsibility: 'Entry point of the C kernel with a 32 KiB stack, Multiboot info passed in rdi/rsi (System V ABI).',
    detail: ['Initialises early consoles and CPU tables in order.'],
  },
  {
    id: 'early',
    title: 'Consoles & CPU tables',
    component: 'serial, VGA, GDT/IDT',
    source: 'drivers/char/serial.c, drivers/video/vga.c, arch/x86_64/cpu/',
    responsibility: 'Debug output and exception handling.',
    detail: ['serial_init(): COM1 16550 UART.', 'vga_init(): text buffer at 0xB8000.', 'gdt_init() + idt_init(): 64-bit GDT, TSS and IDT with 48 ISR stubs.'],
  },
  {
    id: 'pic',
    title: 'Interrupt controller',
    component: 'arch/x86_64/interrupts/pic.c',
    source: 'pic_init()',
    responsibility: 'Remaps the 8259 PIC so hardware IRQs do not collide with CPU exceptions.',
    detail: ['IRQ 0–15 remapped to vectors 32–47.'],
  },
  {
    id: 'pmm',
    title: 'Physical memory',
    component: 'mm/pmm.c',
    source: 'pmm_init()',
    responsibility: 'Tracks free and used 4 KiB frames across Multiboot memory zones with a bitmap.',
    detail: ['Bitmap frame allocator over detected memory regions.'],
    failure: { label: 'No usable memory map', effect: 'Without free frames the kernel cannot build page tables or a heap; initialisation cannot continue.' },
  },
  {
    id: 'vmm',
    title: 'Virtual memory',
    component: 'mm/vmm.c',
    source: 'vmm_init()',
    responsibility: '4-level x86_64 paging (PML4, PDPT, PD, PT) with 4 KiB and 2 MiB pages.',
    detail: ['Replaces the early identity mapping with managed page tables.'],
  },
  {
    id: 'heap',
    title: 'Kernel heap',
    component: 'mm/heap.c',
    source: 'heap_init()',
    responsibility: 'kmalloc / kfree via a boundary-tag chunk allocator with header validation.',
    detail: ['Dynamic kernel allocations become available.'],
  },
  {
    id: 'drivers',
    title: 'Device drivers',
    component: 'drivers/',
    source: 'pit_init(), keyboard_init()',
    responsibility: 'Timer and input devices.',
    detail: ['8254 PIT at 100 Hz on IRQ0.', 'PS/2 keyboard on IRQ1.'],
  },
  {
    id: 'vfs',
    title: 'Filesystem',
    component: 'fs/vfs.c, fs/ramfs.c',
    source: 'vfs_init(), ramfs_init()',
    responsibility: 'In-memory VFS switch and RamFS with /os-release and /README.',
    detail: ['PyxisOS-Web’s own virtual filesystem plays the same role in this browser build.'],
  },
  {
    id: 'rust',
    title: 'Rust kernel core',
    component: 'kernel/src (Lunar Core bindings)',
    source: 'rust_kernel_init() via C FFI',
    responsibility: 'Task control blocks, priority scheduler and IPC channels.',
    detail: ['Lunar Core itself is an experimental no_std crate in native/lunar-core/.'],
  },
  {
    id: 'sti',
    title: 'Enable interrupts',
    component: 'sti',
    source: 'kernel/core/main.c',
    responsibility: 'The system starts handling timer and keyboard interrupts.',
    detail: [],
  },
  {
    id: 'shell',
    title: 'Interactive kernel shell',
    component: 'userspace/shell/',
    source: 'shell_init(), shell_run()',
    responsibility: 'Early console with help, info, mem and uptime.',
    detail: ['On physical machines today, PyxisOS runs its desktop on the Track A Linux substrate instead.'],
  },
];

/** Kernel & Boot Architecture Lab: step-by-step playback of the native boot path with failure scenarios. */
export function BootLabApp(_: AppProps) {
  const settings = useStore(settingsStore);
  const webStages = useStore(runtime.stages);
  const [pos, setPos] = useState(0);
  const [selected, setSelected] = useState(STAGES[0].id);
  const [playing, setPlaying] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const faultIndex = fault ? STAGES.findIndex((s) => s.id === fault) : -1;
  const sel = STAGES.find((s) => s.id === selected)!;
  const halted = faultIndex >= 0 && pos >= faultIndex;

  useEffect(() => {
    if (!playing) return;
    if (pos >= STAGES.length - 1 || halted) {
      setPlaying(false);
      events.log('bootlab', halted ? `Boot model halted at ${STAGES[faultIndex].title} (${STAGES[faultIndex].failure!.label})` : 'Boot model reached the kernel shell', halted ? 'warn' : 'info', { simulated: true });
      return;
    }
    const t = setTimeout(() => {
      setPos((p) => p + 1);
      setSelected(STAGES[Math.min(pos + 1, STAGES.length - 1)].id);
    }, prefersReducedMotion(settings) ? 120 : 650);
    return () => clearTimeout(t);
  }, [playing, pos, halted]);

  const replayRealBoot = async () => {
    if (!(await confirmDialog('Replay the PyxisOS-Web boot?', { message: 'Your work is saved and the page reloads to run the browser boot sequence again at full length.', confirmLabel: 'Restart now' }))) return;
    try {
      sessionStorage.setItem('pyxis.replayBoot', '1');
    } catch {
      // ignore — replay just runs at the normal pace
    }
    await runtime.restart();
  };

  return (
    <div className="bootlab">
      <div className="toolbar wrap">
        <button
          className="btn primary small"
          onClick={() => {
            setPos(0);
            setSelected(STAGES[0].id);
            setPlaying(true);
          }}
          disabled={playing}
        >
          <Icon.play size={13} /> Play boot
        </button>
        <button className="btn small" onClick={() => (setPos((p) => Math.max(0, p - 1)), setSelected(STAGES[Math.max(0, pos - 1)].id))} disabled={playing || pos === 0}>
          Back
        </button>
        <button className="btn small" onClick={() => (setPos((p) => Math.min(STAGES.length - 1, p + 1)), setSelected(STAGES[Math.min(STAGES.length - 1, pos + 1)].id))} disabled={playing || pos === STAGES.length - 1 || halted}>
          Step
        </button>
        <select className="select" value={fault ?? ''} onChange={(e) => (setFault(e.target.value || null), setPos(0), setPlaying(false))} aria-label="Failure scenario">
          <option value="">No failure</option>
          {STAGES.filter((s) => s.failure).map((s) => (
            <option key={s.id} value={s.id}>
              Fail: {s.failure!.label}
            </option>
          ))}
        </select>
        <span className="toolbar-spacer" />
        <Badge kind="SIMULATED" title="Educational model of the native boot path; no code runs on hardware" />
      </div>
      <div className="bootlab-body">
        <ol className="boot-path" aria-label="Native boot stages">
          {STAGES.map((s, i) => {
            const state = halted && i === faultIndex ? 'failed' : i < pos ? 'done' : i === pos ? 'current' : halted && i > faultIndex ? 'skipped' : '';
            return (
              <li key={s.id}>
                <button className={`boot-step ${state}${selected === s.id ? ' selected' : ''}`} onClick={() => setSelected(s.id)} aria-current={i === pos ? 'step' : undefined}>
                  <span className="mono small">{String(i + 1).padStart(2, '0')}</span>
                  <span>{s.title}</span>
                  {s.failure && <Icon.alert size={12} aria-label="Has failure scenario" />}
                </button>
              </li>
            );
          })}
        </ol>
        <section className="split-detail bootlab-detail" aria-live="polite">
          <h3>{sel.title}</h3>
          <dl className="kv">
            <dt>Component</dt>
            <dd className="mono">{sel.component}</dd>
            <dt>Source</dt>
            <dd className="mono">{sel.source}</dd>
            <dt>Responsibility</dt>
            <dd>{sel.responsibility}</dd>
          </dl>
          {sel.detail.length > 0 && (
            <ul className="plain-list">
              {sel.detail.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {sel.failure && (
            <div className={`banner small ${fault === sel.id && halted ? 'banner-err' : 'banner-warn'}`}>
              <strong>Failure scenario — {sel.failure.label}:</strong> {sel.failure.effect}
            </div>
          )}
          <h4 className="section-title">This browser build</h4>
          <p className="small muted">PyxisOS-Web does not execute these stages. Its own boot runs real initialisation steps in JavaScript:</p>
          <ul className="plain-list small">
            {webStages.map((s) => (
              <li key={s.id}>
                <span className="mono">{s.status === 'done' ? 'OK' : s.status.toUpperCase()}</span> {s.label}
                {s.simulated ? ' (simulated)' : ''} — {s.durationMs?.toFixed(1) ?? '–'} ms
              </li>
            ))}
          </ul>
          <button className="btn small" onClick={() => void replayRealBoot()}>
            <Icon.refresh size={13} /> Replay PyxisOS-Web boot
          </button>
          <p className="muted small">Source: obstinix/PyxisOS docs/architecture/boot-flow.md.</p>
        </section>
      </div>
    </div>
  );
}
