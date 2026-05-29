let DATOS_GLOBALES = [];
let ANIO_FILTRADO = 'todos';

function obtenerDatos() {
    const script = document.createElement('script');
    // Consumimos el script directamente de forma pública
    script.src = CONFIG.GOOGLE_SCRIPT_URL + '?callback=procesarDatos';
    document.body.appendChild(script);
}

function procesarDatos(datos) {
    if (!datos || datos.length === 0 || datos === "NOT_AVAILABLE") {
        console.error("No se recibieron datos de la API o la hoja está vacía.");
        return;
    }
    
    DATOS_GLOBALES = datos;
    renderizarDashboard();
}

function mostrarPaginaNoDisponible() {
    document.body.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f7f9fa; font-family: 'Segoe UI', Arial, sans-serif; color: #5f6368; text-align: center; padding: 20px;">
            <div style="font-size: 80px; font-weight: bold; color: #dadce0; margin-bottom: 10px;">404</div>
            <h1 style="font-size: 24px; color: #202124; margin-bottom: 15px; font-weight: 500;">Esta página no está disponible</h1>
            <p style="font-size: 14px; max-width: 400px; margin-bottom: 25px; line-height: 1.6;">Es posible que el enlace esté roto, que la página se haya eliminado o que no tengas los permisos de red del servidor local necesarios.</p>
            <a href="https://www.google.com" style="text-decoration: none; background-color: #1a73e8; color: white; padding: 10px 24px; border-radius: 4px; font-weight: 500; font-size: 14px; box-shadow: 0 1px 2px 0 rgba(60,64,67,0.3);">Ir a la página de inicio</a>
        </div>
    `;
    document.body.style.margin = "0";
    document.body.style.background = "#f7f9fa";
}

function renderizarDashboard() {
    let datosLimpios = DATOS_GLOBALES.filter(item => {
        if (!item || !item.TIMESTAMP) return false;

        const f = new Date(item.TIMESTAMP);
        if (isNaN(f)) return false;

        const anioRegistro = f.getFullYear();
        const mesIdx = f.getMonth(); 

        if (anioRegistro === 2025 && mesIdx < 10) {
            return false;
        }

        const consecutivo = String(item.CONSECUTIVO_INTERNO || "").trim();
        const email = String(item.USUARIO_EMAIL || "").trim();

        if (consecutivo.toLowerCase() === "logs" || email.toLowerCase() === "logs") {
            return false;
        }

        if (/^logs$/i.test(consecutivo) || /^logs$/i.test(email)) {
            return false;
        }

        if (!item.NOMBRE_TRAMITE || item.NOMBRE_TRAMITE === "" || item.NOMBRE_TRAMITE === "undefined") {
            return false;
        }

        return true;
    });

    let textoPeriodo = "Histórico Vigencias (2025 Nov-Dic / Continuo)";
    
    if (ANIO_FILTRADO === 2025) {
        textoPeriodo = "Año 2025 (Periodo Real: Nov - Dic)";
    } else if (ANIO_FILTRADO === 2026) {
        textoPeriodo = "Año 2026 (Periodo Activo)";
    } else if (ANIO_FILTRADO !== 'todos') {
        textoPeriodo = `Año ${ANIO_FILTRADO}`;
    }
    
    const tagPeriodo = document.getElementById("tagPeriodo");
    if (tagPeriodo) tagPeriodo.innerText = textoPeriodo;
    document.querySelectorAll(".txt-periodo").forEach(el => el.innerText = textoPeriodo);

    let datosFinales = datosLimpios;
    if (ANIO_FILTRADO !== 'todos') {
        datosFinales = datosLimpios.filter(item => {
            const f = new Date(item.TIMESTAMP);
            return f.getFullYear() === Number(ANIO_FILTRADO);
        });
    }

    cargarKPIs(datosFinales);
    cargarKPIsParqueAutomotor(datosFinales);
    crearGraficosMensuales(datosFinales);
    crearGraficosDeTramites(datosFinales);
    crearCaracterizacionDeTramites(datosFinales);
    aplicarFiltrosTabla(datosFinales); 
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
        intTotal += Number(item.TOTAL_INTERNO || item.total_interno || 0);
        extTotal += Number(item.VALOR_CUPL_PAGADO || item.valor_cupl_pagado || 0);
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
        const t = (item.NOMBRE_TRAMITE || item.nombre_tramite || "").trim().replace(/"/g, "");
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
        const i = Number(item.TOTAL_INTERNO || item.total_interno || 0);
        const e = Number(item.VALOR_CUPL_PAGADO || item.valor_cupl_pagado || 0);
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

    const contExt = document.querySelector("#graficoMensualExterno");
    if (contExt) {
        contExt.innerHTML = "";
        new ApexCharts(contExt, {
            ...confBase, chart: { ...confBase.chart, type: 'area' },
            series: [{ name: 'Externo RUNT', data: ordenados.map(k => meses[k].ext) }],
            xaxis: { categories: cats }, colors: ['#FF0793']
        }).render();
    }
}

function crearGraficosDeTramites(datos) {
    const tipos = {};
    datos.forEach(item => {
        const t = item.TIPO_TRAMITE || item.tipo_tramite || 'SIN CLASIFICAR';
        if (!tipos[t]) tipos[t] = { total: 0, cantidad: 0 };
        
        const i = Number(item.TOTAL_INTERNO || item.total_interno || 0);
        const e = Number(item.VALOR_CUPL_PAGADO || item.valor_cupl_pagado || 0);
        
        tipos[t].total += (i + e);
        tipos[t].cantidad++;
    });

    const labels = Object.keys(tipos);

    const contenedorDonut = document.querySelector("#graficoTramitesDonut");
    if (contenedorDonut) {
        contenedorDonut.innerHTML = "";
        new ApexCharts(contenedorDonut, {
            chart: { type: 'donut', height: 350, fontFamily: 'Segoe UI' },
            labels: labels,
            series: labels.map(l => tipos[l].total),
            colors: ['#00B029', '#1D4ED8', '#FF0793'], 
            tooltip: { y: { formatter: (v) => formatoMoneda(v) } },
            legend: { position: 'bottom' }
        }).render();
    }

    const contenedorBarras = document.querySelector("#graficoTramitesBarras");
    if (contenedorBarras) {
        contenedorBarras.innerHTML = "";
        new ApexCharts(contenedorBarras, {
            chart: { type: 'bar', height: 350, fontFamily: 'Segoe UI' },
            series: [
                { name: 'Cantidad', data: labels.map(l => tipos[l].cantidad) },
                { name: 'Total ($)', data: labels.map(l => tipos[l].total) }
            ],
            xaxis: { categories: labels },
            yaxis: [
                { title: { text: "Cantidad" } },
                { opposite: true, title: { text: "Recaudo COP" }, labels: { formatter: (v) => formatoMoneda(v) } }
            ],
            colors: ['#1D4ED8', '#009027'],
            tooltip: { y: { formatter: (v, { seriesIndex }) => seriesIndex === 0 ? formatoEntero(v) : formatoMoneda(v) } }
        }).render();
    }
}

function crearCaracterizacionDeTramites(datos) {
    const estadisticasTramites = {};

    datos.forEach(item => {
        const nombre = (item.NOMBRE_TRAMITE || item.nombre_tramite || "SIN NOMBRE").trim().replace(/"/g, "");
        if (!nombre || nombre === "" || nombre === "undefined" || nombre.toLowerCase() === "nombre_tramite") {
            return;
        }

        if (!estadisticasTramites[nombre]) {
            estadisticasTramites[nombre] = { cantidad: 0, recaudoTotal: 0 };
        }

        const intVal = Number(item.TOTAL_INTERNO || item.total_interno || 0);
        const extVal = Number(item.VALOR_CUPL_PAGADO || item.valor_cupl_pagado || 0);

        estadisticasTramites[nombre].cantidad += 1; 
        estadisticasTramites[nombre].recaudoTotal += (intVal + extVal); 
    });

    const listaTramites = Object.keys(estadisticasTramites);
    if (listaTramites.length === 0) return;

    const ordenadosPorCantidad = [...listaTramites].sort((a, b) => estadisticasTramites[b].cantidad - estadisticasTramites[a].cantidad);
    const ordenadosPorRecaudo = [...listaTramites].sort((a, b) => estadisticasTramites[b].recaudoTotal - estadisticasTramites[a].recaudoTotal);

    const opcionesBase = {
        fontFamily: 'Segoe UI, Arial, sans-serif',
        plotOptions: {
            bar: {
                borderRadius: 4,
                horizontal: true, 
                barHeight: '75%',
                dataLabels: { position: 'top' }
            }
        },
        grid: { borderColor: '#f1f5f9', xaxis: { lines: { show: true } } }
    };

    const alturaDinamica = Math.max(listaTramites.length * 35 + 100, 400);

    const contenedorCant = document.querySelector("#graficoTramitesCantidad");
    if (contenedorCant) {
        contenedorCant.innerHTML = "";
        new ApexCharts(contenedorCant, {
            ...opcionesBase,
            chart: { type: 'bar', height: alturaDinamica, toolbar: { show: true } },
            colors: ['#1D4ED8'], 
            series: [{
                name: 'Cantidad de Trámites',
                data: ordenadosPorCantidad.map(name => estadisticasTramites[name].cantidad)
            }],
            xaxis: { categories: ordenadosPorCantidad, labels: { formatter: (v) => formatoEntero(v) } },
            dataLabels: {
                enabled: true,
                formatter: (val) => formatoEntero(val),
                style: { colors: ['#0f172a'], fontSize: '12px', fontWeight: '600' },
                offsetX: 25
            },
            tooltip: { y: { formatter: (v) => formatoEntero(v) + " Ejecuciones" } }
        }).render();
    }

    const contenedorRec = document.querySelector("#graficoTramitesRecaudoMonto");
    if (contenedorRec) {
        contenedorRec.innerHTML = "";
        new ApexCharts(contenedorRec, {
            ...opcionesBase,
            chart: { type: 'bar', height: alturaDinamica, toolbar: { show: true } },
            colors: ['#009027'], 
            series: [{
                name: 'Recaudo Total ($)',
                data: ordenadosPorRecaudo.map(name => estadisticasTramites[name].recaudoTotal)
            }],
            xaxis: { categories: ordenadosPorRecaudo, labels: { formatter: (v) => formatoMoneda(v) } },
            dataLabels: {
                enabled: true,
                formatter: (val) => formatoMoneda(val),
                style: { colors: ['#0f172a'], fontSize: '11px', fontWeight: '600' },
                offsetX: 40
            },
            tooltip: { y: { formatter: (v) => formatoMoneda(v) + " COP" } }
        }).render();
    }
}

function aplicarFiltrosTabla(datosOrigen) {
    const tbody = document.querySelector("#tablaDatos tbody");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    const filtroMesAnio = document.getElementById("filtroMesAnio") ? document.getElementById("filtroMesAnio").value : "";
    const buscarTexto = document.getElementById("buscarTramite") ? document.getElementById("buscarTramite").value.toLowerCase() : "";

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

// Función para abrir/cerrar el menú hamburguesa
function toggleMenu() {
    const toggleBtn = document.querySelector('.menu-toggle');
    const menuWrapper = document.getElementById('navMenuWrapper');
    
    if (toggleBtn && menuWrapper) {
        toggleBtn.classList.toggle('open');
        menuWrapper.classList.toggle('open');
    }
}

// Cierra el menú móvil de manera automática tras realizar una acción
function cerrarMenuMovil() {
    const toggleBtn = document.querySelector('.menu-toggle');
    const menuWrapper = document.getElementById('navMenuWrapper');
    
    if (toggleBtn && toggleBtn.classList.contains('open')) {
        toggleBtn.classList.remove('open');
        menuWrapper.classList.remove('open');
    }
}

// Enlace interceptor para cambiar de sección y cerrar el menú en móvil
function cambiarSeccionResponsive(seccionId, elementoDestinoId) {
    cambiarSeccion(seccionId, elementoDestinoId);
    cerrarMenuMovil();
}

// Enlace interceptor para aplicar el filtro de año y cerrar el menú en móvil
function filtrarPorAnioResponsive(anio) {
    filtrarPorAnio(anio);
    cerrarMenuMovil();
}

obtenerDatos();
