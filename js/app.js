const state = {
    user: null,
    products: [],
    movements: {}
};

let currentMethodFilter = 'TODOS';

document.addEventListener('DOMContentLoaded', () => {
    // Autenticación Sencilla
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;

        if (user === 'admin' && pass === '1234') {
            state.user = user;
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
            loadProductsFromFirebase();
        } else {
            document.getElementById('login-error').classList.remove('hidden');
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => location.reload());

    // Ocultar campo costo en salidas
    const movTypeSelect = document.getElementById('mov-type');
    const costContainer = document.getElementById('cost-container');
    movTypeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'SALIDA') {
            costContainer.classList.add('opacity-40', 'pointer-events-none');
            document.getElementById('mov-cost').removeAttribute('required');
        } else {
            costContainer.classList.remove('opacity-40', 'pointer-events-none');
            document.getElementById('mov-cost').setAttribute('required', 'true');
        }
    });

    // Alta de Producto guardando en Firebase
    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newProduct = {
            name: document.getElementById('prod-name').value,
            unit: document.getElementById('prod-unit').value,
            metodo: document.getElementById('prod-method').value,
            createdAt: new Date()
        };

        try {
            const docRef = await window.fs.addDoc(window.fs.collection(window.db, "productos"), newProduct);
            const productWithId = { id: docRef.id, ...newProduct };
            
            state.products.push(productWithId);
            state.movements[docRef.id] = [];
            
            document.getElementById('product-form').reset();
            updateProductDropdowns();
            renderAllCards();
        } catch (error) {
            console.error("Error al guardar producto:", error);
            alert("No se pudo guardar el producto en la base de datos.");
        }
    });

    // Registro de Movimiento guardando en Firebase
    document.getElementById('movement-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const prodId = document.getElementById('mov-product').value;
        if (!prodId) return alert("Selecciona un producto.");

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
        } catch (error) {
            console.error("Error al guardar movimiento:", error);
            alert("No se pudo registrar el movimiento.");
        }
    });

    // Selector manual para filtrado rápido por producto específico
    document.getElementById('card-selector').addEventListener('change', (e) => {
        renderAllCards(e.target.value);
    });
});

// Lectura de productos desde Firestore
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
    } catch (error) {
        console.error("Error al cargar productos desde Firebase:", error);
    }
}

// Lectura de movimientos desde Firestore
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

// Filtrado por pestañas de método
window.filterCards = function(metodo) {
    currentMethodFilter = metodo;

    ['TODOS', 'PEPS', 'UEPS', 'PROMEDIO'].forEach(m => {
        const btn = document.getElementById(`tab-${m}`);
        if (btn) {
            if (m === metodo) {
                btn.className = "px-3 py-1.5 font-bold text-xs rounded bg-blue-900 text-white transition";
            } else {
                btn.className = "px-3 py-1.5 font-bold text-xs rounded text-slate-600 hover:text-blue-900 transition";
            }
        }
    });

    updateProductDropdowns();
    renderAllCards();
};

function updateProductDropdowns() {
    const movProductSelect = document.getElementById('mov-product');
    const cardSelector = document.getElementById('card-selector');

    movProductSelect.innerHTML = '';
    cardSelector.innerHTML = '<option value="ALL">-- Ver Todos los Productos --</option>';

    state.products.forEach(p => {
        movProductSelect.add(new Option(`${p.name} (${p.metodo})`, p.id));
    });

    const filteredProducts = currentMethodFilter === 'TODOS'
        ? state.products
        : state.products.filter(p => p.metodo === currentMethodFilter);

    filteredProducts.forEach(p => {
        cardSelector.add(new Option(`${p.name} (${p.metodo})`, p.id));
    });
}

// Renderiza MÚLTIPLES TARJETAS en pantalla
async function renderAllCards(singleProductId = null) {
    const container = document.getElementById('cards-container');
    if (!container) return;

    let productsToRender = currentMethodFilter === 'TODOS'
        ? state.products
        : state.products.filter(p => p.metodo === currentMethodFilter);

    if (singleProductId && singleProductId !== 'ALL') {
        productsToRender = productsToRender.filter(p => p.id === singleProductId);
    }

    if (productsToRender.length === 0) {
        container.innerHTML = `
            <div class="p-6 text-center border border-dashed border-slate-300 rounded-lg bg-slate-50">
                <p class="text-sm text-slate-500">No hay tarjetas de almacén registradas bajo el método <strong>${currentMethodFilter}</strong>.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';

    for (const product of productsToRender) {
        if (!state.movements[product.id]) {
            await loadMovementsFromFirebase(product.id);
        }

        const rawMovements = state.movements[product.id] || [];
        const { rows, totalDebe, totalHaber, saldoFinal } = InventoryEngine.processMovements(product, rawMovements);

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
                    <span class="px-2.5 py-1 bg-blue-900 text-white font-bold text-xs rounded">${product.metodo}</span>
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
                    <tbody class="divide-y divide-slate-200">
                        ${rowsHTML || '<tr><td colspan="10" class="p-3 text-slate-400">Sin movimientos registrados</td></tr>'}
                    </tbody>
                    <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
                        <tr>
                            <td colspan="7" class="border border-slate-300 p-2 text-right">TOTALES / SALDO FINAL:</td>
                            <td class="border border-slate-300 p-2 text-blue-900">$${totalDebe.toFixed(2)}</td>
                            <td class="border border-slate-300 p-2 text-blue-900">$${totalHaber.toFixed(2)}</td>
                            <td class="border border-slate-300 p-2 text-blue-900 font-extrabold">$${saldoFinal.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        container.appendChild(cardWrapper);
    }
}

// LÓGICA DEL ESCÁNER CÁMARA WEBCAM
let html5QrCode = null;
let isScannerActive = false;

window.toggleCameraScanner = function() {
    const wrapper = document.getElementById('scanner-wrapper');
    const btn = document.getElementById('toggle-scanner-btn');

    if (!isScannerActive) {
        wrapper.classList.remove('hidden');
        btn.innerText = "Cerrar Cámara Escáner";
        btn.className = "bg-red-700 hover:bg-red-800 text-white font-bold text-xs px-3 py-2 rounded transition";

        html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onCodeScanned
        ).catch(err => {
            console.error("Error al iniciar cámara:", err);
            alert("No se pudo acceder a la cámara web.");
        });

        isScannerActive = true;
    } else {
        stopScanner();
    }
};

function stopScanner() {
    if (html5QrCode && isScannerActive) {
        html5QrCode.stop().then(() => {
            document.getElementById('scanner-wrapper').classList.add('hidden');
            const btn = document.getElementById('toggle-scanner-btn');
            btn.innerText = "Activar Cámara Escáner";
            btn.className = "bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs px-3 py-2 rounded transition";
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
            document.getElementById('prod-method').value = data.metodo || 'PEPS';
            alert(`Producto detectado: ${data.name}. Revisa y guarda los datos.`);

        } else if (data.type === "FACTURA" || data.ref) {
            const targetProd = state.products.find(p => p.name.toLowerCase() === (data.productName || '').toLowerCase());

            if (targetProd) {
                document.getElementById('mov-product').value = targetProd.id;
            }

            document.getElementById('mov-date').value = data.fecha || new Date().toISOString().split('T')[0];
            document.getElementById('mov-ref').value = data.ref || '';
            document.getElementById('mov-concept').value = data.concepto || '';
            document.getElementById('mov-type').value = data.tipo || 'ENTRADA';
            document.getElementById('mov-qty').value = data.cantidad || 0;

            if (data.tipo === 'ENTRADA') {
                const costInput = document.getElementById('mov-cost');
                const costContainer = document.getElementById('cost-container');
                costContainer.classList.remove('opacity-40', 'pointer-events-none');
                costInput.value = data.costo || 0;
            }

            alert(`Factura detectada (${data.ref}). Se autocompletaron los campos del movimiento.`);
        }

    } catch (e) {
        document.getElementById('prod-name').value = decodedText;
        alert(`Código de producto detectado: ${decodedText}`);
    }

    stopScanner();
}