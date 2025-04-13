// Global attributes
const BASE_URL = "https://lisboaparapessoas.github.io/rede-madrugada/geojson";
const DB_OPERATORS = {
    Carris: { color: '#003f8f', name: 'Carris Municipal' },
    CarrisMetropolitana: { color: '#ffdd01', name: 'Carris Metropolitana' },
    MetroLisboa: { color: "#EF5A34", name: "Metro Lisboa" },
    MobiCascais: { color: "#31bcad", name: "MobiCascais" },
    MTS: { color: "#218FCE", name: "Metro Sul" },
    TCB: { color: "#95CB4E", name: "TCBarreiro" },
    CP: { color: "#74B751", name: "CP" },
    Fertagus: { color: "#C74F4F", name: "Fertagus" },
    TTSL: { color: "#EC6724", name: "TTSL" },
};
const DB_HOURS = [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8];
const DB_DATES = {
    20250402: "Dias úteis",
    20250405: "Sábados",
}
const MAX_SERVICES_LINE = 15;

const MAP_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const MAP_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

const GRADIENT = ["#ffffe5","#f7fcc4","#e4f4ac","#c7e89b","#a2d88a","#78c578","#4eaf63","#2f944e","#15793f","#036034","#004529"]
// From https://observablehq.com/@d3/color-schemes
// ["#e8f6e3","#d3eecd","#b7e2b1","#97d494","#73c378","#4daf62","#2f984f","#157f3b","#036429","#00441b"];
