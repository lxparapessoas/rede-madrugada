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
const DB_HOURS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const DB_DATES = {
    20250326: "Dias úteis (Maio)",
    // 20250329: "Sábados (Maio)",
    // 20250401: "Dias úteis (Abril)",
}

const MAP_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const MAP_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';