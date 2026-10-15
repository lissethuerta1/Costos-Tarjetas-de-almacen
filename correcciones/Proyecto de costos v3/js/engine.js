class InventoryEngine {

    static processMovements(product, rawMovements) {
        let existencias = 0;
        let saldo = 0;
        let capas = []; 

        const renderedRows = [];
        let totalDebe = 0;
        let totalHaber = 0;

        for (const mov of rawMovements) {
            if (mov.tipo === 'ENTRADA') {
                existencias += mov.cantidad;
                const debeRow = Number((mov.cantidad * mov.costoUnitario).toFixed(2));
                saldo += debeRow;
                totalDebe += debeRow;

                capas.push({ cantidad: mov.cantidad, costo: mov.costoUnitario });

                renderedRows.push({
                    isSubRow: false,
                    fecha: mov.fecha,
                    ref: mov.ref,
                    concepto: mov.concepto,
                    entradas: mov.cantidad,
                    salidas: '',
                    existencia: existencias,
                    costoUnitario: mov.costoUnitario.toFixed(2),
                    debe: debeRow.toFixed(2),
                    haber: '',
                    saldo: saldo.toFixed(2)
                });

            } else if (mov.tipo === 'SALIDA') {
    if (mov.cantidad > existencias) {
        alert(`Operación denegada: Stock insuficiente (${existencias} ${product.unit} disponibles).`);
        continue;
    }

    if (product.metodo === 'PROMEDIO') {
        const costoPromedio = Number((saldo / existencias).toFixed(2));
        existencias -= mov.cantidad;
        const haberRow = Number((mov.cantidad * costoPromedio).toFixed(2));
        saldo = Number((saldo - haberRow).toFixed(2));
        totalHaber += haberRow;

        renderedRows.push({
            isSubRow: false,
            fecha: mov.fecha,
            ref: mov.ref,
            concepto: mov.concepto,
            entradas: '',
            salidas: mov.cantidad,
            existencia: existencias,
            costoUnitario: costoPromedio.toFixed(2),
            debe: '',
            haber: haberRow.toFixed(2),
            saldo: saldo.toFixed(2)
        });

    } else if (product.metodo === 'PEPS' || product.metodo === 'UEPS') {
        let cantidadPendiente = mov.cantidad;
        let esPrimerRenglon = true;

        // Procesar capa por capa hasta cubrir la cantidad de la salida
        while (cantidadPendiente > 0 && capas.length > 0) {
            const index = product.metodo === 'PEPS' ? 0 : capas.length - 1;
            const capaActual = capas[index];

            // Determinar cuántas unidades se toman de la capa actual
            const unidadesAgotadas = Math.min(capaActual.cantidad, cantidadPendiente);
            
            // Actualizar stock de la capa y pendiente global
            capaActual.cantidad -= unidadesAgotadas;
            cantidadPendiente -= unidadesAgotadas;
            existencias -= unidadesAgotadas;

            // Cálculos monetarios del tramo
            const haberSub = Number((unidadesAgotadas * capaActual.costo).toFixed(2));
            saldo = Number((saldo - haberSub).toFixed(2));
            totalHaber += haberSub;

            // Generar la fila (la primera mantiene los datos del documento; las subfilas indican el costo del lote)
            renderedRows.push({
                isSubRow: !esPrimerRenglon,
                fecha: esPrimerRenglon ? mov.fecha : '',
                ref: esPrimerRenglon ? mov.ref : '',
                concepto: esPrimerRenglon ? mov.concepto : `(Restante a Lote $${capaActual.costo.toFixed(2)})`,
                entradas: '',
                salidas: unidadesAgotadas,
                existencia: existencias,
                costoUnitario: capaActual.costo.toFixed(2),
                debe: '',
                haber: haberSub.toFixed(2),
                saldo: saldo.toFixed(2)
            });

            esPrimerRenglon = false;

            // Si la capa quedó en 0, se elimina del arreglo para pasar a la siguiente
            if (capaActual.cantidad === 0) {
                capas.splice(index, 1);
            }
        }
    }
}

            saldo = Number(saldo.toFixed(2));
        }

        return { rows: renderedRows, totalDebe, totalHaber, saldoFinal: saldo };
    }
}