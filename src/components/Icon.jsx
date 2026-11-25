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
