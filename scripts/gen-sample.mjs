// Sinh dữ liệu GeoJSON mẫu quanh huyện Phong Điền (Thừa Thiên Huế) để chạy demo
// mà không cần .gdb thật. Mỗi lớp là một FeatureCollection -> data/sample/<layer>.geojson
// và một bản GeoJSONSeq -> data/geojson/<layer>.geojsonl (để thử pipeline tippecanoe).
import { mkdirSync, writeFileSync } from 'node:fs';

const SAMPLE_DIR = 'data/sample';
const SEQ_DIR = 'data/geojson';
mkdirSync(SAMPLE_DIR, { recursive: true });
mkdirSync(SEQ_DIR, { recursive: true });

// Khung tọa độ gần đúng huyện Phong Điền.
const W = 107.15, E = 107.62, S = 16.42, N = 16.72;

const fc = (features) => ({ type: 'FeatureCollection', features });
const feat = (geometry, properties = {}) => ({ type: 'Feature', geometry, properties });

// --- Ranh giới (polygon) tỉnh/huyện/xã ---
const districtRing = [
  [W + 0.02, S + 0.02], [E - 0.02, S + 0.03], [E - 0.03, N - 0.02],
  [W + 0.03, N - 0.03], [W + 0.02, S + 0.02]
];
const communePolys = [];
const cols = 2, rows = 2;
const names = ['Phong Điền', 'Điền Hương', 'Điền Môn', 'Phong Bình'];
let idx = 0;
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const x0 = W + 0.05 + c * ((E - W - 0.1) / cols);
    const x1 = x0 + (E - W - 0.1) / cols - 0.01;
    const y0 = S + 0.05 + r * ((N - S - 0.1) / rows);
    const y1 = y0 + (N - S - 0.1) / rows - 0.01;
    communePolys.push(
      feat(
        { type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
        { name: names[idx % names.length], cap: 'xa' }
      )
    );
    idx++;
  }
}
const diagioi = fc([
  feat({ type: 'Polygon', coordinates: [districtRing] }, { name: 'Huyện Phong Điền', cap: 'huyen' }),
  ...communePolys
]);

// --- Sông/hồ (polygon nước) ---
const thuyhe = fc([
  feat(
    {
      type: 'Polygon',
      coordinates: [[
        [W + 0.10, S + 0.20], [W + 0.30, S + 0.22], [W + 0.32, S + 0.26],
        [W + 0.12, S + 0.25], [W + 0.10, S + 0.20]
      ]]
    },
    { name: 'Sông Ô Lâu', loai: 'song' }
  )
]);

// --- Giao thông (line) ---
const giaothong = fc([
  feat(
    { type: 'LineString', coordinates: [[W + 0.05, S + 0.10], [E - 0.05, N - 0.10]] },
    { name: 'QL1A', so: '1', loai: 'quoclo' }
  ),
  feat(
    { type: 'LineString', coordinates: [[W + 0.05, N - 0.08], [E - 0.05, S + 0.12]] },
    { name: 'ĐT4', so: '4', loai: 'tinhlo' }
  )
]);

// --- Đường sắt (line) ---
const duongsat = fc([
  feat(
    { type: 'LineString', coordinates: [[W + 0.06, S + 0.30], [E - 0.06, S + 0.34]] },
    { name: 'Đường sắt Bắc - Nam' }
  )
]);

// --- Điểm mộ liệt sĩ (point) với trạng thái quy tập ---
const rnd = (a, b) => a + Math.random() * (b - a);
const graveFeatures = [];
const statuses = ['moi', 'giadinh', 'nghiatrang', 'xong', 'tieptuc', 'chua', 'chuaketqua', 'khongro'];
for (let i = 0; i < 40; i++) {
  graveFeatures.push(
    feat(
      { type: 'Point', coordinates: [rnd(W + 0.05, E - 0.05), rnd(S + 0.05, N - 0.05)] },
      { id: i + 1, trangthai: statuses[i % statuses.length] }
    )
  );
}
const mols = fc(graveFeatures);

// --- Điểm dân cư / trụ sở (point) ---
const diemdc = fc([
  feat({ type: 'Point', coordinates: [(W + E) / 2, (S + N) / 2] }, { name: 'TT Phong Điền', loai: 'ubnd_huyen' }),
  feat({ type: 'Point', coordinates: [W + 0.15, N - 0.12] }, { name: 'UBND xã Điền Hương', loai: 'ubnd_xa' }),
  feat({ type: 'Point', coordinates: [E - 0.15, S + 0.14] }, { name: 'BCH Quân sự huyện', loai: 'qs_huyen' })
]);

const layers = { diagioi, thuyhe, giaothong, duongsat, mols, diemdc };

for (const [name, collection] of Object.entries(layers)) {
  writeFileSync(`${SAMPLE_DIR}/${name}.geojson`, JSON.stringify(collection));
  // GeoJSONSeq: mỗi feature trên một dòng.
  const seq = collection.features.map((f) => JSON.stringify(f)).join('\n') + '\n';
  writeFileSync(`${SEQ_DIR}/${name}.geojsonl`, seq);
  console.log(`  + ${name}: ${collection.features.length} features`);
}

console.log('==> Đã sinh dữ liệu mẫu vào data/sample/*.geojson và data/geojson/*.geojsonl');
