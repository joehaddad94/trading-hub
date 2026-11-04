/**
 * One look for every control on the chart (audit 4 Nov 2026, option A). Joe could not tell buttons from text: the
 * chart used grey "ghost" buttons whose only cue was a hover fill, which phones never show.
 *
 * - `control`: anything you press has a resting border and fill.
 * - Toggles add `aria-pressed`; pressed turns accent (border, tint, text), not a faint grey.
 * - `fieldLabel`: a word that names a group is small uppercase text with no box, so it never reads as a button.
 */
export const control =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-md border border-input bg-muted px-2 text-foreground text-sm transition-colors hover:border-muted-foreground/70 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1 disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-primary/15 aria-pressed:font-semibold aria-pressed:text-primary aria-expanded:border-primary';

/** The same control a size down, for rows inside the trade list and the order pill. */
export const controlSm = `${control} h-8 px-2 text-xs`;

/** The one primary action in a group (Start replay). */
export const controlPrimary = 'border-primary bg-primary text-primary-foreground hover:border-primary hover:opacity-90';

/** A native select drawn like a control. */
export const selectControl =
  'h-9 rounded-md border border-input bg-muted px-1 text-foreground text-sm hover:border-muted-foreground/70';

/** Names a group of controls; never pressable. */
export const fieldLabel = 'shrink-0 px-0.5 font-medium text-[10.5px] text-muted-foreground uppercase tracking-wider';
