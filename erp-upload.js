(() => {
  const { FILE_DEFS, SAMPLE_FILES, parseCSV, detectType, validateAll, saveDataset, loadDataset, clearDataset, getRowCounts } = window.ErpData;

  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-btn");
  const fileGrid = document.getElementById("file-grid");
  const validationPanel = document.getElementById("validation-panel");
  const validationBadge = document.getElementById("validation-badge");
  const validationSteps = document.getElementById("validation-steps");
  const validationErrors = document.getElementById("validation-errors");
  const goDashboardBtn = document.getElementById("go-dashboard-btn");
  const sampleBtn = document.getElementById("sample-btn");
  const navDashboard = document.getElementById("nav-dashboard");
  const resetBtn = document.getElementById("reset-btn");
  const savedHint = document.getElementById("saved-hint");
  const uploadNotice = document.getElementById("upload-notice");

  const ICONS = { products: "📦", customers: "👥", sales_orders: "🧾", sales_order_items: "📋" };
  const state = { data: {} };

  function resetUploadUI() {
    state.data = {};
    validationPanel.hidden = true;
    validationSteps.innerHTML = "";
    validationErrors.innerHTML = "";
    uploadNotice.hidden = true;
    uploadNotice.textContent = "";
    validationBadge.textContent = "";
    validationBadge.className = "validation-badge";
    goDashboardBtn.disabled = true;
    renderFileGrid();
  }

  function enableDashboardNav() {
    navDashboard.classList.remove("disabled");
  }

  function disableDashboardNav() {
    navDashboard.classList.add("disabled");
  }

  async function updateSavedHint() {
    const saved = await loadDataset();
    if (saved?.validation?.ok && saved?.data) {
      const counts = getRowCounts(saved.data);
      const when = saved.savedAt ? new Date(saved.savedAt).toLocaleString("ko-KR") : "";
      savedHint.hidden = false;
      savedHint.textContent = `저장된 분석 데이터가 있습니다${when ? ` (${when})` : ""}. 대시보드에서 확인할 수 있으며, 새 CSV를 업로드하면 덮어씁니다.`;
      resetBtn.hidden = false;
      enableDashboardNav();
    } else {
      savedHint.hidden = true;
      resetBtn.hidden = true;
      disableDashboardNav();
    }
  }

  async function handleReset() {
    if (!confirm("저장된 ERP 데이터와 검증 결과를 모두 삭제할까요? 대시보드도 비워집니다.")) return;
    await clearDataset();
    resetUploadUI();
    await updateSavedHint();
  }

  function renderFileGrid() {
    fileGrid.innerHTML = Object.entries(FILE_DEFS).map(([key, def]) => {
      const loaded = state.data[key];
      const status = loaded
        ? `<span class="status-ok">✓ 업로드 완료</span><span class="file-card-rows">${loaded.rows.length.toLocaleString()}행</span>`
        : `<span class="status-wait">○ 미업로드</span>`;
      return `
        <div class="file-card ${loaded ? "done" : ""}" data-type="${key}">
          <span class="file-card-icon">${ICONS[key]}</span>
          <span class="file-card-label">${def.label}</span>
          <span class="file-card-status">${status}</span>
        </div>
      `;
    }).join("");
  }

  function allFilesLoaded() {
    return Object.keys(FILE_DEFS).every((k) => state.data[k]);
  }

  async function processFiles(files) {
    const list = [...files];
    const unrecognized = [];
    const updated = [];

    if (list.length >= 4) state.data = {};

    for (const file of list) {
      const text = await file.text();
      const parsed = parseCSV(text);
      const type = detectType(file.name, parsed.headers);

      if (!type) {
        unrecognized.push(file.name);
        continue;
      }

      state.data[type] = parsed;
      updated.push(FILE_DEFS[type].label);
    }

    renderFileGrid();

    if (unrecognized.length) {
      uploadNotice.hidden = false;
      uploadNotice.textContent =
        `인식하지 못한 파일: ${unrecognized.join(", ")}. ` +
        "파일명(products.csv, customers.csv, sales_orders.csv, sales_order_items.csv) 또는 CSV 컬럼 구조를 확인해주세요.";
    } else {
      uploadNotice.hidden = true;
      uploadNotice.textContent = "";
    }

    if (updated.length && !allFilesLoaded()) {
      validationPanel.hidden = false;
      validationBadge.textContent = "파일 대기 중";
      validationBadge.className = "validation-badge";
      validationSteps.innerHTML = Object.entries(FILE_DEFS).map(([key, def]) => {
        const loaded = state.data[key];
        return renderStep(
          `${def.label} — ${loaded ? `${loaded.rows.length.toLocaleString()}행 업로드됨` : "미업로드"}`,
          loaded ? "ok" : "wait"
        );
      }).join("");
      validationErrors.innerHTML = "";
      goDashboardBtn.disabled = true;
    }

    if (allFilesLoaded()) await runValidation();
  }

  async function loadSample() {
    sampleBtn.disabled = true;
    sampleBtn.textContent = "불러오는 중…";
    try {
      for (const [type, path] of Object.entries(SAMPLE_FILES)) {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`${path} 로드 실패`);
        state.data[type] = parseCSV(await res.text());
      }
      renderFileGrid();
      await runValidation();
    } catch (err) {
      alert(err.message || "샘플 데이터를 불러오지 못했습니다.");
    } finally {
      sampleBtn.disabled = false;
      sampleBtn.textContent = "샘플 데이터 불러오기";
    }
  }

  function renderStep(label, status) {
    const cls = status === "ok" ? "ok" : status === "fail" ? "fail" : "run";
    const icon = status === "ok" ? "✓" : status === "fail" ? "✕" : status === "wait" ? "○" : "…";
    return `<div class="validation-step"><span class="step-indicator ${cls === "run" ? "run" : cls}">${icon}</span>${label}</div>`;
  }

  async function runValidation() {
    validationPanel.hidden = false;
    validationBadge.textContent = "검증 중…";
    validationBadge.className = "validation-badge";
    validationSteps.innerHTML = renderStep("스키마 검증 진행 중…", "run");
    validationErrors.innerHTML = "";
    goDashboardBtn.disabled = true;

    await new Promise((r) => setTimeout(r, 400));

    const result = validateAll(state.data);
    const stepHtml = [];

    for (const [type, def] of Object.entries(FILE_DEFS)) {
      const r = result.tables[type];
      stepHtml.push(renderStep(
        `${def.label} (${r.rowCount.toLocaleString()}행) — ${r.ok ? "통과" : "오류"}`,
        r.ok ? "ok" : "fail"
      ));
    }

    if (result.ok || Object.values(result.tables).every((t) => t.rowCount > 0)) {
      stepHtml.push(renderStep(
        result.integrity.ok ? "참조 무결성 검사 — 통과" : `참조 무결성 검사 — ${result.integrity.errors.length}건 이슈`,
        result.integrity.ok ? "ok" : "fail"
      ));
    }

    validationSteps.innerHTML = stepHtml.join("");

    const allErrors = [];
    Object.entries(result.tables).forEach(([type, r]) => {
      r.errors.forEach((e) => allErrors.push(`[${FILE_DEFS[type].label}] ${e}`));
    });
    result.integrity.errors.forEach((e) => allErrors.push(`[무결성] ${e}`));
    validationErrors.innerHTML = allErrors.map((e) => `<li>${e}</li>`).join("");

    if (result.ok) {
      validationBadge.textContent = "검증 완료";
      validationBadge.className = "validation-badge ok";
      try {
        await saveDataset(state.data, result);
        goDashboardBtn.disabled = false;
        enableDashboardNav();
        await updateSavedHint();
      } catch (err) {
        validationBadge.textContent = "저장 실패";
        validationBadge.className = "validation-badge fail";
        validationErrors.innerHTML = `<li>데이터 저장에 실패했습니다. 브라우저 저장 공간을 확인해주세요. (${err.message || err})</li>`;
      }
    } else {
      validationBadge.textContent = "검증 실패";
      validationBadge.className = "validation-badge fail";
    }
  }

  dropZone.addEventListener("click", () => fileInput.click());
  browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });

  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) processFiles(fileInput.files);
    fileInput.value = "";
  });

  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  });

  goDashboardBtn.addEventListener("click", () => {
    window.location.href = "erp-dashboard.html";
  });

  sampleBtn.addEventListener("click", loadSample);
  resetBtn.addEventListener("click", handleReset);

  resetUploadUI();
  updateSavedHint();
})();
