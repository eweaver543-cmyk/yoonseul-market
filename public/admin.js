// 서버가 발급한 24시간 관리자 인증을 브라우저에 보관하고 새로고침 후 복원합니다.
let token = localStorage.getItem("yoonseulAdmin");
let dashboardData = { requests: [], users: [], inquiries: [], brands: [], categories: [], products: [], stats: { total: 0, active: 0, estimatedRevenue: 0, byStatus: {} } };
let currentView = "dashboard";
let productImages = { main: [], detail: [] };
let productOptionTags = { colors: [], sizes: [] };
let productUploadQueue = [];
let activeProductUploads = 0;
const PRODUCT_UPLOAD_CONCURRENCY = 2;
let draggedBrandItem = null;
const statuses = ["입금대기", "배송준비중", "배송중", "배송완료", "취소/반품"];
let activeOrderStatus = "";
const DESIGN_STORAGE_KEY = "yoonseulDesignBanners";
const INQUIRY_CHANNEL_STORAGE_KEY = "yoonseulInquiryChannels";
const PAYMENT_METHOD_STORAGE_KEY = "yoonseulPaymentMethods";
const PROMOTION_STORAGE_KEY = "yoonseulPromotions";
const REVIEW_STORAGE_KEY = "yoonseulReviews";
const REVIEW_UPDATED_KEY = "yoonseulReviewsUpdated";
const DEFAULT_INQUIRY_CHANNELS = {
  kakao: "https://pf.kakao.com/",
  line: "https://line.me/",
  telegram: "https://t.me/",
  google: "https://forms.google.com/",
  liveChannel: "https://channel.io/"
};
const DEFAULT_PAYMENT_METHODS = {
  bankEnabled: true,
  bankLabel: "무통장입금",
  bankName: "국민은행",
  bankAccount: "448601-01-496883",
  bankHolder: "박성현",
  bankNotice: "입금자명과 주문자명이 다를 경우 고객센터로 꼭 알려주세요.",
  cardEnabled: true,
  cardLabel: "카드결제",
  cardProvider: "국내외 주요 카드 결제 지원",
  cardNotice: "카드사별 할부 및 승인 정책에 따라 결제 화면에서 최종 조건이 안내됩니다."
};
const DEFAULT_PROMOTIONS = [
  {
    id: "promo-coupon-welcome-202607",
    type: "coupon",
    title: "신규 회원 웰컴 쿠폰",
    code: "WELCOME10",
    benefitType: "percent",
    benefitValue: 10,
    conditionText: "회원가입 후 첫 주문 시 사용 가능",
    startAt: "2026-07-01",
    endAt: "2026-07-31",
    active: true,
    description: "첫 구매 고객에게 10% 할인 혜택을 제공합니다."
  },
  {
    id: "promo-event-summer-202607",
    type: "event",
    title: "썸머 럭셔리 셀렉션 이벤트",
    code: "",
    benefitType: "text",
    benefitValue: 0,
    conditionText: "일부 브랜드 한정 특가",
    startAt: "2026-07-10",
    endAt: "2026-08-10",
    active: true,
    description: "여름 시즌 인기 브랜드를 한정 특가로 운영하는 기획전입니다."
  }
];
const CUSTOMS_NOTICE_TEXT = `안녕하세요, 고객님! 2026년 2월 2일부터 세관의 해외 수입 물품 통관 검증 절차가 대폭 강화됩니다.

이에 따라 주문 시 입력하신 수취인 정보(성함 / 연락처 / 개인통관고유부호 / 우편번호) 4가지가 모두 일치해야만 정상 통관이 가능합니다.

특히 우편번호가 불일치할 경우 다음과 같은 문제가 발생합니다.
❌ 통관 지연 및 반송 처리 (추가 물류비 고객 부담 발생 가능)
❌ 출고 불가 (송장 출력 후 우편번호만 수정 시, 택배사 시스템 오류 및 분실 위험으로 인해 출고 자체가 제한됩니다.)

💡 주문 전 꼭 확인해 주세요! 결제 전, 입력하신 [주소]와 [우편번호 5자리]가 정확히 일치하는지 다시 한번 반드시 확인 부탁드립니다.

안전하고 신속한 배송을 위해 고객님의 적극적인 협조 부탁드립니다. 감사합니다.`;
const DEFAULT_DESIGN_BANNERS = [
  {
    id: "notice-top-customs-20260202",
    position: "top",
    title: "세관 통관 검증 강화 안내",
    content: CUSTOMS_NOTICE_TEXT,
    active: true,
    updatedAt: "2026-07-10T00:00:00.000Z"
  },
  {
    id: "notice-popup-customs-20260202",
    position: "popup",
    title: "해외 수입 물품 통관 검증 절차 강화 안내",
    content: CUSTOMS_NOTICE_TEXT,
    active: true,
    updatedAt: "2026-07-10T00:00:00.000Z"
  }
];
const DESIGN_POSITION_LABELS = {
  top: "홈 상단 띠배너",
  bottom: "홈 하단 배너",
  popup: "중앙 공지 팝업창"
};
const viewIcons = {
  brands: "fa-tags", categories: "fa-layer-group", products: "fa-box-open",
  members: "fa-users", reviews: "fa-star", design: "fa-images",
  promotions: "fa-gift", inquiries: "fa-comments", payments: "fa-credit-card"
};
const money = (value) => Number(value || 0).toLocaleString("ko-KR");
const dateText = (value) => new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const seoulDateKey = (value = new Date()) => new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

async function adminApi(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (response.status === 401) {
    localStorage.removeItem("yoonseulAdmin");
    token = null;
    showLogin();
    throw new Error("관리자 로그인이 필요합니다.");
  }
  return response.json();
}

function showLogin() {
  document.querySelector("#loginScreen").hidden = false;
  document.querySelector("#adminApp").hidden = true;
}

async function startAdmin() {
  dashboardData = await adminApi("/api/admin/dashboard");
  document.querySelector("#loginScreen").hidden = true;
  document.querySelector("#adminApp").hidden = false;
  document.querySelector("#orderBadge").textContent = dashboardData.stats.active;
  switchView(currentView);
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#loginMessage");
  message.textContent = "로그인 중입니다...";
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))
  });
  const result = await response.json();
  if (!response.ok) {
    message.textContent = result.error;
    return;
  }
  token = result.token;
  localStorage.setItem("yoonseulAdmin", token);
  message.textContent = result.concurrentLogin ? "동시 접속 가능 모드로 로그인되었습니다." : "로그인되었습니다.";
  startAdmin();
});

function isPendingInquiry(inquiry) {
  return !["답변완료", "완료", "closed", "resolved"].includes(String(inquiry.status || "대기").toLowerCase());
}

function dashboardBadgeClass(status) {
  if (status === "배송완료") return "paid";
  if (status === "배송중") return "shipping";
  return "ready";
}

function dashboardTemplate() {
  const today = seoulDateKey();
  const orders = [...dashboardData.requests].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const todayOrders = orders.filter((order) => order.createdAt && seoulDateKey(order.createdAt) === today);
  const todayRevenue = todayOrders
    .filter((order) => order.status !== "취소/반품")
    .reduce((sum, order) => sum + Number(order.confirmedPrice || order.estimatedPrice || 0), 0);
  const todayMembers = dashboardData.users.filter((user) => user.createdAt && seoulDateKey(user.createdAt) === today);
  const pendingInquiries = [...dashboardData.inquiries]
    .filter(isPendingInquiry)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const byStatus = dashboardData.stats.byStatus || {};
  const recentOrders = orders.slice(0, 3);
  const recentInquiries = pendingInquiries.slice(0, 3);
  const orderRows = recentOrders.length ? recentOrders.map((order) => `<tr>
    <td>${safeHtml(order.id)}</td><td>${safeHtml(order.productName || order.itemType || "상품 정보")}</td>
    <td>${safeHtml(order.name || order.email || "고객")}</td><td>₩${money(order.confirmedPrice || order.estimatedPrice)}</td>
    <td><span class="dashboard-badge ${dashboardBadgeClass(order.status)}">${safeHtml(order.status || "입금대기")}</span></td>
  </tr>`).join("") : `<tr><td colspan="5" class="dashboard-empty">아직 접수된 주문이 없습니다.</td></tr>`;
  const inquiryRows = recentInquiries.length ? recentInquiries.map((inquiry) => `<tr>
    <td><span class="inquiry-type">${safeHtml(inquiry.type || "1:1 문의")}</span></td>
    <td>${safeHtml(inquiry.title || inquiry.content || "문의 내용")}</td>
    <td>${safeHtml(inquiry.userName || inquiry.name || inquiry.email || "고객")}</td>
    <td>${inquiry.createdAt ? dateText(inquiry.createdAt) : "-"}</td>
  </tr>`).join("") : `<tr><td colspan="4" class="dashboard-empty">답변을 기다리는 문의가 없습니다.</td></tr>`;

  return `<div id="dashboard-section" class="dashboard-section">
    <div class="view-heading"><div><p>OVERVIEW</p><h2>대시보드</h2></div><button data-switch="products" data-open-product-editor="true"><i class="fa-solid fa-plus"></i> 새 상품 등록</button></div>
    <section class="dashboard-welcome"><div><small>WELCOME BACK, ADMIN</small><h2>오늘의 윤슬마켓 현황입니다.</h2><p>홈페이지의 주문·회원·문의 데이터가 PC와 모바일 관리자 화면에 실시간 연동됩니다.</p></div><time><i class="fa-regular fa-calendar"></i>${new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(new Date())}</time></section>
    <section class="kpi-grid">
      <article class="kpi-card" data-switch="orders"><div class="kpi-icon"><i class="fa-solid fa-won-sign"></i></div><div><span>오늘 매출액</span><strong>₩${money(todayRevenue)}</strong><small>오늘 접수된 취소 제외 주문 기준</small></div></article>
      <article class="kpi-card" data-switch="orders"><div class="kpi-icon"><i class="fa-solid fa-bag-shopping"></i></div><div><span>오늘 신규 주문</span><strong>${todayOrders.length}<em>건</em></strong><small>전체 주문 ${orders.length}건</small></div></article>
      <article class="kpi-card" data-switch="members"><div class="kpi-icon"><i class="fa-solid fa-user-plus"></i></div><div><span>오늘 신규 가입</span><strong>${todayMembers.length}<em>명</em></strong><small>전체 회원 ${dashboardData.users.length}명</small></div></article>
      <article class="kpi-card highlight" data-switch="inquiries"><div class="kpi-icon"><i class="fa-solid fa-comment-dots"></i></div><div><span>미답변 1:1 문의</span><strong>${pendingInquiries.length}<em>건</em></strong><small>${pendingInquiries.length ? "빠른 확인이 필요합니다" : "대기 중인 문의가 없습니다"}</small></div></article>
    </section>
    <section class="workflow-panel">
      <div class="dashboard-section-head"><div><h3>실시간 주문 처리 단계</h3><p>홈페이지 주문 상태와 동일한 현재 현황입니다.</p></div><button data-switch="orders">주문 관리 바로가기 →</button></div>
      <div class="workflow-steps">
        <article data-switch="orders" data-order-status="입금대기"><span class="workflow-icon"><i class="fa-solid fa-wallet"></i></span><div><small>STEP 01</small><b>입금 대기</b></div><strong>${Number(byStatus["입금대기"] || 0)}</strong></article>
        <i class="workflow-arrow fa-solid fa-chevron-right"></i>
        <article data-switch="orders" data-order-status="배송준비중"><span class="workflow-icon"><i class="fa-solid fa-box"></i></span><div><small>STEP 02</small><b>배송 준비중</b></div><strong>${Number(byStatus["배송준비중"] || 0)}</strong></article>
        <i class="workflow-arrow fa-solid fa-chevron-right"></i>
        <article data-switch="orders" data-order-status="배송중"><span class="workflow-icon"><i class="fa-solid fa-truck-fast"></i></span><div><small>STEP 03</small><b>배송중</b></div><strong>${Number(byStatus["배송중"] || 0)}</strong></article>
        <i class="workflow-arrow fa-solid fa-chevron-right"></i>
        <article class="attention" data-switch="orders" data-order-status="취소/반품"><span class="workflow-icon"><i class="fa-solid fa-rotate-left"></i></span><div><small>STEP 04</small><b>취소/반품</b></div><strong>${Number(byStatus["취소/반품"] || 0)}</strong></article>
      </div>
    </section>
    <section class="activity-grid">
      <article class="dashboard-table-card"><div class="dashboard-section-head"><div><h3>최근 주문 요약</h3><p>서버에 접수된 가장 최근 주문 3건입니다.</p></div><button data-switch="orders">전체보기 →</button></div>
        <div class="table-wrap"><table class="summary-table"><thead><tr><th>주문번호</th><th>상품명</th><th>구매자</th><th>금액</th><th>상태</th></tr></thead><tbody>${orderRows}</tbody></table></div>
      </article>
      <article class="dashboard-table-card"><div class="dashboard-section-head"><div><h3>답변 대기 문의</h3><p>서버에 접수된 답변 필요 문의입니다.</p></div><button data-switch="inquiries">문의 관리 →</button></div>
        <div class="table-wrap"><table class="summary-table inquiry-table"><thead><tr><th>유형</th><th>제목</th><th>작성자</th><th>접수일시</th></tr></thead><tbody>${inquiryRows}</tbody></table></div>
      </article>
    </section>
  </div>`;
}

function orderStatusClass(status) {
  return ({ "입금대기": "waiting", "배송준비중": "preparing", "배송중": "shipping", "배송완료": "complete", "취소/반품": "cancelled" })[status] || "waiting";
}

function requestTable(items) {
  if (!items.length) return `<div class="order-empty"><i class="fa-solid fa-box-open"></i><p>조건에 맞는 주문이 없습니다.</p></div>`;
  return `<div class="table-wrap"><table class="order-management-table"><thead><tr><th><input type="checkbox" id="selectAllOrders" aria-label="전체 주문 선택"></th><th>주문번호 / 일시</th><th>주문상품 (옵션포함)</th><th>구매자 / 연락처</th><th>결제금액 (₩)</th><th>개인통관고유부호</th><th>주문상태 관리</th></tr></thead><tbody>
    ${items.map((item) => `<tr data-order-row="${item.id}">
      <td><input type="checkbox" class="order-row-check" value="${item.id}" aria-label="${item.id} 선택"></td>
      <td><strong class="order-number">${item.id}</strong><small>${dateText(item.createdAt)}</small></td>
      <td><strong class="order-product-name">${safeHtml(item.productName || item.itemType)}</strong><span class="order-option">옵션: ${safeHtml(item.option || "기본")}</span></td>
      <td><strong>${safeHtml(item.name)}</strong><small>${safeHtml(item.phone)}</small></td>
      <td><strong class="order-price">₩${money(item.confirmedPrice || item.estimatedPrice)}</strong><small>${item.confirmedPrice ? "결제 확정" : "예상 금액"}</small></td>
      <td><code class="customs-code">${safeHtml(item.customsCode)}</code></td>
      <td><div class="order-status-control"><span class="order-status-badge ${orderStatusClass(item.status)}">${item.status}</span><select class="order-status-select ${orderStatusClass(item.status)}" data-order="${item.id}" aria-label="${item.id} 주문상태">${statuses.map((status) => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}</select></div></td>
    </tr>`).join("")}
    </tbody></table></div>`;
}

function orderTabsTemplate() {
  const tabs = [{ value: "", label: "전체" }, ...statuses.map((status) => ({ value: status, label: status }))];
  return tabs.map((tab) => {
    const count = tab.value ? dashboardData.requests.filter((item) => item.status === tab.value).length : dashboardData.requests.length;
    return `<button class="order-process-tab ${activeOrderStatus === tab.value ? "active" : ""}" data-order-tab="${tab.value}">${tab.label}<span>${count}</span></button>`;
  }).join("");
}

function ordersTemplate() {
  const initialItems = dashboardData.requests.filter((item) => !activeOrderStatus || item.status === activeOrderStatus);
  return `<div class="view-heading"><div><p>ORDER MANAGEMENT</p><h2>주문 관리</h2></div><div class="orders-toolbar"><input id="orderSearch" placeholder="주문번호, 상품명 또는 구매자 검색"></div></div>
    <section class="order-process-panel"><div class="order-process-tabs" id="orderProcessTabs">${orderTabsTemplate()}</div></section>
    <section class="panel order-list-panel">
      <div class="order-bulk-toolbar"><div><button id="bulkShipping"><i class="fa-solid fa-truck-fast"></i> 선택 건 배송중으로 변경</button><button id="bulkComplete"><i class="fa-solid fa-circle-check"></i> 선택 건 배송완료로 변경</button></div><span id="visibleOrderCount">${initialItems.length}건 표시</span></div>
      <div id="ordersTable">${requestTable(initialItems)}</div>
    </section>`;
}

function brandsTemplate() {
  const sorted = [...dashboardData.brands].sort((a, b) => Number(a.order) - Number(b.order));
  return `<div class="view-heading"><div><p>BRAND MANAGEMENT</p><h2>브랜드 관리</h2></div><button id="newBrandButton"><i class="fa-solid fa-plus"></i> 새 브랜드 등록</button></div>
    <section class="brand-editor panel" id="brandEditor" hidden>
      <div class="panel-head"><div><h3 id="brandEditorTitle">새 브랜드 등록</h3><p>메인 메뉴와 상품 필터에 사용할 브랜드 정보를 입력하세요.</p></div><button id="closeBrandEditor">닫기 ×</button></div>
      <form id="brandForm" class="management-form">
        <input type="hidden" name="id">
        <label>브랜드 국문명<input name="koName" id="brandKoName" required placeholder="예: 샤넬"></label>
        <label>브랜드 영문명<input name="enName" id="brandEnName" required placeholder="국문명 입력 시 자동 완성"><small class="auto-translate-note"><i class="fa-solid fa-language"></i> 국문명을 기준으로 자동 입력됩니다.</small></label>
        <label>정렬 순서<input name="order" required type="number" min="1" value="${sorted.length + 1}"></label>
        <label class="featured-field"><input name="featured" type="checkbox"><span><b>추천/인기 브랜드로 설정</b><small>메인 상단 메뉴와 인기 검색어 태그에 자동 노출됩니다.</small></span></label>
        <button class="form-submit" type="submit">브랜드 저장</button>
      </form>
    </section>
    <section class="panel brand-sort-panel">
      <div class="panel-head"><div><h3>홈페이지 브랜드 순서</h3><p>왼쪽 핸들을 잡아 순서를 바꾸면 홈페이지 메뉴와 필터에 동일하게 반영됩니다.</p></div><span><i class="fa-solid fa-grip-lines"></i> DRAG & DROP</span></div>
      <div class="brand-sort-list" id="brandSortList">
        ${sorted.map((brand, index) => `<article class="brand-sort-item" draggable="true" data-brand-id="${brand.id}">
          <button type="button" class="brand-drag-handle" aria-label="${safeHtml(brand.koName)} 순서 이동"><i class="fa-solid fa-grip-vertical"></i></button>
          <span class="brand-sort-number">${index + 1}</span>
          <span class="brand-sort-fallback">${safeHtml(brand.enName.slice(0, 1))}</span>
          <div><b>${safeHtml(brand.koName)}</b><small>${safeHtml(brand.enName)}</small></div>
          <span class="brand-sort-home ${brand.featured ? "on" : ""}">${brand.featured ? "메인 메뉴 노출" : "필터 노출"}</span>
        </article>`).join("")}
      </div>
      <div class="brand-sort-footer"><p><i class="fa-solid fa-circle-info"></i> 순서를 이동한 뒤 저장 버튼을 눌러주세요.</p><button id="saveBrandOrder"><i class="fa-solid fa-check"></i> 순서 저장하기</button></div>
    </section>
    <section class="panel"><div class="panel-head"><div><h3>등록 브랜드</h3><p>숫자가 낮을수록 메인 화면 앞쪽에 표시됩니다.</p></div><span>${sorted.length}개</span></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>국문명</th><th>영문명</th><th>추천 브랜드</th><th>정렬</th><th>관리</th></tr></thead><tbody>
      ${sorted.map((brand) => `<tr><td><strong>#${brand.id}</strong></td><td><strong>${brand.koName}</strong></td><td>${brand.enName}</td><td><span class="recommend-badge ${brand.featured ? "on" : ""}">${brand.featured ? "Y · 노출중" : "N"}</span></td><td>${brand.order}</td><td><button class="table-action edit-brand" data-brand="${brand.id}">수정</button><button class="table-action danger delete-brand" data-brand="${brand.id}">삭제</button></td></tr>`).join("")}
      </tbody></table></div>
    </section>`;
}

function productsTemplate() {
  const brandOptions = [...dashboardData.brands].sort((a, b) => Number(a.order) - Number(b.order)).map((brand) => `<option value="${brand.id}">${brand.koName} / ${brand.enName}</option>`).join("");
  return `<div class="view-heading"><div><p>PRODUCT MANAGEMENT</p><h2>상품 관리</h2></div><button id="newProductButton"><i class="fa-solid fa-plus"></i> 새 상품 등록</button></div>
    <section class="panel product-editor" id="productEditor" hidden><div class="panel-head"><div><h3 id="productEditorTitle">새 상품 등록</h3><p>대분류를 고르면 등록 가능한 소분류만 자동으로 표시됩니다.</p></div><button id="closeProductEditor">닫기 ×</button></div>
      <form id="productForm" class="management-form product-form">
        <input type="hidden" name="id">
        <div class="category-control-row">
          <b>카테고리</b>
          <label><span>대분류</span><select name="brandId" id="productBrandSelect" required><option value="">대분류 선택</option>${brandOptions}</select></label>
          <label><span>소분류</span><select name="categoryId" id="productCategorySelect" required disabled><option value="">대분류를 먼저 선택하세요</option></select></label>
          <div class="category-quick-actions">
            <button type="button" id="addParentCategory"><i class="fa-solid fa-plus"></i> 대분류 추가</button>
            <button type="button" id="addChildCategory"><i class="fa-solid fa-plus"></i> 소분류 추가</button>
            <button type="button" id="editChildCategory"><i class="fa-solid fa-pen"></i> 수정</button>
            <button type="button" id="deleteChildCategory" class="danger"><i class="fa-regular fa-trash-can"></i> 삭제</button>
          </div>
        </div>
        <div class="quick-category-editor" id="quickCategoryEditor" hidden>
          <strong id="quickCategoryTitle">소분류 추가</strong>
          <input id="quickCategoryName" type="text" maxlength="30" placeholder="소분류명 (예: 시계)" autocomplete="off">
          <button type="button" id="saveQuickCategory">저장</button>
          <button type="button" id="cancelQuickCategory">취소</button>
        </div>
        <div class="product-basic-row">
          <label>상품명<input name="name" id="productNameInput" required maxlength="120" placeholder="상품명을 입력하세요"></label>
          <label>상세 설명<input name="description" id="productDescriptionInput" readonly placeholder="상품명과 동일하게 자동 반영됩니다."></label>
          <label>판매가<input name="price" type="number" min="1" required placeholder="판매가 입력"></label>
        </div>
        <section class="product-form-section image-upload-section">
          <div class="form-section-heading"><div><span>01</span><div><h4>상품 이미지</h4><p>선택 즉시 미리보기를 표시하고 최대 1200px·WebP/JPEG 78% 품질로 자동 최적화합니다.</p></div></div><strong id="imageOptimizationSummary">대표 0/10 · 상세 0/20</strong></div>
          <div class="upload-field">
            <div class="upload-label"><b>대표 이미지</b><small>첫 번째 이미지가 쇼핑몰 대표 이미지로 사용됩니다.</small></div>
            <input id="mainImageInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
            <label class="image-drop-zone" for="mainImageInput" data-image-kind="main"><i class="fa-regular fa-image"></i><b>대표 이미지 추가</b><span>클릭 또는 드래그 앤 드롭 · 최대 10장</span></label>
            <div class="image-preview-grid" id="mainImagePreviews"></div>
          </div>
          <div class="upload-field">
            <div class="upload-label"><b>상세 이미지 목록</b><small>여러 장을 한 번에 선택하거나 이 영역에 끌어다 놓으세요.</small></div>
            <input id="detailImageInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
            <label class="image-drop-zone wide" for="detailImageInput" data-image-kind="detail"><i class="fa-solid fa-cloud-arrow-up"></i><b>상세 이미지 다중 업로드</b><span>JPG·PNG·WEBP · 최대 20장 · 용량 제한 없음</span></label>
            <div class="image-preview-grid detail" id="detailImagePreviews"></div>
          </div>
        </section>
        <section class="product-form-section product-option-section">
          <div class="form-section-heading"><div><span>02</span><div><h4>상품 옵션</h4><p>색상과 사이즈를 각각 입력하면 고객이 홈페이지에서 따로 선택할 수 있습니다.</p></div></div><strong id="optionCombinationCount">색상 0 · 사이즈 0</strong></div>
          <div class="option-tag-inputs">
            <div><label for="colorTagInput">색상</label><div class="tag-input-box"><div id="colorTags" class="option-tags"></div><input id="colorTagInput" placeholder="예: 블랙 + Enter" autocomplete="off"></div></div>
            <div><label for="sizeTagInput">사이즈</label><div class="tag-input-box"><div id="sizeTags" class="option-tags"></div><input id="sizeTagInput" placeholder="예: M + Enter" autocomplete="off"></div></div>
          </div>
          <div class="option-table-wrap">
            <table class="option-matrix simple"><thead><tr><th>홈페이지 선택 옵션</th></tr></thead><tbody id="optionMatrixBody"><tr class="option-empty-row"><td>색상 또는 사이즈를 추가하면 이곳에 항목별로 정리됩니다.</td></tr></tbody></table>
          </div>
        </section>
        <div class="product-submit-actions"><button class="form-submit" id="productSubmitButton" type="submit">상품 등록 완료</button></div>
      </form>
    </section>
    <section class="panel product-list-panel"><div class="panel-head"><div><h3>등록 상품 목록</h3><p>상품 이미지와 분류 정보를 확인하고 바로 수정하거나 삭제할 수 있습니다.</p></div><span id="productCount">${dashboardData.products.length}개</span></div>
      <div class="table-wrap"><table class="product-management-table"><thead><tr><th><input type="checkbox" id="selectAllProducts" aria-label="전체 상품 선택"></th><th>대표 이미지</th><th>상품명</th><th>브랜드</th><th>카테고리</th><th>가격 (₩)</th><th>상세 이미지 갯수</th><th>관리</th></tr></thead><tbody id="productTableBody">
      ${productRowsTemplate(dashboardData.products)}
      </tbody></table></div>
    </section>`;
}

function productRowsTemplate(products) {
  const newestFirst = [...products].sort((a, b) => {
    const createdDifference = (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    return createdDifference || Number(b.id || 0) - Number(a.id || 0);
  });
  return newestFirst.map((product) => {
    const brand = dashboardData.brands.find((item) => Number(item.id) === Number(product.brandId));
    const category = findCategory(product.categoryId);
    const thumbnail = product.images?.main?.[0] || product.image || "";
    const detailCount = product.images?.detail?.length || 0;
    return `<tr data-product-row="${product.id}">
      <td><input type="checkbox" class="product-row-check" value="${product.id}" aria-label="${safeHtml(product.name)} 선택"></td>
      <td>${thumbnail ? `<img class="product-list-thumb" src="${thumbnail}" alt="${safeHtml(product.name)} 대표 이미지" loading="lazy">` : `<span class="product-thumb-empty"><i class="fa-regular fa-image"></i></span>`}</td>
      <td><strong class="product-list-name">${safeHtml(product.name)}</strong><small>상품번호 #${product.id}</small></td>
      <td>${brand ? `${safeHtml(brand.koName)}<small>${safeHtml(brand.enName)}</small>` : "미지정"}</td>
      <td><span class="product-category-badge">${safeHtml(category?.name || "미분류")}</span></td>
      <td><strong class="product-list-price">₩${money(product.price)}</strong></td>
      <td><span class="detail-count-badge"><i class="fa-regular fa-images"></i> ${detailCount}장</span></td>
      <td><div class="product-row-actions"><button type="button" class="edit-product" data-product="${product.id}"><i class="fa-solid fa-pen"></i> 수정</button><button type="button" class="delete-product" data-product="${product.id}"><i class="fa-regular fa-trash-can"></i> 삭제</button></div></td>
    </tr>`;
  }).join("");
}

function memberOrders(userId) {
  return dashboardData.requests.filter((order) => order.userId === userId);
}

function memberPurchaseTotal(userId) {
  return memberOrders(userId).reduce((sum, order) => sum + Number(order.confirmedPrice || order.estimatedPrice || 0), 0);
}

function membersTemplate() {
  const members = dashboardData.users.filter((user) => user.role !== "ADMIN");
  const today = seoulDateKey();
  const month = today.slice(0, 7);
  const todayNew = members.filter((user) => seoulDateKey(user.createdAt) === today).length;
  const vipCount = members.filter((user) => user.grade === "VIP").length;
  const monthlyBuyers = members.filter((user) => memberOrders(user.id).some((order) => seoulDateKey(order.createdAt).slice(0, 7) === month)).length;
  return `<div class="view-heading"><div><p>USER MANAGEMENT</p><h2>회원 관리</h2></div><div class="member-live-status"><i class="fa-solid fa-circle"></i> 홈페이지 회원 데이터 실시간 연동</div></div>
    <section class="member-summary-grid">
      <article><span><i class="fa-solid fa-users"></i></span><div><small>전체 회원수</small><strong>${members.length}<em>명</em></strong></div></article>
      <article><span><i class="fa-solid fa-user-plus"></i></span><div><small>오늘 신규 가입</small><strong>${todayNew}<em>명</em></strong></div></article>
      <article class="vip"><span><i class="fa-solid fa-crown"></i></span><div><small>VIP 등급 회원</small><strong>${vipCount}<em>명</em></strong></div></article>
      <article><span><i class="fa-solid fa-bag-shopping"></i></span><div><small>당월 구매 회원</small><strong>${monthlyBuyers}<em>명</em></strong></div></article>
    </section>
    <section class="panel member-list-panel">
      <div class="panel-head"><div><h3>홈페이지 가입 회원</h3><p>가입 정보와 구매 활동을 한눈에 확인할 수 있습니다.</p></div><span>${members.length}명</span></div>
      <div class="table-wrap"><table class="member-management-table"><thead><tr><th><input type="checkbox" id="selectAllMembers" aria-label="전체 회원 선택"></th><th>가입일시</th><th>아이디 / 이메일</th><th>회원명 / 연락처</th><th>등급</th><th>누적 주문건수</th><th>총 구매금액 (₩)</th><th>관리</th></tr></thead><tbody>
        ${members.map((user) => { const orders = memberOrders(user.id); return `<tr>
          <td><input type="checkbox" class="member-row-check" value="${user.id}" aria-label="${safeHtml(user.name)} 선택"></td>
          <td><strong>${dateText(user.createdAt)}</strong><small>${seoulDateKey(user.createdAt)}</small></td>
          <td><strong class="member-id">${user.id}</strong><small>${safeHtml(user.email)}</small></td>
          <td><strong>${safeHtml(user.name)}</strong><small>${safeHtml(user.phone || "연락처 미입력")}</small></td>
          <td><span class="member-grade ${user.grade === "VIP" ? "vip" : ""}">${user.grade === "VIP" ? `<i class="fa-solid fa-crown"></i> VIP` : "일반"}</span></td>
          <td><strong>${orders.length}건</strong></td>
          <td><strong class="member-spend">₩${money(memberPurchaseTotal(user.id))}</strong></td>
          <td><button class="member-detail-button" data-member="${user.id}"><i class="fa-regular fa-address-card"></i> 상세보기</button></td>
        </tr>`; }).join("")}
      </tbody></table></div>
    </section>
    <div class="member-modal-backdrop" id="memberModal" hidden>
      <section class="member-modal" role="dialog" aria-modal="true" aria-labelledby="memberModalTitle">
        <button class="member-modal-close" id="memberModalClose" aria-label="회원 상세 닫기">×</button>
        <div id="memberModalBody"></div>
      </section>
    </div>`;
}

function memberActivityTemplate(userId, type) {
  if (type === "orders") {
    const orders = memberOrders(userId);
    return orders.length ? `<div class="member-activity-list">${orders.map((order) => `<article><div><b>${safeHtml(order.productName || order.itemType)}</b><small>${order.id} · ${dateText(order.createdAt)}</small></div><span>₩${money(order.confirmedPrice || order.estimatedPrice)}</span><em>${order.status}</em></article>`).join("")}</div>` : `<div class="member-activity-empty">최근 주문 내역이 없습니다.</div>`;
  }
  const inquiries = dashboardData.inquiries.filter((inquiry) => inquiry.userId === userId);
  return inquiries.length ? `<div class="member-activity-list">${inquiries.map((inquiry) => `<article><div><b>${safeHtml(inquiry.title)}</b><small>${safeHtml(inquiry.type)} · ${dateText(inquiry.createdAt)}</small></div><em>${inquiry.status}</em></article>`).join("")}</div>` : `<div class="member-activity-empty">작성한 1:1 문의가 없습니다.</div>`;
}

function openMemberModal(userId) {
  const user = dashboardData.users.find((item) => item.id === userId);
  if (!user) return;
  document.querySelector("#memberModalBody").innerHTML = `<div class="member-modal-head"><span>${safeHtml(user.name).slice(0, 1)}</span><div><small>MEMBER PROFILE</small><h2 id="memberModalTitle">${safeHtml(user.name)} 회원 상세정보</h2><p>${safeHtml(user.email)} · ${safeHtml(user.phone || "연락처 미입력")}</p></div><strong class="member-grade ${user.grade === "VIP" ? "vip" : ""}">${user.grade === "VIP" ? "VIP" : "일반 회원"}</strong></div>
    <div class="member-profile-grid"><div><small>회원 아이디</small><b>${user.id}</b></div><div><small>가입일</small><b>${String(user.createdAt).slice(0, 10)}</b></div><div><small>누적 주문</small><b>${memberOrders(user.id).length}건</b></div><div><small>총 구매금액</small><b>₩${money(memberPurchaseTotal(user.id))}</b></div></div>
    <div class="member-modal-tabs"><button class="active" data-member-tab="orders" data-member-id="${user.id}">최근 주문 내역</button><button data-member-tab="inquiries" data-member-id="${user.id}">작성한 1:1 문의 내역</button></div>
    <div id="memberActivityContent">${memberActivityTemplate(user.id, "orders")}</div>`;
  document.querySelector("#memberModal").hidden = false;
  bindMemberModalTabs();
}

function bindMemberModalTabs() {
  document.querySelectorAll("[data-member-tab]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-member-tab]").forEach((tab) => tab.classList.toggle("active", tab === button));
    document.querySelector("#memberActivityContent").innerHTML = memberActivityTemplate(button.dataset.memberId, button.dataset.memberTab);
  }));
}

function closeMemberModal() {
  const modal = document.querySelector("#memberModal");
  if (modal) modal.hidden = true;
}

function categoriesTemplate() {
  const brands = [...dashboardData.brands].sort((a, b) => Number(a.order) - Number(b.order));
  const selectedBrandId = Number(brands[0]?.id || 0);
  return `<div class="view-heading"><div><p>CATEGORY MANAGEMENT</p><h2>카테고리 관리</h2></div><button data-switch="products"><i class="fa-solid fa-box-open"></i> 상품 등록으로 이동</button></div>
    <section class="category-guide">
      <i class="fa-solid fa-shield-halved"></i><div><strong>브랜드를 대분류로 사용합니다.</strong><p>등록된 소분류만 상품에서 선택할 수 있어 오타와 잘못된 분류를 예방합니다.</p></div>
    </section>
    <section class="panel category-manager">
      <div class="panel-head"><div><h3>대분류별 소분류 관리</h3><p>대분류를 선택하고 필요한 제품군을 바로 추가하세요.</p></div><span>${dashboardData.categories.reduce((sum, group) => sum + (group.items || []).length, 0)}개</span></div>
      <div class="category-manager-toolbar">
        <label>대분류<select id="categoryBrandManager">${brands.map((brand) => `<option value="${brand.id}">${brand.koName} / ${brand.enName}</option>`).join("")}</select></label>
        <label>새 소분류<input id="managerCategoryName" maxlength="30" placeholder="예: 시계"></label>
        <button id="managerAddCategory"><i class="fa-solid fa-plus"></i> 소분류 추가</button>
        <button id="managerAddBrand" class="secondary"><i class="fa-solid fa-tags"></i> 대분류 추가</button>
      </div>
      <div id="categoryManagerList">${categoryListTemplate(selectedBrandId)}</div>
    </section>`;
}

function categoryListTemplate(brandId) {
  const brand = dashboardData.brands.find((item) => Number(item.id) === Number(brandId));
  const items = categoryItems(brandId);
  if (!items.length) return `<div class="category-empty"><i class="fa-solid fa-layer-group"></i><p><b>${brand?.koName || "선택한 대분류"}</b>에 등록된 소분류가 없습니다.</p></div>`;
  return `<div class="category-list-head"><strong>${brand?.koName || ""} 소분류</strong><span>${items.length}개</span></div>
    <div class="category-chip-grid">${items.map((item) => `<article><span><small>#${item.id}</small><b>${item.name}</b></span><div><button class="manager-edit-category" data-category="${item.id}"><i class="fa-solid fa-pen"></i> 수정</button><button class="manager-delete-category danger" data-category="${item.id}"><i class="fa-regular fa-trash-can"></i> 삭제</button></div></article>`).join("")}</div>`;
}

function isDesignBannerActive(item) {
  return item?.active === true || item?.active === 1 || item?.active === "true" || item?.active === "1";
}

function normalizeDesignBanners(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item, active: isDesignBannerActive(item) }));
}

function getDesignBanners() {
  if (Array.isArray(dashboardData.siteSettings?.designBanners)) return normalizeDesignBanners(dashboardData.siteSettings.designBanners);
  try {
    const saved = JSON.parse(localStorage.getItem(DESIGN_STORAGE_KEY) || "null");
    if (Array.isArray(saved)) return normalizeDesignBanners(saved);
  } catch (_) {}
  localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(DEFAULT_DESIGN_BANNERS));
  return [...DEFAULT_DESIGN_BANNERS];
}

async function saveDesignBanners(items) {
  const sorted = normalizeDesignBanners(items).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const saved = await adminApi("/api/admin/site-settings", { method: "PUT", body: JSON.stringify({ designBanners: sorted }) });
  const serverItems = normalizeDesignBanners(saved.designBanners);
  localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(serverItems));
  localStorage.setItem("yoonseulDesignUpdated", String(Date.now()));
  dashboardData.siteSettings ||= {};
  dashboardData.siteSettings.designBanners = serverItems;
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("yoonseul-design");
    channel.postMessage({ type: "design-updated" });
    channel.close();
  }
  return serverItems;
}

function getInquiryChannels() {
  const serverSaved = dashboardData.siteSettings?.inquiryChannels;
  if (serverSaved && Object.keys(serverSaved).length) return { ...DEFAULT_INQUIRY_CHANNELS, ...serverSaved };
  try {
    const saved = JSON.parse(localStorage.getItem(INQUIRY_CHANNEL_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      return {
        kakao: saved.kakao == null ? DEFAULT_INQUIRY_CHANNELS.kakao : String(saved.kakao),
        line: saved.line == null ? DEFAULT_INQUIRY_CHANNELS.line : String(saved.line),
        telegram: saved.telegram == null ? DEFAULT_INQUIRY_CHANNELS.telegram : String(saved.telegram),
        google: saved.google == null ? DEFAULT_INQUIRY_CHANNELS.google : String(saved.google),
        liveChannel: saved.liveChannel == null ? DEFAULT_INQUIRY_CHANNELS.liveChannel : String(saved.liveChannel)
      };
    }
  } catch (_) {}
  localStorage.setItem(INQUIRY_CHANNEL_STORAGE_KEY, JSON.stringify(DEFAULT_INQUIRY_CHANNELS));
  return { ...DEFAULT_INQUIRY_CHANNELS };
}

function saveInquiryChannels(channels) {
  localStorage.setItem(INQUIRY_CHANNEL_STORAGE_KEY, JSON.stringify(channels));
  localStorage.setItem("yoonseulInquiryChannelsUpdated", String(Date.now()));
  dashboardData.siteSettings ||= {};
  dashboardData.siteSettings.inquiryChannels = channels;
  adminApi("/api/admin/site-settings", { method: "PUT", body: JSON.stringify({ inquiryChannels: channels }) }).catch(() => showToast("서버 저장에 실패했습니다."));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("yoonseul-inquiry-channels");
    channel.postMessage({ type: "inquiry-channels-updated" });
    channel.close();
  }
}

function getPaymentMethods() {
  const serverSaved = dashboardData.siteSettings?.paymentMethods;
  if (serverSaved && Object.keys(serverSaved).length) return { ...DEFAULT_PAYMENT_METHODS, ...serverSaved };
  try {
    const saved = JSON.parse(localStorage.getItem(PAYMENT_METHOD_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      return {
        bankEnabled: saved.bankEnabled == null ? DEFAULT_PAYMENT_METHODS.bankEnabled : Boolean(saved.bankEnabled),
        bankLabel: saved.bankLabel == null ? DEFAULT_PAYMENT_METHODS.bankLabel : String(saved.bankLabel),
        bankName: saved.bankName == null ? DEFAULT_PAYMENT_METHODS.bankName : String(saved.bankName),
        bankAccount: saved.bankAccount == null ? DEFAULT_PAYMENT_METHODS.bankAccount : String(saved.bankAccount),
        bankHolder: saved.bankHolder == null ? DEFAULT_PAYMENT_METHODS.bankHolder : String(saved.bankHolder),
        bankNotice: saved.bankNotice == null ? DEFAULT_PAYMENT_METHODS.bankNotice : String(saved.bankNotice),
        cardEnabled: saved.cardEnabled == null ? DEFAULT_PAYMENT_METHODS.cardEnabled : Boolean(saved.cardEnabled),
        cardLabel: saved.cardLabel == null ? DEFAULT_PAYMENT_METHODS.cardLabel : String(saved.cardLabel),
        cardProvider: saved.cardProvider == null ? DEFAULT_PAYMENT_METHODS.cardProvider : String(saved.cardProvider),
        cardNotice: saved.cardNotice == null ? DEFAULT_PAYMENT_METHODS.cardNotice : String(saved.cardNotice)
      };
    }
  } catch (_) {}
  localStorage.setItem(PAYMENT_METHOD_STORAGE_KEY, JSON.stringify(DEFAULT_PAYMENT_METHODS));
  return { ...DEFAULT_PAYMENT_METHODS };
}

function savePaymentMethods(methods) {
  localStorage.setItem(PAYMENT_METHOD_STORAGE_KEY, JSON.stringify(methods));
  localStorage.setItem("yoonseulPaymentMethodsUpdated", String(Date.now()));
  dashboardData.siteSettings ||= {};
  dashboardData.siteSettings.paymentMethods = methods;
  adminApi("/api/admin/site-settings", { method: "PUT", body: JSON.stringify({ paymentMethods: methods }) }).catch(() => showToast("서버 저장에 실패했습니다."));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("yoonseul-payment-methods");
    channel.postMessage({ type: "payment-methods-updated" });
    channel.close();
  }
}

function getPromotions() {
  if (Array.isArray(dashboardData.siteSettings?.promotions) && dashboardData.siteSettings.promotions.length) return dashboardData.siteSettings.promotions;
  try {
    const saved = JSON.parse(localStorage.getItem(PROMOTION_STORAGE_KEY) || "null");
    if (Array.isArray(saved)) return saved;
  } catch (_) {}
  localStorage.setItem(PROMOTION_STORAGE_KEY, JSON.stringify(DEFAULT_PROMOTIONS));
  return [...DEFAULT_PROMOTIONS];
}

function savePromotions(items) {
  const next = [...items].sort((a, b) => String(b.startAt || "").localeCompare(String(a.startAt || "")));
  localStorage.setItem(PROMOTION_STORAGE_KEY, JSON.stringify(next));
  localStorage.setItem("yoonseulPromotionsUpdated", String(Date.now()));
  dashboardData.siteSettings ||= {};
  dashboardData.siteSettings.promotions = next;
  adminApi("/api/admin/site-settings", { method: "PUT", body: JSON.stringify({ promotions: next }) }).catch(() => showToast("서버 저장에 실패했습니다."));
  return next;
}

function designBannerRowsTemplate(items = getDesignBanners()) {
  if (!items.length) {
    return `<tr><td colspan="5" class="design-empty-cell">등록된 배너/팝업이 없습니다. 새 공지를 등록해 주세요.</td></tr>`;
  }
  return items.map((item) => { const active = isDesignBannerActive(item); return `<tr>
    <td><span class="design-position-badge ${item.position}">${DESIGN_POSITION_LABELS[item.position] || item.position}</span></td>
    <td><strong>${safeHtml(item.title)}</strong><small>${safeHtml(item.content).slice(0, 96)}${item.content.length > 96 ? "..." : ""}</small></td>
    <td><span class="design-active-badge ${active ? "on" : ""}">${active ? "노출중" : "비활성"}</span><button type="button" class="table-action toggle-design" data-design="${item.id}">${active ? "비활성화" : "노출하기"}</button></td>
    <td>${dateText(item.updatedAt || new Date())}</td>
    <td><button type="button" class="table-action edit-design" data-design="${item.id}">수정</button><button type="button" class="table-action danger delete-design" data-design="${item.id}">삭제</button></td>
  </tr>`; }).join("");
}

function designTemplate() {
  const items = getDesignBanners();
  const activeCount = items.filter(isDesignBannerActive).length;
  return `<div class="view-heading">
      <div><p>DESIGN / BANNER MANAGEMENT</p><h2>디자인/배너 관리</h2></div>
      <button id="resetDesignDefaults"><i class="fa-solid fa-rotate-left"></i> 기본 공지 복구</button>
    </div>
    <section class="panel design-manager-panel">
      <div class="panel-head"><div><h3>배너/팝업 등록</h3><p>홈 상단 띠배너, 홈 하단 배너, 중앙 팝업을 실시간으로 관리합니다.</p></div><span>${activeCount}개 노출중</span></div>
      <form id="designBannerForm" class="design-banner-form">
        <input type="hidden" name="id">
        <label>노출 위치
          <select name="position" required>
            <option value="top">홈 상단 띠배너</option>
            <option value="bottom">홈 하단 배너</option>
            <option value="popup">중앙 공지 팝업창</option>
          </select>
        </label>
        <label>제목
          <input name="title" required maxlength="80" placeholder="예: 세관 통관 검증 강화 안내">
        </label>
        <label class="design-toggle-field">
          <input name="active" type="checkbox" checked>
          <span><b>실시간 노출 활성화</b><small>체크 해제 시 홈페이지에 표시되지 않습니다.</small></span>
        </label>
        <label class="design-content-field">내용
          <textarea name="content" required rows="9" placeholder="공지 내용을 줄바꿈 포함 자유롭게 입력하세요."></textarea>
        </label>
        <div class="design-form-actions">
          <button class="form-submit" type="submit" id="designSubmitButton">배너/팝업 저장</button>
          <button type="button" id="cancelDesignEdit">입력 초기화</button>
        </div>
      </form>
    </section>
    <section class="panel design-list-panel">
      <div class="panel-head"><div><h3>등록 내역</h3><p>수정/삭제하면 사용자 메인 화면에도 즉시 반영됩니다.</p></div><span>${items.length}개 등록</span></div>
      <div class="table-wrap"><table class="design-management-table">
        <thead><tr><th>노출 위치</th><th>제목 및 내용</th><th>상태</th><th>수정일</th><th>관리</th></tr></thead>
        <tbody id="designBannerTableBody">${designBannerRowsTemplate(items)}</tbody>
      </table></div>
    </section>`;
}

function resetDesignForm() {
  const form = document.querySelector("#designBannerForm");
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  form.elements.position.value = "top";
  form.elements.active.checked = true;
  document.querySelector("#designSubmitButton").textContent = "배너/팝업 저장";
}

async function saveDesignBanner(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const items = getDesignBanners();
  const id = data.id || `design-${Date.now()}`;
  const nextItem = {
    id,
    position: data.position,
    title: String(data.title || "").trim(),
    content: String(data.content || "").trim(),
    active: form.elements.active.checked,
    updatedAt: new Date().toISOString()
  };
  if (!nextItem.title || !nextItem.content) return showToast("제목과 내용을 입력해 주세요.");
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) items[index] = nextItem;
  else items.unshift(nextItem);
  try {
    await saveDesignBanners(items);
    switchView("design");
    showToast(index >= 0 ? "배너/팝업이 수정되어 홈페이지에 반영되었습니다." : "새 배너/팝업이 홈페이지에 등록되었습니다.");
  } catch (_) {
    showToast("서버 저장에 실패했습니다. 다시 시도해 주세요.");
  }
}

function editDesignBanner(id) {
  const item = getDesignBanners().find((entry) => entry.id === id);
  const form = document.querySelector("#designBannerForm");
  if (!item || !form) return;
  form.elements.id.value = item.id;
  form.elements.position.value = item.position;
  form.elements.title.value = item.title;
  form.elements.content.value = item.content;
  form.elements.active.checked = isDesignBannerActive(item);
  document.querySelector("#designSubmitButton").textContent = "수정 내용 저장";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteDesignBanner(id) {
  const item = getDesignBanners().find((entry) => entry.id === id);
  if (!item) return;
  if (!confirm(`"${item.title}" 항목을 삭제할까요?`)) return;
  try {
    await saveDesignBanners(getDesignBanners().filter((entry) => entry.id !== id));
    switchView("design");
    showToast("배너/팝업이 삭제되어 홈페이지에서 제거되었습니다.");
  } catch (_) {
    showToast("서버 삭제에 실패했습니다. 다시 시도해 주세요.");
  }
}

async function resetDesignDefaults() {
  if (!confirm("기본 세관 통관 공지로 다시 복구할까요? 기존 배너/팝업 목록은 초기화됩니다.")) return;
  try {
    await saveDesignBanners(DEFAULT_DESIGN_BANNERS);
    switchView("design");
    showToast("기본 공지가 복구되어 홈페이지에 반영되었습니다.");
  } catch (_) {
    showToast("서버 저장에 실패했습니다. 다시 시도해 주세요.");
  }
}

async function toggleDesignBanner(id) {
  const items = getDesignBanners();
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  item.active = !isDesignBannerActive(item);
  item.updatedAt = new Date().toISOString();
  try {
    await saveDesignBanners(items);
    switchView("design");
    showToast(item.active ? "배너가 노출중으로 변경되었습니다." : "배너가 비활성화되어 홈페이지에서 숨겨졌습니다.");
  } catch (_) {
    showToast("상태 저장에 실패했습니다. 다시 시도해 주세요.");
  }
}

function inquiriesTemplate() {
  const channels = getInquiryChannels();
  return `<div class="view-heading">
      <div><p>INQUIRY CHANNEL MANAGEMENT</p><h2>1:1 문의</h2></div>
      <button id="saveInquiryChannelsTop"><i class="fa-solid fa-floppy-disk"></i> 저장하기</button>
    </div>
    <section class="panel inquiry-channel-panel">
      <div class="panel-head">
        <div><h3>고객 문의 채널 설정</h3><p>관리자가 입력한 링크가 메인 홈페이지 하단 문의 채널 메뉴에 실시간 반영됩니다.</p></div>
        <span>FOOTER LIVE SYNC</span>
      </div>
      <form id="inquiryChannelsForm" class="inquiry-channel-form">
        <label>🟢 카톡문의 링크 입력란
          <input name="kakao" type="text" value="${safeHtml(channels.kakao)}" placeholder="https://pf.kakao.com/...">
        </label>
        <label>🟢 라인문의 링크 입력란
          <input name="line" type="text" value="${safeHtml(channels.line)}" placeholder="https://line.me/...">
        </label>
        <label>🟢 텔레문의 (텔레그램) 링크 입력란
          <input name="telegram" type="text" value="${safeHtml(channels.telegram)}" placeholder="https://t.me/...">
        </label>
        <label>🟢 구글문의 (구글 폼 등) 링크 입력란
          <input name="google" type="text" value="${safeHtml(channels.google)}" placeholder="https://forms.google.com/...">
        </label>
        <label>🟢 라이브채널 링크 입력란
          <input name="liveChannel" type="text" value="${safeHtml(channels.liveChannel)}" placeholder="https://channel.io/...">
        </label>
        <div class="inquiry-channel-actions">
          <button class="form-submit" type="submit" id="saveInquiryChannelsButton">저장하기</button>
        </div>
      </form>
    </section>
    <section class="panel inquiry-preview-panel">
      <div class="panel-head">
        <div><h3>현재 반영 예정 링크</h3><p>저장 즉시 홈페이지 푸터의 문의 채널 링크가 아래 주소로 바뀝니다.</p></div>
      </div>
      <div class="table-wrap"><table class="inquiry-channel-table">
        <thead><tr><th>채널</th><th>연결 URL</th></tr></thead>
        <tbody>
          <tr><td><strong>카톡문의</strong></td><td>${channels.kakao ? `<a href="${safeHtml(channels.kakao)}" target="_blank" rel="noopener">${safeHtml(channels.kakao)}</a>` : `<span class="inquiry-channel-empty">미설정 (홈페이지에서 숨김 처리)</span>`}</td></tr>
          <tr><td><strong>라인문의</strong></td><td>${channels.line ? `<a href="${safeHtml(channels.line)}" target="_blank" rel="noopener">${safeHtml(channels.line)}</a>` : `<span class="inquiry-channel-empty">미설정 (홈페이지에서 숨김 처리)</span>`}</td></tr>
          <tr><td><strong>텔레문의</strong></td><td>${channels.telegram ? `<a href="${safeHtml(channels.telegram)}" target="_blank" rel="noopener">${safeHtml(channels.telegram)}</a>` : `<span class="inquiry-channel-empty">미설정 (홈페이지에서 숨김 처리)</span>`}</td></tr>
          <tr><td><strong>구글문의</strong></td><td>${channels.google ? `<a href="${safeHtml(channels.google)}" target="_blank" rel="noopener">${safeHtml(channels.google)}</a>` : `<span class="inquiry-channel-empty">미설정 (홈페이지에서 숨김 처리)</span>`}</td></tr>
          <tr><td><strong>라이브채널</strong></td><td>${channels.liveChannel ? `<a href="${safeHtml(channels.liveChannel)}" target="_blank" rel="noopener">${safeHtml(channels.liveChannel)}</a>` : `<span class="inquiry-channel-empty">미설정 (홈페이지에서 숨김 처리)</span>`}</td></tr>
        </tbody>
      </table></div>
    </section>`;
}

function paymentsTemplate() {
  const methods = getPaymentMethods();
  return `<div class="view-heading">
      <div><p>PAYMENT MANAGEMENT</p><h2>결제 수단 관리</h2></div>
      <button id="savePaymentMethodsTop"><i class="fa-solid fa-floppy-disk"></i> 저장하기</button>
    </div>
    <section class="panel payment-settings-panel">
      <div class="panel-head">
        <div><h3>결제 수단 설정</h3><p>관리자가 저장한 무통장 입금 및 카드결제 정보가 주문/결제 페이지에 실시간으로 반영됩니다.</p></div>
        <span>CHECKOUT LIVE SYNC</span>
      </div>
      <form id="paymentMethodsForm" class="payment-settings-form">
        <article class="payment-settings-card">
          <div class="payment-settings-card-head">
            <div><strong>무통장 입금</strong><small>입금 계좌와 안내 문구를 관리합니다.</small></div>
            <label class="payment-toggle-switch">
              <input name="bankEnabled" type="checkbox" ${methods.bankEnabled ? "checked" : ""}>
              <span>노출 활성화</span>
            </label>
          </div>
          <div class="payment-settings-grid">
            <label>표시명
              <input name="bankLabel" type="text" value="${safeHtml(methods.bankLabel)}" placeholder="예: 무통장입금" maxlength="30">
            </label>
            <label>은행명
              <input name="bankName" type="text" value="${safeHtml(methods.bankName)}" placeholder="예: 국민은행" maxlength="40">
            </label>
            <label>계좌번호
              <input name="bankAccount" type="text" value="${safeHtml(methods.bankAccount)}" placeholder="예: 448601-01-496883" maxlength="60">
            </label>
            <label>예금주
              <input name="bankHolder" type="text" value="${safeHtml(methods.bankHolder)}" placeholder="예: 박성현" maxlength="30">
            </label>
            <label class="payment-settings-wide">안내 문구
              <textarea name="bankNotice" rows="3" placeholder="입금 전 확인이 필요한 안내 문구를 입력해 주세요.">${safeHtml(methods.bankNotice)}</textarea>
            </label>
          </div>
        </article>

        <article class="payment-settings-card">
          <div class="payment-settings-card-head">
            <div><strong>카드결제</strong><small>표시명과 결제 안내 문구를 관리합니다.</small></div>
            <label class="payment-toggle-switch">
              <input name="cardEnabled" type="checkbox" ${methods.cardEnabled ? "checked" : ""}>
              <span>노출 활성화</span>
            </label>
          </div>
          <div class="payment-settings-grid">
            <label>표시명
              <input name="cardLabel" type="text" value="${safeHtml(methods.cardLabel)}" placeholder="예: 카드결제" maxlength="30">
            </label>
            <label>결제사/지원 카드 안내
              <input name="cardProvider" type="text" value="${safeHtml(methods.cardProvider)}" placeholder="예: 국내외 주요 카드 결제 지원" maxlength="80">
            </label>
            <label class="payment-settings-wide">안내 문구
              <textarea name="cardNotice" rows="3" placeholder="카드결제 관련 안내 문구를 입력해 주세요.">${safeHtml(methods.cardNotice)}</textarea>
            </label>
          </div>
        </article>

        <div class="payment-settings-actions">
          <button class="form-submit" type="submit">결제 수단 저장하기</button>
        </div>
      </form>
    </section>
    <section class="panel payment-preview-panel">
      <div class="panel-head">
        <div><h3>현재 결제창 반영 미리보기</h3><p>체크아웃 페이지의 결제 수단 영역에 아래 내용으로 노출됩니다.</p></div>
      </div>
      <div class="payment-preview-list">
        <article class="payment-preview-item ${methods.bankEnabled ? "" : "is-disabled"}">
          <div><strong>${safeHtml(methods.bankLabel || "무통장입금")}</strong><small>${methods.bankEnabled ? "활성화됨" : "비활성화됨"}</small></div>
          <p>${safeHtml(methods.bankName || "-")} · ${safeHtml(methods.bankAccount || "-")} · ${safeHtml(methods.bankHolder || "-")}</p>
          <span>${safeHtml(methods.bankNotice || "안내 문구 없음")}</span>
        </article>
        <article class="payment-preview-item ${methods.cardEnabled ? "" : "is-disabled"}">
          <div><strong>${safeHtml(methods.cardLabel || "카드결제")}</strong><small>${methods.cardEnabled ? "활성화됨" : "비활성화됨"}</small></div>
          <p>${safeHtml(methods.cardProvider || "결제 안내 없음")}</p>
          <span>${safeHtml(methods.cardNotice || "안내 문구 없음")}</span>
        </article>
      </div>
    </section>`;
}

function promotionTypeLabel(type) {
  return type === "event" ? "이벤트" : "쿠폰";
}

function promotionBenefitLabel(item) {
  if (item.type === "event" || item.benefitType === "text") return item.conditionText || "기획전 안내";
  if (item.benefitType === "amount") return `₩${money(item.benefitValue)} 할인`;
  return `${item.benefitValue}% 할인`;
}

function promotionStatusLabel(item) {
  if (!item.active) return "비활성화";
  const today = seoulDateKey();
  if (item.endAt && item.endAt < today) return "종료";
  if (item.startAt && item.startAt > today) return "예정";
  return "진행중";
}

function filteredPromotions(type) {
  const items = getPromotions();
  if (!type) return items;
  if (type === "active") return items.filter((item) => item.active);
  return items.filter((item) => item.type === type);
}

function promotionRowsTemplate(items) {
  if (!items.length) {
    return `<tr><td colspan="8" class="promotion-empty-cell">등록된 프로모션이 없습니다. 새 쿠폰 또는 이벤트를 추가해 주세요.</td></tr>`;
  }
  return items.map((item) => `
    <tr>
      <td><span class="promotion-type-badge ${item.type}">${promotionTypeLabel(item.type)}</span></td>
      <td><strong>${safeHtml(item.title)}</strong><small>${safeHtml(item.description || "설명 없음")}</small></td>
      <td>${item.code ? `<code>${safeHtml(item.code)}</code>` : `<span class="promotion-code-empty">자동/없음</span>`}</td>
      <td><strong>${safeHtml(promotionBenefitLabel(item))}</strong></td>
      <td>${safeHtml(item.startAt || "-")} ~ ${safeHtml(item.endAt || "-")}</td>
      <td><span class="promotion-status-badge ${promotionStatusLabel(item)}">${promotionStatusLabel(item)}</span></td>
      <td><button type="button" class="table-action toggle-promotion" data-promotion="${item.id}">${item.active ? "비활성화" : "활성화"}</button></td>
      <td><button type="button" class="table-action edit-promotion" data-promotion="${item.id}">수정</button><button type="button" class="table-action danger delete-promotion" data-promotion="${item.id}">삭제</button></td>
    </tr>
  `).join("");
}

function promotionsTemplate() {
  const items = getPromotions();
  const activeItems = items.filter((item) => promotionStatusLabel(item) === "진행중");
  const coupons = items.filter((item) => item.type === "coupon");
  const events = items.filter((item) => item.type === "event");
  return `<div class="view-heading">
      <div><p>PROMOTION MANAGEMENT</p><h2>프로모션 (쿠폰/이벤트)</h2></div>
      <button id="newPromotionButton"><i class="fa-solid fa-plus"></i> 새 프로모션 등록</button>
    </div>
    <section class="promotion-summary-grid">
      <article><span><i class="fa-solid fa-bullhorn"></i></span><div><small>전체 프로모션</small><strong>${items.length}<em>건</em></strong></div></article>
      <article><span><i class="fa-solid fa-ticket"></i></span><div><small>활성 쿠폰</small><strong>${coupons.filter((item) => promotionStatusLabel(item) === "진행중").length}<em>건</em></strong></div></article>
      <article><span><i class="fa-solid fa-calendar-check"></i></span><div><small>진행 이벤트</small><strong>${events.filter((item) => promotionStatusLabel(item) === "진행중").length}<em>건</em></strong></div></article>
      <article class="highlight"><span><i class="fa-solid fa-bolt"></i></span><div><small>현재 노출중</small><strong>${activeItems.length}<em>건</em></strong></div></article>
    </section>
    <section class="panel promotion-editor-panel">
      <div class="panel-head">
        <div><h3>쿠폰 / 이벤트 등록</h3><p>프로모션 유형에 따라 코드, 할인 혜택, 진행 기간을 관리할 수 있습니다.</p></div>
      </div>
      <form id="promotionForm" class="promotion-form">
        <input type="hidden" name="id">
        <label>유형
          <select name="type" id="promotionType" required>
            <option value="coupon">쿠폰</option>
            <option value="event">이벤트</option>
          </select>
        </label>
        <label>프로모션명
          <input name="title" type="text" maxlength="80" required placeholder="예: 신규 회원 웰컴 쿠폰">
        </label>
        <label>쿠폰 코드
          <input name="code" id="promotionCode" type="text" maxlength="30" placeholder="예: WELCOME10">
        </label>
        <label>혜택 유형
          <select name="benefitType" id="promotionBenefitType">
            <option value="percent">퍼센트 할인</option>
            <option value="amount">정액 할인</option>
            <option value="text">텍스트 안내</option>
          </select>
        </label>
        <label>혜택 값
          <input name="benefitValue" id="promotionBenefitValue" type="number" min="0" value="10" placeholder="예: 10">
        </label>
        <label>사용/이벤트 조건
          <input name="conditionText" type="text" maxlength="120" placeholder="예: 1인 1회 사용 가능">
        </label>
        <label>시작일
          <input name="startAt" type="date" required>
        </label>
        <label>종료일
          <input name="endAt" type="date" required>
        </label>
        <label class="promotion-active-field">
          <input name="active" type="checkbox" checked>
          <span><b>즉시 활성화</b><small>체크 해제 시 목록에는 남지만 고객 노출은 중단됩니다.</small></span>
        </label>
        <label class="promotion-wide-field">상세 설명
          <textarea name="description" rows="4" placeholder="프로모션 노출 시 사용할 상세 설명을 입력해 주세요."></textarea>
        </label>
        <div class="promotion-form-actions">
          <button class="form-submit" type="submit" id="promotionSubmitButton">프로모션 저장하기</button>
          <button type="button" id="cancelPromotionEdit">입력 초기화</button>
        </div>
      </form>
    </section>
    <section class="panel promotion-list-panel">
      <div class="panel-head">
        <div><h3>등록 내역</h3><p>쿠폰과 이벤트를 필터별로 빠르게 확인하고 상태를 변경할 수 있습니다.</p></div>
        <div class="promotion-filter-tabs">
          <button type="button" class="promotion-filter-tab active" data-promotion-filter="">전체</button>
          <button type="button" class="promotion-filter-tab" data-promotion-filter="coupon">쿠폰</button>
          <button type="button" class="promotion-filter-tab" data-promotion-filter="event">이벤트</button>
          <button type="button" class="promotion-filter-tab" data-promotion-filter="active">활성중</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="promotion-table">
          <thead><tr><th>유형</th><th>프로모션명</th><th>코드</th><th>혜택</th><th>기간</th><th>상태</th><th>토글</th><th>관리</th></tr></thead>
          <tbody id="promotionTableBody">${promotionRowsTemplate(items)}</tbody>
        </table>
      </div>
    </section>`;
}

function isValidInquiryUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function saveInquiryChannelsForm(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const nextChannels = {
    kakao: String(data.kakao || "").trim(),
    line: String(data.line || "").trim(),
    telegram: String(data.telegram || "").trim(),
    google: String(data.google || "").trim(),
    liveChannel: String(data.liveChannel || "").trim()
  };
  const invalidEntry = Object.values(nextChannels).find((value) => value && !isValidInquiryUrl(value));
  if (invalidEntry) return showToast("모든 문의 링크는 http:// 또는 https:// 로 시작해야 합니다.");
  saveInquiryChannels(nextChannels);
  switchView("inquiries");
  showToast("문의 채널 링크가 메인 홈페이지에 반영되었습니다.");
}

function savePaymentMethodsForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const nextMethods = {
    bankEnabled: form.elements.bankEnabled.checked,
    bankLabel: String(data.bankLabel || "").trim(),
    bankName: String(data.bankName || "").trim(),
    bankAccount: String(data.bankAccount || "").trim(),
    bankHolder: String(data.bankHolder || "").trim(),
    bankNotice: String(data.bankNotice || "").trim(),
    cardEnabled: form.elements.cardEnabled.checked,
    cardLabel: String(data.cardLabel || "").trim(),
    cardProvider: String(data.cardProvider || "").trim(),
    cardNotice: String(data.cardNotice || "").trim()
  };

  if (!nextMethods.bankEnabled && !nextMethods.cardEnabled) {
    return showToast("최소 1개 이상의 결제 수단은 활성화되어야 합니다.");
  }

  if (nextMethods.bankEnabled && (!nextMethods.bankLabel || !nextMethods.bankName || !nextMethods.bankAccount || !nextMethods.bankHolder)) {
    return showToast("무통장 입금을 활성화하려면 표시명, 은행명, 계좌번호, 예금주를 모두 입력해 주세요.");
  }

  if (nextMethods.cardEnabled && (!nextMethods.cardLabel || !nextMethods.cardProvider)) {
    return showToast("카드결제를 활성화하려면 표시명과 결제사/지원 카드 안내를 입력해 주세요.");
  }

  savePaymentMethods(nextMethods);
  switchView("payments");
  showToast("결제 수단 정보가 저장되어 주문/결제 페이지에 반영되었습니다.");
}

function updatePromotionTypeUI() {
  const type = document.querySelector("#promotionType")?.value || "coupon";
  const code = document.querySelector("#promotionCode");
  const benefitType = document.querySelector("#promotionBenefitType");
  const benefitValue = document.querySelector("#promotionBenefitValue");
  if (!code || !benefitType || !benefitValue) return;
  const isEvent = type === "event";
  code.disabled = isEvent;
  benefitType.disabled = isEvent;
  benefitValue.disabled = isEvent || benefitType.value === "text";
  if (isEvent) {
    code.value = "";
    benefitType.value = "text";
    benefitValue.value = 0;
  } else if (benefitType.value !== "text" && Number(benefitValue.value || 0) === 0) {
    benefitValue.value = benefitType.value === "amount" ? 10000 : 10;
  }
}

function resetPromotionForm() {
  const form = document.querySelector("#promotionForm");
  if (!form) return;
  form.reset();
  form.elements.id.value = "";
  form.elements.type.value = "coupon";
  form.elements.benefitType.value = "percent";
  form.elements.benefitValue.value = 10;
  form.elements.active.checked = true;
  form.elements.startAt.value = seoulDateKey();
  form.elements.endAt.value = seoulDateKey(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));
  document.querySelector("#promotionSubmitButton").textContent = "프로모션 저장하기";
  updatePromotionTypeUI();
}

function savePromotionForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const items = getPromotions();
  const nextItem = {
    id: values.id || `promotion-${Date.now()}`,
    type: values.type,
    title: String(values.title || "").trim(),
    code: values.type === "coupon" ? String(values.code || "").trim().toUpperCase() : "",
    benefitType: values.type === "event" ? "text" : values.benefitType,
    benefitValue: values.type === "event" ? 0 : Number(values.benefitValue || 0),
    conditionText: String(values.conditionText || "").trim(),
    startAt: String(values.startAt || "").trim(),
    endAt: String(values.endAt || "").trim(),
    active: form.elements.active.checked,
    description: String(values.description || "").trim()
  };

  if (!nextItem.title || !nextItem.startAt || !nextItem.endAt) {
    return showToast("프로모션명과 시작일, 종료일을 입력해 주세요.");
  }
  if (nextItem.endAt < nextItem.startAt) {
    return showToast("종료일은 시작일보다 빠를 수 없습니다.");
  }
  if (nextItem.type === "coupon" && !nextItem.code) {
    return showToast("쿠폰 유형은 쿠폰 코드를 입력해 주세요.");
  }

  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index >= 0) items[index] = nextItem;
  else items.unshift(nextItem);
  savePromotions(items);
  switchView("promotions");
  showToast(index >= 0 ? "프로모션이 수정되어 홈페이지에 반영됩니다." : "새 프로모션이 등록되어 홈페이지에 반영됩니다.");
}

function editPromotion(id) {
  const item = getPromotions().find((entry) => entry.id === id);
  const form = document.querySelector("#promotionForm");
  if (!item || !form) return;
  form.elements.id.value = item.id;
  form.elements.type.value = item.type;
  form.elements.title.value = item.title;
  form.elements.code.value = item.code || "";
  form.elements.benefitType.value = item.benefitType || "percent";
  form.elements.benefitValue.value = item.benefitValue || 0;
  form.elements.conditionText.value = item.conditionText || "";
  form.elements.startAt.value = item.startAt || "";
  form.elements.endAt.value = item.endAt || "";
  form.elements.active.checked = Boolean(item.active);
  form.elements.description.value = item.description || "";
  document.querySelector("#promotionSubmitButton").textContent = "프로모션 수정 저장";
  updatePromotionTypeUI();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deletePromotion(id) {
  const item = getPromotions().find((entry) => entry.id === id);
  if (!item) return;
  if (!confirm(`"${item.title}" 프로모션을 삭제할까요?`)) return;
  savePromotions(getPromotions().filter((entry) => entry.id !== id));
  switchView("promotions");
  showToast("프로모션이 삭제되었습니다.");
}

function togglePromotion(id) {
  const items = getPromotions();
  const item = items.find((entry) => entry.id === id);
  if (!item) return;
  item.active = !item.active;
  savePromotions(items);
  switchView("promotions");
  showToast(item.active ? "프로모션이 활성화되어 홈페이지에 노출됩니다." : "프로모션이 비활성화되어 홈페이지에서 숨겨집니다.");
}

function applyPromotionFilter(type) {
  document.querySelectorAll(".promotion-filter-tab").forEach((button) => button.classList.toggle("active", button.dataset.promotionFilter === type));
  document.querySelector("#promotionTableBody").innerHTML = promotionRowsTemplate(filteredPromotions(type));
  document.querySelectorAll(".edit-promotion").forEach((button) => button.addEventListener("click", () => editPromotion(button.dataset.promotion)));
  document.querySelectorAll(".delete-promotion").forEach((button) => button.addEventListener("click", () => deletePromotion(button.dataset.promotion)));
  document.querySelectorAll(".toggle-promotion").forEach((button) => button.addEventListener("click", () => togglePromotion(button.dataset.promotion)));
}

function emptyTemplate(view, label) {
  return `<div class="view-heading"><div><p>${view.toUpperCase()} MANAGEMENT</p><h2>${label}</h2></div><button><i class="fa-solid fa-plus"></i> 새 항목 등록</button></div>
    <section class="empty-view"><div><i class="fa-solid ${viewIcons[view]}"></i><h2>${label} 화면입니다.</h2><p>${label}에 필요한 데이터와 기능이 이 영역에 표시됩니다.</p><span>UI SKELETON · READY</span></div></section>`;
}

function getAdminReviews() {
  if (Array.isArray(dashboardData.siteSettings?.reviews)) return dashboardData.siteSettings.reviews;
  try {
    const saved = JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (_) {
    return [];
  }
}

function saveAdminReviews(items) {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(REVIEW_UPDATED_KEY, String(Date.now()));
  dashboardData.siteSettings ||= {};
  dashboardData.siteSettings.reviews = items;
  adminApi("/api/admin/site-settings", { method: "PUT", body: JSON.stringify({ reviews: items }) }).catch(() => showToast("서버 저장에 실패했습니다."));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("yoonseul-reviews");
    channel.postMessage({ type: "reviews-updated" });
    channel.close();
  }
}

function reviewStarsLabel(rating) {
  return "\u2605".repeat(Number(rating || 0)) + "\u2606".repeat(5 - Number(rating || 0));
}

function reviewStatusLabel(status) {
  return status === "hidden" ? "숨김" : "노출중";
}

function reviewStatusClass(status) {
  return status === "hidden" ? "is-hidden" : "is-published";
}

function syncMemberOrderHistoryStatus(orderIds, status) {
  const ids = Array.isArray(orderIds) ? orderIds.map(String) : [String(orderIds)];
  try {
    const saved = JSON.parse(localStorage.getItem("yoonseulOrderHistory") || "[]");
    if (!Array.isArray(saved)) return;
    let changed = false;
    const next = saved.map((order) => {
      if (ids.includes(String(order.id))) {
        changed = true;
        return { ...order, status };
      }
      return order;
    });
    if (!changed) return;
    localStorage.setItem("yoonseulOrderHistory", JSON.stringify(next));
    localStorage.setItem("yoonseulOrderHistoryUpdated", String(Date.now()));
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("yoonseul-orders");
      channel.postMessage({ type: "orders-updated" });
      channel.close();
    }
  } catch (_) {}
}

let activeReviewFilter = "all";

function getReviewOrderMap() {
  try {
    const orders = JSON.parse(localStorage.getItem("yoonseulOrderHistory") || "[]");
    return Array.isArray(orders)
      ? orders.reduce((map, order) => {
          map[String(order.id)] = order;
          return map;
        }, {})
      : {};
  } catch (_) {
    return {};
  }
}

function getFilteredReviewsForKey(reviews, key) {
  if (key === "photo") return reviews.filter((review) => (review.images?.length || 0) > 0 || review.image);
  if (key === "pending") return reviews.filter((review) => review.status === "hidden");
  if (/^rating-/.test(key)) {
    const rating = Number(key.split("-")[1]);
    return reviews.filter((review) => Number(review.rating || 0) === rating);
  }
  return reviews;
}

function getFilteredReviews(reviews) {
  return getFilteredReviewsForKey(reviews, activeReviewFilter);
}

function buildReviewImageCell(review) {
  const imageSource = review.images?.[0] || review.image || "";
  if (!imageSource) return '<span class="review-image-empty">없음</span>';
  return '<button class="review-thumb-button" type="button" data-review-image="' + imageSource + '"><img src="' + imageSource + '" alt="리뷰 이미지 썸네일"></button>';
}

function getReviewFilterTabs(reviews) {
  const tabs = [
    { key: "all", label: "전체 리뷰" },
    { key: "photo", label: "포토 리뷰" },
    { key: "pending", label: "미승인 리뷰" },
    { key: "rating-5", label: "5점" },
    { key: "rating-4", label: "4점" },
    { key: "rating-3", label: "3점" },
    { key: "rating-2", label: "2점" },
    { key: "rating-1", label: "1점" }
  ];
  return tabs.map((tab) => {
    const count = getFilteredReviewsForKey(reviews, tab.key).length;
    return '<button class="review-filter-tab ' + (activeReviewFilter === tab.key ? 'active' : '') + '" type="button" data-review-filter="' + tab.key + '">' + tab.label + '<span>' + count + '</span></button>';
  }).join("");
}

function reviewReplyModalTemplate() {
  return `
    <div class="member-review-modal-backdrop" id="adminReviewModal" hidden>
      <section class="member-review-modal admin-review-modal" role="dialog" aria-modal="true" aria-labelledby="adminReviewModalTitle">
        <button class="member-review-close" id="adminReviewModalClose" type="button" aria-label="리뷰 상세 닫기">×</button>
        <div id="adminReviewModalBody"></div>
      </section>
    </div>
  `;
}

function reviewsTemplate() {
  const reviews = getAdminReviews().sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const orderMap = getReviewOrderMap();
  const publishedCount = reviews.filter((review) => review.status !== "hidden").length;
  const hiddenCount = reviews.filter((review) => review.status === "hidden").length;
  const averageRating = reviews.length
    ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
    : "0.0";
  const filteredReviews = getFilteredReviews(reviews);

  return '<div class="view-heading"><div><p>REVIEW MANAGEMENT</p><h2>리뷰 관리</h2></div></div>' +
    '<section class="review-summary-grid">' +
      '<article><span><i class="fa-solid fa-star"></i></span><div><small>전체 리뷰</small><strong>' + reviews.length + '</strong></div></article>' +
      '<article><span><i class="fa-regular fa-eye"></i></span><div><small>노출중 리뷰</small><strong>' + publishedCount + '</strong></div></article>' +
      '<article><span><i class="fa-regular fa-eye-slash"></i></span><div><small>미승인 리뷰</small><strong>' + hiddenCount + '</strong></div></article>' +
      '<article class="highlight"><span><i class="fa-solid fa-ranking-star"></i></span><div><small>평균 평점</small><strong>' + averageRating + '<em>/ 5.0</em></strong></div></article>' +
    '</section>' +
    '<section class="panel review-list-panel">' +
      '<div class="panel-head"><div><h3>리뷰 대시보드</h3><p>포토 리뷰, 평점, 노출 상태, 배송완료 매칭 여부를 한 화면에서 확인할 수 있습니다.</p></div></div>' +
      '<div class="review-filter-tabs">' + getReviewFilterTabs(reviews) + '</div>' +
      '<div class="table-wrap"><table class="review-management-table review-management-table-wide"><thead><tr><th>주문번호 / 작성자</th><th>상품명</th><th>평점</th><th>리뷰 내용</th><th>첨부 이미지</th><th>작성일 / 배송완료일</th><th>상태 / 검증</th><th>관리</th></tr></thead><tbody>' +
      (filteredReviews.length ? filteredReviews.map((review) => {
        const order = orderMap[String(review.orderId)] || null;
        const productHref = '/detail.html?id=' + encodeURIComponent(review.productId || '');
        const deliveryDate = review.deliveryCompletedAt || (["배송완료", "구매확정"].includes(String(order?.status || '').trim()) ? order?.createdAt : '');
        const isEligible = review.isEligibleOrder !== false && ["배송완료", "구매확정"].includes(String(order?.status || '배송완료').trim());
        return '<tr data-review-row="' + review.id + '">' +
          '<td><strong class="review-order-id">' + safeHtml(review.orderId || '-') + '</strong><small>' + safeHtml(review.userName || '고객') + '</small></td>' +
          '<td><a class="review-product-link" href="' + productHref + '" target="_blank">' + safeHtml(review.productName || '상품') + '</a><small>' + safeHtml(review.option || '기본 옵션') + '</small></td>' +
          '<td><b class="review-rating-stars">' + reviewStarsLabel(review.rating) + '</b><small>' + Number(review.rating || 0) + '점</small></td>' +
          '<td><p class="review-content-preview">' + safeHtml(review.content || '') + '</p><button class="table-action review-detail-button" type="button" data-review="' + review.id + '">전체보기</button></td>' +
          '<td>' + buildReviewImageCell(review) + '</td>' +
          '<td><strong>' + dateText(review.createdAt || new Date().toISOString()) + '</strong><small>' + (deliveryDate ? dateText(deliveryDate) : '배송완료 미매칭') + '</small></td>' +
          '<td><span class="review-status-badge ' + reviewStatusClass(review.status) + '">' + reviewStatusLabel(review.status) + '</span><small class="review-eligibility ' + (isEligible ? 'ok' : 'warn') + '">' + (isEligible ? '배송완료 검증' : '검증 필요') + '</small></td>' +
          '<td><div class="review-action-stack"><button class="table-action toggle-review-visibility" type="button" data-review="' + review.id + '">' + (review.status === 'hidden' ? '노출 승인' : '블라인드') + '</button><button class="table-action reply-review" type="button" data-review="' + review.id + '">답변 달기</button><button class="table-action danger delete-review" type="button" data-review="' + review.id + '">삭제</button></div></td>' +
        '</tr>';
      }).join('') : '<tr><td colspan="8" class="review-empty-cell">조건에 맞는 리뷰가 없습니다.</td></tr>') +
      '</tbody></table></div></section>' + reviewReplyModalTemplate();
}

function toggleReviewVisibility(id) {
  const nextStatus = getAdminReviews().find((review) => review.id === id)?.status === "hidden" ? "published" : "hidden";
  window.YoonseulCart?.updateReviewStatus?.(id, nextStatus);
  switchView("reviews");
  showToast(nextStatus === "hidden" ? "리뷰를 블라인드 처리했습니다." : "리뷰 노출을 승인했습니다.");
}

function deleteReviewAdmin(id) {
  const reviews = getAdminReviews();
  const target = reviews.find((review) => review.id === id);
  if (!target || !confirm("선택한 리뷰를 삭제할까요?")) return;
  window.YoonseulCart?.deleteReview?.(id);
  switchView("reviews");
  showToast("리뷰를 삭제했습니다.");
}

function openAdminReviewModal(reviewId, mode = "detail") {
  const review = getAdminReviews().find((item) => item.id === reviewId);
  if (!review) return;
  const modal = document.querySelector("#adminReviewModal");
  const body = document.querySelector("#adminReviewModalBody");
  const imageSource = review.images?.[0] || review.image || "";
  body.innerHTML = mode === "reply"
    ? '<form id="adminReviewReplyForm" data-review-id="' + review.id + '" class="admin-review-reply-form"><p>REVIEW REPLY</p><h2 id="adminReviewModalTitle">윤슬마켓 답변 등록</h2><strong>' + safeHtml(review.productName || '상품') + '</strong><small>' + safeHtml(review.userName || '고객') + ' · ' + reviewStarsLabel(review.rating) + '</small><div class="admin-review-original">' + safeHtml(review.content || '') + '</div><label>답변 내용<textarea name="replyContent" rows="6" placeholder="고객에게 노출될 답변을 입력해 주세요.">' + safeHtml(review.replyContent || '') + '</textarea></label><div class="review-modal-actions"><button class="table-action" type="submit">답변 저장</button></div></form>'
    : '<div class="admin-review-detail"><p>REVIEW DETAIL</p><h2 id="adminReviewModalTitle">리뷰 전체보기</h2><strong>' + safeHtml(review.productName || '상품') + '</strong><small>' + safeHtml(review.userName || '고객') + ' · ' + reviewStarsLabel(review.rating) + ' · ' + dateText(review.createdAt || new Date().toISOString()) + '</small>' + (imageSource ? '<img class="admin-review-full-image" src="' + imageSource + '" alt="리뷰 원본 이미지">' : '') + '<div class="admin-review-original">' + safeHtml(review.content || '') + '</div>' + (review.replyContent ? '<div class="admin-review-reply-box"><b>윤슬마켓 답변</b><p>' + safeHtml(review.replyContent) + '</p><small>' + (review.repliedAt ? dateText(review.repliedAt) : '') + '</small></div>' : '') + '</div>';
  modal.hidden = false;
}

function closeAdminReviewModal() {
  const modal = document.querySelector("#adminReviewModal");
  if (modal) modal.hidden = true;
}

function saveReviewReply(reviewId, replyContent) {
  window.YoonseulCart?.updateReviewReply?.(reviewId, replyContent);
  closeAdminReviewModal();
  switchView("reviews");
  showToast(replyContent.trim() ? "답변을 저장했습니다." : "답변을 비웠습니다.");
}

function switchView(view) {
  currentView = view;
  const button = document.querySelector(`[data-view="${view}"]`);
  const label = button?.dataset.label || "대시보드";
  document.querySelector("#pageTitle").textContent = label;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  document.querySelector("#contentArea").innerHTML = view === "dashboard" ? dashboardTemplate() : view === "orders" ? ordersTemplate() : view === "brands" ? brandsTemplate() : view === "categories" ? categoriesTemplate() : view === "products" ? productsTemplate() : view === "members" ? membersTemplate() : view === "reviews" ? reviewsTemplate() : view === "design" ? designTemplate() : view === "promotions" ? promotionsTemplate() : view === "inquiries" ? inquiriesTemplate() : view === "payments" ? paymentsTemplate() : emptyTemplate(view, label);
  bindDynamicEvents();
  closeSidebar();
}

function bindDynamicEvents() {
  document.querySelectorAll("[data-switch]").forEach((button) => {
    const activate = () => {
      if (button.dataset.switch === "orders") activeOrderStatus = button.dataset.orderStatus || "";
      switchView(button.dataset.switch);
      if (button.dataset.openProductEditor === "true") openProductEditor();
    };
    button.addEventListener("click", activate);
    if (button.tagName !== "BUTTON") {
      button.setAttribute("role", "button");
      button.setAttribute("tabindex", "0");
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    }
  });
  document.querySelectorAll(".member-detail-button").forEach((button) => button.addEventListener("click", () => openMemberModal(button.dataset.member)));
  document.querySelector("#memberModalClose")?.addEventListener("click", closeMemberModal);
  document.querySelector("#memberModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeMemberModal();
  });
  document.querySelector("#selectAllMembers")?.addEventListener("change", (event) => {
    document.querySelectorAll(".member-row-check").forEach((checkbox) => checkbox.checked = event.currentTarget.checked);
  });
  const search = document.querySelector("#orderSearch");
  if (search) search.addEventListener("input", renderFilteredOrders);
  document.querySelectorAll("[data-order-tab]").forEach((button) => button.addEventListener("click", () => {
    activeOrderStatus = button.dataset.orderTab;
    switchView("orders");
  }));
  document.querySelector("#bulkShipping")?.addEventListener("click", () => bulkUpdateOrders("배송중"));
  document.querySelector("#bulkComplete")?.addEventListener("click", () => bulkUpdateOrders("배송완료"));
  bindOrderTableEvents();
  const newBrandButton = document.querySelector("#newBrandButton");
  if (newBrandButton) newBrandButton.addEventListener("click", () => openBrandEditor());
  const closeBrandEditor = document.querySelector("#closeBrandEditor");
  if (closeBrandEditor) closeBrandEditor.addEventListener("click", closeBrandForm);
  const brandForm = document.querySelector("#brandForm");
  if (brandForm) brandForm.addEventListener("submit", saveBrand);
  document.querySelector("#brandKoName")?.addEventListener("input", autoFillBrandEnglish);
  document.querySelectorAll(".edit-brand").forEach((button) => button.addEventListener("click", () => openBrandEditor(Number(button.dataset.brand))));
  document.querySelectorAll(".delete-brand").forEach((button) => button.addEventListener("click", () => deleteBrand(Number(button.dataset.brand))));
  bindBrandSorting();
  document.querySelector("#saveBrandOrder")?.addEventListener("click", saveBrandOrder);
  const newProductButton = document.querySelector("#newProductButton");
  if (newProductButton) newProductButton.addEventListener("click", () => openProductEditor());
  document.querySelectorAll(".edit-product").forEach((button) => button.addEventListener("click", () => openProductEditor(Number(button.dataset.product))));
  document.querySelectorAll(".delete-product").forEach((button) => button.addEventListener("click", () => deleteProduct(Number(button.dataset.product))));
  document.querySelector("#selectAllProducts")?.addEventListener("change", (event) => {
    document.querySelectorAll(".product-row-check").forEach((checkbox) => checkbox.checked = event.currentTarget.checked);
  });
  const closeProductEditor = document.querySelector("#closeProductEditor");
  if (closeProductEditor) closeProductEditor.addEventListener("click", closeProductForm);
  const productForm = document.querySelector("#productForm");
  if (productForm) productForm.addEventListener("submit", saveProduct);
  document.querySelector("#productNameInput")?.addEventListener("input", syncProductDescription);
  document.querySelector("#mainImageInput")?.addEventListener("change", (event) => {
    addProductImages("main", event.target.files);
    event.target.value = "";
  });
  document.querySelector("#detailImageInput")?.addEventListener("change", (event) => {
    addProductImages("detail", event.target.files);
    event.target.value = "";
  });
  document.querySelectorAll(".image-drop-zone").forEach((zone) => {
    zone.addEventListener("dragover", handleImageDrag);
    zone.addEventListener("dragleave", handleImageDrag);
    zone.addEventListener("drop", handleImageDrop);
  });
  document.querySelector("#colorTagInput")?.addEventListener("keydown", (event) => handleOptionTagInput(event, "colors"));
  document.querySelector("#sizeTagInput")?.addEventListener("keydown", (event) => handleOptionTagInput(event, "sizes"));
  const productBrandSelect = document.querySelector("#productBrandSelect");
  if (productBrandSelect) productBrandSelect.addEventListener("change", () => populateProductCategories());
  document.querySelector("#addParentCategory")?.addEventListener("click", () => switchView("brands"));
  document.querySelector("#addChildCategory")?.addEventListener("click", () => openQuickCategoryEditor("add"));
  document.querySelector("#editChildCategory")?.addEventListener("click", () => openQuickCategoryEditor("edit"));
  document.querySelector("#deleteChildCategory")?.addEventListener("click", deleteSelectedCategory);
  document.querySelector("#saveQuickCategory")?.addEventListener("click", saveQuickCategory);
  document.querySelector("#cancelQuickCategory")?.addEventListener("click", closeQuickCategoryEditor);
  const categoryBrandManager = document.querySelector("#categoryBrandManager");
  if (categoryBrandManager) categoryBrandManager.addEventListener("change", renderCategoryManagerList);
  document.querySelector("#managerAddCategory")?.addEventListener("click", addManagerCategory);
  document.querySelector("#managerAddBrand")?.addEventListener("click", () => switchView("brands"));
  bindCategoryManagerActions();
  document.querySelector("#designBannerForm")?.addEventListener("submit", saveDesignBanner);
  document.querySelector("#cancelDesignEdit")?.addEventListener("click", resetDesignForm);
  document.querySelector("#resetDesignDefaults")?.addEventListener("click", resetDesignDefaults);
  document.querySelectorAll(".edit-design").forEach((button) => button.addEventListener("click", () => editDesignBanner(button.dataset.design)));
  document.querySelectorAll(".toggle-design").forEach((button) => button.addEventListener("click", () => toggleDesignBanner(button.dataset.design)));
  document.querySelectorAll(".delete-design").forEach((button) => button.addEventListener("click", () => deleteDesignBanner(button.dataset.design)));
  document.querySelector("#inquiryChannelsForm")?.addEventListener("submit", saveInquiryChannelsForm);
  document.querySelector("#saveInquiryChannelsTop")?.addEventListener("click", () => document.querySelector("#inquiryChannelsForm")?.requestSubmit());
  document.querySelector("#paymentMethodsForm")?.addEventListener("submit", savePaymentMethodsForm);
  document.querySelector("#savePaymentMethodsTop")?.addEventListener("click", () => document.querySelector("#paymentMethodsForm")?.requestSubmit());
  document.querySelector("#promotionForm")?.addEventListener("submit", savePromotionForm);
  document.querySelector("#newPromotionButton")?.addEventListener("click", () => {
    resetPromotionForm();
    document.querySelector("#promotionForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#cancelPromotionEdit")?.addEventListener("click", resetPromotionForm);
  document.querySelector("#promotionType")?.addEventListener("change", updatePromotionTypeUI);
  document.querySelector("#promotionBenefitType")?.addEventListener("change", updatePromotionTypeUI);
  document.querySelectorAll(".promotion-filter-tab").forEach((button) => button.addEventListener("click", () => applyPromotionFilter(button.dataset.promotionFilter)));
  document.querySelectorAll(".edit-promotion").forEach((button) => button.addEventListener("click", () => editPromotion(button.dataset.promotion)));
  document.querySelectorAll(".delete-promotion").forEach((button) => button.addEventListener("click", () => deletePromotion(button.dataset.promotion)));
  document.querySelectorAll(".toggle-promotion").forEach((button) => button.addEventListener("click", () => togglePromotion(button.dataset.promotion)));
  document.querySelectorAll(".review-filter-tab").forEach((button) => button.addEventListener("click", () => {
    activeReviewFilter = button.dataset.reviewFilter;
    switchView("reviews");
  }));
  document.querySelectorAll(".toggle-review-visibility").forEach((button) => button.addEventListener("click", () => toggleReviewVisibility(button.dataset.review)));
  document.querySelectorAll(".delete-review").forEach((button) => button.addEventListener("click", () => deleteReviewAdmin(button.dataset.review)));
  document.querySelectorAll(".review-detail-button").forEach((button) => button.addEventListener("click", () => openAdminReviewModal(button.dataset.review, "detail")));
  document.querySelectorAll(".reply-review").forEach((button) => button.addEventListener("click", () => openAdminReviewModal(button.dataset.review, "reply")));
  document.querySelectorAll("[data-review-image]").forEach((button) => button.addEventListener("click", () => {
    const image = button.dataset.reviewImage;
    const modal = document.querySelector("#adminReviewModal");
    const body = document.querySelector("#adminReviewModalBody");
    if (!modal || !body) return;
    body.innerHTML = `<div class="admin-review-detail"><p>PHOTO REVIEW</p><h2 id="adminReviewModalTitle">첨부 이미지 원본 보기</h2><img class="admin-review-full-image" src="${image}" alt="리뷰 원본 이미지"></div>`;
    modal.hidden = false;
  }));
  document.querySelector("#adminReviewModalClose")?.addEventListener("click", closeAdminReviewModal);
  document.querySelector("#adminReviewModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeAdminReviewModal();
  });
  document.querySelector("#adminReviewReplyForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    saveReviewReply(form.dataset.reviewId, form.elements.replyContent.value);
  });
  if (document.querySelector("#promotionForm")) resetPromotionForm();
}

function bindBrandSorting() {
  const list = document.querySelector("#brandSortList");
  if (!list) return;
  list.querySelectorAll(".brand-sort-item").forEach((item) => {
    item.addEventListener("dragstart", () => {
      draggedBrandItem = item;
      item.classList.add("dragging");
      list.classList.add("sorting");
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!draggedBrandItem || draggedBrandItem === item) return;
      const bounds = item.getBoundingClientRect();
      list.insertBefore(draggedBrandItem, event.clientY < bounds.top + bounds.height / 2 ? item : item.nextSibling);
      updateBrandSortNumbers();
    });
    item.addEventListener("drop", (event) => event.preventDefault());
    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      list.classList.remove("sorting");
      draggedBrandItem = null;
      updateBrandSortNumbers();
    });
  });
}

function updateBrandSortNumbers() {
  document.querySelectorAll("#brandSortList .brand-sort-number").forEach((number, index) => number.textContent = index + 1);
}

async function saveBrandOrder() {
  const button = document.querySelector("#saveBrandOrder");
  const items = [...document.querySelectorAll("#brandSortList .brand-sort-item")].map((item, index) => ({
    id: Number(item.dataset.brandId),
    sort_order: index + 1
  }));
  button.disabled = true;
  button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 저장 중`;
  const response = await fetch("/api/admin/brands/order", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items })
  });
  const result = await response.json();
  if (!response.ok) {
    button.disabled = false;
    button.innerHTML = `<i class="fa-solid fa-check"></i> 순서 저장하기`;
    return showToast(result.error || "브랜드 순서를 저장하지 못했습니다.");
  }
  dashboardData.brands = result.brands;
  localStorage.setItem("yoonseulCatalogUpdated", String(Date.now()));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("yoonseul-catalog");
    channel.postMessage({ type: "brand-order-updated" });
    channel.close();
  }
  switchView("brands");
  showToast("브랜드 순서가 홈페이지에 반영되었습니다.");
}

function categoryItems(brandId) {
  return dashboardData.categories.find((group) => Number(group.brandId) === Number(brandId))?.items || [];
}

function findCategory(categoryId) {
  return dashboardData.categories.flatMap((group) => group.items || []).find((item) => Number(item.id) === Number(categoryId));
}

function populateProductCategories(selectedId = "") {
  const brandId = Number(document.querySelector("#productBrandSelect")?.value || 0);
  const select = document.querySelector("#productCategorySelect");
  if (!select) return;
  const items = categoryItems(brandId);
  select.disabled = !brandId || !items.length;
  select.innerHTML = !brandId
    ? `<option value="">대분류를 먼저 선택하세요</option>`
    : !items.length
      ? `<option value="">등록된 소분류가 없습니다</option>`
      : `<option value="">소분류 선택</option>${items.map((item) => `<option value="${item.id}" ${Number(selectedId) === Number(item.id) ? "selected" : ""}>${item.name}</option>`).join("")}`;
  closeQuickCategoryEditor();
}

function openQuickCategoryEditor(mode) {
  const brandId = Number(document.querySelector("#productBrandSelect")?.value || 0);
  const categoryId = Number(document.querySelector("#productCategorySelect")?.value || 0);
  if (!brandId) return showToast("대분류를 먼저 선택해 주세요.");
  if (mode === "edit" && !categoryId) return showToast("수정할 소분류를 선택해 주세요.");
  const editor = document.querySelector("#quickCategoryEditor");
  editor.dataset.mode = mode;
  editor.dataset.categoryId = mode === "edit" ? categoryId : "";
  document.querySelector("#quickCategoryTitle").textContent = mode === "edit" ? "소분류 수정" : "소분류 추가";
  document.querySelector("#quickCategoryName").value = mode === "edit" ? findCategory(categoryId)?.name || "" : "";
  editor.hidden = false;
  document.querySelector("#quickCategoryName").focus();
}

function closeQuickCategoryEditor() {
  const editor = document.querySelector("#quickCategoryEditor");
  if (editor) editor.hidden = true;
}

async function categoryRequest(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json();
  if (!response.ok) {
    showToast(result.error || "카테고리를 처리하지 못했습니다.");
    return null;
  }
  return result;
}

async function saveQuickCategory() {
  const editor = document.querySelector("#quickCategoryEditor");
  const name = document.querySelector("#quickCategoryName").value.trim();
  const brandId = Number(document.querySelector("#productBrandSelect").value);
  if (!name) return showToast("소분류명을 입력해 주세요.");
  const isEdit = editor.dataset.mode === "edit";
  const categoryId = Number(editor.dataset.categoryId || 0);
  const saved = await categoryRequest(isEdit ? `/api/admin/categories/${categoryId}` : "/api/admin/categories", isEdit ? "PUT" : "POST", isEdit ? { name } : { brandId, name });
  if (!saved) return;
  dashboardData = await adminApi("/api/admin/dashboard");
  populateProductCategories(saved.id);
  showToast(isEdit ? "소분류를 수정했습니다." : "소분류를 추가했습니다.");
}

async function deleteSelectedCategory() {
  const categoryId = Number(document.querySelector("#productCategorySelect")?.value || 0);
  if (!categoryId) return showToast("삭제할 소분류를 선택해 주세요.");
  if (!confirm(`'${findCategory(categoryId)?.name}' 소분류를 삭제할까요?`)) return;
  const deleted = await categoryRequest(`/api/admin/categories/${categoryId}`, "DELETE");
  if (!deleted) return;
  dashboardData = await adminApi("/api/admin/dashboard");
  populateProductCategories();
  showToast("소분류를 삭제했습니다.");
}

function renderCategoryManagerList() {
  const brandId = Number(document.querySelector("#categoryBrandManager")?.value || 0);
  document.querySelector("#categoryManagerList").innerHTML = categoryListTemplate(brandId);
  bindCategoryManagerActions();
}

function bindCategoryManagerActions() {
  document.querySelectorAll(".manager-edit-category").forEach((button) => button.addEventListener("click", () => editManagerCategory(Number(button.dataset.category))));
  document.querySelectorAll(".manager-delete-category").forEach((button) => button.addEventListener("click", () => deleteManagerCategory(Number(button.dataset.category))));
}

async function addManagerCategory() {
  const brandId = Number(document.querySelector("#categoryBrandManager").value);
  const input = document.querySelector("#managerCategoryName");
  const name = input.value.trim();
  if (!name) return showToast("추가할 소분류명을 입력해 주세요.");
  const saved = await categoryRequest("/api/admin/categories", "POST", { brandId, name });
  if (!saved) return;
  dashboardData = await adminApi("/api/admin/dashboard");
  input.value = "";
  renderCategoryManagerList();
  showToast("소분류를 추가했습니다.");
}

async function editManagerCategory(categoryId) {
  const current = findCategory(categoryId);
  const name = prompt("변경할 소분류명을 입력하세요.", current?.name || "");
  if (name === null || !name.trim()) return;
  const saved = await categoryRequest(`/api/admin/categories/${categoryId}`, "PUT", { name: name.trim() });
  if (!saved) return;
  dashboardData = await adminApi("/api/admin/dashboard");
  renderCategoryManagerList();
  showToast("소분류를 수정했습니다.");
}

async function deleteManagerCategory(categoryId) {
  if (!confirm(`'${findCategory(categoryId)?.name}' 소분류를 삭제할까요?`)) return;
  const deleted = await categoryRequest(`/api/admin/categories/${categoryId}`, "DELETE");
  if (!deleted) return;
  dashboardData = await adminApi("/api/admin/dashboard");
  renderCategoryManagerList();
  showToast("소분류를 삭제했습니다.");
}

const brandEnglishDictionary = {
  "에르메스": "HERMÈS", "까르띠에": "CARTIER", "샤넬": "CHANEL", "발렌시아가": "BALENCIAGA",
  "구찌": "GUCCI", "티파니앤코": "TIFFANY & CO.", "디올": "DIOR", "고야드": "GOYARD",
  "루이비통": "LOUIS VUITTON", "프라다": "PRADA", "버버리": "BURBERRY", "셀린느": "CELINE",
  "보테가베네타": "BOTTEGA VENETA", "로에베": "LOEWE", "생로랑": "SAINT LAURENT",
  "불가리": "BVLGARI", "반클리프아펠": "VAN CLEEF & ARPELS", "롤렉스": "ROLEX", "오메가": "OMEGA"
};

function romanizeKorean(value) {
  const initials = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
  const vowels = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
  const finals = ["", "k", "k", "ks", "n", "nj", "nh", "t", "l", "lk", "lm", "lb", "ls", "lt", "lp", "lh", "m", "p", "ps", "t", "t", "ng", "t", "t", "k", "t", "p", "h"];
  return [...value.trim()].map((character) => {
    const code = character.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return character;
    const initial = Math.floor(code / 588);
    const vowel = Math.floor((code % 588) / 28);
    const final = code % 28;
    return `${initials[initial]}${vowels[vowel]}${finals[final]}`;
  }).join("").replace(/\s+/g, " ").toUpperCase();
}

function translateBrandName(koName) {
  const normalized = String(koName || "").trim().replace(/\s+/g, "");
  return brandEnglishDictionary[normalized] || romanizeKorean(String(koName || ""));
}

function autoFillBrandEnglish(event) {
  const englishInput = document.querySelector("#brandEnName");
  if (englishInput) englishInput.value = translateBrandName(event.currentTarget.value);
}

function openBrandEditor(id) {
  const editor = document.querySelector("#brandEditor");
  const form = document.querySelector("#brandForm");
  form.reset();
  form.elements.id.value = "";
  document.querySelector("#brandEditorTitle").textContent = id ? "브랜드 정보 수정" : "새 브랜드 등록";
  if (id) {
    const brand = dashboardData.brands.find((item) => Number(item.id) === Number(id));
    ["id", "koName", "enName", "order"].forEach((key) => form.elements[key].value = brand[key] || "");
    form.elements.featured.checked = brand.featured;
  } else {
    form.elements.order.value = dashboardData.brands.length + 1;
  }
  editor.hidden = false;
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeBrandForm() {
  document.querySelector("#brandEditor").hidden = true;
}

async function saveBrand(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const id = Number(values.id || 0);
  values.enName = values.enName || translateBrandName(values.koName);
  values.featured = event.currentTarget.elements.featured.checked;
  values.order = Number(values.order);
  const response = await fetch(id ? `/api/admin/brands/${id}` : "/api/admin/brands", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(values)
  });
  const result = await response.json();
  if (!response.ok) return showToast(result.error || "브랜드를 저장하지 못했습니다.");
  dashboardData = await adminApi("/api/admin/dashboard");
  switchView("brands");
  showToast("브랜드가 저장되어 쇼핑몰에 반영되었습니다.");
}

async function deleteBrand(id) {
  if (!confirm("이 브랜드를 삭제할까요?")) return;
  const response = await fetch(`/api/admin/brands/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok) return showToast(result.error || "브랜드를 삭제하지 못했습니다.");
  dashboardData = await adminApi("/api/admin/dashboard");
  switchView("brands");
  showToast("브랜드가 삭제되었습니다.");
}

function openProductEditor(id = 0) {
  releaseProductImageUrls();
  productImages = { main: [], detail: [] };
  productOptionTags = { colors: [], sizes: [] };
  const form = document.querySelector("#productForm");
  form.reset();
  form.elements.id.value = "";
  document.querySelector("#productEditorTitle").textContent = id ? "상품 정보 수정" : "새 상품 등록";
  if (id) {
    const product = dashboardData.products.find((item) => Number(item.id) === Number(id));
    if (!product) return showToast("상품 정보를 찾을 수 없습니다.");
    form.elements.id.value = product.id;
    form.elements.brandId.value = product.brandId;
    populateProductCategories(product.categoryId);
    form.elements.name.value = product.name || "";
    form.elements.description.value = product.description || product.name || "";
    form.elements.price.value = product.price || "";
    const mainSources = product.images?.main?.length ? product.images.main : [product.image].filter(Boolean);
    const detailSources = product.images?.detail || [];
    productImages.main = mainSources.map((source, index) => storedProductImage(source, "대표", index));
    productImages.detail = detailSources.map((source, index) => storedProductImage(source, "상세", index));
    productOptionTags.colors = [...new Set((product.options || []).map((option) => option.color).filter(Boolean))];
    productOptionTags.sizes = [...new Set((product.options || []).map((option) => option.size).filter(Boolean))];
  } else {
    populateProductCategories();
  }
  renderProductImages("main");
  renderProductImages("detail");
  renderOptionTags();
  renderOptionMatrix();
  document.querySelector("#productEditor").hidden = false;
  document.querySelector("#productEditor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function storedProductImage(source, label, index) {
  return {
    id: `stored-${label}-${index}-${Date.now()}`,
    file: { name: `${label} 이미지 ${index + 1}`, size: 0, lastModified: 0 },
    preview: source,
    dataUrl: source,
    originalSize: 0,
    optimizedSize: 0,
    status: "done",
    stored: true,
    promise: Promise.resolve()
  };
}

function closeProductForm() {
  releaseProductImageUrls();
  productImages = { main: [], detail: [] };
  document.querySelector("#productEditor").hidden = true;
}

function releaseProductImageUrls() {
  Object.values(productImages).flat().forEach((item) => {
    if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);
  });
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("이미지를 읽지 못했습니다.")));
    reader.readAsDataURL(file);
  });
}

function syncProductDescription(event) {
  const description = document.querySelector("#productDescriptionInput");
  if (description) description.value = event.currentTarget.value;
}

function safeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
}

function handleImageDrag(event) {
  event.preventDefault();
  event.currentTarget.classList.toggle("dragging", event.type === "dragover");
}

function handleImageDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove("dragging");
  addProductImages(event.currentTarget.dataset.imageKind, event.dataTransfer.files);
}

function drainProductUploadQueue() {
  while (activeProductUploads < PRODUCT_UPLOAD_CONCURRENCY && productUploadQueue.length) {
    const nextTask = productUploadQueue.shift();
    activeProductUploads += 1;
    nextTask()
      .catch(() => {})
      .finally(() => {
        activeProductUploads = Math.max(0, activeProductUploads - 1);
        drainProductUploadQueue();
      });
  }
}

function enqueueProductUpload(task) {
  return new Promise((resolve, reject) => {
    productUploadQueue.push(() => task().then(resolve).catch(reject));
    drainProductUploadQueue();
  });
}

function addProductImages(kind, fileList) {
  const limit = kind === "main" ? 10 : 20;
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));
  const available = limit - productImages[kind].length;
  if (available <= 0) return showToast(`${kind === "main" ? "대표" : "상세"} 이미지는 최대 ${limit}장까지 등록할 수 있습니다.`);
  files.slice(0, available).forEach((file) => {
    const duplicate = productImages[kind].some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
    if (duplicate) return;
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      preview: URL.createObjectURL(file),
      originalSize: file.size,
      optimizedSize: 0,
      dataUrl: "",
      status: "processing"
    };
    productImages[kind].push(item);
    item.promise = enqueueProductUpload(() => uploadProductImage(item, kind)).then((result) => {
      Object.assign(item, result, { status: "done" });
      renderProductImages(kind);
      return item;
    }).catch(() => {
      item.status = "done";
      item.fallback = true;
      item.optimizedSize = Number(item.file.size || 0);
      renderProductImages(kind);
      return item;
    });
  });
  if (files.length > available) showToast(`최대 ${limit}장까지만 추가했습니다.`);
  renderProductImages(kind);
}

async function uploadProductImage(item, kind) {
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("images", item.file, item.file.name);

  try {
    const response = await fetch("/api/admin/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.files?.length) {
      throw new Error(result.error || "이미지 업로드를 다시 시도합니다.");
    }

    const uploaded = result.files[0];
    if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview);

    return {
      preview: uploaded.url,
      dataUrl: uploaded.url,
      optimizedSize: Number(uploaded.optimizedSize || item.file.size || 0),
      width: Number(uploaded.width || 0),
      height: Number(uploaded.height || 0),
      fallback: false
    };
  } catch (error) {
    const dataUrl = await readFileAsDataUrl(item.file);
    return {
      preview: item.preview,
      dataUrl,
      optimizedSize: Number(item.file.size || 0),
      width: 0,
      height: 0,
      fallback: true
    };
  }
}

function renderProductImages(kind) {
  const container = document.querySelector(`#${kind}ImagePreviews`);
  if (!container) return;
  container.innerHTML = productImages[kind].map((item, index) => `<article class="image-preview-card ${item.status}">
    <img src="${item.preview}" alt="${safeHtml(item.file.name)}">
    ${kind === "main" && index === 0 ? `<span class="primary-image-badge">대표</span>` : ""}
    <button type="button" class="remove-product-image" data-kind="${kind}" data-image-id="${item.id}" aria-label="${safeHtml(item.file.name)} 삭제">×</button>
    <div><b>${safeHtml(item.file.name)}</b><small>${item.status === "processing" ? `<i class="fa-solid fa-spinner fa-spin"></i> 최적화 중` : item.status === "error" ? "등록 대기" : item.stored ? "저장된 이미지" : item.fallback ? "등록 대기" : `${formatFileSize(item.originalSize)} → ${formatFileSize(item.optimizedSize)}`}</small></div>
  </article>`).join("");
  container.querySelectorAll(".remove-product-image").forEach((button) => button.addEventListener("click", () => removeProductImage(button.dataset.kind, button.dataset.imageId)));
  const summary = document.querySelector("#imageOptimizationSummary");
  if (summary) summary.textContent = `대표 ${Math.min(productImages.main.length, 10)}/10 · 상세 ${productImages.detail.length}/20`;
}

function removeProductImage(kind, id) {
  const index = productImages[kind].findIndex((item) => item.id === id);
  if (index < 0) return;
  if (productImages[kind][index].preview?.startsWith("blob:")) URL.revokeObjectURL(productImages[kind][index].preview);
  productImages[kind].splice(index, 1);
  renderProductImages(kind);
}

function handleOptionTagInput(event, type) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const value = event.currentTarget.value.trim().replace(/[<>"']/g, "").slice(0, 30);
  if (!value) return;
  if (productOptionTags[type].some((tag) => tag.toLowerCase() === value.toLowerCase())) {
    showToast("이미 추가된 옵션입니다.");
    return;
  }
  if (productOptionTags[type].length >= 20) return showToast("옵션은 항목별 최대 20개까지 등록할 수 있습니다.");
  productOptionTags[type].push(value);
  event.currentTarget.value = "";
  renderOptionTags();
  renderOptionMatrix();
}

function renderOptionTags() {
  [["colors", "colorTags"], ["sizes", "sizeTags"]].forEach(([type, containerId]) => {
    const container = document.querySelector(`#${containerId}`);
    if (!container) return;
    container.innerHTML = productOptionTags[type].map((tag) => `<span>${safeHtml(tag)}<button type="button" class="remove-option-tag" data-option-type="${type}" data-option-value="${safeHtml(tag)}" aria-label="${safeHtml(tag)} 삭제">×</button></span>`).join("");
  });
  document.querySelectorAll(".remove-option-tag").forEach((button) => button.addEventListener("click", () => removeOptionTag(button.dataset.optionType, button.dataset.optionValue)));
}

function removeOptionTag(type, value) {
  productOptionTags[type] = productOptionTags[type].filter((tag) => tag !== value);
  renderOptionTags();
  renderOptionMatrix();
}

function optionCombinations() {
  const colors = productOptionTags.colors.length ? productOptionTags.colors : [""];
  const sizes = productOptionTags.sizes.length ? productOptionTags.sizes : [""];
  if (!productOptionTags.colors.length && !productOptionTags.sizes.length) return [];
  return colors.flatMap((color) => sizes.map((size) => ({ color, size, key: JSON.stringify([color, size]) })));
}

function buildProductOptionsPayload() {
  if (!productOptionTags.colors.length && !productOptionTags.sizes.length) return [];
  return optionCombinations()
    .map(({ color, size }) => ({
      color: (color || "").trim(),
      size: (size || "").trim()
    }))
    .filter((option) => option.color || option.size);
}

function renderOptionMatrix() {
  const body = document.querySelector("#optionMatrixBody");
  if (!body) return;
  const colorCount = productOptionTags.colors.length;
  const sizeCount = productOptionTags.sizes.length;
  document.querySelector("#optionCombinationCount").textContent = `색상 ${colorCount} · 사이즈 ${sizeCount}`;
  if (!colorCount && !sizeCount) {
    body.innerHTML = `<tr class="option-empty-row"><td>옵션이 없는 단품 상품은 현재 상태 그대로 등록할 수 있습니다.</td></tr>`;
    return;
  }
  body.innerHTML = [
    colorCount ? `<tr class="option-summary-row"><td><strong>색상</strong><div class="option-summary-values">${productOptionTags.colors.map((value) => `<span>${safeHtml(value)}</span>`).join("")}</div></td></tr>` : "",
    sizeCount ? `<tr class="option-summary-row"><td><strong>사이즈</strong><div class="option-summary-values">${productOptionTags.sizes.map((value) => `<span>${safeHtml(value)}</span>`).join("")}</div></td></tr>` : ""
  ].join("");
}

async function saveProduct(event) {
  event.preventDefault();
  event.stopPropagation();
  const submitButton = document.querySelector("#productSubmitButton");
  submitButton.disabled = true;
  submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 이미지 최적화 중`;
  await Promise.all(Object.values(productImages).flat().map((item) => item.promise));
  const failed = Object.values(productImages).flat().some((item) => item.status !== "done");
  if (!productImages.main.length || failed) {
    submitButton.disabled = false;
    submitButton.textContent = "상품 등록 완료";
    return showToast(!productImages.main.length ? "대표 이미지를 한 장 이상 등록해 주세요." : "처리하지 못한 이미지를 삭제하거나 다시 등록해 주세요.");
  }
  const productOptions = buildProductOptionsPayload();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const productId = Number(values.id || 0);
  delete values.mainImageInput;
  delete values.detailImageInput;
  delete values.image;
  delete values.images;
  values.images = {
    main: productImages.main.map((item) => item.dataUrl).filter((source) => typeof source === "string" && source.trim()).slice(0, 10),
    detail: productImages.detail.map((item) => item.dataUrl).filter((source) => typeof source === "string" && source.trim())
  };
  const mainImageSet = new Set(values.images.main);
  values.images.detail = values.images.detail.filter((source) => !mainImageSet.has(source));
  values.image = values.images.main[0] || "";
  values.options = productOptions;
  values.singleProduct = productOptions.length === 0;
  submitButton.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 서버 전송 중`;
  const response = await fetch(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
    method: productId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(values)
  });
  const result = await response.json();
  if (!response.ok) {
    submitButton.disabled = false;
    submitButton.textContent = "상품 등록 완료";
    return showToast(result.error || "상품을 저장하지 못했습니다.");
  }
  releaseProductImageUrls();
  dashboardData = await adminApi("/api/admin/dashboard");
  switchView("products");
  showToast(productId ? "상품 정보가 수정되었습니다." : "상품이 저장되어 쇼핑몰에 반영되었습니다.");
}

async function deleteProduct(id) {
  const product = dashboardData.products.find((item) => Number(item.id) === Number(id));
  if (!product || !confirm(`'${product.name}' 상품을 삭제할까요?`)) return;
  const response = await fetch(`/api/admin/products/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok) return showToast(result.error || "상품을 삭제하지 못했습니다.");
  const row = document.querySelector(`[data-product-row="${id}"]`);
  if (row) row.classList.add("removing");
  dashboardData.products = dashboardData.products.filter((item) => Number(item.id) !== Number(id));
  document.querySelector("#productCount").textContent = `${dashboardData.products.length}개`;
  setTimeout(() => row?.remove(), 220);
  showToast("상품이 삭제되었습니다.");
}

function renderFilteredOrders() {
  const query = document.querySelector("#orderSearch")?.value.trim().toLowerCase() || "";
  const items = dashboardData.requests.filter((item) => {
    const searchable = `${item.id} ${item.name} ${item.phone} ${item.productName || ""} ${item.option || ""}`.toLowerCase();
    return searchable.includes(query) && (!activeOrderStatus || item.status === activeOrderStatus);
  });
  document.querySelector("#ordersTable").innerHTML = requestTable(items);
  document.querySelector("#visibleOrderCount").textContent = `${items.length}건 표시`;
  bindOrderTableEvents();
}

function bindOrderTableEvents() {
  document.querySelectorAll("[data-order]").forEach((select) => select.addEventListener("change", () => updateOrder(select.dataset.order, select.value)));
  document.querySelector("#selectAllOrders")?.addEventListener("change", (event) => {
    document.querySelectorAll(".order-row-check").forEach((checkbox) => checkbox.checked = event.currentTarget.checked);
  });
}

async function bulkUpdateOrders(status) {
  const ids = [...document.querySelectorAll(".order-row-check:checked")].map((checkbox) => checkbox.value);
  if (!ids.length) return showToast("변경할 주문을 먼저 선택해 주세요.");
  const buttons = document.querySelectorAll(".order-bulk-toolbar button");
  buttons.forEach((button) => button.disabled = true);
  await Promise.all(ids.map((id) => adminApi(`/api/admin/requests/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status })
  })));
  syncMemberOrderHistoryStatus(ids, status);
  dashboardData = await adminApi("/api/admin/dashboard");
  document.querySelector("#orderBadge").textContent = dashboardData.stats.active;
  switchView("orders");
  showToast(`선택한 ${ids.length}건을 ${status} 상태로 변경했습니다.`);
}

async function updateOrder(id, status) {
  const updated = await adminApi(`/api/admin/requests/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ status }) });
  const index = dashboardData.requests.findIndex((item) => item.id === id);
  dashboardData.requests[index] = updated;
  syncMemberOrderHistoryStatus(id, status);
  dashboardData = await adminApi("/api/admin/dashboard");
  document.querySelector("#orderBadge").textContent = dashboardData.stats.active;
  switchView("orders");
  showToast("주문 상태가 저장되었습니다.");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function openSidebar() {
  document.querySelector("#adminSidebar").classList.add("open");
  document.querySelector("#sidebarOverlay").classList.add("open");
}
function closeSidebar() {
  document.querySelector("#adminSidebar").classList.remove("open");
  document.querySelector("#sidebarOverlay").classList.remove("open");
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", async () => {
  if (["dashboard", "reviews"].includes(button.dataset.view) && token) {
    try { dashboardData = await adminApi("/api/admin/dashboard"); } catch (_) {}
  }
  switchView(button.dataset.view);
}));
document.querySelector("#mobileSidebarButton").addEventListener("click", openSidebar);
document.querySelector("#sidebarOverlay").addEventListener("click", closeSidebar);
document.querySelector("#logoutButton").addEventListener("click", () => {
  localStorage.removeItem("yoonseulAdmin");
  token = null;
  showLogin();
});

async function refreshMemberData() {
  if (!token) return;
  try {
    dashboardData = await adminApi("/api/admin/dashboard");
    if (currentView === "members") switchView("members");
  } catch (_) {}
}

async function refreshReviewData() {
  if (!token || currentView !== "reviews") return;
  try {
    dashboardData = await adminApi("/api/admin/dashboard");
    switchView("reviews");
  } catch (_) {}
}

async function refreshLiveDashboard() {
  if (!token || currentView !== "dashboard") return;
  try {
    dashboardData = await adminApi("/api/admin/dashboard");
    switchView("dashboard");
  } catch (_) {}
}

setInterval(refreshReviewData, 15000);
setInterval(refreshLiveDashboard, 15000);
window.addEventListener("focus", refreshLiveDashboard);

window.addEventListener("storage", (event) => {
  if (event.key === "yoonseulMembersUpdated") refreshMemberData();
  if ((event.key === REVIEW_STORAGE_KEY || event.key === REVIEW_UPDATED_KEY) && currentView === "reviews") switchView("reviews");
});
if ("BroadcastChannel" in window) {
  const memberUpdates = new BroadcastChannel("yoonseul-members");
  memberUpdates.addEventListener("message", (event) => {
    if (event.data?.type === "member-registered") refreshMemberData();
  });
  const reviewUpdates = new BroadcastChannel("yoonseul-reviews");
  reviewUpdates.addEventListener("message", () => {
    if (currentView === "reviews") switchView("reviews");
  });
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMemberModal();
});

token ? startAdmin().catch(() => showLogin()) : showLogin();
