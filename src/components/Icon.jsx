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
