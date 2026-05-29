let DATOS_GLOBALES = [];
let ANIO_FILTRADO = 'todos';

function obtenerDatos() {
    const script = document.createElement('script');
    script.src = CONFIG.GOOGLE_SCRIPT_URL + '?callback=procesarDatos';
    document.body.appendChild(script);
}

function procesarDatos(datos) {
    // Si el script de Google nos envía el texto de bloqueo, activamos la pantalla falsa
    if (datos === "NOT_AVAILABLE" || !datos) {
        mostrarPaginaNoDisponible();
        return;
    }

    if (datos.length === 0) {
        console.error("No se recibieron datos de la API");
        return;
    }
    DATOS_GLOBALES = datos;
    renderizarDashboard();
}

// Esta función borra todo el dashboard y dibuja un error de internet falso
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
    const estadisticasTramites = {};

    // 1. Agrupar de forma estricta por NOMBRE_TRAMITE (Columna F)
    datos.forEach(item => {
        // Limpiamos el texto de comillas o espacios fantasmas
        const nombre = (item.NOMBRE_TRAMITE || "SIN NOMBRE").trim().replace(/"/g, "");
        
        if (!estadisticasTramites[nombre]) {
            estadisticasTramites[nombre] = {
                cantidad: 0,
                recaudoTotal: 0
            };
        }

        const intVal = Number(item.TOTAL_INTERNO || 0);
        const extVal = Number(item.VALOR_CUPL_PAGADO || 0);

        estadisticasTramites[nombre].cantidad += 1; // Cuenta de veces ejecutado
        estadisticasTramites[nombre].recaudoTotal += (intVal + extVal); // Suma total de dinero
    });

    // 2. Convertir en arreglos y ordenar para mostrar los más importantes (Top)
    const listaTramites = Object.keys(estadisticasTramites);
    
    // Ordenar por cantidad (Los más realizados)
    const ordenadosPorCantidad = [...listaTramites].sort((a, b) => estadisticasTramites[b].cantidad - estadisticasTramites[a].cantidad);
    
    // Ordenar por dinero (Los que más recaudan)
    const ordenadosPorRecaudo = [...listaTramites].sort((a, b) => estadisticasTramites[b].recaudoTotal - estadisticasTramites[a].recaudoTotal);

    // Configuración de fuentes y barras limpias
    const opcionesBase = {
        fontFamily: 'Segoe UI, Arial, sans-serif',
        plotOptions: {
            bar: {
                borderRadius: 6,
                horizontal: true, // Barras horizontales para que los nombres largos se lean perfecto
                barHeight: '70%',
                dataLabels: { position: 'top' }
            }
        },
        grid: {
            borderColor: '#f1f5f9',
            xaxis: { lines: { show: true } }
        }
    };

    // ========================================================
    // GRÁFICO 1: LOS TRÁMITES MÁS REALIZADOS (CANTIDAD DE VECES)
    // ========================================================
    const contenedorCant = document.querySelector("#graficoTramitesCantidad");
    if (contenedorCant) {
        contenedorCant.innerHTML = "";
        new ApexCharts(contenedorCant, {
            ...opcionesBase,
            chart: { type: 'bar', height: 450, toolbar: { show: true } },
            colors: ['#1D4ED8'], // Azul operativo
            series: [{
                name: 'Cantidad de Trámites',
                data: ordenadosPorCantidad.map(name => estadisticasTramites[name].cantidad)
            }],
            xaxis: {
                categories: ordenadosPorCantidad,
                labels: { formatter: (v) => formatoEntero(v) }
            },
            dataLabels: {
                enabled: true,
                formatter: (val) => formatoEntero(val),
                style: { colors: ['#0f172a'], fontSize: '12px', fontWeight: '600' },
                offsetX: 30
            },
            tooltip: { y: { formatter: (v) => formatoEntero(v) + " Ejecuciones" } }
        }).render();
    }

    // ========================================================
    // GRÁFICO 2: LOS TRÁMITES QUE MÁS RECAUDAN (MONTO DINERO)
    // ========================================================
    const contenedorRec = document.querySelector("#graficoTramitesRecaudoMonto");
    if (contenedorRec) {
        contenedorRec.innerHTML = "";
        new ApexCharts(contenedorRec, {
            ...opcionesBase,
            chart: { type: 'bar', height: 450, toolbar: { show: true } },
            colors: ['#009027'], // Verde financiero
            series: [{
                name: 'Recaudo Total ($)',
                data: ordenadosPorRecaudo.map(name => estadisticasTramites[name].recaudoTotal)
            }],
            xaxis: {
                categories: ordenadosPorRecaudo,
                labels: { formatter: (v) => formatoMoneda(v) }
            },
            dataLabels: {
                enabled: true,
                formatter: (val) => formatoMoneda(val),
                style: { colors: ['#0f172a'], fontSize: '11px', fontWeight: '600' },
                offsetX: 45
            },
            tooltip: { y: { formatter: (v) => formatoMoneda(v) + " COP" } }
        }).render();
    }
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
