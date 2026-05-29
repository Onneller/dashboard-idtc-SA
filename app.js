let DATOS_GLOBALES = [];
let ANIO_FILTRADO = 'todos';

function obtenerDatos() {
    const script = document.createElement('script');
    script.src = CONFIG.GOOGLE_SCRIPT_URL + '?callback=procesarDatos';
    document.body.appendChild(script);
}

function procesarDatos(datos) {
    if (!datos || datos.length === 0) {
        console.error("No se recibieron datos de la API");
        return;
    }
    DATOS_GLOBALES = datos;
    renderizarDashboard();
}

function renderizarDashboard() {
    // 1. FILTRADO INTELIGENTE: SEPARACIÓN DE REGISTROS VS MÓDULOS MENSUALES REALES
    let datosLimpios = DATOS_GLOBALES.filter(item => {
        if (!item || !item.TIMESTAMP) return false;

        // Validar y parsear la fecha de forma segura
        const f = new Date(item.TIMESTAMP);
        if (isNaN(f)) return false;

        const anioRegistro = f.getFullYear();
        const mesIdx = f.getMonth(); 

        // Rango de vigencia dinámico: Permitimos 2025 (Nov-Dic) y cualquier mes/año hacia adelante (2026, 2027, etc.)
        if (anioRegistro === 2025 && mesIdx < 10) {
            return false; // Descarta meses anteriores a Noviembre de 2025
        }

        // --- LEY DE CONTROL DE LOGS EXCLUSIVA ---
        // Extraemos las cadenas de control típicas de tu Sheet
        const consecutivo = String(item.CONSECUTIVO_INTERNO || "").trim();
        const email = String(item.USUARIO_EMAIL || "").trim();

        // REGLA DE ORO AUTOMÁTICA: 
        // Si el campo es EXACTAMENTE "Logs" (sin el mes adjunto), se descarta porque es solo para registro.
        // Solo dejamos pasar aquellos que sigan la estructura "Logs_Mes_Año" (contienen un guion bajo)
        if (consecutivo.toLowerCase() === "logs" || email.toLowerCase() === "logs") {
            return false;
        }

        // Si por error de digitación viene la palabra "logs" sola en minúsculas o con espacios, se bloquea
        if (/^logs$/i.test(consecutivo) || /^logs$/i.test(email)) {
            return false;
        }

        // Validación de consistencia mínima: Evitar celdas fantasmas o corruptas
        if (!item.NOMBRE_TRAMITE || item.NOMBRE_TRAMITE === "" || item.NOMBRE_TRAMITE === "undefined") {
            return false;
        }

        return true;
    });

    // 2. CONFIGURACIÓN DINÁMICA DEL TEXTO INFORMATIVO DE PERIODOS REALES
    let textoPeriodo = "Histórico Vigencias (2025 Nov-Dic / Continuo)";
    
    if (ANIO_FILTRADO === 2025) {
        textoPeriodo = "Año 2025 (Periodo Real: Nov - Dic)";
    } else if (ANIO_FILTRADO === 2026) {
        textoPeriodo = "Año 2026 (Periodo Activo)";
    } else if (ANIO_FILTRADO !== 'todos') {
        textoPeriodo = `Año ${ANIO_FILTRADO}`;
    }
    
    // Inyectar etiquetas descriptivas en la interfaz
    const tagPeriodo = document.getElementById("tagPeriodo");
    if (tagPeriodo) tagPeriodo.innerText = textoPeriodo;
    document.querySelectorAll(".txt-periodo").forEach(el => el.innerText = textoPeriodo);

    // 3. FILTRAR POR EL AÑO SELECCIONADO EN EL MENÚ DE NAVEGACIÓN
    let datosFinales = datosLimpios;
    if (ANIO_FILTRADO !== 'todos') {
        datosFinales = datosLimpios.filter(item => {
            const f = new Date(item.TIMESTAMP);
            return f.getFullYear() === Number(ANIO_FILTRADO);
        });
    }

    // 4. RE-RENDERIZAR COMPONENTES CON LA DATA PURIFICADA
    cargarKPIs(datosFinales);
    cargarKPIsParqueAutomotor(datosFinales);
    crearGraficosMensuales(datosFinales);
    crearGraficosDeTramites(datosFinales);
    aplicarFiltrosTabla(datosLimpios); 
}

function formatoMoneda(valor) {
    return valor.toLocaleString("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function formatoEntero(valor) {
    return valor.toLocaleString("es-CO");
}

function cargarKPIs(datos) {
    let intTotal = 0, extTotal = 0;
    datos.forEach(item => {
        intTotal += Number(item.TOTAL_INTERNO || 0);
        extTotal += Number(item.VALOR_CUPL_PAGADO || 0);
    });
    document.getElementById("interno").innerText = formatoMoneda(intTotal);
    document.getElementById("externo").innerText = formatoMoneda(extTotal);
    document.getElementById("general").innerText = formatoMoneda(intTotal + extTotal);
}

function cargarKPIsParqueAutomotor(datos) {
    let motos = 0, autos = 0;
    const tMotos = ["Matricula Motocicletas", "Radicación Matricula Motos", "Radicación Cuenta Motocicleta", "Matricula Motocicletas Pignorado"];
    const tAutos = ["Matrícula Particular y Oficial", "Matrícula Público", "Radicación Matricula 4 Llantas o más", "Radicación Cuenta Automovil", "Matrícula Particular y Oficial Pignorado"];

    datos.forEach(item => {
        const t = (item.NOMBRE_TRAMITE || "").trim().replace(/"/g, "");
        if (tMotos.some(m => t.toLowerCase() === m.toLowerCase())) motos++;
        else if (tAutos.some(a => t.toLowerCase() === a.toLowerCase())) autos++;
    });

    document.getElementById("cifraMotos").innerText = formatoEntero(motos);
    document.getElementById("cifraAutos").innerText = formatoEntero(autos);

    const contenedorParque = document.querySelector("#graficoParqueBarras");
    if (contenedorParque) {
        contenedorParque.innerHTML = "";
        new ApexCharts(contenedorParque, {
            chart: { type: 'bar', height: 320, fontFamily: 'Segoe UI' },
            series: [{ name: 'Unidades', data: [motos, autos] }],
            xaxis: { categories: ['Motocicletas 🏍️', 'Automóviles 🚗'] },
            colors: ['#FF0793', '#1D4ED8'],
            plotOptions: { bar: { distributed: true, dataLabels: { position: 'top' } } },
            dataLabels: { 
                enabled: true,
                formatter: (val) => formatoEntero(val),
                style: { colors: ['#000'] }
            }
        }).render();
    }
}

function crearGraficosMensuales(datos) {
    const meses = {};
    datos.forEach(item => {
        if (!item.TIMESTAMP) return;
        const f = new Date(item.TIMESTAMP);
        const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
        const label = f.toLocaleString("es-CO", { month: "short", year: "numeric" });

        if (!meses[key]) meses[key] = { label, gen: 0, int: 0, ext: 0 };
        const i = Number(item.TOTAL_INTERNO || 0);
        const e = Number(item.VALOR_CUPL_PAGADO || 0);
        meses[key].gen += (i + e);
        meses[key].int += i;
        meses[key].ext += e;
    });

    const ordenados = Object.keys(meses).sort();
    const cats = ordenados.map(k => meses[k].label);

    const confBase = {
        fontFamily: 'Segoe UI',
        chart: { height: 350, toolbar: { show: true } },
        yaxis: { labels: { formatter: (v) => formatoMoneda(v) } },
        tooltip: { y: { formatter: (v) => formatoMoneda(v) } }
    };

    document.querySelector("#graficoMensual").innerHTML = "";
    new ApexCharts(document.querySelector("#graficoMensual"), {
        ...confBase, chart: { ...confBase.chart, type: 'bar' },
        series: [{ name: 'Recaudo Total', data: ordenados.map(k => meses[k].gen) }],
        xaxis: { categories: cats }, colors: ['#009027']
    }).render();

    document.querySelector("#graficoMensualInterno").innerHTML = "";
    new ApexCharts(document.querySelector("#graficoMensualInterno"), {
        ...confBase, chart: { ...confBase.chart, type: 'area' },
        series: [{ name: 'Interno OT', data: ordenados.map(k => meses[k].int) }],
        xaxis: { categories: cats }, colors: ['#1D4ED8']
    }).render();

    document.querySelector("#graficoMensualExterno").innerHTML = "";
    new ApexCharts(document.querySelector("#graficoMensualExterno"), {
        ...confBase, chart: { ...confBase.chart, type: 'area' },
        series: [{ name: 'Externo RUNT', data: ordenados.map(k => meses[k].ext) }],
        xaxis: { categories: cats }, colors: ['#FF0793']
    }).render();
}

function crearGraficosDeTramites(datos) {
    const tipos = {};
    datos.forEach(item => {
        const t = item.TIPO_TRAMITE || 'SIN CLASIFICAR';
        if (!tipos[t]) tipos[t] = { total: 0, cantidad: 0, int: 0, ext: 0 };
        const i = Number(item.TOTAL_INTERNO || 0);
        const e = Number(item.VALOR_CUPL_PAGADO || 0);
        tipos[t].total += (i + e);
        tipos[t].int += i;
        tipos[t].ext += e;
        tipos[t].cantidad++;
    });

    const labels = Object.keys(tipos);

    document.querySelector("#graficoTramitesDonut").innerHTML = "";
    new ApexCharts(document.querySelector("#graficoTramitesDonut"), {
        chart: { type: 'donut', height: 350, fontFamily: 'Segoe UI' },
        labels: labels,
        series: labels.map(l => tipos[l].total),
        colors: ['#00B029', '#1D4ED8', '#FF0793'], 
        tooltip: { y: { formatter: (v) => formatoMoneda(v) } },
        legend: { position: 'bottom' }
    }).render();

    document.querySelector("#graficoTramitesBarras").innerHTML = "";
    new ApexCharts(document.querySelector("#graficoTramitesBarras"), {
        chart: { type: 'bar', height: 380, fontFamily: 'Segoe UI' },
        series: [
            { name: 'Cant. Trámites', data: labels.map(l => tipos[l].cantidad) },
            { name: 'Recaudo Interno', data: labels.map(l => tipos[l].int) },
            { name: 'Recaudo Externo', data: labels.map(l => tipos[l].ext) }
        ],
        xaxis: { categories: labels },
        yaxis: [
            { title: { text: "Cantidad" }, labels: { formatter: (v) => formatoEntero(v) } },
            { opposite: true, title: { text: "Valor COP" }, labels: { formatter: (v) => formatoMoneda(v) } }
        ],
        tooltip: { y: { formatter: (v, { seriesIndex }) => seriesIndex === 0 ? formatoEntero(v) : formatoMoneda(v) } }
    }).render();
}

function aplicarFiltrosTabla(datosLimpios) {
    const datosOrigen = datosLimpios || DATOS_GLOBALES;
    const filtroMesAnio = document.getElementById("filtroMesAnio").value;
    const buscarTexto = document.getElementById("buscarTramite").value.toLowerCase();
    const tbody = document.querySelector("#tablaDatos tbody");
    if (!tbody) return;
    
    tbody.innerHTML = "";

    let datosAMostrar = datosOrigen.filter(item => {
        let cumpleFecha = true, cumpleTexto = true;
        if (filtroMesAnio && item.TIMESTAMP) {
            const f = new Date(item.TIMESTAMP);
            const yM = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
            cumpleFecha = (yM === filtroMesAnio);
        }
        if (buscarTexto) {
            cumpleTexto = (item.NOMBRE_TRAMITE || "").toLowerCase().includes(buscarTexto);
        }
        return cumpleFecha && cumpleTexto;
    });

    datosAMostrar.slice(0, 100).forEach(item => {
        const fLegible = item.TIMESTAMP ? new Date(item.TIMESTAMP).toLocaleDateString("es-CO") : '';
        tbody.innerHTML += `
            <tr>
                <td>${item.NOMBRE_TRAMITE || ''}</td>
                <td class="txt-num">${formatoMoneda(Number(item.TOTAL_INTERNO || 0))}</td>
                <td class="txt-num">${formatoMoneda(Number(item.VALOR_CUPL_PAGADO || 0))}</td>
                <td>${item.TIPO_TRAMITE || ''}</td>
                <td>${item.CLASIFICACION_TRAMITE || ''}</td>
                <td>${fLegible}</td>
            </tr>
        `;
    });
}

function cambiarSeccion(seccionId, elementoDestinoId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active-tab'));
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    
    const targetTab = document.getElementById(seccionId);
    if (targetTab) targetTab.classList.add('active-tab');
    
    const eventTarget = window.event?.target;
    if(eventTarget && eventTarget.classList.contains('nav-link')) {
        eventTarget.classList.add('active');
    }

    setTimeout(() => {
        const elemento = document.getElementById(elementoDestinoId);
        if (elemento) {
            elemento.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 150);
}

function filtrarPorAnio(anio) {
    ANIO_FILTRADO = anio;
    cambiarSeccion('inicio', 'inicio');
    renderizarDashboard();
}


obtenerDatos();