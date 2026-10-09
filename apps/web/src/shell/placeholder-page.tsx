/** Empty page used until the milestone that builds the screen (docs/MILESTONES.md). */
export function PlaceholderPage({ title, milestone }: { title: string; milestone: string }) {
  return (
    <div className="flex flex-col gap-2 p-4 md:p-6">
      <h2 className="font-semibold text-xl">{title}</h2>
      <p className="text-muted-foreground text-sm">Not built yet — arrives in {milestone}.</p>
    </div>
  );
}
