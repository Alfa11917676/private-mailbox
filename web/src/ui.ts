// Small presentational helpers shared across components.

/** Stable hue from a string, for colorful sender avatars. */
function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) % 360;
  return h;
}

export function avatarStyle(seed: string): { background: string } {
  // Muted, low-saturation tone — distinct per sender but not loud.
  const hue = hashHue(seed || "?");
  return { background: `hsl(${hue} 18% 38%)` };
}

/** First letter of a display name / address, for the avatar. */
export function initial(text: string): string {
  const match = text.match(/[a-zA-Z0-9]/);
  return (match?.[0] ?? "?").toUpperCase();
}
