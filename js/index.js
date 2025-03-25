// State
let geojsonLayer = {}; // Each operator will have one
let maxFrequency = 0;

const getShapesLayer = (operator, date, hour) => {
    return new L.GeoJSON.AJAX(`${BASE_URL}/${date}/${operator}_${String(hour).padStart(2, '0')}00_shapes.geojson`, {
        style: function (feature) {
            let properties = feature.properties;
            if (properties.services > maxFrequency) maxFrequency = properties.services;
            let weight = properties.services === 0 ? 0 : (properties.services / 16) * 5; // Max weight of 5
            return { color: DB_OPERATORS[operator]['color'], weight: weight };
        },
        onEachFeature: function (feature, layer) {
            let properties = feature.properties;
            layer.bindPopup(`
                        <h6>${DB_OPERATORS[operator]['name']}</h6>
                        <dl>
                            <dt>Linha<dt>
                            <dd><b>${properties.route_short_name}</b>, ${properties.route_long_name}<dd>
                            <dt>Nr circulações<dt>
                            <dd><b>${Math.ceil(properties.services)}</b></dd>
                            <dt>Intervalo médio<dt>
                            <dd><b>${Math.ceil(properties.mean_headways / 60)} minutos</b></dd>
                        </dl>
                    `);
        }
    });
}

const formChange = (map, date, hour, operators) => {
    console.log("form change", date, hour, operators);

    hour_text = document.getElementById("hour-text");
    hour_text.innerHTML = String(hour).padStart(2, '0');

    if (map && date && hour !== undefined && operators) {
        if (Array.isArray(operators)) {
            // Only remove other operators when a new list is provided
            // This allows to add a new operator individually, without removing the others
            Object.values(geojsonLayer).forEach(layer => layer.remove());
        } else {
            // Otherwise, just convert the single operator into a list for the next step to work :)
            operators = [operators];
        }

        operators.forEach(op => {
            geojsonLayer[op] = getShapesLayer(op, date, hour);
            geojsonLayer[op].addTo(map);
        })
    }
}

const toggleDetails = (btn_detail, detailed) => {
    let elements = document.getElementsByClassName("details");

    Array.from(elements).forEach(e => {
        if (detailed) e.classList.remove("hidden");
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
    if (urlParams.get('iframe')===null) document.getElementsByClassName("iframe")[0].classList.remove("iframe");

    // State
    let HOUR = Math.min(...DB_HOURS);
    let OPERATORS = Object.keys(DB_OPERATORS);
    let DATE = urlParams.get('date') && Object.keys(DB_DATES).includes(urlParams.get('date')) ? urlParams.get('date') : Object.keys(DB_DATES)[0];
    let COLOR_MODE = localStorage.getItem("color-mode") ? localStorage.getItem("color-mode") : "dark";
    let DETAILED_MODE = localStorage.getItem("detailed-mode") ? localStorage.getItem("detailed-mode") === "true" : true;

    // DOM elements
    const hour_slider = document.getElementById("hour-slider");
    const operator_fieldset = document.getElementById("operator-fieldset");
    const dates_fieldset = document.getElementById("dates-fieldset");
    const btn_color = document.getElementById("toggle-color");
    const btn_detail = document.getElementById("toggle-detail");

    // Initialize map
    var map = L.map('map', { zoomControl: false }).setView([38.719604, -9.139209], 13);

    toggleColor(map, btn_color, COLOR_MODE);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);


    // Addapt form to database
    hour_slider.max = Math.max(...DB_HOURS);
    hour_slider.min = Math.min(...DB_HOURS);
    hour_slider.value = Math.min(...DB_HOURS);

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
                    <label htmlFor="${day}"><input type="radio" value="${day}" name="date-checkbox" ${i === 0 ? 'checked' : ''} />${label}</label>
                `
    })
    dates_fieldset.innerHTML = dates_form_html;
    const date_checkbox = document.getElementsByName("date-checkbox");

    // Listeners 
    hour_slider.oninput = (e) => {
        formChange(undefined, undefined, e.target.value, undefined); // When user is just sliding, don't update map
    }
    hour_slider.onchange = (e) => {
        HOUR = e.target.value;
        formChange(map, DATE, HOUR, OPERATORS);
    }

    operator_checkbox.forEach(checkbox => {
        checkbox.onchange = (e) => {
            let operator = e.target.value;
            if (e.target.checked) { // true, add to operators
                OPERATORS = [...new Set([...OPERATORS, operator])];
                formChange(map, DATE, HOUR, operator);
            } else { // Remove
                OPERATORS = [...new Set(OPERATORS.filter(v => v !== operator))];
                if (geojsonLayer[operator]) geojsonLayer[operator].remove();
            }
        }
    })

    date_checkbox.forEach(checkbox => {
        checkbox.onchange = (e) => {
            console.log("date_checkbox", e.target.value)
            if (e.target.checked) { // true, add to operators
                DATE = e.target.value;
                formChange(map, DATE, HOUR, OPERATORS);
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
        toggleDetails(btn_detail, DETAILED_MODE);
    }

    // Initialize form 
    formChange(map, DATE, HOUR, OPERATORS);
    toggleDetails(btn_detail, DETAILED_MODE);
}