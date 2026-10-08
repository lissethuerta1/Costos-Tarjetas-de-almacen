const state = {
    user: null,
    products: [],
    workers: [],
    processes: [],
    movements: {},
    globalMethod: 'PEPS'
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
        if (badge) badge.innerText = `Método Activo: ${state.globalMethod}`;
        
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

    // 4. ALTA DE INSUMO
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

    // 6. REGISTRO DE PROCESOS/ESTACIONES
    document.getElementById('process-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('proc-name').value.trim();
        const machine = document.getElementById('proc-machine').value.trim();
        const time = parseFloat(document.getElementById('proc-time').value);

        const newProc = {
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

// NAVEGACIÓN DE MÓDULOS
window.switchModule = function(moduleName) {
    ['config', 'mp', 'mo', 'procesos', 'reportes'].forEach(m => {
        const mod = document.getElementById(`module-${m}`);
        if (mod) mod.classList.add('hidden');
        
        const btn = document.getElementById(`nav-${m}`);
        if (btn) btn.className = "px-3 py-1.5 text-xs font-bold rounded transition text-blue-200 hover:text-white";
    });

    const activeMod = document.getElementById(`module-${moduleName}`);
    if (activeMod) activeMod.classList.remove('hidden');

    const activeBtn = document.getElementById(`nav-${moduleName}`);
    if (activeBtn) activeBtn.className = "px-3 py-1.5 text-xs font-bold rounded transition bg-blue-800 text-white";

    if (moduleName === 'procesos') renderProcesosModule();
    if (moduleName === 'reportes') actualizarCedulaProducto();
};

// MÓDULO DE PROCESOS: RENDERIZADO Y ASIGNACIÓN
function renderProcesosModule() {
    const container = document.getElementById('procesos-list-container');
    if (!container) return;

    if (state.processes.length === 0) {
        container.innerHTML = `<p class="col-span-2 text-center text-slate-400 p-4 border border-dashed rounded">No hay procesos o estaciones registradas.</p>`;
        return;
    }

    let htmlOperadoresOpts = '<option value="">-- Sin Operador Asignado --</option>';
    state.workers.forEach(w => {
        htmlOperadoresOpts += `<option value="${w.id}">${w.name} (CHH: $${w.chh.toFixed(2)})</option>`;
    });

    let htmlCards = '';
    state.processes.forEach((proc, index) => {
        let opts = htmlOperadoresOpts;
        if (proc.assignedWorkerId) {
            opts = opts.replace(`value="${proc.assignedWorkerId}"`, `value="${proc.assignedWorkerId}" selected`);
        }

        htmlCards += `
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <div class="flex justify-between items-center border-b pb-2">
                    <div>
                        <span class="font-bold text-blue-900 text-sm">${index + 1}. ${proc.name}</span>
                        <p class="text-[10px] text-slate-500">Máquina: ${proc.machine}</p>
                    </div>
                    <span class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">${proc.time} hrs</span>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Operador / Puesto Asignado:</label>
                    <select onchange="asignarTrabajadorProceso('${proc.id}', this.value)" class="w-full p-2 border rounded text-xs bg-white text-slate-800 font-semibold">
                        ${opts}
                    </select>
                </div>
            </div>`;
    });

    container.innerHTML = htmlCards;
}

window.asignarTrabajadorProceso = function(processId, workerId) {
    const proc = state.processes.find(p => p.id === processId);
    if (proc) {
        proc.assignedWorkerId = workerId || null;
        actualizarCedulaProducto();
    }
};

// CÉDULA DE INTEGRACIÓN DINÁMICA
window.actualizarCedulaProducto = function() {
    const selectElem = document.getElementById('select-producto-costeo');
    if (!selectElem) return;

    const key = selectElem.value;

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
            { nombre: "Armazón de Acetato", tipo: "MPD", cantidadTexto: "1 Pza", factor: 1.0, ctoUnit: getCostoMP(["Armazón", "Acetato"], 85.00) },
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

    // 1. RENDER MATERIA PRIMA
    const tbodyMP = document.getElementById('tb-cedula-mp');
    let totalMP = 0;
    if (tbodyMP) {
        tbodyMP.innerHTML = '';
        const listMP = recetasMP[key] || [];

        listMP.forEach(item => {
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

        const lblMP = document.getElementById('lbl-cedula-total-mp');
        if (lblMP) lblMP.innerText = `$${totalMP.toFixed(2)}`;
    }

    // 2. RENDER MANO DE OBRA CON PROCESOS Y TRABAJADORES
    const tbodyMO = document.getElementById('tb-cedula-mo');
    let totalMO = 0;

    if (tbodyMO) {
        tbodyMO.innerHTML = '';

        if (state.processes.length === 0) {
            tbodyMO.innerHTML = `<tr><td colspan="5" class="p-3 text-slate-400">No hay procesos configurados. Ve al módulo "Procesos y Operadores".</td></tr>`;
        } else {
            state.processes.forEach(proc => {
                const worker = state.workers.find(w => w.id === proc.assignedWorkerId);
                const workerName = worker ? worker.name : '<span class="text-amber-600 font-semibold">Sin Asignar (CHH Base)</span>';
                const chhVal = worker ? worker.chh : 35.82;
                const subtotal = proc.time * chhVal;
                totalMO += subtotal;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="border border-slate-300 p-2 text-left font-bold text-blue-900">${proc.name} (${proc.machine})</td>
                    <td class="border border-slate-300 p-2 text-left">${workerName}</td>
                    <td class="border border-slate-300 p-2">${proc.time} hrs</td>
                    <td class="border border-slate-300 p-2">$${chhVal.toFixed(2)}</td>
                    <td class="border border-slate-300 p-2 font-bold">$${subtotal.toFixed(2)}</td>`;
                tbodyMO.appendChild(tr);
            });
        }

        const lblMO = document.getElementById('lbl-cedula-total-mo');
        if (lblMO) lblMO.innerText = `$${totalMO.toFixed(2)}`;
    }

    // 3. RESUMEN COSTO FINAL
    const costoFinal = totalMP + totalMO;
    const lblCostoFinal = document.getElementById('lbl-cedula-costo-final');
    if (lblCostoFinal) lblCostoFinal.innerText = `$${costoFinal.toFixed(2)} MXN`;
};

// FIRESTORE: CARGA Y PERSISTENCIA
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
                tr.className = "border-b border-slate-300";
                tr.innerHTML = `
                    <td class="p-2 border font-bold text-left">${w.name}</td>
                    <td class="p-2 border">$${w.dailyWage.toFixed(2)}</td>
                    <td class="p-2 border">$${w.sueldoAnual.toFixed(2)}</td>
                    <td class="p-2 border">$${w.subtotalLey.toFixed(2)}</td>
                    <td class="p-2 border">$${w.cargasPatronales.toFixed(2)}</td>
                    <td class="p-2 border">$${w.salarioIntegradoAnual.toFixed(2)}</td>
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
        cardWrapper.className = "border border-slate-300 rounded-lg overflow-hidden shadow-sm bg-white mb-6";

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
                    <td class="border border-slate-300 p-2 font-bold text-blue-900">$${r.saldo}</td>
                </tr>`;
        });

        cardWrapper.innerHTML = `
            <div class="bg-slate-100 px-4 py-3 border-b border-slate-300 flex justify-between items-center">
                <div>
                    <h3 class="font-bold text-base text-blue-900">${product.name}</h3>
                    <p class="text-xs text-slate-500">Unidad de Medida: <span class="font-semibold text-slate-700">${product.unit}</span></p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="px-2.5 py-1 bg-blue-900 text-white font-bold text-xs rounded">${state.globalMethod}</span>
                    <button onclick="window.print()" class="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded transition">Imprimir</button>
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full border-collapse border border-slate-300 text-xs text-center">
                    <thead class="bg-blue-900 text-white font-bold">
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
                            <td class="border border-slate-300 p-2 text-blue-900">$${totalDebe.toFixed(2)}</td>
                            <td class="border border-slate-300 p-2 text-blue-900">$${totalHaber.toFixed(2)}</td>
                            <td class="border border-slate-300 p-2 text-blue-900 font-extrabold">$${saldoFinal.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;

        container.appendChild(cardWrapper);
    }
}

function calculateWorkerCHH(dailyWage) {
    const diasLab = 302;
    const jornada = 8;
    
    const sueldoAnual = dailyWage * 365;
    const aguinaldo = dailyWage * 15;
    const primaVacacional = (dailyWage * 12) * 0.25;
    const subtotalLey = sueldoAnual + aguinaldo + primaVacacional;

    const comedorAnual = 48 * 19.83 * 12;
    const valesAnual = 1200 * 12;
    const eqSeguridad = 1720;

    const cargasPatronales = subtotalLey * 0.14;
    const salarioIntegradoAnual = subtotalLey + comedorAnual + valesAnual + cargasPatronales + eqSeguridad;

    const salarioIntegradoDiario = salarioIntegradoAnual / diasLab;
    const chh = salarioIntegradoDiario / jornada;

    return { sueldoAnual, subtotalLey, cargasPatronales, salarioIntegradoAnual, salarioIntegradoDiario, chh };
}

document.getElementById('worker-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('wrk-name').value;
    const startDate = document.getElementById('wrk-date').value;
    const dailyWage = parseFloat(document.getElementById('wrk-wage').value);

    const calc = calculateWorkerCHH(dailyWage);
    const newWorker = { name, startDate, dailyWage, ...calc, createdAt: new Date() };

    try {
        await window.fs.addDoc(window.fs.collection(window.db, "trabajadores"), newWorker);
        document.getElementById('worker-form').reset();
        await loadWorkersFromFirebase();
    } catch (error) {
        console.error("Error al guardar trabajador:", error);
    }
});

// ESCÁNER QR
let html5QrCode = null;
let isScannerActive = false;

window.toggleCameraScanner = function() {
    const wrapper = document.getElementById('scanner-wrapper');
    const btn = document.getElementById('toggle-scanner-btn');

    if (!isScannerActive) {
        wrapper?.classList.remove('hidden');
        if (btn) {
            btn.innerText = "Cerrar Cámara Escáner";
            btn.className = "bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-3 py-2 rounded transition";
        }

        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onCodeScanned
        ).catch(err => console.error("Error cámara:", err));

        isScannerActive = true;
    } else {
        stopScanner();
    }
};

function stopScanner() {
    if (html5QrCode && isScannerActive) {
        html5QrCode.stop().then(() => {
            document.getElementById('scanner-wrapper')?.classList.add('hidden');
            const btn = document.getElementById('toggle-scanner-btn');
            if (btn) {
                btn.innerText = "Activar Cámara Escáner";
                btn.className = "bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-3 py-2 rounded transition";
            }
            isScannerActive = false;
        });
    }
}

function onCodeScanned(decodedText) {
    try {
        const data = JSON.parse(decodedText);

        if (data.type === "PRODUCTO") {
            document.getElementById('prod-name').value = data.name || '';
            document.getElementById('prod-unit').value = data.unit || '';
            alert(`Insumo detectado: ${data.name}.`);

        } else if (data.type === "FACTURA" || data.ref) {
            const targetProd = state.products.find(p => p.name.toLowerCase() === (data.productName || '').toLowerCase());
            if (targetProd) document.getElementById('mov-product').value = targetProd.id;

            document.getElementById('mov-date').value = data.fecha || new Date().toISOString().split('T')[0];
            document.getElementById('mov-ref').value = data.ref || '';
            document.getElementById('mov-concept').value = data.concepto || '';
            document.getElementById('mov-type').value = data.tipo || 'ENTRADA';
            document.getElementById('mov-qty').value = data.cantidad || 0;

            if (data.tipo === 'ENTRADA') {
                const costInput = document.getElementById('mov-cost');
                const costContainer = document.getElementById('cost-container');
                costContainer?.classList.remove('opacity-40', 'pointer-events-none');
                if (costInput) costInput.value = data.costo || 0;
            }

            alert(`Factura detectada (${data.ref}). Se autocompletaron los datos.`);
        }
    } catch (e) {
        const prodInput = document.getElementById('prod-name');
        if (prodInput) prodInput.value = decodedText;
    }
    stopScanner();
}