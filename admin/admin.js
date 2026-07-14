const page = document.currentScript.dataset.page;

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 401) {
    window.location.href = '/admin/login';
    throw new Error('No autenticado');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const money = (value) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
const CATEGORIES = ['Pantalones', 'Poleras', 'Accesorios'];

// ---------------- LOGIN PAGE ----------------
if (page === 'login') {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const formData = new FormData(form);
    try {
      const res = await fetch('/admin/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: formData.get('username'), password: formData.get('password') })
      });
      const body = await res.json();
      if (!res.ok) {
        errorEl.textContent = body.error || 'No se pudo iniciar sesión';
        errorEl.hidden = false;
        return;
      }
      window.location.href = '/admin';
    } catch (err) {
      errorEl.textContent = 'Error de conexión con el servidor';
      errorEl.hidden = false;
    }
  });
}

// ---------------- DASHBOARD PAGE ----------------
if (page === 'dashboard') {
  const navLinks = document.querySelectorAll('.admin-nav__link');
  const sections = document.querySelectorAll('.admin-section');

  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('is-active'));
      sections.forEach(s => s.classList.remove('is-active'));
      link.classList.add('is-active');
      document.getElementById(`section-${link.dataset.section}`).classList.add('is-active');
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/admin/api/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  });

  // ----- Session check + username -----
  api('/admin/api/me').then(me => {
    if (me.authenticated) document.getElementById('adminUsername').textContent = me.username;
  });

  // ----- Summary + chart -----
  let chart;

  async function loadAnalytics() {
    let summary, series;
    try {
      [summary, series] = await Promise.all([
        api('/admin/api/analytics/summary'),
        api('/admin/api/analytics/series?days=30')
      ]);
    } catch (err) {
      console.error('No se pudo cargar el resumen', err);
      ['statVisits30', 'statPurchases30', 'statRevenue30', 'statConversion'].forEach(id => {
        document.getElementById(id).textContent = 'Error';
      });
      return;
    }

    document.getElementById('statVisits30').textContent = summary.visits30.toLocaleString('es-ES');
    document.getElementById('statVisits7').textContent = `${summary.visits7.toLocaleString('es-ES')} últimos 7 días`;
    document.getElementById('statPurchases30').textContent = summary.purchases30.toLocaleString('es-ES');
    document.getElementById('statPurchases7').textContent = `${summary.purchases7.toLocaleString('es-ES')} últimos 7 días`;
    document.getElementById('statRevenue30').textContent = money(summary.revenue30);
    document.getElementById('statConversion').textContent =
      summary.conversionRate30 === null ? 'N/D' : `${summary.conversionRate30}%`;

    const ctx = document.getElementById('analyticsChart');
    const labels = series.visits.map(v => v.date.slice(5));
    const visitData = series.visits.map(v => v.count);
    const purchaseData = series.purchases.map(p => p.count);

    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Visitas',
            data: visitData,
            borderColor: '#1c2a33',
            backgroundColor: 'rgba(28,42,51,0.08)',
            tension: 0.35,
            fill: true,
            pointRadius: 0
          },
          {
            label: 'Compras (demo)',
            data: purchaseData,
            borderColor: '#c2542c',
            backgroundColor: 'rgba(194,84,44,0.12)',
            tension: 0.35,
            fill: true,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  loadAnalytics();

  // ----- Product comparison -----
  // Paleta categórica validada (CVD-safe) para distinguir productos en el
  // gráfico de torta — no es el acento de marca porque ahí la función del
  // color es identidad (qué producto es), no magnitud.
  const PRODUCT_PIE_COLORS = ['#2a78d6', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948', '#eda100'];

  let productBarChart;
  let productPieChart;

  function renderProductCharts(products) {
    const barCtx = document.getElementById('productBarChart');
    const pieCtx = document.getElementById('productPieChart');
    const labels = products.map(p => p.name);
    const unitsData = products.map(p => p.unitsSold);
    const totalUnits = unitsData.reduce((sum, n) => sum + n, 0);

    if (productBarChart) productBarChart.destroy();
    productBarChart = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Unidades vendidas',
          data: unitsData,
          backgroundColor: 'rgba(194,84,44,0.75)',
          hoverBackgroundColor: 'rgba(194,84,44,0.95)',
          borderRadius: 6,
          barThickness: 22
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Unidades vendidas por producto', align: 'start', font: { size: 13 }, color: '#5b6670', padding: { bottom: 12 } }
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,0.06)' } },
          y: { grid: { display: false } }
        }
      }
    });

    if (productPieChart) productPieChart.destroy();
    productPieChart = new Chart(pieCtx, {
      type: 'pie',
      data: {
        labels: labels.map((name, i) => {
          const pct = totalUnits ? Math.round((unitsData[i] / totalUnits) * 100) : 0;
          return `${name} (${pct}%)`;
        }),
        datasets: [{
          data: unitsData,
          backgroundColor: PRODUCT_PIE_COLORS,
          borderColor: '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
          title: { display: true, text: 'Reparto de gustos (% de unidades)', align: 'start', font: { size: 13 }, color: '#5b6670', padding: { bottom: 12 } }
        }
      }
    });
  }

  async function loadProductPerformance() {
    const days = document.getElementById('productDaysFilter').value;
    let products;
    try {
      products = await api(`/admin/api/analytics/products?days=${days}`);
    } catch (err) {
      console.error('No se pudo cargar la comparación de productos', err);
      document.querySelector('#productPerfTable tbody').innerHTML = '<tr><td colspan="5">No se pudo cargar la información.</td></tr>';
      return;
    }

    const tbody = document.querySelector('#productPerfTable tbody');
    tbody.innerHTML = products.map((p, i) => `
      <tr>
        <td>
          ${p.name}
          ${p.active === false ? ' <span class="badge badge--off">Oculto</span>' : ''}
          ${i === 0 ? ' <span class="badge badge--on">Más vendido</span>' : ''}
        </td>
        <td>${p.category}</td>
        <td>${p.unitsSold.toLocaleString('es-ES')}</td>
        <td>${money(p.revenue)}</td>
        <td>${p.revenueShare}%</td>
      </tr>
    `).join('') || '<tr><td colspan="5">Sin ventas en este período.</td></tr>';

    renderProductCharts(products);
  }

  document.getElementById('productDaysFilter').addEventListener('change', loadProductPerformance);
  loadProductPerformance();

  // ----- Generic modal helper -----
  const modal = document.getElementById('modal');
  const modalForm = document.getElementById('modalForm');
  const modalFields = document.getElementById('modalFields');
  const modalTitle = document.getElementById('modalTitle');
  let onSubmit = null;

  function openModal(title, fields, initialValues, submitHandler, onRender) {
    modalTitle.textContent = title;
    modalFields.innerHTML = '';
    fields.forEach(field => {
      const label = document.createElement('label');
      label.dataset.field = field.name;
      const value = initialValues && initialValues[field.name] !== undefined ? initialValues[field.name] : '';
      if (field.type === 'checkbox') {
        label.className = 'checkbox-row';
        label.innerHTML = `<input type="checkbox" name="${field.name}" ${value ? 'checked' : ''}> ${field.label}`;
      } else if (field.type === 'select') {
        const opts = field.options.map(o => {
          const optLabel = (field.optionLabels && field.optionLabels[o]) || o;
          return `<option value="${o}" ${String(o) === String(value) ? 'selected' : ''}>${optLabel}</option>`;
        }).join('');
        label.innerHTML = `${field.label}<select name="${field.name}">${opts}</select>`;
      } else if (field.type === 'textarea') {
        label.innerHTML = `${field.label}<textarea name="${field.name}" rows="3">${value}</textarea>`;
      } else if (field.type === 'image') {
        label.innerHTML = `
          ${field.label}
          <span class="image-field">
            <span class="image-field__preview" data-image-preview>${value ? `<img src="${value}" alt="">` : '<span class="image-field__empty">Sin imagen</span>'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-image-upload>
            <input type="hidden" name="${field.name}" value="${value}">
          </span>
        `;
      } else {
        label.innerHTML = `${field.label}<input type="${field.type}" name="${field.name}" value="${value}" ${field.step ? `step="${field.step}"` : ''} ${field.required ? 'required' : ''}>`;
      }
      modalFields.appendChild(label);
    });

    modalFields.querySelectorAll('[data-image-upload]').forEach(fileInput => {
      const preview = fileInput.previousElementSibling;
      const hiddenInput = fileInput.nextElementSibling;
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        preview.innerHTML = '<span class="image-field__empty">Subiendo…</span>';
        try {
          const formData = new FormData();
          formData.append('image', file);
          const res = await fetch('/admin/api/products/upload', { method: 'POST', credentials: 'same-origin', body: formData });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || 'No se pudo subir la imagen');
          hiddenInput.value = body.url;
          preview.innerHTML = `<img src="${body.url}" alt="">`;
        } catch (err) {
          preview.innerHTML = '<span class="image-field__empty">Sin imagen</span>';
          alert(err.message);
        }
      });
    });

    onSubmit = submitHandler;
    modal.hidden = false;
    if (onRender) onRender(modalFields, initialValues);
  }

  function closeModal() {
    modal.hidden = true;
    onSubmit = null;
  }

  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', closeModal);

  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(modalForm);
    const values = {};
    modalFields.querySelectorAll('[name]').forEach(input => {
      values[input.name] = input.type === 'checkbox' ? input.checked : input.value;
    });
    if (onSubmit) {
      try {
        await onSubmit(values);
        closeModal();
      } catch (err) {
        alert(err.message || 'No se pudo guardar. Intenta de nuevo.');
      }
    }
  });

  // ----- Products -----
  const PRODUCT_FIELDS = [
    { name: 'image', label: 'Imagen del producto', type: 'image' },
    { name: 'name', label: 'Nombre', type: 'text', required: true },
    { name: 'description', label: 'Descripción', type: 'textarea' },
    { name: 'price', label: 'Precio (EUR)', type: 'number', step: '0.01', required: true },
    { name: 'stock', label: 'Stock disponible', type: 'number', step: '1', required: true },
    { name: 'category', label: 'Categoría', type: 'select', options: CATEGORIES },
    { name: 'tag', label: 'Etiqueta (ej. Nuevo, Más vendido)', type: 'text' },
    { name: 'active', label: 'Producto activo (visible en la tienda)', type: 'checkbox' }
  ];

  function stockBadge(stock) {
    if (stock <= 0) return `<span class="badge badge--off">Agotado</span>`;
    if (stock <= 5) return `<span class="badge badge--warn">Bajo: ${stock}</span>`;
    return stock.toLocaleString('es-ES');
  }

  async function loadProducts() {
    let products;
    try {
      products = await api('/admin/api/products');
    } catch (err) {
      console.error('No se pudieron cargar los productos', err);
      document.querySelector('#productsTable tbody').innerHTML = '<tr><td colspan="8">No se pudo cargar la información.</td></tr>';
      return;
    }
    const tbody = document.querySelector('#productsTable tbody');
    tbody.innerHTML = products.map(p => `
      <tr data-id="${p.id}">
        <td>${p.image ? `<img class="product-thumb" src="${p.image}" alt="">` : '<span class="product-thumb product-thumb--empty"></span>'}</td>
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td>${money(p.price)}</td>
        <td>${stockBadge(p.stock || 0)}</td>
        <td>${p.tag || '—'}</td>
        <td><span class="badge ${p.active ? 'badge--on' : 'badge--off'}">${p.active ? 'Activo' : 'Oculto'}</span></td>
        <td class="actions">
          <button class="btn btn--ghost btn--sm" data-edit="${p.id}">Editar</button>
          <button class="btn btn--danger btn--sm" data-delete="${p.id}">Eliminar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8">Sin productos todavía.</td></tr>';

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const product = products.find(p => p.id === Number(btn.dataset.edit));
        openModal('Editar producto', PRODUCT_FIELDS, product, async (values) => {
          await api(`/admin/api/products/${product.id}`, { method: 'PUT', body: JSON.stringify(values) });
          loadProducts();
        });
      });
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este producto?')) return;
        await api(`/admin/api/products/${btn.dataset.delete}`, { method: 'DELETE' });
        loadProducts();
      });
    });
  }

  document.getElementById('newProductBtn').addEventListener('click', () => {
    openModal('Nuevo producto', PRODUCT_FIELDS, { active: true, category: 'Pantalones', stock: 0 }, async (values) => {
      await api('/admin/api/products', { method: 'POST', body: JSON.stringify(values) });
      loadProducts();
    });
  });

  loadProducts();

  // ----- Discounts -----
  const DISCOUNT_SCOPE_LABELS = { all: 'Todo el sitio', category: 'Una categoría', product: 'Un producto específico' };
  const DISCOUNT_FIELDS = [
    { name: 'code', label: 'Código', type: 'text', required: true },
    { name: 'description', label: 'Descripción', type: 'text' },
    { name: 'percent', label: 'Porcentaje de descuento', type: 'number', required: true },
    { name: 'scope', label: 'Aplica a', type: 'select', options: ['all', 'category', 'product'], optionLabels: DISCOUNT_SCOPE_LABELS },
    { name: 'scopeValue', label: 'Categoría o producto', type: 'select', options: [] },
    { name: 'expiresAt', label: 'Vence (opcional)', type: 'date' },
    { name: 'active', label: 'Descuento activo', type: 'checkbox' }
  ];

  // Muestra/oculta y repuebla el select "Categoría o producto" según lo que
  // se elija en "Aplica a". Se vuelve a llamar cada vez que cambia el scope.
  function wireDiscountScopeField(fields, initialValues, products) {
    const scopeSelect = fields.querySelector('[name=scope]');
    const scopeValueSelect = fields.querySelector('[name=scopeValue]');
    const scopeValueLabel = scopeValueSelect.closest('label');
    let preselect = initialValues ? initialValues.scopeValue : '';

    function refresh() {
      const scope = scopeSelect.value;
      let options = [];
      if (scope === 'category') options = CATEGORIES.map(c => ({ value: c, label: c }));
      if (scope === 'product') options = products.map(p => ({ value: String(p.id), label: p.name }));
      scopeValueSelect.innerHTML = options
        .map(o => `<option value="${o.value}" ${String(o.value) === String(preselect) ? 'selected' : ''}>${o.label}</option>`)
        .join('');
      scopeValueLabel.style.display = scope === 'all' ? 'none' : '';
    }

    scopeSelect.addEventListener('change', () => { preselect = null; refresh(); });
    refresh();
  }

  function discountScopeLabel(d, productById) {
    const scope = d.scope || 'all';
    if (scope === 'all') return 'Todo el sitio';
    if (scope === 'category') return `Categoría: ${d.scopeValue || '—'}`;
    if (scope === 'product') return `Producto: ${productById[d.scopeValue] || d.scopeValue || '—'}`;
    return '—';
  }

  async function loadDiscounts() {
    let discounts, products;
    try {
      [discounts, products] = await Promise.all([
        api('/admin/api/discounts'),
        api('/admin/api/products')
      ]);
    } catch (err) {
      console.error('No se pudieron cargar los descuentos', err);
      document.querySelector('#discountsTable tbody').innerHTML = '<tr><td colspan="6">No se pudo cargar la información.</td></tr>';
      return;
    }
    const productById = Object.fromEntries(products.map(p => [String(p.id), p.name]));

    const tbody = document.querySelector('#discountsTable tbody');
    tbody.innerHTML = discounts.map(d => `
      <tr data-id="${d.id}">
        <td>${d.code}</td>
        <td>${discountScopeLabel(d, productById)}</td>
        <td>${d.percent}%</td>
        <td>${d.expiresAt ? new Date(d.expiresAt).toLocaleDateString('es-ES') : '—'}</td>
        <td><span class="badge ${d.active ? 'badge--on' : 'badge--off'}">${d.active ? 'Activo' : 'Inactivo'}</span></td>
        <td class="actions">
          <button class="btn btn--ghost btn--sm" data-edit="${d.id}">Editar</button>
          <button class="btn btn--danger btn--sm" data-delete="${d.id}">Eliminar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6">Sin descuentos todavía.</td></tr>';

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const discount = discounts.find(d => d.id === Number(btn.dataset.edit));
        openModal('Editar descuento', DISCOUNT_FIELDS, { ...discount, scope: discount.scope || 'all' }, async (values) => {
          await api(`/admin/api/discounts/${discount.id}`, { method: 'PUT', body: JSON.stringify(values) });
          loadDiscounts();
        }, (fields, initialValues) => wireDiscountScopeField(fields, initialValues, products));
      });
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este descuento?')) return;
        await api(`/admin/api/discounts/${btn.dataset.delete}`, { method: 'DELETE' });
        loadDiscounts();
      });
    });

    document.getElementById('newDiscountBtn').onclick = () => {
      openModal('Nuevo descuento', DISCOUNT_FIELDS, { active: true, scope: 'all' }, async (values) => {
        await api('/admin/api/discounts', { method: 'POST', body: JSON.stringify(values) });
        loadDiscounts();
      }, (fields, initialValues) => wireDiscountScopeField(fields, initialValues, products));
    };
  }

  loadDiscounts();

  // ----- Branches -----
  const BRANCH_FIELDS = [
    { name: 'name', label: 'Nombre', type: 'text', required: true },
    { name: 'address', label: 'Dirección', type: 'text' },
    { name: 'active', label: 'Sucursal activa', type: 'checkbox' }
  ];

  let branchesCache = [];

  function populateBranchFilter() {
    const select = document.getElementById('acctBranchFilter');
    const current = select.value;
    select.innerHTML = '<option value="">Todas las sucursales</option>' +
      branchesCache.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    select.value = current;
  }

  async function loadBranches() {
    try {
      branchesCache = await api('/admin/api/branches');
    } catch (err) {
      console.error('No se pudieron cargar las sucursales', err);
      document.querySelector('#branchesTable tbody').innerHTML = '<tr><td colspan="4">No se pudo cargar la información.</td></tr>';
      return;
    }
    const tbody = document.querySelector('#branchesTable tbody');
    tbody.innerHTML = branchesCache.map(b => `
      <tr data-id="${b.id}">
        <td>${b.name}${b.type === 'online' ? ' <span class="badge badge--on">En línea</span>' : ''}</td>
        <td>${b.address || '—'}</td>
        <td><span class="badge ${b.active ? 'badge--on' : 'badge--off'}">${b.active ? 'Activa' : 'Inactiva'}</span></td>
        <td class="actions">
          <button class="btn btn--ghost btn--sm" data-edit="${b.id}">Editar</button>
          ${b.type === 'online' ? '' : `<button class="btn btn--danger btn--sm" data-delete="${b.id}">Eliminar</button>`}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4">Sin sucursales todavía.</td></tr>';

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const branch = branchesCache.find(b => b.id === Number(btn.dataset.edit));
        openModal('Editar sucursal', BRANCH_FIELDS, branch, async (values) => {
          await api(`/admin/api/branches/${branch.id}`, { method: 'PUT', body: JSON.stringify(values) });
          await loadBranches();
        });
      });
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta sucursal?')) return;
        try {
          await api(`/admin/api/branches/${btn.dataset.delete}`, { method: 'DELETE' });
          await loadBranches();
        } catch (err) {
          alert(err.message);
        }
      });
    });

    populateBranchFilter();
  }

  document.getElementById('newBranchBtn').addEventListener('click', () => {
    openModal('Nueva sucursal', BRANCH_FIELDS, { active: true }, async (values) => {
      await api('/admin/api/branches', { method: 'POST', body: JSON.stringify(values) });
      await loadBranches();
    });
  });

  // ----- Accounting -----
  let accountingCategories = { income: [], expense: [] };

  function transactionFields() {
    return [
      {
        name: 'branchId', label: 'Sucursal', type: 'select',
        options: branchesCache.map(b => String(b.id)),
        optionLabels: Object.fromEntries(branchesCache.map(b => [String(b.id), b.name]))
      },
      { name: 'type', label: 'Tipo', type: 'select', options: ['income', 'expense'], optionLabels: { income: 'Ingreso', expense: 'Gasto' } },
      { name: 'category', label: 'Categoría', type: 'select', options: accountingCategories.income },
      { name: 'description', label: 'Descripción', type: 'text' },
      { name: 'amount', label: 'Monto (EUR)', type: 'number', step: '0.01', required: true },
      {
        name: 'method', label: 'Medio de pago', type: 'select',
        options: ['efectivo', 'transferencia', 'tarjeta', 'paypal'],
        optionLabels: { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', paypal: 'PayPal' }
      },
      { name: 'reference', label: 'N° de operación bancaria (opcional)', type: 'text' },
      { name: 'date', label: 'Fecha', type: 'date', required: true }
    ];
  }

  // Repuebla el select de categoría según el tipo elegido (ingreso/gasto),
  // mismo patrón que el scope de descuentos.
  function wireTransactionTypeField(fields, initialValues) {
    const typeSelect = fields.querySelector('[name=type]');
    const categorySelect = fields.querySelector('[name=category]');
    let preselect = initialValues ? initialValues.category : '';

    function refresh() {
      const list = typeSelect.value === 'expense' ? accountingCategories.expense : accountingCategories.income;
      categorySelect.innerHTML = list.map(c => `<option value="${c}" ${c === preselect ? 'selected' : ''}>${c}</option>`).join('');
    }

    typeSelect.addEventListener('change', () => { preselect = null; refresh(); });
    refresh();
  }

  function currentAccountingFilters() {
    const branchId = document.getElementById('acctBranchFilter').value;
    const days = document.getElementById('acctDaysFilter').value;
    const from = new Date(Date.now() - Number(days) * 86400000).toISOString().slice(0, 10);
    return { branchId, days, from };
  }

  function renderCategoryBreakdown(byCategory) {
    const income = byCategory.filter(c => c.type === 'income');
    const expense = byCategory.filter(c => c.type === 'expense');
    const list = (items, cls) => items.map(c => `
      <div class="category-row"><span>${c.category}</span><span class="${cls}">${money(c.amount)}</span></div>
    `).join('') || '<p class="chart-card__note">Sin datos.</p>';

    document.getElementById('categoryBreakdownBody').innerHTML = `
      <div><h4>Ingresos</h4>${list(income, 'stat-card--income')}</div>
      <div><h4>Gastos</h4>${list(expense, 'stat-card--expense')}</div>
    `;
  }

  const TRANSACTIONS_PAGE_SIZE = 50;
  let transactionsCache = [];
  let transactionsPage = 0;

  function renderTransactionsTable() {
    const branchById = Object.fromEntries(branchesCache.map(b => [b.id, b.name]));
    const start = transactionsPage * TRANSACTIONS_PAGE_SIZE;
    const pageItems = transactionsCache.slice(start, start + TRANSACTIONS_PAGE_SIZE);

    const tbody = document.querySelector('#transactionsTable tbody');
    tbody.innerHTML = pageItems.map(t => `
      <tr data-id="${t.id}">
        <td>${new Date(t.date).toLocaleDateString('es-ES')}</td>
        <td>${branchById[t.branchId] || '—'}</td>
        <td><span class="badge ${t.type === 'income' ? 'badge--on' : 'badge--off'}">${t.type === 'income' ? 'Ingreso' : 'Gasto'}</span></td>
        <td>${t.category}</td>
        <td>${t.description || '—'}</td>
        <td class="${t.type === 'income' ? 'stat-card--income' : 'stat-card--expense'}">${t.type === 'income' ? '+' : '−'} ${money(t.amount)}</td>
        <td>${t.reference || '—'}</td>
        <td class="actions">
          <button class="btn btn--ghost btn--sm" data-edit="${t.id}">Editar</button>
          <button class="btn btn--danger btn--sm" data-delete="${t.id}">Eliminar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8">Sin movimientos en este período.</td></tr>';

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const transaction = transactionsCache.find(t => t.id === Number(btn.dataset.edit));
        openModal('Editar movimiento', transactionFields(), { ...transaction, branchId: String(transaction.branchId) }, async (values) => {
          await api(`/admin/api/transactions/${transaction.id}`, { method: 'PUT', body: JSON.stringify(values) });
          loadTransactions();
        }, (fields, initialValues) => wireTransactionTypeField(fields, initialValues));
      });
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este movimiento?')) return;
        await api(`/admin/api/transactions/${btn.dataset.delete}`, { method: 'DELETE' });
        loadTransactions();
      });
    });

    renderTransactionsPager();
  }

  function renderTransactionsPager() {
    const total = transactionsCache.length;
    const totalPages = Math.max(1, Math.ceil(total / TRANSACTIONS_PAGE_SIZE));
    const start = total ? transactionsPage * TRANSACTIONS_PAGE_SIZE + 1 : 0;
    const end = Math.min(total, (transactionsPage + 1) * TRANSACTIONS_PAGE_SIZE);

    document.getElementById('transactionsPagerInfo').textContent =
      total ? `Mostrando ${start}–${end} de ${total} movimientos` : 'Sin movimientos en este período.';
    document.getElementById('transactionsPrevBtn').disabled = transactionsPage === 0;
    document.getElementById('transactionsNextBtn').disabled = transactionsPage >= totalPages - 1;
  }

  document.getElementById('transactionsPrevBtn').addEventListener('click', () => {
    if (transactionsPage > 0) {
      transactionsPage--;
      renderTransactionsTable();
    }
  });
  document.getElementById('transactionsNextBtn').addEventListener('click', () => {
    const totalPages = Math.ceil(transactionsCache.length / TRANSACTIONS_PAGE_SIZE);
    if (transactionsPage < totalPages - 1) {
      transactionsPage++;
      renderTransactionsTable();
    }
  });

  let acctChart;
  function renderAccountingChart(series) {
    const ctx = document.getElementById('acctChart');
    const labels = series.map(s => s.date.slice(5));
    if (acctChart) acctChart.destroy();
    acctChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Ingresos', data: series.map(s => s.income), backgroundColor: 'rgba(30,107,52,0.65)', borderRadius: 4 },
          { label: 'Gastos', data: series.map(s => s.expenses), backgroundColor: 'rgba(178,58,58,0.65)', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  let acctProductChart;

  function renderAccountingProductChart(products) {
    const ctx = document.getElementById('acctProductChart');
    const labels = products.map(p => p.name);
    const revenueData = products.map(p => p.revenue);

    if (acctProductChart) acctProductChart.destroy();
    if (!products.length) return;

    acctProductChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Ingresos por producto',
          data: revenueData,
          backgroundColor: 'rgba(194,84,44,0.75)',
          borderRadius: 6,
          barThickness: 22
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { callback: (v) => money(v) }, grid: { color: 'rgba(0,0,0,0.06)' } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  async function loadTransactions({ resetPage = false } = {}) {
    const { branchId, days, from } = currentAccountingFilters();

    const txParams = new URLSearchParams({ from });
    if (branchId) txParams.set('branchId', branchId);

    const summaryParams = new URLSearchParams({ days });
    if (branchId) summaryParams.set('branchId', branchId);

    let transactions, summary, series, productPerformance;
    try {
      [transactions, summary, series, productPerformance] = await Promise.all([
        api(`/admin/api/transactions?${txParams}`),
        api(`/admin/api/accounting/summary?${summaryParams}`),
        api(`/admin/api/accounting/series?${summaryParams}`),
        api(`/admin/api/analytics/products?days=${days}`)
      ]);
    } catch (err) {
      console.error('No se pudo cargar la contabilidad', err);
      document.querySelector('#transactionsTable tbody').innerHTML = '<tr><td colspan="8">No se pudo cargar la información.</td></tr>';
      document.getElementById('transactionsPagerInfo').textContent = 'Error al cargar.';
      return;
    }

    transactionsCache = transactions;
    if (resetPage) transactionsPage = 0;
    const maxPage = Math.max(0, Math.ceil(transactionsCache.length / TRANSACTIONS_PAGE_SIZE) - 1);
    if (transactionsPage > maxPage) transactionsPage = maxPage;

    document.getElementById('acctIncome').textContent = money(summary.income);
    document.getElementById('acctExpenses').textContent = money(summary.expenses);
    const netEl = document.getElementById('acctNet');
    netEl.textContent = money(summary.net);
    netEl.className = summary.net >= 0 ? 'net-positive' : 'net-negative';

    document.getElementById('branchBreakdownBody').innerHTML = summary.byBranch.map(b => `
      <tr>
        <td>${b.branchName}</td>
        <td class="stat-card--income">${money(b.income)}</td>
        <td class="stat-card--expense">${money(b.expenses)}</td>
        <td class="${b.net >= 0 ? 'net-positive' : 'net-negative'}">${money(b.net)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">Sin movimientos en este período.</td></tr>';

    renderCategoryBreakdown(summary.byCategory);
    renderTransactionsTable();
    renderAccountingChart(series);
    renderAccountingProductChart(productPerformance);
  }

  document.getElementById('newTransactionBtn').addEventListener('click', () => {
    openModal('Nuevo movimiento', transactionFields(), {
      type: 'income',
      branchId: branchesCache[0] ? String(branchesCache[0].id) : '',
      method: 'efectivo',
      date: new Date().toISOString().slice(0, 10)
    }, async (values) => {
      await api('/admin/api/transactions', { method: 'POST', body: JSON.stringify(values) });
      loadTransactions({ resetPage: true });
    }, (fields, initialValues) => wireTransactionTypeField(fields, initialValues));
  });

  document.getElementById('acctBranchFilter').addEventListener('change', () => loadTransactions({ resetPage: true }));
  document.getElementById('acctDaysFilter').addEventListener('change', () => loadTransactions({ resetPage: true }));

  document.getElementById('exportTransactionsBtn').addEventListener('click', async () => {
    const { branchId, from } = currentAccountingFilters();
    const params = new URLSearchParams({ from });
    if (branchId) params.set('branchId', branchId);
    const transactions = await api(`/admin/api/transactions?${params}`);
    const branchById = Object.fromEntries(branchesCache.map(b => [b.id, b.name]));

    const rows = [['Fecha', 'Sucursal', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'N° operación']];
    transactions.forEach(t => rows.push([
      t.date, branchById[t.branchId] || '', t.type === 'income' ? 'Ingreso' : 'Gasto', t.category, t.description || '', t.amount, t.reference || ''
    ]));
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rawgat-movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  loadBranches()
    .then(() => api('/admin/api/accounting/categories'))
    .then(categories => {
      accountingCategories = categories;
      loadTransactions();
    })
    .catch(err => {
      console.error('No se pudo cargar la contabilidad', err);
      document.querySelector('#transactionsTable tbody').innerHTML = '<tr><td colspan="8">No se pudo cargar la información.</td></tr>';
    });

  // Mantiene el resumen, la contabilidad y el stock al día sin recargar la
  // página. Se salta la actualización mientras hay un modal abierto para no
  // interrumpir una edición en curso.
  setInterval(() => {
    if (!modal.hidden) return;
    const activeId = document.querySelector('.admin-section.is-active')?.id;
    if (activeId === 'section-resumen') {
      loadAnalytics();
      loadProductPerformance();
    } else if (activeId === 'section-contabilidad') {
      loadTransactions();
    } else if (activeId === 'section-productos') {
      loadProducts();
    }
  }, 30000);
}
