// State
let geojsonLayer = {}; // Each operator will have one
let maxFrequencyOp = 0;
let maxFrequencyPa = 0;

const getShapesLayerOperator = (operator, date, hour) => {
    return new L.GeoJSON.AJAX(`${BASE_URL}/${date}/${operator}_${String(hour).padStart(2, '0')}00_shapes_aggregated.geojson`, {
        style: function (feature) {
            let properties = feature.properties;
            if (properties.services_sum > maxFrequencyOp) maxFrequencyOp = properties.services_sum;

            // Weight depending on 
            let weight = 0;
            weight = properties.services_sum === 0 ? 0 : (properties.services_sum / MAX_SERVICES_LINE) * 5; // Max weight of 5
            if (weight < 1.5 && properties.services_sum > 0) weight = 1.5;

            // Color
            let colorIndex = Math.min(Math.ceil(properties.services_sum * GRADIENT.length / MAX_SERVICES_LINE), GRADIENT.length - 1);
            // DB_OPERATORS[operator]['color']
            return { color: GRADIENT[colorIndex], weight: weight };
        },
        onEachFeature: function (feature, layer) {
            let properties = feature.properties;
            // console.log(date, hour, operator, properties);
            layer.bindPopup(`
                        <h6>${DB_OPERATORS[operator]['name']}</h6>
                        <dl>
                            <dt>Linhas<dt>
                            <dd><b>${properties.route_short_name_unique}</b><dd>
                            <dt>Circulações<dt>
                            <dd><b>${Math.round(properties.services_sum)}</b></dd>
                        </dl>
                    `);
        }
    });
}

const getShapesLayerParishesData = (layer, date, hour) => {
    // Load CSV data
    // console.log("CSV Request", `${BASE_URL}/${date}/${String(hour).padStart(2, '0')}00.csv`, layer);
    Papa.parse(`${BASE_URL}/${date}/${String(hour).padStart(2, '0')}00.csv`, {
        download: true, header: true,
        complete: results => {
            layer.setStyle(function (feature) {
                let properties = results.data.find(row => row['Dicofre'] === feature.properties.Dicofre);

                if (properties && properties.services > maxFrequencyPa) maxFrequencyPa = properties.services;

                // Color
                let colorIndex = !properties ? undefined : Math.min(Math.ceil(properties.services * GRADIENT.length / MAX_SERVICES_PARISH), GRADIENT.length - 1);

                return {
                    color: '#FFFFFF',
                    fillColor: (!properties || properties.services === 0) ? '#EDEDEDBF' : GRADIENT[colorIndex],
                    fill: true,
                    fillOpacity: 1
                };
            });

            layer.eachLayer(function (layer) {
                const feature = layer.feature;
                let properties = results.data.find(row => row['Dicofre'] === feature.properties.Dicofre);
                let operators = properties && properties.lines ? [...new Set(properties.lines.split(",").map(l => l.replace(/[0-9]/g, '').trim()))] : [];

                // Replace old tooltip (optional step)
                if (layer.getTooltip()) {
                    layer.unbindTooltip();
                }

                layer.bindPopup(`
                    <h6>${feature.properties.Freguesia}</h6>
                    <dl>
                        <dt>Concelho<dt>
                        <dd><b>${feature.properties.Concelho}</b><dd>
                        <dt>Circulações<dt>
                        <dd><b>${properties && properties.services ? Math.round(properties.services) : 0}</b></dd>
                        <dt>Serviços<dt>
                        <dd><b>${operators && operators.length > 0 ? operators.join(', ') : "-"}</b></dd>
                    </dl>
                `);
            })

            // TODO! tooltip

        }
    });
}

const getShapesLayerParishes = () => {
    return new L.GeoJSON.AJAX(`${BASE_URL}/freguesias_4326.geojson`, {
        style: function () {
            return {
                color: '#363636',
                weight: 1,
                fill: true,
                fillColor: '#FFFFFF',
            };
        },
    });
}


const getShapesLayerMunicipalities = () => {
    return new L.GeoJSON.AJAX(`${BASE_URL}/municipios_4326.geojson`, {
        style: function () {
            return {
                color: '#363636',
                weight: 1,
                fill: false
            };
        },
    });
}



const formChange = (map, mapType, date, hourIndex, operators, detailedMode) => {
    // console.log("form change", date, hourIndex, operators);
    let hour = DB_HOURS[hourIndex];

    hour_text = document.getElementById("hour-text");
    hour_text.innerHTML = String(hour).padStart(2, '0');

    if (map && date && hour !== undefined && operators) {
        if (detailedMode && mapType !== undefined && mapType !== "lines") {
            document.getElementById("operators").classList.add("hidden");
        } else if (detailedMode) {
            document.getElementById("operators").classList.remove("hidden");
        }

        if (mapType == "lines") {
            if (Array.isArray(operators)) {
                // Only remove other operators when a new list is provided
                // This allows to add a new operator individually, without removing the others
                Object.values(geojsonLayer).forEach(layer => layer.remove());
            } else {
                // Otherwise, just convert the single operator into a list for the next step to work :)
                operators = [operators];
            }

            operators.forEach(op => {
                geojsonLayer[op] = getShapesLayerOperator(op, date, hour);
                geojsonLayer[op].addTo(map);
            })
        } else {
            Object.keys(geojsonLayer).forEach(key => { if (key !== "MUN" && key !== "PAR") geojsonLayer[key].remove() });

            if (!geojsonLayer['MUN'] || !geojsonLayer['MUN']._map) {
                geojsonLayer['MUN'] = getShapesLayerMunicipalities();
                geojsonLayer['MUN'].addTo(map);
                geojsonLayer['MUN'].bringToFront();
                geojsonLayer['MUN'].on('data:loaded', function () {
                    geojsonLayer['MUN'].bringToFront();
                })
            }

            if (!geojsonLayer['PAR'] || !geojsonLayer['PAR']._map) {
                // If parishes not drawn yet, draw them
                geojsonLayer['PAR'] = getShapesLayerParishes();
                geojsonLayer['PAR'].addTo(map);
                geojsonLayer['PAR'].bringToFront();
                geojsonLayer['PAR'].on('data:loaded', function () {
                    // geojsonLayer['PAR'].bringToFront();
                    geojsonLayer['MUN'].bringToFront();
                    getShapesLayerParishesData(geojsonLayer['PAR'], date, hour);
                })
            } else {
                getShapesLayerParishesData(geojsonLayer['PAR'], date, hour);
            }
        }
    }
}

const toggleDetails = (btn_detail, detailed, mapType) => {
    let elements = document.getElementsByClassName("details");

    Array.from(elements).forEach(e => {
        if (detailed) {
            if (mapType === "lines" || e.id !== "operators") e.classList.remove("hidden");
        }
        else e.classList.add("hidden");
    })

    btn_detail.innerHTML = detailed ? "<i class='fa-solid fa-map'></i> Ver mapa" : "<i class='fa-solid fa-sliders'></i> Editar parâmetros";
    localStorage.setItem("detailed-mode", detailed);
}

const toggleColor = (map, btn_color, mode) => {
    L.tileLayer(mode === "dark" ? MAP_DARK : MAP_LIGHT).addTo(map);
    btn_color.innerHTML = mode === "dark" ? "<i class='fa-solid fa-circle-half-stroke'></i> Modo claro" : "<i class='fa-solid fa-circle-half-stroke'></i> Modo escuro";
    document.querySelector("#logo img").src = mode === "dark" ? "./static/logo-b.svg" : "./static/logo.svg";
    localStorage.setItem("color-mode", mode);
}


window.onload = function () {

    // Get URL params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('iframe') === null) document.getElementsByClassName("iframe")[0].classList.remove("iframe");

    // State
    let HOUR = 0;
    let OPERATORS = Object.keys(DB_OPERATORS);
    let DATE = urlParams.get('date') && Object.keys(DB_DATES).includes(urlParams.get('date')) ? urlParams.get('date') : Object.keys(DB_DATES)[0];
    let COLOR_MODE = localStorage.getItem("color-mode") ? localStorage.getItem("color-mode") : "dark";
    let DETAILED_MODE = localStorage.getItem("detailed-mode") ? localStorage.getItem("detailed-mode") === "true" : false;
    let MAP_TYPE = urlParams.get('map') ? urlParams.get('map') : "parishes"; // Options: parishes, lines
    let PLAY = undefined;

    // DOM elements
    const hour_slider = document.getElementById("hour-slider");
    const operator_fieldset = document.getElementById("operator-fieldset");
    const dates_fieldset = document.getElementById("dates-fieldset");
    const btn_color = document.getElementById("toggle-color");
    const btn_detail = document.getElementById("toggle-detail");
    const btn_play = document.getElementById("toggle-play");

    // Initialize map
    var map = L.map('map', { zoomControl: false }).setView(MAP_INIT_CENTER, MAP_INIT_ZOOM);

    toggleColor(map, btn_color, COLOR_MODE);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);


    // Addapt form to database
    hour_slider.min = 0;
    hour_slider.max = DB_HOURS.length - 1;
    hour_slider.value = 0;

    let operators_form_html = "";
    Object.keys(DB_OPERATORS).map(operator => {
        let properties = DB_OPERATORS[operator];
        operators_form_html += `
                <label htmlFor = "${operator}" > <input type="checkbox" value="${operator}" name="operator-checkbox" checked />${properties.name}</label >
                `
    })
    operator_fieldset.innerHTML = operators_form_html;
    const operator_checkbox = document.getElementsByName("operator-checkbox");

    let dates_form_html = "";
    Object.keys(DB_DATES).map((day, i) => {
        let label = DB_DATES[day];
        dates_form_html += `
                <label htmlFor = "${day}" > <input type="radio" value="${day}" name="date-checkbox" ${DATE == day ? 'checked' : ''} />${label}</label >
                `
    })
    dates_fieldset.innerHTML = dates_form_html;
    const date_checkbox = document.getElementsByName("date-checkbox");

    const map_checkbox = document.getElementsByName("map-checkbox");



    // Listeners 
    hour_slider.oninput = (e) => {
        formChange(undefined, undefined, undefined, e.target.value, undefined, undefined); // When user is just sliding, don't update map
    }
    hour_slider.onchange = (e) => {
        HOUR = e.target.value;
        formChange(map, MAP_TYPE, DATE, HOUR, OPERATORS, DETAILED_MODE);
    }

    operator_checkbox.forEach(checkbox => {
        checkbox.onchange = (e) => {
            let operator = e.target.value;
            if (e.target.checked) { // true, add to operators
                OPERATORS = [...new Set([...OPERATORS, operator])];
                formChange(map, MAP_TYPE, DATE, HOUR, operator, DETAILED_MODE);
            } else { // Remove
                OPERATORS = [...new Set(OPERATORS.filter(v => v !== operator))];
                if (geojsonLayer[operator]) geojsonLayer[operator].remove();
            }
        }
    })

    date_checkbox.forEach(checkbox => {
        checkbox.onchange = (e) => {
            if (e.target.checked) { // true, add to operators
                DATE = e.target.value;
                formChange(map, MAP_TYPE, DATE, HOUR, OPERATORS, DETAILED_MODE);
            }

        }
    })

    map_checkbox.forEach(checkbox => {
        // Initialize with map being displayed (can be changed through URL param)
        if (checkbox.value === MAP_TYPE) { checkbox.checked = true; }
        else { checkbox.checked = false; }

        checkbox.onchange = (e) => {
            if (e.target.checked) { // true, add to operators
                MAP_TYPE = e.target.value;
                formChange(map, MAP_TYPE, DATE, HOUR, OPERATORS, DETAILED_MODE);
            }
        }
    })

    btn_color.onclick = () => {
        COLOR_MODE = COLOR_MODE === "dark" ? "light" : "dark";
        toggleColor(map, btn_color, COLOR_MODE);
    }

    btn_detail.onclick = () => {
        DETAILED_MODE = !DETAILED_MODE;
        localStorage.setItem("detailed-mode", DETAILED_MODE);
        toggleDetails(btn_detail, DETAILED_MODE, MAP_TYPE);
    }

    const tick = () => {
        HOUR = HOUR + 1 >= DB_HOURS.length ? 0 : HOUR + 1;
        hour_slider.value = HOUR;
        formChange(map, MAP_TYPE, DATE, HOUR, OPERATORS, DETAILED_MODE);
    }
    btn_play.onclick = () => {
        if (PLAY) {
            clearInterval(PLAY);
            PLAY = undefined;
            hour_slider.disabled = false;
            btn_play.innerHTML = "<i class='fa-solid fa-play'></i>";
        } else {
            btn_play.innerHTML = "<i class='fa-solid fa-pause'></i>";
            hour_slider.disabled = true;
            tick();
            PLAY = setInterval(() => {
                tick();
            }, MAP_TYPE == "parishes" ? 1500 : 3000)
        }
    }
    btn_play.innerHTML = "<i class='fa-solid fa-play'></i>";
    // If play url param, trigger click on btn_play
    if (urlParams.get('play') !== null) {
        btn_play.click();
    }

    // Initialize form 
    formChange(map, MAP_TYPE, DATE, HOUR, OPERATORS, DETAILED_MODE);
    toggleDetails(btn_detail, DETAILED_MODE, MAP_TYPE);
}