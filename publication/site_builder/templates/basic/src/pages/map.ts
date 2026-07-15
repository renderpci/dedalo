/**
 * Example page: a Leaflet map. Demonstrates pulling records and plotting any that carry
 * coordinates. Which columns hold lat/lng depends on the ontology — adjust LAT_KEYS /
 * LNG_KEYS (or ask the agent to) for your data. Replace freely.
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { listRecords } from '../lib/dedalo';

const LAT_KEYS = ['lat', 'latitude', 'geo_lat'];
const LNG_KEYS = ['lng', 'lon', 'longitude', 'geo_lng'];

function pick(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

export async function renderMap(root: HTMLElement, db: string, table: string): Promise<void> {
  const container = document.createElement('div');
  container.style.height = '70vh';
  root.replaceChildren(container);

  const map = L.map(container).setView([40, -3], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  const result = await listRecords(db, table, { limit: 200 });
  const points: L.LatLng[] = [];
  for (const row of result.data as Record<string, unknown>[]) {
    const lat = pick(row, LAT_KEYS);
    const lng = pick(row, LNG_KEYS);
    if (lat === null || lng === null) continue;
    const marker = L.marker([lat, lng]).addTo(map);
    const label = row.title ?? row.name ?? '';
    if (label) marker.bindPopup(String(label));
    points.push(L.latLng(lat, lng));
  }
  if (points.length > 0) map.fitBounds(L.latLngBounds(points).pad(0.2));
}
