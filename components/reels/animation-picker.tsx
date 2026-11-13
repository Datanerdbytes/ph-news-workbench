'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  PRESET_CATEGORIES,
  REEL_PRESETS,
  getPreset,
  type PresetValues,
  type ReelPreset,
} from '@/lib/reels/presets';
import { mountPreset } from '@/lib/reels/presets.preview';
import { FieldLabel, inputClass } from '@/components/publishing/publish-page';
import { cn } from 'cn';

const THUMB_W = 118;

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

/**
 * Gallery strip of pre-built GSAP animations: tap a card to apply it to the
 * reel, edit its text below. The animation is baked into the video on post.
 */
export function AnimationPicker({
  value,
  values,
  onSelect,
  onFieldChange,
}: {
  value: string | null;
  values: Record<string, PresetValues>;
  onSelect: (id: string) => void;
  onFieldChange: (presetId: string, key: string, text: string) => void;
}) {
  const [filter, setFilter] = useState<string>('All');
  const active: ReelPreset | null = value === null ? null : getPreset(value);

  const visible = REEL_PRESETS.filter(
    (preset) =>
      preset.id === 'none' || filter === 'All' || preset.category === filter
  );

  return (
    <div>
      <FieldLabel hint="Baked in when you post">Animations</FieldLabel>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
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
          const selected = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(preset.id)}
              className={cn(
                'w-[132px] shrink-0 rounded-[10px] border bg-card p-1.5 text-left transition-colors cursor-pointer',
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
              <span className="mt-1.5 block truncate text-[11px] font-semibold leading-tight">
                {preset.name}
              </span>
              <span className="block truncate text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {preset.id === 'none' ? 'Start here' : preset.category}
              </span>
            </button>
          );
        })}
      </div>

      {active && active.fields.length > 0 && (
        <div className="grid gap-2.5 rounded-lg border border-dashed border-border bg-background/60 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-brand" aria-hidden />
            <span className="text-[11.5px] font-semibold">{active.name}</span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {active.window}
            </span>
          </div>
          {active.fields.map((field) => (
            <div key={field.key}>
              <FieldLabel htmlFor={`preset-${active.id}-${field.key}`}>
                {field.label}
              </FieldLabel>
              <input
                id={`preset-${active.id}-${field.key}`}
                type="text"
                value={values[active.id]?.[field.key] ?? field.value}
                onChange={(event) =>
                  onFieldChange(active.id, field.key, event.target.value)
                }
                className={cn(inputClass, 'mt-1')}
              />
            </div>
          ))}
        </div>
      )}
      {active && active.fields.length === 0 && active.id !== 'none' && (
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          “{active.name}” plays {active.window.toLowerCase()} — no text needed.
        </p>
      )}
    </div>
  );
}
