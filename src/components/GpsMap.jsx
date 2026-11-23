import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Street tiles are opt-in: loading them tells OpenStreetMap roughly which area you are looking at.
export default function GpsMap({ trail }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const [streets, setStreets] = useState(false);
  const last = trail.at(-1);

  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: false }).setView([0, 0], 2);
    L.control.zoom({ position: 'bottomleft' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);

  useEffect(() => {
    layer.current.clearLayers();
    if (!last) return;
    const here = [last.lat, last.lng];
    map.current.setView(here, Math.max(16, map.current.getZoom()), { animate: false });
    L.polyline(trail.map((p) => [p.lat, p.lng]), { color: '#059669', weight: 6 }).addTo(layer.current);
    if (last.accuracy) L.circle(here, { radius: last.accuracy, color: '#10b981', weight: 1 }).addTo(layer.current);
    L.circleMarker(here, { radius: 10, color: '#fff', weight: 3, fillColor: '#059669', fillOpacity: 1 }).addTo(layer.current);
  }, [last?.at]);

  useEffect(() => {
    if (!streets) return undefined;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    return () => tiles.remove();
  }, [streets]);

  return (
    <>
      <div ref={box} className="map gps-map" />
      {!last && <p className="gps-wait">Waiting for the courier to share their location…</p>}
      {last && !streets && (
        <button type="button" className="btn gps-streets" onClick={() => setStreets(true)} title="Shares the approximate area with OpenStreetMap">
          Show streets (uses OpenStreetMap)
        </button>
      )}
    </>
  );
}
