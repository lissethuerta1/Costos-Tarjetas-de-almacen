const state = {
    user: null,
    products: [],
    workers: [],
    processes: [],
    movements: {},
    globalMethod: 'PEPS',
    isProcesosLocked: true
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. LOGIN
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const user = document.getElementById('username').value;
            const pass = document.getElementById('password').value;

            if (user === 'admin' && pass === '1234') {
                state.user = user;
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app-screen').classList.remove('hidden');
                
                loadProductsFromFirebase();
                loadWorkersFromFirebase();
                loadProcessesFromFirebase();
            } else {
                document.getElementById('login-error').classList.remove('hidden');
            }
        });
    }

    document.getElementById('logout-btn')?.addEventListener('click', () => location.reload());

    // 2. CONFIGURACIÓN GENERAL
    document.getElementById('config-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        state.globalMethod = document.getElementById('cfg-metodo-global').value;
        const badge = document.getElementById('active-method-badge');
        if (badge) badge.innerText = `Método: ${state.globalMethod}`;
        
        renderAllCards();
        actualizarCedulaProducto();
        alert(`Configuración guardada. El método institucional de inventario ahora es ${state.globalMethod}.`);
    });

    // 3. OCULTAR COSTO EN SALIDAS
    const movTypeSelect = document.getElementById('mov-type');
    const costContainer = document.getElementById('cost-container');
    movTypeSelect?.addEventListener('change', (e) => {
        if (e.target.value === 'SALIDA') {
            costContainer?.classList.add('opacity-40', 'pointer-events-none');
            document.getElementById('mov-cost')?.removeAttribute('required');
        } else {
            costContainer?.classList.remove('opacity-40', 'pointer-events-none');
            document.getElementById('mov-cost')?.setAttribute('required', 'true');
        }
    });

    // 4. REGISTRO DE INSUMOS
    document.getElementById('product-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newProduct = {
            name: document.getElementById('prod-name').value.trim(),
            unit: document.getElementById('prod-unit').value.trim(),
            createdAt: new Date()
        };

        try {
            const docRef = await window.fs.addDoc(window.fs.collection(window.db, "productos"), newProduct);
            state.products.push({ id: docRef.id, ...newProduct });
            state.movements[docRef.id] = [];
            
            document.getElementById('product-form').reset();
            updateProductDropdowns();
            renderAllCards();
            actualizarCedulaProducto();
        } catch (error) {
            console.error("Error al guardar producto:", error);
        }
    });

    // 5. REGISTRO DE MOVIMIENTOS
    document.getElementById('movement-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prodId = document.getElementById('mov-product').value;
        if (!prodId) return alert("Selecciona un insumo.");

        const movement = {
            productId: prodId,
            fecha: document.getElementById('mov-date').value,
            ref: document.getElementById('mov-ref').value,
            concepto: document.getElementById('mov-concept').value,
            tipo: document.getElementById('mov-type').value,
            cantidad: parseFloat(document.getElementById('mov-qty').value),
            costoUnitario: parseFloat(document.getElementById('mov-cost').value || 0),
            createdAt: new Date()
        };

        try {
            await window.fs.addDoc(window.fs.collection(window.db, "movimientos"), movement);
            document.getElementById('movement-form').reset();
            await loadMovementsFromFirebase(prodId);
            renderAllCards();
            actualizarCedulaProducto();
        } catch (error) {
            console.error("Error al guardar movimiento:", error);
        }
    });

    // 6. REGISTRO DE PROCESOS POR RUTA DE PRODUCTO
    document.getElementById('process-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.isProcesosLocked) {
            return alert("La configuración de procesos está bloqueada por el Área de Administración. Desbloquéala para realizar cambios.");
        }

        const productKey = document.getElementById('proc-product-key').value;
        const name = document.getElementById('proc-name').value.trim();
        const machine = document.getElementById('proc-machine').value.trim();
        const time = parseFloat(document.getElementById('proc-time').value);

        const newProc = {
            productKey,
            name,
            machine,
            time,
            assignedWorkerId: null,
            createdAt: new Date()
        };

        try {
            const docRef = await window.fs.addDoc(window.fs.collection(window.db, "procesos"), newProc);
            state.processes.push({ id: docRef.id, ...newProc });
            document.getElementById('process-form').reset();
            renderProcesosModule();
            actualizarCedulaProducto();
        } catch (error) {
            console.error("Error al guardar proceso:", error);
        }
    });
});

// NAVEGACIÓN
window.switchModule = function(moduleName) {
    ['config', 'mp', 'mo', 'procesos', 'prorrateo', 'reportes'].forEach(m => {
        const mod = document.getElementById(`module-${m}`);
        if (mod) mod.classList.add('hidden');
        
        const btn = document.getElementById(`nav-${m}`);
        if (btn) btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg transition text-blue-200 hover:text-white";
    });

    const activeMod = document.getElementById(`module-${moduleName}`);
    if (activeMod) activeMod.classList.remove('hidden');

    const activeBtn = document.getElementById(`nav-${moduleName}`);
    if (activeBtn) activeBtn.className = "px-3 py-1.5 text-xs font-bold rounded-lg transition bg-blue-800 text-white";

    if (moduleName === 'procesos') renderProcesosModule();
    if (moduleName === 'prorrateo') calcularYRenderizarProrrateos();
    if (moduleName === 'reportes') actualizarCedulaProducto();
};

// BLOQUEO Y DESBLOQUEO DE PROCESOS (ESTILO ERP REAL)
window.toggleLockProcesos = function() {
    state.isProcesosLocked = !state.isProcesosLocked;
    renderProcesosModule();
};

function renderProcesosModule() {
    const container = document.getElementById('procesos-list-container');
    const btnLock = document.getElementById('btn-toggle-lock-procesos');
    const procFormInputs = document.querySelectorAll('#process-form input, #process-form select, #process-form button');
    const filterKey = document.getElementById('filter-ruta-product')?.value || 'lente';

    if (btnLock) {
        btnLock.innerText = state.isProcesosLocked ? "🔓 Desbloquear Configuración" : "🔒 Guardar y Bloquear Configuración";
        btnLock.className = state.isProcesosLocked ? 
            "px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg transition" : 
            "px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition";
    }

    procFormInputs.forEach(el => {
        if (state.isProcesosLocked) el.setAttribute('disabled', 'true');
        else el.removeAttribute('disabled');
    });

    if (!container) return;

    const filteredProcs = state.processes.filter(p => (p.productKey || 'lente') === filterKey);

    if (filteredProcs.length === 0) {
        container.innerHTML = `<p class="col-span-2 text-center text-slate-400 p-4 border border-dashed rounded-lg">No hay estaciones o procesos registrados para este producto.</p>`;
        return;
    }

    let htmlOperadoresOpts = '<option value="">-- Sin Operador Asignado --</option>';
    state.workers.forEach(w => {
        htmlOperadoresOpts += `<option value="${w.id}">${w.name} (CHH: $${w.chh.toFixed(2)})</option>`;
    });

    let htmlCards = '';
    filteredProcs.forEach((proc, index) => {
        let opts = htmlOperadoresOpts;
        if (proc.assignedWorkerId) {
            opts = opts.replace(`value="${proc.assignedWorkerId}"`, `value="${proc.assignedWorkerId}" selected`);
        }

        const disabledAttr = state.isProcesosLocked ? 'disabled' : '';

        htmlCards += `
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 shadow-sm">
                <div class="flex justify-between items-center border-b pb-2">
                    <div>
                        <span class="font-extrabold text-blue-950 text-sm">${index + 1}. ${proc.name}</span>
                        <p class="text-[10px] text-slate-500 font-semibold">Máquina: ${proc.machine}</p>
                    </div>
                    <span class="px-2 py-0.5 bg-blue-100 text-blue-900 rounded-md font-extrabold text-xs">${proc.time} hrs</span>
                </div>
                <div>
                    <label class="block text-[11px] font-bold text-slate-600 mb-1">Operador Asignado Permamante:</label>
                    <select ${disabledAttr} onchange="asignarTrabajadorProceso('${proc.id}', this.value)" class="w-full p-2 border rounded-lg text-xs bg-white text-slate-900 font-bold disabled:bg-slate-100 disabled:text-slate-500">
                        ${opts}
                    </select>
                </div>
            </div>`;
    });

    container.innerHTML = htmlCards;
}

window.asignarTrabajadorProceso = async function(processId, workerId) {
    const proc = state.processes.find(p => p.id === processId);
    if (proc) {
        proc.assignedWorkerId = workerId || null;
        try {
            await window.fs.updateDoc(window.fs.doc(window.db, "procesos", processId), { assignedWorkerId: proc.assignedWorkerId });
        } catch (e) {
            console.error("Error al actualizar proceso:", e);
        }
        actualizarCedulaProducto();
    }
};

// CÁLCULO DINÁMICO DE PRORRATEO PRIMARIO, SECUNDARIO Y FINAL (APUNTES Y EXCEL)
function calcularYRenderizarProrrateos() {
    const m2 = { Produc: 110, Admon: 40, Ventas: 15, RH: 10, Distr: 40 };
    const totalM2 = 215;

    // 1. Primario
    const rentaTotal = 50000;
    const factorRenta = rentaTotal / totalM2;
    const renta = {}; Object.keys(m2).forEach(k => renta[k] = m2[k] * factorRenta);

    const eeTotal = 22000;
    const eeFM = eeTotal * 0.72; // $15,840 a producción
    const eeIlum = eeTotal * 0.28; // $6,160 por m2
    const factorIlum = eeIlum / totalM2;
    const ee = {}; Object.keys(m2).forEach(k => ee[k] = (m2[k] * factorIlum) + (k === 'Produc' ? eeFM : 0));

    const aguaTotal = 2300;
    const factorAgua = aguaTotal / totalM2;
    const agua = {}; Object.keys(m2).forEach(k => agua[k] = m2[k] * factorAgua);

    const gasolina = { Produc: 0, Admon: 0, Ventas: 0, RH: 0, Distr: 2200 };
    const licencias = { Produc: 5000, Admon: 0, Ventas: 0, RH: 0, Distr: 0 };

    const primarioTotales = {};
    Object.keys(m2).forEach(k => {
        primarioTotales[k] = renta[k] + ee[k] + agua[k] + gasolina[k] + licencias[k];
    });

    // Render Primario
    const tbodyPrimario = document.getElementById('tb-prorrateo-primario');
    if (tbodyPrimario) {
        tbodyPrimario.innerHTML = `
            <tr><td class="p-2 border text-left">Renta de Nave</td><td class="p-2 border">Superficie (${totalM2}m²)</td><td class="p-2 border bg-blue-50 font-bold">$${renta.Produc.toFixed(2)}</td><td class="p-2 border">$${renta.Admon.toFixed(2)}</td><td class="p-2 border">$${renta.Ventas.toFixed(2)}</td><td class="p-2 border">$${renta.RH.toFixed(2)}</td><td class="p-2 border">$${renta.Distr.toFixed(2)}</td><td class="p-2 border font-bold">$${rentaTotal.toFixed(2)}</td></tr>
            <tr><td class="p-2 border text-left">Energía Eléctrica (FM + Ilum)</td><td class="p-2 border">Fuerza Motriz / m²</td><td class="p-2 border bg-blue-50 font-bold">$${ee.Produc.toFixed(2)}</td><td class="p-2 border">$${ee.Admon.toFixed(2)}</td><td class="p-2 border">$${ee.Ventas.toFixed(2)}</td><td class="p-2 border">$${ee.RH.toFixed(2)}</td><td class="p-2 border">$${ee.Distr.toFixed(2)}</td><td class="p-2 border font-bold">$${eeTotal.toFixed(2)}</td></tr>
            <tr><td class="p-2 border text-left">Agua Potable</td><td class="p-2 border">Superficie (${totalM2}m²)</td><td class="p-2 border bg-blue-50 font-bold">$${agua.Produc.toFixed(2)}</td><td class="p-2 border">$${agua.Admon.toFixed(2)}</td><td class="p-2 border">$${agua.Ventas.toFixed(2)}</td><td class="p-2 border">$${agua.RH.toFixed(2)}</td><td class="p-2 border">$${agua.Distr.toFixed(2)}</td><td class="p-2 border font-bold">$${aguaTotal.toFixed(2)}</td></tr>
            <tr><td class="p-2 border text-left">Gasolina Flotilla Reparto</td><td class="p-2 border">Directo a Distribución</td><td class="p-2 border bg-blue-50 font-bold">$0.00</td><td class="p-2 border">$0.00</td><td class="p-2 border">$0.00</td><td class="p-2 border">$0.00</td><td class="p-2 border">$${gasolina.Distr.toFixed(2)}</td><td class="p-2 border font-bold">$${gasolina.Distr.toFixed(2)}</td></tr>
            <tr><td class="p-2 border text-left">Licencias Software Sanitario</td><td class="p-2 border">Directo a Producción</td><td class="p-2 border bg-blue-50 font-bold">$${licencias.Produc.toFixed(2)}</td><td class="p-2 border">$0.00</td><td class="p-2 border">$0.00</td><td class="p-2 border">$0.00</td><td class="p-2 border">$0.00</td><td class="p-2 border font-bold">$${licencias.Produc.toFixed(2)}</td></tr>
        `;

        document.getElementById('tr-totales-primario').innerHTML = `
            <td colspan="2" class="p-2 border text-right">TOTAL PRORRATEO PRIMARIO:</td>
            <td class="p-2 border text-blue-950 font-extrabold">$${primarioTotales.Produc.toFixed(2)}</td>
            <td class="p-2 border">$${primarioTotales.Admon.toFixed(2)}</td>
            <td class="p-2 border">$${primarioTotales.Ventas.toFixed(2)}</td>
            <td class="p-2 border">$${primarioTotales.RH.toFixed(2)}</td>
            <td class="p-2 border">$${primarioTotales.Distr.toFixed(2)}</td>
            <td class="p-2 border text-blue-950 font-black">$${(50000+22000+2300+2200+5000).toFixed(2)}</td>
        `;
    }

    // 2. Secundario
    const rhMonto = primarioTotales.RH;
    const emp = { Produc: 12, Ventas: 3, Distr: 3, Admon: 2 };
    const factorRH = rhMonto / 18;
    const rhDist = { Produc: emp.Produc * factorRH, Ventas: emp.Ventas * factorRH, Distr: emp.Distr * factorRH, Admon: emp.Admon * factorRH };

    const admonMontoAcum = primarioTotales.Admon + rhDist.Admon;
    const admonDist = { Produc: admonMontoAcum * 0.70, Ventas: admonMontoAcum * 0.15, Distr: admonMontoAcum * 0.15 };

    const tbodySecundario = document.getElementById('tb-prorrateo-secundario');
    if (tbodySecundario) {
        tbodySecundario.innerHTML = `
            <tr><td class="p-2 border text-left">Recosteo Recursos Humanos (RH)</td><td class="p-2 border">$${rhMonto.toFixed(2)}</td><td class="p-2 border">Número de Empleados (18 op.)</td><td class="p-2 border bg-blue-50 font-bold">$${rhDist.Produc.toFixed(2)}</td><td class="p-2 border">$${rhDist.Ventas.toFixed(2)}</td><td class="p-2 border">$${rhDist.Distr.toFixed(2)}</td></tr>
            <tr><td class="p-2 border text-left">Recosteo Administración General</td><td class="p-2 border">$${admonMontoAcum.toFixed(2)}</td><td class="p-2 border">Porcentaje Asignación Operativa (70% Fab)</td><td class="p-2 border bg-blue-50 font-bold">$${admonDist.Produc.toFixed(2)}</td><td class="p-2 border">$${admonDist.Ventas.toFixed(2)}</td><td class="p-2 border">$${admonDist.Distr.toFixed(2)}</td></tr>
        `;

        const totalSecProduc = rhDist.Produc + admonDist.Produc;
        document.getElementById('tr-totales-secundario').innerHTML = `
            <td colspan="3" class="p-2 border text-right">TOTAL ASIGNADO A PRODUCCIÓN:</td>
            <td class="p-2 border text-blue-950 font-extrabold">$${totalSecProduc.toFixed(2)}</td>
            <td class="p-2 border">$${(rhDist.Ventas + admonDist.Ventas).toFixed(2)}</td>
            <td class="p-2 border">$${(rhDist.Distr + admonDist.Distr).toFixed(2)}</td>
        `;
    }

    // 3. Final
    const gifTotalProduccion = primarioTotales.Produc + rhDist.Produc + admonDist.Produc;
    const cuotaPorUnidad = gifTotalProduccion / 1000;
    const cuotaPorHora = gifTotalProduccion / 1450;

    document.getElementById('lbl-gif-total-a').innerText = `$${gifTotalProduccion.toFixed(2)}`;
    document.getElementById('lbl-gif-total-b').innerText = `$${gifTotalProduccion.toFixed(2)}`;
    document.getElementById('lbl-tasa-gif-unidad').innerText = `$${cuotaPorUnidad.toFixed(2)} / pza`;
    document.getElementById('lbl-tasa-gif-hora').innerText = `$${cuotaPorHora.toFixed(2)} / hr`;

    return { gifTotalProduccion, cuotaPorHora };
}

// CÉDULA DE INTEGRACIÓN TOTAL
window.actualizarCedulaProducto = function() {
    const selectElem = document.getElementById('select-producto-costeo');
    if (!selectElem) return;

    const key = selectElem.value;
    const { cuotaPorHora } = calcularYRenderizarProrrateos();

    function getCostoMP(keywords, defaultVal) {
        const prod = state.products.find(p => keywords.some(k => p.name.toLowerCase().includes(k.toLowerCase())));
        if (!prod) return defaultVal;

        const movs = state.movements[prod.id] || [];
        const entradas = movs.filter(m => m.tipo === 'ENTRADA' && m.costoUnitario > 0);
        return entradas.length > 0 ? entradas[entradas.length - 1].costoUnitario : defaultVal;
    }

    const recetasMP = {
        lente: [
            { nombre: "Micas Orgánicas CR-39", tipo: "MPD", cantidadTexto: "1 Par", factor: 1.0, ctoUnit: getCostoMP(["Mica", "CR-39"], 120.00) },
            { nombre: "Armazón de Acetato Inyectado", tipo: "MPD", cantidadTexto: "1 Pza", factor: 1.0, ctoUnit: getCostoMP(["Armazón", "Acetato"], 85.00) },
            { nombre: "Estuche y Microfibra", tipo: "MPI", cantidadTexto: "1 Juego", factor: 1.0, ctoUnit: getCostoMP(["Estuche"], 15.00) }
        ],
        armazon: [
            { nombre: "Pellets de Acetato de Celulosa", tipo: "MPD", cantidadTexto: "0.25 Kg", factor: 0.25, ctoUnit: getCostoMP(["Acetato"], 112.00) },
            { nombre: "Alma Metálica y Bisagras", tipo: "MPD", cantidadTexto: "1 Juego", factor: 1.0, ctoUnit: getCostoMP(["Bisagras"], 15.00) },
            { nombre: "Empaque Individual Bolsa", tipo: "MPI", cantidadTexto: "1 Pza", factor: 1.0, ctoUnit: getCostoMP(["Bolsa"], 2.00) }
        ],
        kit: [
            { nombre: "Solución Limpiadora 60ml", tipo: "MPD", cantidadTexto: "1 Frasco", factor: 1.0, ctoUnit: getCostoMP(["Solución"], 12.00) },
            { nombre: "Paño Microfibra", tipo: "MPD", cantidadTexto: "1 Pza", factor: 1.0, ctoUnit: getCostoMP(["Paño"], 6.00) },
            { nombre: "Estuche Rígido con Cierre", tipo: "MPD", cantidadTexto: "1 Pza", factor: 1.0, ctoUnit: getCostoMP(["Estuche"], 15.00) }
        ]
    };

    // 1. RENDER MP
    const tbodyMP = document.getElementById('tb-cedula-mp');
    let totalMP = 0;
    if (tbodyMP) {
        tbodyMP.innerHTML = '';
        (recetasMP[key] || []).forEach(item => {
            const subtotal = item.ctoUnit * item.factor;
            totalMP += subtotal;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="border border-slate-300 p-2 text-left font-medium">${item.nombre}</td>
                <td class="border border-slate-300 p-2 font-bold ${item.tipo === 'MPD' ? 'text-blue-900' : 'text-amber-700'}">${item.tipo}</td>
                <td class="border border-slate-300 p-2">${item.cantidadTexto}</td>
                <td class="border border-slate-300 p-2">$${item.ctoUnit.toFixed(2)}</td>
                <td class="border border-slate-300 p-2 font-bold">$${subtotal.toFixed(2)}</td>`;
            tbodyMP.appendChild(tr);
        });

        document.getElementById('lbl-cedula-total-mp').innerText = `$${totalMP.toFixed(2)}`;
    }

    // 2. RENDER MO FILTRADO POR RUTA REAL DEL PRODUCTO
    const tbodyMO = document.getElementById('tb-cedula-mo');
    let totalMO = 0;
    let tiempoTotalHoras = 0;

    const rutaProcesos = state.processes.filter(p => (p.productKey || 'lente') === key);

    if (tbodyMO) {
        tbodyMO.innerHTML = '';
        if (rutaProcesos.length === 0) {
            tbodyMO.innerHTML = `<tr><td colspan="5" class="p-3 text-slate-400">No hay procesos configurados para la ruta de este producto.</td></tr>`;
        } else {
            rutaProcesos.forEach(proc => {
                const worker = state.workers.find(w => w.id === proc.assignedWorkerId);
                const workerName = worker ? worker.name : 'Sin Asignar (CHH Base)';
                const chhVal = worker ? worker.chh : 35.82;
                const subtotal = proc.time * chhVal;

                totalMO += subtotal;
                tiempoTotalHoras += proc.time;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="border border-slate-300 p-2 text-left font-bold text-blue-950">${proc.name} (${proc.machine})</td>
                    <td class="border border-slate-300 p-2 text-left">${workerName}</td>
                    <td class="border border-slate-300 p-2">${proc.time} hrs</td>
                    <td class="border border-slate-300 p-2">$${chhVal.toFixed(2)}</td>
                    <td class="border border-slate-300 p-2 font-bold">$${subtotal.toFixed(2)}</td>`;
                tbodyMO.appendChild(tr);
            });
        }

        document.getElementById('lbl-cedula-total-mo').innerText = `$${totalMO.toFixed(2)}`;
    }

    // 3. RENDER GIF (PRORRATEADO)
    const totalGIF = tiempoTotalHoras * cuotaPorHora;
    document.getElementById('lbl-cedula-gif-tasa').innerText = `$${cuotaPorHora.toFixed(2)} / hr`;
    document.getElementById('lbl-cedula-gif-tiempo').innerText = `${tiempoTotalHoras.toFixed(2)} hrs`;
    document.getElementById('lbl-cedula-total-gif').innerText = `$${totalGIF.toFixed(2)}`;

    // METRICAS DE APUNTES
    const costoPrimo = totalMP + totalMO;
    const costoTransformacion = totalMO + totalGIF;
    const costoFinal = totalMP + totalMO + totalGIF;

    document.getElementById('lbl-costo-primo').innerText = `$${costoPrimo.toFixed(2)} MXN`;
    document.getElementById('lbl-costo-transformacion').innerText = `$${costoTransformacion.toFixed(2)} MXN`;
    document.getElementById('lbl-cedula-costo-final').innerText = `$${costoFinal.toFixed(2)} MXN`;

    // REGENERAR CÓDIGO QR INDUSTRIAL CON LA INFORMACIÓN DEL COSTO
    const qrContainer = document.getElementById('qrcode-container');
    if (qrContainer && window.QRCode) {
        qrContainer.innerHTML = '';
        const qrData = `OptiCost ERP | Cédula Validada: ${key.toUpperCase()} | Costo Total Unitario: $${costoFinal.toFixed(2)} MXN (MP: $${totalMP.toFixed(2)}, MO: $${totalMO.toFixed(2)}, GIF: $${totalGIF.toFixed(2)}) | Fecha: ${new Date().toLocaleDateString()}`;
        new QRCode(qrContainer, {
            text: qrData,
            width: 64,
            height: 64,
            colorDark : "#0f172a",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }
};

// FIRESTORE Y CONTROLADORES
async function loadProductsFromFirebase() {
    try {
        const querySnapshot = await window.fs.getDocs(window.fs.collection(window.db, "productos"));
        state.products = [];
        querySnapshot.forEach((doc) => {
            state.products.push({ id: doc.id, ...doc.data() });
        });

        updateProductDropdowns();

        for (const p of state.products) {
            await loadMovementsFromFirebase(p.id);
        }

        renderAllCards();
        actualizarCedulaProducto();
    } catch (error) {
        console.error("Error al cargar productos:", error);
    }
}

async function loadWorkersFromFirebase() {
    try {
        const querySnapshot = await window.fs.getDocs(window.fs.collection(window.db, "trabajadores"));
        state.workers = [];
        const tbody = document.getElementById('workers-table-body');
        if (tbody) tbody.innerHTML = '';

        querySnapshot.forEach((doc) => {
            const w = { id: doc.id, ...doc.data() };
            state.workers.push(w);

            if (tbody) {
                const tr = document.createElement('tr');
                tr.className = "border-b border-slate-300 whitespace-nowrap"; // Mantiene las celdas en una sola línea
                tr.innerHTML = `
                    <td class="p-2 border font-bold text-left">${w.name}</td>
                    <td class="p-2 border text-slate-600">${w.startDate || 'No registrada'}</td>
                    <td class="p-2 border bg-slate-50">${w.tipoJornada || 'Diurna'} (${w.jornada || 8}h)</td>
                    <td class="p-2 border bg-slate-50 font-semibold">${w.diasVacaciones !== undefined ? w.diasVacaciones : 12}</td>
                    <td class="p-2 border bg-slate-50 text-red-600 font-semibold">${w.faltas || 0}</td>
                    <td class="p-2 border bg-slate-50 text-slate-500">${w.diasLibresLey || 59}</td>
                    <td class="p-2 border bg-blue-50 font-black text-blue-900">${w.diasLab !== undefined ? w.diasLab : 302}</td>
                    <td class="p-2 border">$${w.dailyWage.toFixed(2)}</td>
                    <td class="p-2 border">$${w.sueldoAnual.toFixed(2)}</td>
                    <td class="p-2 border">$${w.subtotalLey.toFixed(2)}</td>
                    <td class="p-2 border">$${w.cargasPatronales.toFixed(2)}</td>
                    <td class="p-2 border text-slate-500 font-semibold">$${w.salarioIntegradoAnual.toFixed(2)}</td>
                    <td class="p-2 border bg-slate-100 font-bold">$${w.salarioIntegradoDiario.toFixed(2)}</td>
                    <td class="p-2 border bg-emerald-100 text-emerald-900 font-extrabold">$${w.chh.toFixed(2)}</td>`;
                tbody.appendChild(tr);
            }
        });

        renderProcesosModule();
        actualizarCedulaProducto();
    } catch (error) {
        console.error("Error al cargar trabajadores:", error);
    }
}

async function loadProcessesFromFirebase() {
    try {
        const querySnapshot = await window.fs.getDocs(window.fs.collection(window.db, "procesos"));
        state.processes = [];
        querySnapshot.forEach((doc) => {
            state.processes.push({ id: doc.id, ...doc.data() });
        });

        renderProcesosModule();
        actualizarCedulaProducto();
    } catch (error) {
        console.error("Error al cargar procesos:", error);
    }
}

async function loadMovementsFromFirebase(productId) {
    try {
        const q = window.fs.query(
            window.fs.collection(window.db, "movimientos"), 
            window.fs.where("productId", "==", productId)
        );
        const querySnapshot = await window.fs.getDocs(q);
        
        state.movements[productId] = [];
        querySnapshot.forEach((doc) => {
            state.movements[productId].push(doc.data());
        });

        state.movements[productId].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    } catch (error) {
        console.error("Error al cargar movimientos:", error);
    }
}

function updateProductDropdowns() {
    const movProductSelect = document.getElementById('mov-product');
    if (!movProductSelect) return;

    movProductSelect.innerHTML = '';
    state.products.forEach(p => {
        movProductSelect.add(new Option(`${p.name}`, p.id));
    });
}

async function renderAllCards() {
    const container = document.getElementById('cards-container');
    if (!container) return;

    if (state.products.length === 0) {
        container.innerHTML = `<div class="p-6 text-center border border-dashed border-slate-300 rounded-lg bg-slate-50"><p class="text-sm text-slate-500">No hay insumos ni tarjetas registradas.</p></div>`;
        return;
    }

    container.innerHTML = '';

    for (const product of state.products) {
        if (!state.movements[product.id]) {
            await loadMovementsFromFirebase(product.id);
        }

        const productWithGlobalMethod = { ...product, metodo: state.globalMethod };
        const rawMovements = state.movements[product.id] || [];
        const { rows, totalDebe, totalHaber, saldoFinal } = InventoryEngine.processMovements(productWithGlobalMethod, rawMovements);

        const cardWrapper = document.createElement('div');
        cardWrapper.className = "border border-slate-300 rounded-xl overflow-hidden shadow-sm bg-white mb-6";

        let rowsHTML = '';
        rows.forEach(r => {
            rowsHTML += `
                <tr class="${r.isSubRow ? 'row-sub border-b border-slate-200' : 'row-main border-b border-slate-300'}">
                    <td class="border border-slate-300 p-2">${r.fecha}</td>
                    <td class="border border-slate-300 p-2">${r.ref}</td>
                    <td class="border border-slate-300 p-2 text-left">${r.concepto}</td>
                    <td class="border border-slate-300 p-2 font-semibold">${r.entradas}</td>
                    <td class="border border-slate-300 p-2 text-red-700 font-semibold">${r.salidas}</td>
                    <td class="border border-slate-300 p-2 font-bold">${r.existencia} ${product.unit}</td>
                    <td class="border border-slate-300 p-2">${r.costoUnitario ? '$' + r.costoUnitario : ''}</td>
                    <td class="border border-slate-300 p-2">${r.debe ? '$' + r.debe : ''}</td>
                    <td class="border border-slate-300 p-2">${r.haber ? '$' + r.haber : ''}</td>
                    <td class="border border-slate-300 p-2 font-bold text-blue-950">$${r.saldo}</td>
                </tr>`;
        });

        cardWrapper.innerHTML = `
            <div class="bg-slate-100 px-4 py-3 border-b border-slate-300 flex justify-between items-center">
                <div>
                    <h3 class="font-bold text-base text-blue-950">${product.name}</h3>
                    <p class="text-xs text-slate-500">Unidad: <span class="font-semibold text-slate-700">${product.unit}</span></p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="px-2.5 py-1 bg-blue-950 text-white font-bold text-xs rounded-lg">${state.globalMethod}</span>
                    <button onclick="window.print()" class="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded-lg transition font-bold">Imprimir</button>
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full border-collapse border border-slate-300 text-xs text-center">
                    <thead class="bg-blue-950 text-white font-bold">
                        <tr>
                            <th class="border border-slate-300 p-2">Fecha</th>
                            <th class="border border-slate-300 p-2">Ref</th>
                            <th class="border border-slate-300 p-2">Concepto</th>
                            <th class="border border-slate-300 p-2">Entradas</th>
                            <th class="border border-slate-300 p-2">Salidas</th>
                            <th class="border border-slate-300 p-2">Existencia</th>
                            <th class="border border-slate-300 p-2">Cto Ut</th>
                            <th class="border border-slate-300 p-2">Debe</th>
                            <th class="border border-slate-300 p-2">Haber</th>
                            <th class="border border-slate-300 p-2">Saldo</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">${rowsHTML || '<tr><td colspan="10" class="p-3 text-slate-400">Sin movimientos registrados</td></tr>'}</tbody>
                    <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
                        <tr>
                            <td colspan="7" class="border border-slate-300 p-2 text-right">TOTALES / SALDO FINAL:</td>
                            <td class="border border-slate-300 p-2 text-blue-950">$${totalDebe.toFixed(2)}</td>
                            <td class="border border-slate-300 p-2 text-blue-950">$${totalHaber.toFixed(2)}</td>
                            <td class="border border-slate-300 p-2 text-blue-950 font-black">$${saldoFinal.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;

        container.appendChild(cardWrapper);
    }
}

function calcularDiasVacaciones(fechaIngreso) {
    const hoy = new Date();
    const ingreso = new Date(fechaIngreso);
    let antiguedad = hoy.getFullYear() - ingreso.getFullYear();
    
    const mes = hoy.getMonth() - ingreso.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < ingreso.getDate())) {
        antiguedad--;
    }

    if (antiguedad < 1) return 0;
    if (antiguedad === 1) return 12;
    if (antiguedad === 2) return 14;
    if (antiguedad === 3) return 16;
    if (antiguedad === 4) return 18;
    if (antiguedad === 5) return 20;
    return 22 + Math.floor((antiguedad - 6) / 5) * 2;
}

function calculateWorkerCHH(dailyWage, fechaIngreso, tipoJornada, faltas) {
    let jornada = 8;
    if (tipoJornada === 'Nocturna') jornada = 7;
    if (tipoJornada === 'Mixta') jornada = 7.5;

    // Cálculo de Días (Descontando fines de semana, festivos, vacaciones y faltas)
    const diasVacaciones = calcularDiasVacaciones(fechaIngreso);
    const diasAnuales = 365;
    const domingos = 52;
    const diasFestivos = 7; 
    const diasLibresLey = domingos + diasFestivos; // 59 días libres garantizados
    
    const diasLab = diasAnuales - diasLibresLey - diasVacaciones - faltas;
    
    // Matemática Contable
    const sueldoAnual = dailyWage * 365;
    const aguinaldo = dailyWage * 15;
    const primaVacacional = (dailyWage * diasVacaciones) * 0.25; 
    const subtotalLey = sueldoAnual + aguinaldo + primaVacacional;

    const comedorAnual = 48 * 19.83 * 12;
    const valesAnual = 1200 * 12;
    const eqSeguridad = 1720;

    const cargasPatronales = subtotalLey * 0.14;
    const salarioIntegradoAnual = subtotalLey + comedorAnual + valesAnual + cargasPatronales + eqSeguridad;

    const salarioIntegradoDiario = salarioIntegradoAnual / diasLab;
    const chh = salarioIntegradoDiario / jornada;

    return { 
        sueldoAnual, subtotalLey, cargasPatronales, salarioIntegradoAnual, 
        salarioIntegradoDiario, chh, diasLab, diasVacaciones, tipoJornada, faltas, jornada, diasLibresLey 
    };
}

document.getElementById('worker-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('wrk-name').value;
    const startDate = document.getElementById('wrk-date').value;
    const dailyWage = parseFloat(document.getElementById('wrk-wage').value);
    const tipoJornada = document.getElementById('wrk-jornada').value;
    const faltas = parseInt(document.getElementById('wrk-faltas').value) || 0;

    const calc = calculateWorkerCHH(dailyWage, startDate, tipoJornada, faltas);
    const newWorker = { name, startDate, dailyWage, ...calc, createdAt: new Date() };

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "trabajadores"), newWorker);
        document.getElementById('worker-form').reset();
        await loadWorkersFromFirebase();
    } catch (error) {
        console.error("Error al guardar trabajador:", error);
    }
});