// The Forkfly app icon with its wordmark, sized like Strawberry Pay's logo.
export default function Logo({ size = 20 }) {
  return (
    <span className="logo" style={{ fontSize: size }}>
      <img src="/favicon.svg" alt="" width={size * 1.2} height={size * 1.2} />
      <span>Forkfly</span>
    </span>
  );
}
