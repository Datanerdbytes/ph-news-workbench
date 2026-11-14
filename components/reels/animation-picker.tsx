'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  LOOP_GAP_SECONDS,
  PRESET_CATEGORIES,
  REEL_PRESETS,
  SLOT_ORDER,
  getPreset,
  type PresetSlot,
  type PresetValues,
  type ReelPreset,
} from '@/lib/reels/presets';
import { mountPreset } from '@/lib/reels/presets.preview';
import { FieldLabel, inputClass } from '@/components/publishing/publish-page';
import { cn } from 'cn';

const THUMB_W = 118;

/** Per-slot selection: which animation (if any) each slot has attached. */
export type SlotSelection = Record<PresetSlot, string | null>;

/** Per-slot loop toggles: repeat the attached animation through the reel. */
export type SlotLoops = Record<PresetSlot, boolean>;

const SLOT_META: { key: PresetSlot; label: string; empty: string }[] = [
  { key: 'start', label: 'Start', empty: 'Pick an animation that opens the reel.' },
  { key: 'middle', label: 'Middle', empty: 'Pick an animation for mid-reel.' },
  { key: 'end', label: 'End', empty: 'Pick an animation that closes the reel.' },
];

/**
 * Looping GSAP preview of one preset, rendered into a 270×480 design-space
 * stage scaled down to thumb size — the same motion the baked reel will have.
 */
function PresetThumb({
  presetId,
  values,
  width,
}: {
  presetId: string;
  values: PresetValues;
  width: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scale = width / 270;
    const stage = document.createElement('div');
    stage.style.cssText =
      'position:absolute;top:0;left:0;width:270px;height:480px;transform-origin:0 0;';
    el.appendChild(stage);
    const timeline = mountPreset(stage, presetId, values);
    stage.style.transform = `scale(${scale})`;
    return () => {
      timeline?.kill();
      stage.remove();
    };
  }, [presetId, values, width]);

  return (
    <div
      ref={ref}
      style={{ width, height: (width * 480) / 270 }}
      className="relative overflow-hidden rounded-md bg-ink"
      aria-hidden
    />
  );
}

/** Editor block for one attached slot: fields, loop toggle, remove. */
function SlotEditor({
  slot,
  preset,
  loop,
  values,
  onLoopChange,
  onFieldChange,
  onRemove,
}: {
  slot: PresetSlot;
  preset: ReelPreset;
  loop: boolean;
  values: PresetValues;
  onLoopChange: (loop: boolean) => void;
  onFieldChange: (key: string, text: string) => void;
  onRemove: () => void;
}) {
  const loops = loop && slot !== 'end';
  return (
    <div className="grid gap-2.5 rounded-lg border border-dashed border-border bg-background/60 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-ink px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-paper">
          {slot}
        </span>
        <Sparkles className="size-3.5 text-brand" aria-hidden />
        <span className="truncate text-[11.5px] font-semibold">{preset.name}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {slot !== 'end' && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[10.5px] font-semibold text-muted-foreground">
              <input
                type="checkbox"
                checked={loop}
                onChange={(event) => onLoopChange(event.target.checked)}
                className="size-4 accent-[var(--brand)]"
              />
              Loop
            </label>
          )}
          <button
            type="button"
            aria-label={`Remove ${preset.name} from the ${slot} slot`}
            onClick={onRemove}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
      {preset.fields.map((field) => (
        <div key={field.key}>
          {/* Slot-scoped ids: the same preset can occupy two slots (e.g. Logo
              Sting at start and end) and the ids must not collide. */}
          <FieldLabel htmlFor={`preset-${slot}-${preset.id}-${field.key}`}>
            {field.label}
          </FieldLabel>
          <input
            id={`preset-${slot}-${preset.id}-${field.key}`}
            type="text"
            value={values[field.key] ?? field.value}
            onChange={(event) => onFieldChange(field.key, event.target.value)}
            className={cn(inputClass, 'mt-1')}
          />
        </div>
      ))}
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {slot === 'end'
          ? `Plays ${preset.window.toLowerCase()}.`
          : loops
            ? `Repeats about every ${(preset.duration + LOOP_GAP_SECONDS).toFixed(1)}s through the rest of the reel.`
            : 'Plays once.'}
      </p>
    </div>
  );
}

/**
 * Gallery of pre-built GSAP animations, organized by reel slot: pick a slot
 * (start / middle / end), tap a card to attach it there, loop it through the
 * reel if wanted. Animations are baked into the video on post — several slots
 * can be attached at once, e.g. a headline up front plus an end card.
 */
export function AnimationPicker({
  slots,
  loops,
  values,
  onSelect,
  onLoopChange,
  onFieldChange,
}: {
  slots: SlotSelection;
  loops: SlotLoops;
  values: Record<string, PresetValues>;
  onSelect: (slot: PresetSlot, presetId: string | null) => void;
  onLoopChange: (slot: PresetSlot, loop: boolean) => void;
  onFieldChange: (presetId: string, key: string, text: string) => void;
}) {
  const [filter, setFilter] = useState<string>('All');
  const [activeSlot, setActiveSlot] = useState<PresetSlot>('start');

  const visible = REEL_PRESETS.filter(
    (preset) =>
      preset.id === 'none' ||
      (preset.slots.includes(activeSlot) &&
        (filter === 'All' || preset.category === filter))
  );

  return (
    <div>
      <FieldLabel hint="Baked in when you post">Animations</FieldLabel>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {SLOT_META.map(({ key, label }) => {
          const active = activeSlot === key;
          const filled = Boolean(slots[key]);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveSlot(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer',
                active
                  ? 'border-ink bg-ink text-paper'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'size-1.5 rounded-full',
                  filled
                    ? 'bg-brand'
                    : active
                      ? 'bg-paper/50'
                      : 'bg-muted-foreground/40'
                )}
              />
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESET_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-colors cursor-pointer',
              filter === category
                ? 'border-ink bg-ink text-paper'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
        {visible.map((preset) => {
          const selected = slots[activeSlot] === preset.id;
          const assignedSlot = SLOT_ORDER.find((slot) => slots[slot] === preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onSelect(
                  activeSlot,
                  preset.id === 'none' || selected ? null : preset.id
                )
              }
              className={cn(
                'relative w-[132px] shrink-0 rounded-[10px] border bg-card p-1.5 text-left transition-colors cursor-pointer',
                selected
                  ? 'border-ink ring-2 ring-ink/15'
                  : 'border-border hover:border-muted-foreground/40'
              )}
            >
              <PresetThumb
                presetId={preset.id}
                values={values[preset.id] ?? {}}
                width={THUMB_W}
              />
              {assignedSlot && (
                <span className="absolute right-2 top-2 rounded-full bg-ink px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-paper">
                  {assignedSlot}
                </span>
              )}
              <span className="mt-1.5 block truncate text-[11px] font-semibold leading-tight">
                {preset.name}
              </span>
              <span className="block truncate text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {preset.id === 'none' ? 'Clear slot' : preset.category}
              </span>
            </button>
          );
        })}
      </div>

      {!slots[activeSlot] && (
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          {SLOT_META.find((meta) => meta.key === activeSlot)?.empty}
        </p>
      )}

      <div className="mt-2 grid gap-2">
        {SLOT_ORDER.map((slot) => {
          const preset = getPreset(slots[slot]);
          if (!preset || preset.id === 'none') return null;
          return (
            <SlotEditor
              key={slot}
              slot={slot}
              preset={preset}
              loop={loops[slot]}
              values={values[preset.id] ?? {}}
              onLoopChange={(loop) => onLoopChange(slot, loop)}
              onFieldChange={(key, text) => onFieldChange(preset.id, key, text)}
              onRemove={() => onSelect(slot, null)}
            />
          );
        })}
      </div>
    </div>
  );
}
