// Simple line icons, drawn on a 24 × 24 grid. They take the surrounding text colour.
export const ICON_PATHS = {
  compass: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9z'],
  receipt: ['M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.2z', 'M9 8h6', 'M9 12h6', 'M9 16h3'],
  bag: ['M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z', 'M9 8V7a3 3 0 0 1 6 0v1'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-4-4'],
  user: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21a8 8 0 0 1 16 0'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  home: ['M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z'],
  store: ['M4 9 5.5 4h13L20 9', 'M4 9h16v11H4z', 'M10 20v-6h4v6'],
  bike: ['M6 13.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M18 13.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M6 17l4-7h5l3 7', 'M10 10 8.5 7H6', 'M14 7h2l-1 3'],
  plate: ['M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  chart: ['M4 20h16', 'M7 16v-5', 'M12 16V7', 'M17 16v-8'],
  users: ['M9 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.3a3.5 3.5 0 0 1 0 6.4', 'M18 14.2a6.5 6.5 0 0 1 3.5 5.8'],
  gear: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1'],
  shield: ['M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z', 'm9 12 2 2 4-4'],
  alert: ['M12 3 2.5 20h19z', 'M12 10v4', 'M12 17h.01'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  'eye-off': ['M3 3l18 18', 'M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.9', 'M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  star: ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'],
  // Food line drawings, used as decoration on the sign-in page.
  pizza: ['M4 6c5-2.7 11-2.7 16 0L12 21z', 'M5.6 9c4-1.8 8.8-1.8 12.8 0', 'M10 12.5h.01', 'M13.5 14.5h.01', 'M12.5 11h.01'],
  bowl: ['M3 12h18a9 9 0 0 1-18 0z', 'M8 8.5c0-1.5 1-2 1-3.5', 'M12 8.5c0-1.5 1-2 1-3.5', 'M16 8.5c0-1.5 1-2 1-3.5'],
  cup: ['M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z', 'M16 10h1.5a2.5 2.5 0 0 1 0 5H16', 'M8.5 3.5v2', 'M12.5 3.5v2'],
  burger: ['M4 11c0-4 3.6-6 8-6s8 2 8 6z', 'M3 14.5h18', 'M4.5 18h15a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18z'],
  taco: ['M3 17a9 9 0 0 1 18 0z', 'M7 13c1-1 2 0 3-1s2 0 3-1 2 0 3-1'],
  leaf: ['M5 19C5 10 11 5 19 5c0 8-5 14-14 14z', 'M5 19l8-8'],
  chili: ['M17 6c-1 0-2 1-2 2 0 5-4 9.5-11 11.5 8 2 15-3 15-10 0-2-1-3.5-2-3.5z', 'M17 6c0-1.2.8-2.2 2-2.5'],
};

export default function Icon({ name, size = 24, strokeWidth = 1.75, className, title }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
