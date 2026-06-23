(() => {
  const STORAGE_KEY = "erp_dataset_v1";

  const FILE_DEFS = {
    products: {
      label: "상품",
      filenames: ["products.csv"],
      columns: ["product_id", "product_name", "category", "brand", "unit_cost_krw", "unit_price_krw", "stock_qty", "status"],
      idCol: "product_id",
    },
    customers: {
      label: "고객",
      filenames: ["customers.csv"],
      columns: ["customer_id", "customer_name", "customer_type", "city", "phone", "email", "join_date", "tier"],
      idCol: "customer_id",
    },
    sales_orders: {
      label: "주문",
      filenames: ["sales_orders.csv"],
      columns: ["order_no", "customer_id", "order_date", "status", "channel", "payment_method", "total_amount_krw"],
      idCol: "order_no",
    },
    sales_order_items: {
      label: "주문상세",
      filenames: ["sales_order_items.csv"],
      columns: ["order_item_id", "order_no", "product_id", "qty", "unit_price_krw", "discount_pct", "amount_krw"],
      idCol: "order_item_id",
    },
  };

  const SAMPLE_FILES = {
    products: "erp_data/products.csv",
    customers: "erp_data/customers.csv",
    sales_orders: "erp_data/sales_orders.csv",
    sales_order_items: "erp_data/sales_order_items.csv",
  };

  function parseCSV(text) {
    const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
    if (!lines.length) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(",");
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = (values[idx] ?? "").trim();
      });
      rows.push(row);
    }
    return { headers, rows };
  }

  function detectType(filename, headers) {
    const base = String(filename || "").split(/[/\\]/).pop().toLowerCase().trim();

    for (const [type, def] of Object.entries(FILE_DEFS)) {
      if (def.filenames.some((f) => base === f.toLowerCase())) return type;
    }

    const nameRules = [
      ["sales_order_items", "sales_order_items"],
      ["order_items", "sales_order_items"],
      ["sales_orders", "sales_orders"],
      ["products", "products"],
      ["customers", "customers"],
      ["주문상세", "sales_order_items"],
      ["주문", "sales_orders"],
      ["상품", "products"],
      ["고객", "customers"],
    ];
    for (const [pattern, type] of nameRules) {
      if (base.includes(pattern)) return type;
    }

    if (headers?.length) {
      const cols = new Set(headers.map((h) => h.trim()));
      if (cols.has("order_item_id") && cols.has("order_no") && cols.has("product_id")) {
        return "sales_order_items";
      }
      if (cols.has("order_no") && cols.has("customer_id") && cols.has("total_amount_krw")) {
        return "sales_orders";
      }
      if (cols.has("product_id") && cols.has("unit_cost_krw") && cols.has("stock_qty")) {
        return "products";
      }
      if (cols.has("customer_id") && cols.has("customer_name") && cols.has("tier")) {
        return "customers";
      }
    }

    return null;
  }

  function isInt(v) {
    return /^-?\d+$/.test(v);
  }

  function isNumber(v) {
    return v !== "" && !Number.isNaN(Number(v));
  }

  function isDate(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  }

  function validateTable(type, parsed) {
    const def = FILE_DEFS[type];
    const errors = [];
    const warnings = [];
    const missingCols = def.columns.filter((c) => !parsed.headers.includes(c));
    if (missingCols.length) {
      errors.push(`필수 컬럼 누락: ${missingCols.join(", ")}`);
      return { ok: false, errors, warnings, rowCount: 0 };
    }

    const seenIds = new Set();
    parsed.rows.forEach((row, idx) => {
      const line = idx + 2;
      const id = row[def.idCol];
      if (!id) errors.push(`${line}행: ${def.idCol} 값이 비어 있습니다.`);
      else if (seenIds.has(id)) errors.push(`${line}행: ${def.idCol} 중복 (${id})`);
      else seenIds.add(id);

      if (type === "products") {
        ["unit_cost_krw", "unit_price_krw", "stock_qty"].forEach((c) => {
          if (!isNumber(row[c])) errors.push(`${line}행: ${c} 숫자 형식 오류`);
        });
      }
      if (type === "customers") {
        if (!isDate(row.join_date)) errors.push(`${line}행: join_date 형식 오류 (YYYY-MM-DD)`);
      }
      if (type === "sales_orders") {
        if (!isDate(row.order_date)) errors.push(`${line}행: order_date 형식 오류`);
        if (!isNumber(row.total_amount_krw)) errors.push(`${line}행: total_amount_krw 숫자 형식 오류`);
        if (!isInt(row.customer_id)) errors.push(`${line}행: customer_id 정수 형식 오류`);
      }
      if (type === "sales_order_items") {
        ["qty", "unit_price_krw", "discount_pct", "amount_krw"].forEach((c) => {
          if (!isNumber(row[c])) errors.push(`${line}행: ${c} 숫자 형식 오류`);
        });
      }
    });

    if (errors.length > 20) {
      warnings.push(`추가 오류 ${errors.length - 20}건이 더 있습니다.`);
      errors.length = 20;
    }

    return { ok: errors.length === 0, errors, warnings, rowCount: parsed.rows.length };
  }

  function validateIntegrity(data) {
    const errors = [];
    const customerIds = new Set(data.customers.rows.map((r) => r.customer_id));
    const productIds = new Set(data.products.rows.map((r) => r.product_id));
    const orderNos = new Set(data.sales_orders.rows.map((r) => r.order_no));

    let orphanCustomers = 0;
    data.sales_orders.rows.forEach((row) => {
      if (!customerIds.has(row.customer_id)) orphanCustomers++;
    });
    if (orphanCustomers) errors.push(`주문에 존재하지 않는 customer_id ${orphanCustomers}건`);

    let orphanOrders = 0;
    let orphanProducts = 0;
    data.sales_order_items.rows.forEach((row) => {
      if (!orderNos.has(row.order_no)) orphanOrders++;
      if (!productIds.has(row.product_id)) orphanProducts++;
    });
    if (orphanOrders) errors.push(`주문상세에 존재하지 않는 order_no ${orphanOrders}건`);
    if (orphanProducts) errors.push(`주문상세에 존재하지 않는 product_id ${orphanProducts}건`);

    return { ok: errors.length === 0, errors };
  }

  function validateAll(data) {
    const results = {};
    let allOk = true;
    for (const type of Object.keys(FILE_DEFS)) {
      const table = data[type];
      if (!table) {
        results[type] = { ok: false, errors: ["파일이 업로드되지 않았습니다."], warnings: [], rowCount: 0 };
        allOk = false;
        continue;
      }
      const r = validateTable(type, table);
      results[type] = r;
      if (!r.ok) allOk = false;
    }

    let integrity = { ok: true, errors: [] };
    if (allOk) {
      integrity = validateIntegrity(data);
      if (!integrity.ok) allOk = false;
    }

    return { ok: allOk, tables: results, integrity };
  }

  const DB_NAME = "erp_analytics_db";
  const DB_VERSION = 1;
  const STORE_NAME = "dataset";

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  async function saveDataset(data, validation) {
    const payload = { data, validation, savedAt: new Date().toISOString() };
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(payload, STORAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch { /* ignore */ }
    return payload;
  }

  async function loadDataset() {
    const load = async () => {
      try {
        const db = await openDB();
        const fromDb = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, "readonly");
          const req = tx.objectStore(STORE_NAME).get(STORAGE_KEY);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
        if (fromDb?.data) return fromDb;
      } catch { /* fallback below */ }

      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw || raw === "1") return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    };

    return Promise.race([
      load(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("IndexedDB load timeout")), 10000)),
    ]);
  }

  async function clearDataset() {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(STORAGE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch { /* ignore */ }
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function getRowCounts(data) {
    if (!data) return null;
    return {
      products: data.products?.rows?.length || 0,
      customers: data.customers?.rows?.length || 0,
      sales_orders: data.sales_orders?.rows?.length || 0,
      sales_order_items: data.sales_order_items?.rows?.length || 0,
    };
  }

  function formatKRW(n) {
    if (!Number.isFinite(n)) return "₩0";
    return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(Math.round(n));
  }

  function formatNum(n) {
    if (!Number.isFinite(n)) return "0";
    return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Math.round(n));
  }

  function formatPct(n) {
    if (!Number.isFinite(n)) return "0.0%";
    return `${(n * 100).toFixed(1)}%`;
  }

  function formatAxis(n) {
    if (!Number.isFinite(n)) return "0";
    const t = Math.abs(n);
    if (t >= 1e12) return `${(n / 1e12).toFixed(1)}조`;
    if (t >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
    if (t >= 1e4) return `${Math.round(n / 1e4)}만`;
    return formatNum(n);
  }

  function monthLabel(ym) {
    const [y, m] = ym.split("-");
    return y && m ? `${y.slice(2)}.${m}` : ym;
  }

  function monthSpan(start, end) {
    if (!start || !end) return 1;
    const [y1, m1] = start.split("-").map(Number);
    const [y2, m2] = end.split("-").map(Number);
    if (!y1 || !y2) return 1;
    return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
  }

  const INVALID_STATUS = new Set(["취소", "반품"]);

  function mapEntries(map) {
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }

  function marginLevel(m) {
    if (m >= 0.3) return "normal";
    if (m >= 0.2) return "warning";
    return "danger";
  }

  function rateLevel(rate, warn, danger) {
    if (rate >= danger) return "danger";
    if (rate >= warn) return "warning";
    return "normal";
  }

  function computeAnalytics(data) {
    const products = data.products.rows;
    const customers = data.customers.rows;
    const orders = data.sales_orders.rows;
    const items = data.sales_order_items.rows;

    const productMap = new Map(products.map((r) => [r.product_id, r]));
    const customerMap = new Map(customers.map((r) => [r.customer_id, r]));
    const orderMap = new Map(orders.map((r) => [r.order_no, r]));

    let totalRevenue = 0;
    let totalCogs = 0;
    let unitsSold = 0;
    let cancelledAmount = 0;
    let returnedAmount = 0;

    const monthlyMap = new Map();
    const categoryMap = new Map();
    const brandMap = new Map();
    const productSales = new Map();

    for (const item of items) {
      const order = orderMap.get(item.order_no);
      if (!order) continue;
      const product = productMap.get(item.product_id);
      const amount = Number(item.amount_krw);
      const qty = Number(item.qty);
      const cogs = qty * Number(product?.unit_cost_krw || 0);

      if (order.status === "취소") cancelledAmount += amount;
      if (order.status === "반품") returnedAmount += amount;
      if (INVALID_STATUS.has(order.status)) continue;

      totalRevenue += amount;
      totalCogs += cogs;
      unitsSold += qty;

      const month = order.order_date.slice(0, 7);
      const m = monthlyMap.get(month) || { month, revenue: 0, grossProfit: 0, orders: new Set() };
      m.revenue += amount;
      m.grossProfit += amount - cogs;
      m.orders.add(order.order_no);
      monthlyMap.set(month, m);

      const cat = product?.category || "미분류";
      const c = categoryMap.get(cat) || { category: cat, revenue: 0, cogs: 0, grossProfit: 0, units: 0 };
      c.revenue += amount;
      c.cogs += cogs;
      c.grossProfit += amount - cogs;
      c.units += qty;
      categoryMap.set(cat, c);

      const brand = product?.brand || "기타";
      brandMap.set(brand, (brandMap.get(brand) || 0) + amount);

      const ps = productSales.get(item.product_id) || { revenue: 0, units: 0, cogs: 0 };
      ps.revenue += amount;
      ps.units += qty;
      ps.cogs += cogs;
      productSales.set(item.product_id, ps);
    }

    const channelMap = new Map();
    const paymentMap = new Map();
    const tierMap = new Map();
    const typeMap = new Map();
    const cityMap = new Map();
    const statusMap = new Map();
    const customerSales = new Map();
    const activeCustomers = new Set();
    let validOrderCount = 0;
    let cancelCount = 0;
    let returnCount = 0;

    for (const order of orders) {
      statusMap.set(order.status, (statusMap.get(order.status) || 0) + 1);
      if (order.status === "취소") cancelCount++;
      if (order.status === "반품") returnCount++;
      if (INVALID_STATUS.has(order.status)) continue;

      validOrderCount++;
      const amount = Number(order.total_amount_krw);
      const customer = customerMap.get(order.customer_id);

      const ch = channelMap.get(order.channel) || { name: order.channel, revenue: 0, orders: 0 };
      ch.revenue += amount;
      ch.orders++;
      channelMap.set(order.channel, ch);

      const pm = paymentMap.get(order.payment_method) || { name: order.payment_method, revenue: 0, orders: 0 };
      pm.revenue += amount;
      pm.orders++;
      paymentMap.set(order.payment_method, pm);

      const tier = customer?.tier || "미상";
      tierMap.set(tier, (tierMap.get(tier) || 0) + amount);

      const ctype = customer?.customer_type || "미상";
      typeMap.set(ctype, (typeMap.get(ctype) || 0) + amount);

      const city = customer?.city || "미상";
      cityMap.set(city, (cityMap.get(city) || 0) + amount);

      const cs = customerSales.get(order.customer_id) || { revenue: 0, orders: 0 };
      cs.revenue += amount;
      cs.orders++;
      customerSales.set(order.customer_id, cs);
      activeCustomers.add(order.customer_id);
    }

    const orderDates = orders.map((o) => o.order_date).filter(Boolean).sort();
    const start = orderDates[0] || "";
    const end = orderDates[orderDates.length - 1] || "";
    const months = monthSpan(start, end);

    const grossProfit = totalRevenue - totalCogs;
    const grossMargin = totalRevenue > 0 ? grossProfit / totalRevenue : 0;
    const grossRevenue = totalRevenue + cancelledAmount + returnedAmount;
    const orderCount = orders.length;

    const monthly = [...monthlyMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        month: m.month,
        label: monthLabel(m.month),
        revenue: Math.round(m.revenue),
        grossProfit: Math.round(m.grossProfit),
        orders: m.orders.size,
      }));

    const categories = [...categoryMap.values()]
      .map((c) => ({
        ...c,
        revenue: Math.round(c.revenue),
        cogs: Math.round(c.cogs),
        grossProfit: Math.round(c.grossProfit),
        margin: c.revenue > 0 ? c.grossProfit / c.revenue : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const topProducts = [...productSales.entries()]
      .map(([id, s]) => {
        const p = productMap.get(id);
        const gp = s.revenue - s.cogs;
        return {
          productId: id,
          productName: p?.product_name || id,
          category: p?.category || "미분류",
          brand: p?.brand || "기타",
          revenue: Math.round(s.revenue),
          units: s.units,
          grossProfit: Math.round(gp),
          margin: s.revenue > 0 ? gp / s.revenue : 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const topCustomers = [...customerSales.entries()]
      .map(([id, s]) => {
        const c = customerMap.get(id);
        return {
          customerId: id,
          customerName: c?.customer_name || id,
          tier: c?.tier || "미상",
          type: c?.customer_type || "미상",
          city: c?.city || "미상",
          revenue: Math.round(s.revenue),
          orders: s.orders,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const stockRisks = [];
    for (const p of products) {
      const sales = productSales.get(p.product_id);
      const monthlyVelocity = months > 0 ? (sales?.units || 0) / months : 0;
      const coverMonths = monthlyVelocity > 0 ? Number(p.stock_qty) / monthlyVelocity : null;
      let level = "normal";
      let message = "정상";

      if (p.status === "단종") {
        if (Number(p.stock_qty) <= 0) continue;
        level = "warning";
        message = "단종 재고 소진 필요";
      } else if (coverMonths !== null) {
        if (coverMonths < 1) { level = "danger"; message = "재고 소진 임박"; }
        else if (coverMonths < 2) { level = "warning"; message = "재발주 검토"; }
      } else if (Number(p.stock_qty) === 0) {
        level = "danger";
        message = "품절";
      }

      if (level !== "normal") {
        stockRisks.push({
          productId: p.product_id,
          productName: p.product_name,
          category: p.category,
          brand: p.brand,
          stockQty: Number(p.stock_qty),
          status: p.status,
          monthlyVelocity: Math.round(monthlyVelocity * 10) / 10,
          coverMonths: coverMonths === null ? null : Math.round(coverMonths * 10) / 10,
          level,
          message,
        });
      }
    }
    stockRisks.sort((a, b) => {
      const rank = { danger: 0, warning: 1, normal: 2 };
      return rank[a.level] - rank[b.level] || (a.coverMonths ?? 999) - (b.coverMonths ?? 999);
    });

    const discontinuedCount = products.filter((p) => p.status === "단종").length;
    const stockRiskCount = stockRisks.length;

    const kpis = {
      totalRevenue: Math.round(totalRevenue),
      grossRevenue: Math.round(grossRevenue),
      cancelledAmount: Math.round(cancelledAmount),
      returnedAmount: Math.round(returnedAmount),
      totalCogs: Math.round(totalCogs),
      grossProfit: Math.round(grossProfit),
      grossMargin,
      orderCount,
      validOrderCount,
      cancelRate: orderCount > 0 ? cancelCount / orderCount : 0,
      returnRate: orderCount > 0 ? returnCount / orderCount : 0,
      avgOrderValue: validOrderCount > 0 ? Math.round(totalRevenue / validOrderCount) : 0,
      activeCustomers: activeCustomers.size,
      totalCustomers: customers.length,
      productCount: products.length,
      stockRiskCount,
      discontinuedCount,
      unitsSold,
    };

    return {
      kpis,
      dateRange: { start, end, months },
      monthly,
      categories,
      brands: mapEntries(brandMap).slice(0, 10),
      channels: [...channelMap.values()].sort((a, b) => b.revenue - a.revenue),
      payments: [...paymentMap.values()].sort((a, b) => b.revenue - a.revenue),
      tiers: mapEntries(tierMap),
      customerTypes: mapEntries(typeMap),
      orderStatus: mapEntries(statusMap),
      cities: mapEntries(cityMap).slice(0, 10),
      topCustomers,
      topProducts,
      stockRisks,
      marginLevel,
      rateLevel,
    };
  }

  window.ErpData = {
    FILE_DEFS,
    SAMPLE_FILES,
    STORAGE_KEY,
    parseCSV,
    detectType,
    validateAll,
    saveDataset,
    loadDataset,
    clearDataset,
    getRowCounts,
    computeAnalytics,
    formatKRW,
    formatNum,
    formatPct,
    formatAxis,
  };
})();
