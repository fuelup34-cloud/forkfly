import { imageUrl } from '../images.js';

// A restaurant's initials on its brand colours, used wherever it needs a small picture.
// If the restaurant has a cover photo, a crop of that is used instead.
const SKIP = new Set(['&', 'and', 'the', 'of', 'a']);

export function initials(name = '') {
  const words = name.split(/\s+/).filter((w) => w && !SKIP.has(w.toLowerCase()));
  const letters = (words.length > 1 ? [words[0], words[1]] : [words[0] ?? '']).map((w) => [...w][0] ?? '');
  return letters.join('').toUpperCase();
}

export function brandGradient(colors) {
  return Array.isArray(colors) && colors.length === 2 ? `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` : undefined;
}

const PX = { sm: 32, md: 48, lg: 88 };

export default function Monogram({ name, colors, image, size = 'md', className = '' }) {
  if (image)
    return (
      <span className={`mono mono--${size} mono--photo ${className}`} aria-hidden="true">
        <img src={imageUrl(image, PX[size] ?? 48)} alt="" loading="lazy" decoding="async" />
      </span>
    );
  const bg = brandGradient(colors);
  return (
    <span className={`mono mono--${size} ${bg ? '' : 'mono--plain'} ${className}`} style={bg ? { background: bg } : undefined} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
