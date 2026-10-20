/**
 * Blogauto Naver - Web Version
 * 데모 모드: 실제 네이버/티스토리 발행은 Electron 데스크톱 앱에서 사용하세요.
 * 이 웹 버전은 UI와 워크플로를 시뮬레이션합니다.
 */

const state = {
  currentJobId: "",
  running: false,
  autoRunning: false,
  tokenTotal: 0,
  accountStore: { selectedAccountId: "", accounts: [] },
  history: [],
  draggingAccountId: "",
  draggingCategoryId: "",
  editingCategoryId: "",
  saveTimer: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const STORAGE_KEY = "blogauto-web-data.v1";
const DEFAULT_AGENT_MODELS = { main: "high", research: "high", writer: "high", image: "medium" };

// ================= 유틸리티 =================
function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTokens(total) {
  const value = Number(total || 0);
  return `${value.toLocaleString()} tokens`;
}

function setTokenTotal(total) {
  state.tokenTotal = Number(total || 0);
  $("#tokenBadge").textContent = `누적 ${formatTokens(state.tokenTotal)}`;
}

function setRunState(status, detail = "") {
  const badge = $("#runState");
  const classMap = {
    success: "success",
    generated: "success",
    failed: "danger",
    session_expired: "danger",
    duplicate_retry: "warning",
    publishing: "info",
    generating: "info",
  };
  const labelMap = {
    success: "성공",
    generated: "생성",
    failed: "실패",
    session_expired: "세션만료",
    duplicate_retry: "중복",
    publishing: "발행",
    generating: "생성중",
  };
  badge.className = `badge ${classMap[status] || "info"}`;
  badge.textContent = detail && detail !== status ? detail : (labelMap[status] || status || "대기");
}

function addLog(agent, message, level = "info") {
  const streamMap = {
    main: "#mainLogStream",
    research: "#researchLogStream",
    writer: "#writerLogStream",
    image: "#mainLogStream",
  };
  const stream = $(streamMap[agent] || streamMap.main);
  if (!stream) return;
  const line = document.createElement("div");
  line.className = `log-line ${level}`;
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${message}`;
  stream.appendChild(line);
  stream.scrollTop = stream.scrollHeight;
}

function clearLogs() {
  ["#mainLogStream", "#researchLogStream", "#writerLogStream"].forEach((s) => {
    const el = $(s);
    if (el) el.innerHTML = "";
  });
}

// ================= 데이터 persistence =================
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.accountStore = parsed.accountStore || { selectedAccountId: "", accounts: [] };
      state.history = parsed.history || [];
    }
  } catch (e) {
    console.warn("데이터 로드 실패", e);
  }
}

function saveData() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accountStore: state.accountStore, history: state.history }, null, 2)
    );
  } catch (e) {
    console.warn("데이터 저장 실패", e);
  }
}

// ================= 계정 관리 =================
function ensureSelectedAccount() {
  const accounts = state.accountStore.accounts || [];
  if (!accounts.length) {
    state.accountStore.selectedAccountId = "";
    return null;
  }
  const selected = accounts.find((a) => a.id === state.accountStore.selectedAccountId);
  if (selected) return selected;
  state.accountStore.selectedAccountId = accounts[0].id;
  return accounts[0];
}

function selectedAccount() {
  return ensureSelectedAccount();
}

function accountDisplayName(account) {
  return account ? String(account.label || account.blogId || "Naver 계정") : "Naver 계정";
}

function renderAccounts() {
  const list = $("#accountList");
  const manager = $("#accountManager");
  const toggle = $("#toggleAccountManagerButton");
  ensureSelectedAccount();
  if (manager && toggle) {
    manager.classList.toggle("collapsed", !state.accountStore.accounts.length ? false : !getAccountManagerOpen());
    toggle.textContent = getAccountManagerOpen() ? "접기" : "펼치기";
  }
  list.innerHTML = "";
  const accounts = state.accountStore.accounts || [];
  if (!accounts.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "등록된 계정이 없습니다.";
    list.appendChild(empty);
    renderCategories();
    return;
  }
  for (const account of accounts) {
    const row = document.createElement("div");
    row.className = `account-row${account.id === state.accountStore.selectedAccountId ? " selected" : ""}`;
    row.dataset.accountId = account.id;
    row.innerHTML = `
      <input class="list-check" type="checkbox" ${account.checked !== false ? "checked" : ""} />
      <div class="account-main">
        <strong>${escapeHtml(accountDisplayName(account))}</strong>
        <span>로그인 정보 직접 입력</span>
        <small>블로그 ${escapeHtml(account.blogId || "-")}</small>
        <small>카테고리 ${(account.categories || []).length}개</small>
      </div>
      <div class="account-actions">
        <span class="badge ${account.sessionStatus === "valid" ? "success" : account.sessionStatus === "expired" ? "danger" : "warning"}">
          ${account.sessionStatus === "valid" ? "정상" : account.sessionStatus === "expired" ? "세션만료" : "미확인"}
        </span>
        <button type="button" class="ghost small" data-action="session">세션확인</button>
        <button type="button" class="select-button small" data-action="select">
          ${account.id === state.accountStore.selectedAccountId ? "선택됨" : "선택"}
        </button>
        <button type="button" class="ghost small danger-button" data-action="delete">삭제</button>
      </div>
    `;
    row.querySelector("input").addEventListener("click", (e) => {
      e.stopPropagation();
      account.checked = e.target.checked;
      saveData();
      renderAccounts();
    });
    row.querySelector("[data-action='select']").addEventListener("click", (e) => {
      e.stopPropagation();
      selectAccount(account.id);
    });
    row.querySelector("[data-action='session']").addEventListener("click", (e) => {
      e.stopPropagation();
      checkAccountSession(account);
    });
    row.querySelector("[data-action='delete']").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!window.confirm(`${accountDisplayName(account)} 계정을 삭제할까요?`)) return;
      state.accountStore.accounts = state.accountStore.accounts.filter((a) => a.id !== account.id);
      if (state.accountStore.accounts.length > 0) {
        selectAccount(state.accountStore.accounts[0].id);
      } else {
        clearAccountForm();
        clearCategoryForm();
      }
      await saveAccountStoreNow();
      addLog("main", `${accountDisplayName(account)} 계정을 삭제했습니다.`, "warn");
    });
    row.addEventListener("click", () => selectAccount(account.id));
    list.appendChild(row);
  }
  renderCategories();
}

let accountManagerOpen = false;
function getAccountManagerOpen() {
  return accountManagerOpen;
}

function selectAccount(accountId) {
  const account = state.accountStore.accounts.find((a) => a.id === accountId);
  if (!account) return;
  state.accountStore.selectedAccountId = account.id;
  fillAccountForm(account);
  clearCategoryForm();
  renderAccounts();
  saveData();
}

function fillAccountForm(account) {
  $("#accountLabel").value = account?.label || "";
  $("#blogId").value = account?.blogId || "";
}

function clearAccountForm() {
  fillAccountForm(null);
}

function checkAccountSession(account) {
  addLog("main", `${accountDisplayName(account)} 계정 세션 확인을 시작합니다.`);
  setRunState("generating", "로그인 완료 대기 중");
  setTimeout(() => {
    account.sessionStatus = "valid";
    account.sessionCheckedAt = new Date().toISOString();
    saveData();
    renderAccounts();
    setRunState("generated", "세션 정상");
    addLog("main", `${accountDisplayName(account)} 계정 세션 확인 완료.`, "success");
  }, 1500);
}

// ================= 카테고리 관리 =================
let categoryManagerOpen = false;
function getCategoryManagerOpen() {
  return categoryManagerOpen;
}

function renderCategories() {
  const account = selectedAccount();
  const list = $("#categoryList");
  const manager = $("#categoryManager");
  manager.classList.toggle("collapsed", !categoryManagerOpen);
  list.innerHTML = "";
  if (!account) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "카테고리를 등록할 계정을 먼저 선택하세요.";
    list.appendChild(empty);
    return;
  }
  if (!account.categories || !account.categories.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "등록된 카테고리가 없습니다.";
    list.appendChild(empty);
    return;
  }
  for (const [index, category] of account.categories.entries()) {
    const row = document.createElement("div");
    row.className = `category-row${state.editingCategoryId === category.id ? " selected" : ""}`;
    row.dataset.categoryId = category.id;
    const summary = [
      category.excludedTopics ? `제외: ${category.excludedTopics}` : "",
      category.freshnessLevel && category.freshnessLevel !== "auto" ? `최신성: ${category.freshnessLevel}` : "",
      category.checked !== false ? "자동 발행 대상" : "",
    ].filter(Boolean).join(" · ");
    row.innerHTML = `
      <input class="list-check" type="checkbox" ${category.checked !== false ? "checked" : ""} />
      <div class="category-main">
        <strong>${escapeHtml(category.name)}</strong>
        <span>${escapeHtml(category.keyword || "검색 키워드 없음")}</span>
        ${summary ? `<small>${escapeHtml(summary)}</small>` : ""}
      </div>
      <div class="category-actions">
        <button type="button" class="ghost small" data-action="move-up" ${index === 0 ? "disabled" : ""}>위</button>
        <button type="button" class="ghost small" data-action="move-down" ${index === account.categories.length - 1 ? "disabled" : ""}>아래</button>
        <button type="button" class="ghost small" data-action="edit">수정</button>
        <button type="button" class="ghost small danger-button" data-action="delete">삭제</button>
      </div>
    `;
    row.querySelector("input").addEventListener("change", (e) => {
      category.checked = e.target.checked;
      saveData();
      renderCategories();
    });
    row.querySelector("[data-action='move-up']").addEventListener("click", () => {
      if (index > 0) {
        [account.categories[index - 1], account.categories[index]] = [account.categories[index], account.categories[index - 1]];
        saveData();
        renderCategories();
      }
    });
    row.querySelector("[data-action='move-down']").addEventListener("click", () => {
      if (index < account.categories.length - 1) {
        [account.categories[index + 1], account.categories[index]] = [account.categories[index], account.categories[index + 1]];
        saveData();
        renderCategories();
      }
    });
    row.querySelector("[data-action='edit']").addEventListener("click", () => editCategory(category));
    row.querySelector("[data-action='delete']").addEventListener("click", () => {
      account.categories = account.categories.filter((c) => c.id !== category.id);
      if (state.editingCategoryId === category.id) clearCategoryForm();
      saveData();
      renderCategories();
    });
    list.appendChild(row);
  }
}

function clearCategoryForm() {
  state.editingCategoryId = "";
  $("#categoryName").value = "";
  $("#categoryKeyword").value = "";
  $("#categoryExcludedTopics").value = "";
  $("#categoryPublishPurpose").value = "";
  $("#categoryPreferredTone").value = "";
  $("#categoryFreshnessLevel").value = "auto";
  $("#categorySearchChannel").value = "blog";
  $("#addCategoryButton").textContent = "카테고리 등록";
}

function editCategory(category) {
  state.editingCategoryId = category.id;
  categoryManagerOpen = true;
  $("#categoryManager").classList.remove("collapsed");
  $("#toggleCategoryManagerButton").textContent = "접기";
  $("#categoryName").value = category.name;
  $("#categoryKeyword").value = category.keyword;
  $("#categoryExcludedTopics").value = category.excludedTopics;
  $("#categoryPublishPurpose").value = category.publishPurpose;
  $("#categoryPreferredTone").value = category.preferredTone;
  $("#categoryFreshnessLevel").value = category.freshnessLevel;
  $("#categorySearchChannel").value = category.searchChannel;
  $("#addCategoryButton").textContent = "카테고리 수정";
}

function findSelectedCategory(account) {
  if (!account || !account.categories) return null;
  return account.categories.find((c) => c.checked !== false) || account.categories[0] || null;
}

// ================= 설정 =================
function collectForm(target = {}) {
  const account = target.account || selectedAccount();
  const category = target.category || findSelectedCategory(account) || null;
  return {
    accountId: account?.id || "",
    blogId: account?.blogId || "",
    topicMode: $("#topicMode").value,
    repeatTermMinutes: Number($("#repeatTermMinutes").value || 60),
    topic: $("#topic").value.trim(),
    category: category?.name || "",
    keyword: category?.keyword || "",
    excludedTopics: $("#categoryExcludedTopics").value.trim(),
    publishPurpose: $("#categoryPublishPurpose").value.trim(),
    preferredTone: $("#categoryPreferredTone").value.trim(),
    freshnessLevel: $("#categoryFreshnessLevel").value,
    searchChannel: $("#categorySearchChannel").value,
    codexModel: $("#codexModel").value,
    publishAfterGenerate: $("#publishAfterGenerate").checked,
    publishToTistoryAfterNaver: $("#publishToTistoryAfterNaver").checked,
    tistoryBlogId: $("#tistoryBlogId").value.trim(),
    publishVisibility: $("#publishVisibility").value,
    publishScheduleMode: $("#publishScheduleMode").value,
    reserveAfterHours: Number($("#reserveAfterHours").value || 0),
    includeTitleImage: $("#includeTitleImage").checked,
    titleImageAspectRatio: $("#titleImageAspectRatio").value,
    bodyImageAspectRatio: $("#bodyImageAspectRatio").value,
    maxBodyImages: Number($("#maxBodyImages").value),
    breakSentencesInBody: $("#breakSentencesInBody").checked,
    agentModels: {
      main: $("#mainAgentModel").value,
      research: $("#researchAgentModel").value,
      writer: $("#writerAgentModel").value,
      image: $("#imageWorkerModel").value,
    },
  };
}

function saveSettingsNow() {
  $("#settingsState").textContent = "설정 저장 중";
  saveData();
  $("#settingsState").textContent = "설정 저장됨";
  setTimeout(() => {
    $("#settingsState").textContent = "데모 데이터 자동 저장";
  }, 1500);
}

async function saveAccountStoreNow() {
  saveData();
  renderAccounts();
}

// ================= 모드 컨트롤 =================
function updateModeControls() {
  const isAuto = $("#topicMode").value === "auto";
  const isPrivatePublish = $("#publishVisibility").value !== "public";
  $("#repeatTermLabel").style.display = isAuto ? "grid" : "none";
  $("#manualTopicLabel").style.display = isAuto ? "none" : "grid";
  $("#publishAfterGenerate").checked = isAuto ? true : $("#publishAfterGenerate").checked;
  $("#publishAfterGenerate").disabled = isAuto;
  if (isPrivatePublish && $("#publishScheduleMode").value === "reserve") {
    $("#publishScheduleMode").value = "now";
  }
  $("#publishScheduleMode").disabled = isPrivatePublish;
  $("#reserveAfterLabel").style.display =
    !isPrivatePublish && $("#publishScheduleMode").value === "reserve" ? "grid" : "none";
}

// ================= 이미지 시뮬레이션 =================
function renderImages(count) {
  const grid = $("#imageGrid");
  grid.innerHTML = "";
  if (!count || count <= 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "생성된 이미지 파일이 없습니다.";
    grid.appendChild(empty);
    return;
  }
  const titleCount = 1;
  const bodyCount = Math.min(count - 1, 9);
  let totalRendered = 0;
  // 타이틀 이미지
  if (titleCount > 0 && totalRendered < count) {
    const card = document.createElement("div");
    card.className = "thumb";
    card.innerHTML = `
      <img src="https://via.placeholder.com/400x225/03c75a/ffffff?text=Title+Image" alt="타이틀 이미지" />
      <span>title</span>
      <code class="image-path">title-image.png</code>
    `;
    grid.appendChild(card);
    totalRendered++;
  }
  // 본문 이미지
  for (let i = 1; i <= bodyCount && totalRendered < count; i++) {
    const card = document.createElement("div");
    card.className = "thumb";
    card.innerHTML = `
      <img src="https://via.placeholder.com/400x225/0b63ce/ffffff?text=Body+Image+${i}" alt="본문 이미지 ${i}" />
      <span>IMAGE ${i}</span>
      <code class="image-path">body-image-${i}.png</code>
    `;
    grid.appendChild(card);
    totalRendered++;
  }
}

function renderImageNotes(notes) {
  const container = $("#imageNotes");
  container.innerHTML = "";
  if (!notes || notes.length === 0) return;
  for (const note of notes) {
    const item = document.createElement("div");
    item.className = "note";
    item.textContent = note;
    container.appendChild(item);
  }
}

// ================= 이력 =================
function renderHistory() {
  const summary = $("#historySummary");
  const body = $("#historyBody");
  const items = state.history.slice(0, 20);
  const total = state.history.length;
  const success = state.history.filter((h) => h.status === "success" || h.status === "generated").length;
  const failed = total - success;
  const latest = state.history[0];
  summary.innerHTML = `
    <div class="history-metric"><strong>${total}</strong><span>전체</span></div>
    <div class="history-metric success"><strong>${success}</strong><span>성공/생성</span></div>
    <div class="history-metric danger"><strong>${failed}</strong><span>확인 필요</span></div>
    <div class="history-latest">
      <span>최근 작업</span>
      <strong>${escapeHtml(latest ? (latest.title || latest.topic || "제목 없음") : "기록 없음")}</strong>
      <em>${latest ? new Date(latest.create_at).toLocaleString() : "-"}</em>
    </div>
  `;
  body.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "작업 기록이 없습니다.";
    body.appendChild(empty);
    return;
  }
  for (const item of items) {
    const card = document.createElement("article");
    card.className = `history-card ${item.status === "success" || item.status === "generated" ? "success" : item.status === "duplicate_retry" ? "warning" : "danger"}`;
    const meta = [item.category && `카테고리 ${item.category}`, item.keyword && `키워드 ${item.keyword}`, item.blog_id && `블로그 ${item.blog_id}`].filter(Boolean).join(" · ");
    card.innerHTML = `
      <div class="history-card-top">
        <span class="badge ${item.status === "success" ? "success" : "danger"}">${item.status === "success" ? "성공" : item.status}</span>
        <span class="history-date">${new Date(item.create_at).toLocaleString()}</span>
        <span class="history-token">${formatTokens(item.token_total || 0)}</span>
      </div>
      <h3>${escapeHtml(item.title || item.topic || "제목 없음")}</h3>
      <p class="history-meta">${escapeHtml(meta || "작업 대상 정보 없음")}</p>
      <p class="history-reason">${escapeHtml(item.reason || "기록된 사유가 없습니다.")}</p>
    `;
    body.appendChild(card);
  }
}

function appendHistory(entry) {
  state.history.unshift(entry);
  if (state.history.length > 100) state.history = state.history.slice(0, 100);
  saveData();
  renderHistory();
}

// ================= 작업 시작 (시뮬레이션) =================
function generateDummyArticle(topic, keyword, category) {
  const title = topic || `${category} ${keyword} 관련 최신 정보`;
  const article = [
    `# ${title}`,
    "",
    `안녕하세요. 오늘은 ${keyword}에 대해 알아보려고 합니다.`,
    "",
    `## ${keyword}란 무엇인가?`,
    "",
    `${keyword}는 최근 많은 분들이 관심을 두고 있는 주제입니다.`,
    "",
    `## ${category}에서의 중요성`,
    "",
    `${category} 분야에서 ${keyword}는 점점 더 중요해지고 있습니다.`,
    "",
    `## 결론`,
    "",
    `앞으로도 ${keyword}에 대한 다양한 정보를 제공해 드리겠습니다.`,
  ].join("\n");
  return { title, article };
}

async function startManualJob() {
  if (state.running) return;
  const form = collectForm();
  if (!form.topic) {
    addLog("main", "수동 방식에서는 주제가 필요합니다.", "error");
    setRunState("failed", "주제 필요");
    return;
  }
  if (!form.category) {
    addLog("main", "선택 계정에서 카테고리를 체크하세요.", "error");
    setRunState("failed", "카테고리 필요");
    return;
  }
  if (!form.keyword) {
    addLog("main", "선택한 카테고리에 검색 키워드를 등록하세요.", "error");
    setRunState("failed", "키워드 필요");
    return;
  }
  if (form.publishAfterGenerate && !form.blogId) {
    addLog("main", "발행까지 진행하려면 Blog ID가 등록된 계정을 선택하세요.", "error");
    setRunState("failed", "Blog ID 필요");
    return;
  }

  state.running = true;
  $("#startButton").disabled = true;
  saveSettingsNow();
  setTokenTotal(0);
  $("#articlePreview").value = "";
  $("#selectedTitle").textContent = "아직 선정 전";
  renderImages(0);
  renderImageNotes([]);
  setRunState("generating", "생성 준비");

  clearLogs();

  const jobId = `job_${Date.now()}`;
  state.currentJobId = jobId;

  try {
    // Research/Title 시뮬레이션
    addLog("research", "Research/Title Agent 시작", "info");
    setRunState("generating", "Research/Title Agent 실행 중");
    await sleep(1200);
    addLog("research", `키워드: ${form.keyword}`, "info");
    await sleep(800);
    const selectedTitle = form.topic || `${form.category} ${form.keyword} 가이드`;
    addLog("research", `선정 제목: ${selectedTitle}`, "success");
    $("#selectedTitle").textContent = selectedTitle;
    $("#articleMeta").textContent = "제목 선정 완료";

    // Writer 시뮬레이션
    addLog("writer", "Writer Agent 시작", "info");
    setRunState("generating", "Writer Agent 본문 생성 중");
    await sleep(1500);
    const { title, article } = generateDummyArticle(selectedTitle, form.keyword, form.category);
    $("#articlePreview").value = article;
    $("#articleMeta").textContent = "본문 생성 완료";
    addLog("writer", "본문 생성 완료", "success");

    // 이미지 시뮬레이션
    addLog("image", "Image Worker 이미지 생성 중", "info");
    await sleep(1000);
    const maxBodyImages = form.includeTitleImage ? Math.min(form.maxBodyImages, 5) : 0;
    renderImages(maxBodyImages + (form.includeTitleImage ? 1 : 0));
    renderImageNotes(["타이틀 이미지 생성 완료", `본문 이미지 ${maxBodyImages}장 생성 완료`]);
    addLog("image", "이미지 생성 완료", "success");

    setTokenTotal(Math.floor(Math.random() * 3000) + 1500);

    // 발행 시뮬레이션
    if (form.publishAfterGenerate) {
      setRunState("publishing", `Naver 블로그 ${form.publishVisibility === "public" ? "전체공개" : "비공개"} 발행 자동화`);
      addLog("main", `Naver 블로그 주소 ID: ${form.blogId}`, "info");
      await sleep(2000);
      addLog("main", "Naver 발행 완료", "success");

      if (form.publishToTistoryAfterNaver) {
        if (!form.tistoryBlogId) {
          addLog("main", "티스토리 블로그 ID가 없어 티스토리 발행을 건너뜁니다.", "warn");
        } else {
          setRunState("publishing", "티스토리 발행 중");
          await sleep(1500);
          addLog("main", "티스토리 발행 완료", "success");
        }
      }

      appendHistory({
        id: jobId,
        create_at: new Date().toISOString(),
        account_id: form.accountId,
        blog_id: form.blogId,
        title,
        topic: form.topic,
        keyword: form.keyword,
        category: form.category,
        status: "success",
        token_total: state.tokenTotal,
        reason: form.publishToTistoryAfterNaver ? "네이버와 티스토리 발행 완료." : "네이버 발행 완료.",
      });
      setRunState("success", "발행 완료");
      addLog("main", "모든 작업이 완료되었습니다.", "success");
    } else {
      appendHistory({
        id: jobId,
        create_at: new Date().toISOString(),
        account_id: form.accountId,
        blog_id: form.blogId,
        title,
        topic: form.topic,
        keyword: form.keyword,
        category: form.category,
        status: "generated",
        token_total: state.tokenTotal,
        reason: "사용자가 발행 실행을 끄고 생성만 실행했습니다.",
      });
      setRunState("generated", "본문 생성 완료, 발행 대기");
      addLog("main", "본문 생성이 완료되었습니다. 발행을 원하시면 '생성 후 Naver 발행까지 진행'을 체크하세요.", "info");
    }
  } catch (error) {
    addLog("main", error.message, "error");
    setRunState("failed", "실패");
  } finally {
    state.running = false;
    $("#startButton").disabled = false;
  }
}

// ================= 자동 발행 (시뮬레이션) =================
async function startAutoPublishing() {
  if (state.autoRunning) return;
  const checkedAccounts = state.accountStore.accounts.filter((a) => a.checked !== false);
  if (!checkedAccounts.length) {
    addLog("main", "자동 발행할 체크된 계정이 없습니다.", "error");
    setRunState("failed", "계정 필요");
    return;
  }
  const targets = checkedAccounts.flatMap((account) =>
    (account.categories || []).filter((c) => c.checked !== false && c.name && c.keyword).map((c) => ({ account, category: c }))
  );
  if (!targets.length) {
    addLog("main", "자동 발행하려면 체크된 카테고리의 카테고리명과 키워드를 먼저 등록하세요.", "error");
    setRunState("failed", "카테고리/키워드 필요");
    return;
  }

  state.autoRunning = true;
  state.running = true;
  $("#startButton").disabled = true;
  $("#stopAutoButton").disabled = false;
  saveSettingsNow();
  setTokenTotal(0);

  let index = 0;
  while (state.autoRunning) {
    const currentTargets = state.accountStore.accounts
      .filter((a) => a.checked !== false)
      .flatMap((a) => (a.categories || []).filter((c) => c.checked !== false && c.name && c.keyword).map((c) => ({ account: a, category: c })));
    if (!currentTargets.length) {
      addLog("warn", "체크된 자동 발행 대상이 없습니다.");
      await sleep(3000);
      continue;
    }
    index %= currentTargets.length;
    const target = currentTargets[index];
    const form = collectForm({ account: target.account, category: target.category });

    addLog("main", `자동 Cycle 시작: ${accountDisplayName(target.account)} / ${target.category.name}`, "info");
    $("#selectedTitle").textContent = "아직 선정 전";
    $("#articlePreview").value = "";
    renderImages(0);
    renderImageNotes([]);

    try {
      const { title, article } = generateDummyArticle(form.topic || `${form.category} ${form.keyword}`, form.keyword, form.category);
      $("#selectedTitle").textContent = title;
      $("#articlePreview").value = article;
      $("#articleMeta").textContent = "자동 생성 완료";
      setTokenTotal(state.tokenTotal + Math.floor(Math.random() * 2000) + 1000);

      if (form.publishAfterGenerate && form.blogId) {
        addLog("main", `Naver 발행 중... (${target.account.blogId})`, "info");
        await sleep(1500);
        addLog("main", "Naver 발행 완료", "success");
        appendHistory({
          id: `auto_${Date.now()}`,
          create_at: new Date().toISOString(),
          account_id: target.account.id,
          blog_id: target.account.blogId,
          title,
          topic: form.topic,
          keyword: form.keyword,
          category: form.category,
          status: "success",
          token_total: state.tokenTotal,
          reason: "자동 발행 완료.",
        });
      }

      renderHistory();
    } catch (error) {
      addLog("main", error.message, "error");
    }

    index++;
    if (state.autoRunning) {
      await sleep(3000); // 자동 간격
    }
  }

  state.autoRunning = false;
  state.running = false;
  $("#startButton").disabled = false;
  $("#stopAutoButton").disabled = true;
  setRunState("generated", "자동 중지");
  addLog("main", "자동 발행이 중지되었습니다.", "warn");
}

// ================= 티스토리 테스트 (시뮬레이션) =================
async function startTistoryTestPublish() {
  const form = collectForm();
  if (!form.tistoryBlogId) {
    addLog("main", "티스토리 블로그 ID가 필요합니다.", "error");
    setRunState("failed", "Tistory Blog ID 필요");
    return;
  }
  state.running = true;
  $("#startButton").disabled = true;
  saveSettingsNow();
  setTokenTotal(0);
  $("#articlePreview").value = "";
  $("#selectedTitle").textContent = "티스토리 테스트";
  renderImages(0);
  renderImageNotes([]);
  setRunState("publishing", "티스토리 테스트");

  clearLogs();

  try {
    addLog("main", "티스토리 세션 확인 중...", "info");
    await sleep(1500);
    addLog("main", "티스토리 세션 확인 완료", "success");
    addLog("main", "본문 입력 중...", "info");
    await sleep(1000);
    addLog("main", "이미지 업로드 중...", "info");
    await sleep(1000);
    addLog("main", "카테고리 선택 및 태그 입력 중...", "info");
    await sleep(1000);
    addLog("main", "최종 발행 중...", "info");
    await sleep(1500);
    addLog("main", "티스토리 테스트 발행 완료", "success");

    const testArticle = [
      "[티스토리 테스트] 자동화 테스트 글",
      "",
      "이 글은 티스토리 전용 자동화 테스트 글입니다.",
      "네이버 세션 확인, 본문 생성, 이미지 생성, 네이버 발행 과정을 건너뛰고 티스토리 입력과 발행 흐름만 확인합니다.",
    ].join("\n");
    $("#articlePreview").value = testArticle;
    $("#articleMeta").textContent = "티스토리 테스트 완료";
    renderImages(1);
    renderImageNotes(["티스토리 테스트 이미지가 생성되었습니다."]);
    setRunState("success", "티스토리 테스트 완료");
  } catch (error) {
    addLog("main", error.message, "error");
    setRunState("failed", "티스토리 테스트 실패");
  } finally {
    state.running = false;
    $("#startButton").disabled = false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ================= 초기화 =================
function boot() {
  loadData();

  // 세션 공지
  const notice = $("#sessionNotice");
  if (notice) notice.hidden = false;

  // 계정/카테고리 렌더
  renderAccounts();
  renderHistory();

  // 이벤트 리스너
  $("#dismissSessionNoticeButton").addEventListener("click", () => {
    $("#sessionNotice").hidden = true;
  });

  $("#toggleAccountManagerButton").addEventListener("click", () => {
    accountManagerOpen = !accountManagerOpen;
    $("#accountManager").classList.toggle("collapsed", !accountManagerOpen);
    $("#toggleAccountManagerButton").textContent = accountManagerOpen ? "접기" : "펼치기";
    if (accountManagerOpen) fillAccountForm(selectedAccount());
    renderAccounts();
  });

  $("#toggleCategoryManagerButton").addEventListener("click", () => {
    categoryManagerOpen = !categoryManagerOpen;
    $("#categoryManager").classList.toggle("collapsed", !categoryManagerOpen);
    $("#toggleCategoryManagerButton").textContent = categoryManagerOpen ? "접기" : "펼치기";
    renderCategories();
  });

  $("#jobForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("#topicMode").value === "auto") {
      await startAutoPublishing();
    } else {
      await startManualJob();
    }
  });

  $("#tistoryTestButton")?.addEventListener("click", async () => {
    if (state.running || state.autoRunning) return;
    await startTistoryTestPublish();
  });

  $("#addAccountButton").addEventListener("click", async () => {
    const blogId = $("#blogId").value.trim();
    if (!blogId) {
      addLog("main", "Blog ID를 입력하세요.", "error");
      return;
    }
    const duplicate = state.accountStore.accounts.find((a) => a.blogId === blogId);
    if (duplicate) {
      addLog("main", "이미 등록된 Blog ID입니다.", "error");
      return;
    }
    const account = {
      id: makeId("acct"),
      label: $("#accountLabel").value.trim() || blogId,
      blogId,
      checked: true,
      sessionStatus: "unknown",
      sessionCheckedAt: "",
      categories: [],
    };
    state.accountStore.accounts.push(account);
    state.accountStore.selectedAccountId = account.id;
    state.categoryManagerOpen = true;
    $("#categoryManager").classList.remove("collapsed");
    $("#toggleCategoryManagerButton").textContent = "접기";
    clearCategoryForm();
    await saveAccountStoreNow();
    $("#categoryName").focus();
  });

  $("#updateAccountButton").addEventListener("click", async () => {
    const account = selectedAccount();
    if (!account) {
      addLog("main", "수정할 계정을 먼저 선택하세요.", "error");
      return;
    }
    const blogId = $("#blogId").value.trim();
    if (!blogId) {
      addLog("main", "Blog ID를 입력하세요.", "error");
      return;
    }
    account.label = $("#accountLabel").value.trim() || blogId;
    account.blogId = blogId;
    saveData();
    renderAccounts();
    addLog("main", "계정 정보가 수정되었습니다.", "success");
  });

  $("#clearAccountFormButton").addEventListener("click", () => {
    clearAccountForm();
    addLog("main", "신규 계정 입력을 시작합니다.", "info");
  });

  $("#addCategoryButton").addEventListener("click", async () => {
    const account = selectedAccount();
    const name = $("#categoryName").value.trim();
    const keyword = $("#categoryKeyword").value.trim();
    if (!account) return;
    if (!name || !keyword) {
      addLog("main", "카테고리를 등록하려면 카테고리명과 검색 키워드를 모두 입력하세요.", "warn");
      setRunState("failed", "카테고리명/키워드 필요");
      return;
    }
    account.categories = account.categories || [];
    if (state.editingCategoryId) {
      const existing = account.categories.find((c) => c.id === state.editingCategoryId);
      if (existing) {
        existing.name = name;
        existing.keyword = keyword;
        existing.excludedTopics = $("#categoryExcludedTopics").value.trim();
        existing.publishPurpose = $("#categoryPublishPurpose").value.trim();
        existing.preferredTone = $("#categoryPreferredTone").value.trim();
        existing.freshnessLevel = $("#categoryFreshnessLevel").value;
        existing.searchChannel = $("#categorySearchChannel").value;
        existing.checked = true;
      }
    } else if (account.categories.some((c) => c.name === name)) {
      addLog("main", "같은 이름의 카테고리가 이미 있습니다.", "warn");
      setRunState("failed", "중복 카테고리명");
      return;
    } else {
      account.categories.push({
        id: makeId("cat"),
        name,
        keyword,
        excludedTopics: $("#categoryExcludedTopics").value.trim(),
        publishPurpose: $("#categoryPublishPurpose").value.trim(),
        preferredTone: $("#categoryPreferredTone").value.trim(),
        freshnessLevel: $("#categoryFreshnessLevel").value,
        searchChannel: $("#categorySearchChannel").value,
        checked: true,
      });
    }
    clearCategoryForm();
    await saveAccountStoreNow();
    addLog("main", "카테고리가 등록되었습니다.", "success");
  });

  $("#stopAutoButton").addEventListener("click", () => {
    state.autoRunning = false;
    $("#stopAutoButton").disabled = true;
    setRunState("generated", "자동 중지 요청");
  });

  $("#reloadHistoryButton").addEventListener("click", renderHistory);

  $("#clearLogButton").addEventListener("click", clearLogs);

  $("#saveSettingsButton").addEventListener("click", saveSettingsNow);

  $("#openRuntimeButton").addEventListener("click", () => {
    alert("웹 데모 버전입니다. 실제 런타임 폴더는 Electron 데스크톱 앱에서 확인할 수 있습니다.");
  });

  // 설정 자동 저장
  const autoSaveControls = [
    "#topicMode", "#repeatTermMinutes", "#topic", "#tistoryBlogId",
    "#publishVisibility", "#publishScheduleMode", "#reserveAfterHours",
    "#includeTitleImage", "#titleImageAspectRatio", "#bodyImageAspectRatio",
    "#maxBodyImages", "#breakSentencesInBody",
    "#codexModel", "#mainAgentModel", "#researchAgentModel", "#writerAgentModel", "#imageWorkerModel",
    "#publishAfterGenerate", "#publishToTistoryAfterNaver",
  ];
  autoSaveControls.forEach((id) => {
    const ctrl = $(id);
    if (!ctrl) return;
    ctrl.addEventListener("input", () => {
      $("#settingsState").textContent = "변경 감지";
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(saveSettingsNow, 500);
    });
    ctrl.addEventListener("change", () => {
      $("#settingsState").textContent = "변경 감지";
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(saveSettingsNow, 500);
    });
  });

  $("#topicMode").addEventListener("change", updateModeControls);
  $("#publishVisibility").addEventListener("change", updateModeControls);
  $("#publishScheduleMode").addEventListener("change", updateModeControls);

  updateModeControls();
}

boot();