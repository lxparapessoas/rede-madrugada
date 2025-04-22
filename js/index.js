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
            console.log(date, hour, operator, properties);
            layer.bindPopup(`
                        <h6>${DB_OPERATORS[operator]['name']}</h6>
                        <dl>
                            <dt>Linha(s)<dt>
                            <dd><b>${properties.route_short_name_unique}</b><dd>
                            <dt>Nr circulações<dt>
                            <dd><b>${Math.round(properties.services_sum)}</b></dd>
                        </dl>
                    `);
        }
    });
}

const getShapesLayerParishes = (date, hour) => {
    return new L.GeoJSON.AJAX(`${BASE_URL}/${date}/${String(hour).padStart(2, '0')}00.geojson`, {
        style: function (feature) {
            let properties = feature.properties;
            if (properties.services > maxFrequencyPa) maxFrequencyPa = properties.services;

            // Color
            let colorIndex = Math.min(Math.ceil(properties.services * GRADIENT.length / MAX_SERVICES_PARISH), GRADIENT.length - 1);
            return {
                color: '#FFFFFF',
                fillColor: properties.services === 0 ? 'rgb(0,0,0,0)' : GRADIENT[colorIndex],
                fill: true,
                fillOpacity: 1
            };
        },
        onEachFeature: function (feature, layer) {
            let properties = feature.properties;
            console.log(date, hour, "Freguesia", properties);
            let operators = properties.lines ? [...new Set(properties.lines.split(",").map(l => l.replace(/[0-9]/g, '').trim()))] : [];
            layer.bindPopup(`
                        <h6>${properties.Freguesia}</h6>
                        <dl>
                            <dt>Concelho<dt>
                            <dd><b>${properties.Concelho}</b><dd>
                            <dt>Nr circulações<dt>
                            <dd><b>${Math.round(properties.services)}</b></dd>
                            <dt>Operadores<dt>
                            <dd><b>${operators && operators.length>0 ? operators.join(', ') : "-"}</b></dd>
                        </dl>
                    `);
        },
    });
}

const getShapesLayerMunicipalities = () => {
    return new L.GeoJSON.AJAX(`${BASE_URL}/municipios.geojson`, {
        style: function () {
            return {
                color: '#363636',
                fill: false
            };
        },
    });
}



const formChange = (map, mapType, date, hourIndex, operators, detailedMode) => {
    console.log("form change", date, hourIndex, operators);
    let hour = DB_HOURS[hourIndex];

    hour_text = document.getElementById("hour-text");
    hour_text.innerHTML = String(hour).padStart(2, '0');

    if (map && date && hour !== undefined && operators) {
        if (detailedMode && mapType!==undefined && mapType!=="lines") {
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
            Object.keys(geojsonLayer).forEach(key => {if (key!=="MUN") geojsonLayer[key].remove()});

            geojsonLayer[date] = getShapesLayerParishes(date, hour);
            geojsonLayer[date].addTo(map);
            geojsonLayer[date].bringToBack();
            geojsonLayer[date].on('data:loaded', function() {
                geojsonLayer[date].bringToBack();
            }) 
            if (!geojsonLayer['MUN'] || !geojsonLayer['MUN']._map) {
                geojsonLayer['MUN'] = getShapesLayerMunicipalities(date, hour);
                geojsonLayer['MUN'].addTo(map);
                geojsonLayer['MUN'].bringToFront();
                geojsonLayer['MUN'].on('data:loaded', function() {
                    geojsonLayer[date + 'MUN'].bringToFront();
                }) 
            }
        }
    }
}

const toggleDetails = (btn_detail, detailed, mapType) => {
    let elements = document.getElementsByClassName("details");

    Array.from(elements).forEach(e => {
        if (detailed) {
            if (mapType==="lines" || e.id!=="operators") e.classList.remove("hidden");
        }
        else e.classList.add("hidden");
    })

    btn_detail.innerHTML = detailed ? "🔹Ver mapa" : "📑 Editar parâmetros";
    localStorage.setItem("detailed-mode", detailed);
}

const toggleColor = (map, btn_color, mode) => {
    L.tileLayer(mode === "dark" ? MAP_DARK : MAP_LIGHT).addTo(map);
    btn_color.innerHTML = mode === "dark" ? "☀️ Modo claro" : "🌑 Modo escuro";
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
    let DETAILED_MODE = localStorage.getItem("detailed-mode") ? localStorage.getItem("detailed-mode") === "true" : true;
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
    var map = L.map('map', { zoomControl: false }).setView([38.719604, -9.139209], 13);

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
                    <label htmlFor="${operator}"><input type="checkbox" value="${operator}" name="operator-checkbox" checked />${properties.name}</label>
                `
    })
    operator_fieldset.innerHTML = operators_form_html;
    const operator_checkbox = document.getElementsByName("operator-checkbox");

    let dates_form_html = "";
    Object.keys(DB_DATES).map((day, i) => {
        let label = DB_DATES[day];
        dates_form_html += `
                    <label htmlFor="${day}"><input type="radio" value="${day}" name="date-checkbox" ${DATE == day ? 'checked' : ''} />${label}</label>
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
        if (checkbox.value===MAP_TYPE) {checkbox.checked=true;}
        else {checkbox.checked=false;}

        checkbox.onchange = (e) => {
            console.log("map_checkbox", e.target.value)
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
    
    btn_play.onclick = () => {
        if (PLAY) {
            clearInterval(PLAY);
            PLAY = undefined;
            hour_slider.disabled=false;
            btn_play.innerHTML = "▶️";
        } else {
            btn_play.innerHTML = "⏹️";
            hour_slider.disabled=true;
            PLAY = setInterval(() => {
                HOUR = HOUR+1>=DB_HOURS.length ? 0 : HOUR+1;
                hour_slider.value = HOUR;
                formChange(map, MAP_TYPE, DATE, HOUR, OPERATORS, DETAILED_MODE);
            }, 3000)
        }
    }
    btn_play.innerHTML = "▶️";

    // Initialize form 
    formChange(map, MAP_TYPE, DATE, HOUR, OPERATORS, DETAILED_MODE);
    toggleDetails(btn_detail, DETAILED_MODE, MAP_TYPE);
}