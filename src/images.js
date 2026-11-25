// Photos: picking the right size to show, and shrinking uploads before they leave the device.

// Unsplash photos can be resized on their side, so we ask for just what the screen needs.
export function imageUrl(src, width) {
  if (!src) return null;
  if (src.startsWith('https://images.unsplash.com/')) {
    const w = Math.round(width * Math.min(2, window.devicePixelRatio || 1));
    return `${src}?auto=format&fit=crop&w=${w}&q=70`;
  }
  return src;
}

// Shrinks a photo so its longest side is at most `maxSide` pixels, as a JPEG.
// A phone photo goes from ~5 MB to ~300 KB, which uploads fast even on a weak signal.
export async function shrinkPhoto(file, maxSide = 1600) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
    throw new Error('Please choose a photo (JPEG, PNG or WebP).');
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That photo couldn’t be opened. Try a JPEG or PNG.');
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('That photo couldn’t be prepared. Try another one.');
  return blob;
}

export async function uploadPhoto(file, maxSide) {
  const blob = await shrinkPhoto(file, maxSide);
  const res = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The photo didn’t upload. Please try again.');
  return data.url;
}
