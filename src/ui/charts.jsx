// Small SVG charts for the dashboards. One series each, in the brand green
// (--viz-1, validated for contrast in both themes), with a hover tooltip and a table view.

import { useLayoutEffect, useRef, useState } from 'react';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// A rounded maximum and 3–4 gridlines below it.
function niceTicks(max) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}

// A chart card with a title and a switch between chart and table.
export function ChartCard({ title, subtitle, action, table, children, className = '' }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`dash-card chart-card ${className}`}>
      <header className="chart-card__head">
        <div>
          <h2 className="dash-card__title">{title}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <div className="chart-card__tools">
          {action}
          {table && (
            <button type="button" className="text-btn small" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
              {asTable ? 'Show chart' : 'Show table'}
            </button>
          )}
        </div>
      </header>
      {asTable ? <DataTable {...table} /> : children}
    </section>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="table-wrap chart-table">
      <table className="table">
        <thead>
          <tr>
            {columns.map(([label, , num]) => (
              <th key={label} scope="col" className={num ? 'num' : undefined}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map(([label, get, num]) => (
                <td key={label} className={num ? 'num' : undefined}>
                  {get(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PAD = { top: 12, right: 12, bottom: 26, left: 52 };

// Change over time: a line with a soft area under it, crosshair and tooltip on hover.
export function TrendChart({ points, value, format, xLabel, tipLabel, height = 240, label }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const n = points.length;
  const max = Math.max(0, ...points.map(value));
  const { top, ticks } = niceTicks(max);
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => PAD.top + ih - (v / top) * ih;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(value(p)).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1).toFixed(1)},${PAD.top + ih}L${x(0).toFixed(1)},${PAD.top + ih}Z`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - PAD.left) / iw) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  return (
    <div className="chart" ref={ref}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart__grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart__tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t, true)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            (i % every === 0 && n - 1 - i >= every / 2) || i === n - 1 ? (
              <text key={i} className="chart__tick" x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                {xLabel(p)}
              </text>
            ) : null
          )}
          <path className="chart__area" d={area} />
          <path className="chart__line" d={line} />
          {hover != null && (
            <g>
              <line className="chart__cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} />
              <circle className="chart__dot" cx={x(hover)} cy={y(value(points[hover]))} r="5" />
            </g>
          )}
          <rect x={PAD.left} y={PAD.top} width={iw} height={ih} fill="transparent" />
        </svg>
      )}
      {hover != null && (
        <Tip x={x(hover)} width={width}>
          <span className="chart-tip__label">{tipLabel(points[hover])}</span>
          <strong>{format(value(points[hover]))}</strong>
        </Tip>
      )}
    </div>
  );
}

// Amounts across categories: vertical bars with a tooltip on each.
export function BarChart({ data, value, format, xLabel, tipLabel, height = 220, label, highlight }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const n = data.length;
  const { top, ticks } = niceTicks(Math.max(0, ...data.map(value)));
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const slot = iw / Math.max(1, n);
  const bw = Math.max(4, Math.min(36, slot - 2));
  const y = (v) => PAD.top + ih - (v / top) * ih;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 44))));

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart__grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="chart__tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t, true)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const v = value(d);
            const h = Math.max(0, PAD.top + ih - y(v));
            const r = Math.min(4, bw / 2, h);
            const x0 = cx - bw / 2;
            const yb = PAD.top + ih;
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                {h > 0 && (
                  <path
                    className={`chart__bar ${highlight?.(d) ? 'is-peak' : ''} ${hover === i ? 'is-hover' : ''}`}
                    d={`M${x0},${yb}V${yb - h + r}Q${x0},${yb - h} ${x0 + r},${yb - h}H${x0 + bw - r}Q${x0 + bw},${yb - h} ${x0 + bw},${yb - h + r}V${yb}Z`}
                  />
                )}
                {(i % every === 0 || i === n - 1) && (
                  <text className="chart__tick" x={cx} y={height - 6} textAnchor="middle">
                    {xLabel(d)}
                  </text>
                )}
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={ih} fill="transparent" />
              </g>
            );
          })}
          <line className="chart__base" x1={PAD.left} x2={width - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} />
        </svg>
      )}
      {hover != null && (
        <Tip x={PAD.left + slot * hover + slot / 2} width={width}>
          <span className="chart-tip__label">{tipLabel(data[hover])}</span>
          <strong>{format(value(data[hover]))}</strong>
        </Tip>
      )}
    </div>
  );
}

// Ranked list with a bar behind each value. Names and values are plain text, so it reads without colour.
export function BarList({ rows, value, format, name, max }) {
  const top = max ?? Math.max(1, ...rows.map(value));
  return (
    <ol className="bar-list">
      {rows.map((r, i) => (
        <li key={i} className="bar-list__row">
          <span className="bar-list__name">{name(r)}</span>
          <span className="bar-list__track" aria-hidden="true">
            <span className="bar-list__fill" style={{ width: `${(value(r) / top) * 100}%` }} />
          </span>
          <span className="bar-list__value">{format(value(r))}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ x, width, children }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div className="chart-tip" style={{ left }} role="status">
      {children}
    </div>
  );
}

export function Sparkline({ points, value, width = 96, height = 28 }) {
  const n = points.length;
  const max = Math.max(1, ...points.map(value));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, n - 1)) * (width - 4) + 2).toFixed(1)},${(height - 3 - (value(p) / max) * (height - 6)).toFixed(1)}`).join('');
  return (
    <svg className="sparkline" width={width} height={height} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
