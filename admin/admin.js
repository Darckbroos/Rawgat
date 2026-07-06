const page = document.currentScript.dataset.page;

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 401) {
    window.location.href = '/admin/login.html';
    throw new Error('No autenticado');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const money = (value) => `$${Number(value || 0).toLocaleString('es-CL')}`;

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
    window.location.href = '/admin/login.html';
  });

  // ----- Session check + username -----
  api('/admin/api/me').then(me => {
    if (me.authenticated) document.getElementById('adminUsername').textContent = me.username;
  });

  // ----- Summary + chart -----
  let chart;

  async function loadAnalytics() {
    const [summary, series] = await Promise.all([
      api('/admin/api/analytics/summary'),
      api('/admin/api/analytics/series?days=30')
    ]);

    document.getElementById('statVisits30').textContent = summary.visits30.toLocaleString('es-CL');
    document.getElementById('statVisits7').textContent = `${summary.visits7.toLocaleString('es-CL')} últimos 7 días`;
    document.getElementById('statPurchases30').textContent = summary.purchases30.toLocaleString('es-CL');
    document.getElementById('statPurchases7').textContent = `${summary.purchases7.toLocaleString('es-CL')} últimos 7 días`;
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

  // ----- Generic modal helper -----
  const modal = document.getElementById('modal');
  const modalForm = document.getElementById('modalForm');
  const modalFields = document.getElementById('modalFields');
  const modalTitle = document.getElementById('modalTitle');
  let onSubmit = null;

  function openModal(title, fields, initialValues, submitHandler) {
    modalTitle.textContent = title;
    modalFields.innerHTML = '';
    fields.forEach(field => {
      const label = document.createElement('label');
      const value = initialValues && initialValues[field.name] !== undefined ? initialValues[field.name] : '';
      if (field.type === 'checkbox') {
        label.className = 'checkbox-row';
        label.innerHTML = `<input type="checkbox" name="${field.name}" ${value ? 'checked' : ''}> ${field.label}`;
      } else if (field.type === 'select') {
        label.innerHTML = `${field.label}<select name="${field.name}">${field.options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      } else if (field.type === 'textarea') {
        label.innerHTML = `${field.label}<textarea name="${field.name}" rows="3">${value}</textarea>`;
      } else {
        label.innerHTML = `${field.label}<input type="${field.type}" name="${field.name}" value="${value}" ${field.required ? 'required' : ''}>`;
      }
      modalFields.appendChild(label);
    });
    onSubmit = submitHandler;
    modal.hidden = false;
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
      await onSubmit(values);
      closeModal();
    }
  });

  // ----- Products -----
  const PRODUCT_FIELDS = [
    { name: 'name', label: 'Nombre', type: 'text', required: true },
    { name: 'description', label: 'Descripción', type: 'textarea' },
    { name: 'price', label: 'Precio (CLP)', type: 'number', required: true },
    { name: 'category', label: 'Categoría', type: 'select', options: ['Pantalones', 'Poleras', 'Accesorios'] },
    { name: 'tag', label: 'Etiqueta (ej. Nuevo, Más vendido)', type: 'text' },
    { name: 'active', label: 'Producto activo (visible en la tienda)', type: 'checkbox' }
  ];

  async function loadProducts() {
    const products = await api('/admin/api/products');
    const tbody = document.querySelector('#productsTable tbody');
    tbody.innerHTML = products.map(p => `
      <tr data-id="${p.id}">
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td>${money(p.price)}</td>
        <td>${p.tag || '—'}</td>
        <td><span class="badge ${p.active ? 'badge--on' : 'badge--off'}">${p.active ? 'Activo' : 'Oculto'}</span></td>
        <td class="actions">
          <button class="btn btn--ghost btn--sm" data-edit="${p.id}">Editar</button>
          <button class="btn btn--danger btn--sm" data-delete="${p.id}">Eliminar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6">Sin productos todavía.</td></tr>';

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
    openModal('Nuevo producto', PRODUCT_FIELDS, { active: true, category: 'Pantalones' }, async (values) => {
      await api('/admin/api/products', { method: 'POST', body: JSON.stringify(values) });
      loadProducts();
    });
  });

  loadProducts();

  // ----- Discounts -----
  const DISCOUNT_FIELDS = [
    { name: 'code', label: 'Código', type: 'text', required: true },
    { name: 'description', label: 'Descripción', type: 'text' },
    { name: 'percent', label: 'Porcentaje de descuento', type: 'number', required: true },
    { name: 'expiresAt', label: 'Vence (opcional)', type: 'date' },
    { name: 'active', label: 'Descuento activo', type: 'checkbox' }
  ];

  async function loadDiscounts() {
    const discounts = await api('/admin/api/discounts');
    const tbody = document.querySelector('#discountsTable tbody');
    tbody.innerHTML = discounts.map(d => `
      <tr data-id="${d.id}">
        <td>${d.code}</td>
        <td>${d.description || '—'}</td>
        <td>${d.percent}%</td>
        <td>${d.expiresAt ? new Date(d.expiresAt).toLocaleDateString('es-CL') : '—'}</td>
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
        openModal('Editar descuento', DISCOUNT_FIELDS, discount, async (values) => {
          await api(`/admin/api/discounts/${discount.id}`, { method: 'PUT', body: JSON.stringify(values) });
          loadDiscounts();
        });
      });
    });
    tbody.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este descuento?')) return;
        await api(`/admin/api/discounts/${btn.dataset.delete}`, { method: 'DELETE' });
        loadDiscounts();
      });
    });
  }

  document.getElementById('newDiscountBtn').addEventListener('click', () => {
    openModal('Nuevo descuento', DISCOUNT_FIELDS, { active: true }, async (values) => {
      await api('/admin/api/discounts', { method: 'POST', body: JSON.stringify(values) });
      loadDiscounts();
    });
  });

  loadDiscounts();
}
