// Global attributes
const BASE_URL = "http://127.0.0.1:8000/geojson";
const DB_OPERATORS = {
    Carris: { color: '#003f8f', name: 'Carris' },
    CarrisMetropolitana: { color: '#ffdd01', name: 'Carris Met' },
    MetroLisboa: { color: "#EF5A34", name: "Metro" },
    MobiCascais: { color: "#31bcad", name: "MobiCascais" },
    MTS: { color: "#218FCE", name: "MTS" },
    TCB: { color: "#95CB4E", name: "TCB" },
    CP: { color: "#74B751", name: "CP" },
    Fertagus: { color: "#C74F4F", name: "Fertagus" },
    TTSL: { color: "#EC6724", name: "TTSL" },
};
const DB_HOURS = [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8];
const DB_DATES = {
    20250917: "Dias úteis",
    20250920: "Sábados",
    20250921: "Domingos"
}
const MAX_SERVICES_LINE = 15;
const MAX_SERVICES_PARISH = 270;

const MAP_DARK = 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png';
const MAP_LIGHT = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const MAP_INIT_ZOOM = 11;
const MAP_INIT_CENTER = [38.7169, -9.1399]; // Lisbon

let GRADIENT = ["#ffffe5", "#f7fcc4", "#e4f4ac", "#c7e89b", "#a2d88a", "#78c578", "#4eaf63", "#2f944e", "#15793f", "#036034", "#004529"]
// Append transparency 0.75
GRADIENT = GRADIENT.map(g => g + "BF")
// From https://observablehq.com/@d3/color-schemes
// ["#e8f6e3","#d3eecd","#b7e2b1","#97d494","#73c378","#4daf62","#2f984f","#157f3b","#036429","#00441b"];

// Run locally: $ python3 -m http.server
