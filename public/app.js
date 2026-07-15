let products = [];
let brands = [];
let categories = [];
let activeBrandId = 0;
let activeCategoryId = 0;
let initialBrandId = Number(new URLSearchParams(location.search).get("brand") || 0);
let query = "";
let activeRank = "realtime";
let catalogSignature = "";
let salesRankings = { realtime: [], weekly: [], monthly: [] };
let rankingPeriods = { realtime: "최근 24시간", weekly: "최근 7일", monthly: "최근 30일" };
let promotions = [];
let randomBestProductIds = [];
let randomBestSignature = "";
const DESIGN_STORAGE_KEY = "yoonseulDesignBanners";
const MEMBER_STORAGE_KEY = "yoonseulCurrentMember";
const INQUIRY_CHANNEL_STORAGE_KEY = "yoonseulInquiryChannels";
const DEFAULT_INQUIRY_CHANNELS = {
  kakao: "https://pf.kakao.com/",
  line: "https://line.me/",
  telegram: "https://t.me/",
  google: "https://forms.google.com/",
  liveChannel: "https://channel.io/"
};
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
const won = (value) => `₩${Number(value).toLocaleString("ko-KR")}`;
const brandOf = (product) => brands.find((brand) => Number(brand.id) === Number(product.brandId)) || { id: 0, koName: "미지정", enName: "UNASSIGNED" };
const PRODUCT_PLACEHOLDER_IMAGE = "/images/product-placeholder.svg";
const DETAIL_PREVIEW_KEY = "yoonseul-detail-preview";
const productPrimaryImage = (product) => product.images?.main?.[0] || product.image || PRODUCT_PLACEHOLDER_IMAGE;
const productThumbnailImage = (product) => {
  const original = productPrimaryImage(product);
  return original.startsWith("/uploads/") ? `/thumbnail?src=${encodeURIComponent(original)}` : original;
};
const hasProductDisplayImage = (product) => Boolean(product?.images?.main?.[0] || product?.image);
const productDetailUrl = (product) => {
  const slug = String(product?.name || "product")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "product";
  return `/product/${Number(product?.id || 0)}/${encodeURIComponent(slug)}`;
};

const cartStore = () => window.YoonseulCart;

function syncCartCount() {
  const count = cartStore()?.getCartCount?.() || 0;
  const cartCount = document.querySelector("#cartCount");
  if (cartCount) cartCount.textContent = count;
}

function getCurrentMember() {
  try {
    return JSON.parse(localStorage.getItem(MEMBER_STORAGE_KEY) || "null");
  } catch (_) {
    return null;
  }
}

function getInquiryChannels() {
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

function inquiryChannelEntries() {
  const channels = getInquiryChannels();
  return [
    { key: "kakao", label: "카톡문의", short: "Kakao", href: channels.kakao },
    { key: "line", label: "라인문의", short: "LINE", href: channels.line },
    { key: "telegram", label: "텔레문의", short: "Telegram", href: channels.telegram },
    { key: "google", label: "구글문의", short: "Google", href: channels.google },
    { key: "liveChannel", label: "라이브채널", short: "Live", href: channels.liveChannel }
  ];
}

function ensureInquiryFloatingDock() {
  let dock = document.querySelector("#inquiryFloatingDock");
  if (dock) return dock;
  dock = document.createElement("aside");
  dock.className = "inquiry-floating-dock";
  dock.id = "inquiryFloatingDock";
  dock.setAttribute("aria-label", "문의 채널 바로가기");
  document.body.appendChild(dock);
  return dock;
}

function renderInquiryChannels() {
  const entries = inquiryChannelEntries();
  const linkMap = {
    footerKakaoLink: entries.find((entry) => entry.key === "kakao")?.href || "",
    footerLineLink: entries.find((entry) => entry.key === "line")?.href || "",
    footerTelegramLink: entries.find((entry) => entry.key === "telegram")?.href || "",
    footerGoogleLink: entries.find((entry) => entry.key === "google")?.href || "",
    footerLiveChannelLink: entries.find((entry) => entry.key === "liveChannel")?.href || ""
  };

  Object.entries(linkMap).forEach(([id, href]) => {
    const link = document.querySelector(`#${id}`);
    if (!link) return;
    const visible = Boolean(String(href || "").trim());
    link.hidden = !visible;
    if (!visible) {
      link.removeAttribute("href");
      return;
    }
    link.setAttribute("href", href);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
  });

  const dock = ensureInquiryFloatingDock();
  const activeEntries = entries.filter((entry) => String(entry.href || "").trim());
  dock.hidden = activeEntries.length === 0;
  dock.innerHTML = activeEntries.map((entry) => `<a href="${escapeHtml(entry.href)}" target="_blank" rel="noopener" aria-label="${escapeHtml(entry.label)}" title="${escapeHtml(entry.label)}">${escapeHtml(entry.short)}</a>`).join("");
}

function buildMemberJoinUrl() {
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  return `/join?returnTo=${encodeURIComponent(returnTo)}`;
}

function logoutCurrentMember() {
  localStorage.removeItem(MEMBER_STORAGE_KEY);
  syncHeaderMemberState();
  showToast("로그아웃되었습니다.");
}

function syncHeaderMemberState() {
  const member = getCurrentMember();
  const loginButton = document.querySelector("#memberJoinButton");
  const logoutButton = document.querySelector("#memberLogoutButton");
  const drawer = document.querySelector("#mobileCategoryDrawer");
  const drawerAccount = document.querySelector("#mobileDrawerAccount");
  document.body.classList.toggle("member-logged-in", Boolean(member));
  document.body.classList.toggle("member-guest", !member);
  if (loginButton) {
    loginButton.textContent = member ? `${member.name}님` : "로그인";
    loginButton.setAttribute("href", member ? "/mypage.html" : buildMemberJoinUrl());
    loginButton.setAttribute("aria-label", member ? `${member.name}님 로그인 상태` : "로그인");
  }
  if (logoutButton) logoutButton.hidden = !member;
  if (drawer) drawer.dataset.authState = member ? "member" : "guest";
  if (drawerAccount) {
    drawerAccount.innerHTML = member ? `
      <a href="/mypage.html"><i class="fa-regular fa-user"></i>마이페이지</a>
      <button type="button" id="mobileDrawerLogoutButton"><i class="fa-solid fa-arrow-right-from-bracket"></i>로그아웃</button>
    ` : `
      <a href="${buildMemberJoinUrl()}"><i class="fa-regular fa-user"></i>로그인</a>
    `;
    document.querySelector("#mobileDrawerLogoutButton")?.addEventListener("click", () => {
      closeMobileDrawer();
      logoutCurrentMember();
    });
  }
}

function cardTemplate(product, rank, sales, priority = false) {
  const brand = brandOf(product);
  const detailUrl = productDetailUrl(product);
  const originalImage = productPrimaryImage(product);
  const cardImage = productThumbnailImage(product);
  return `<article class="product-card" data-product="${product.id}">
    <div class="product-image"><a class="product-image-link" href="${detailUrl}" aria-label="${escapeHtml(product.name)} 상세보기"><img src="${escapeHtml(cardImage)}" data-original="${escapeHtml(originalImage)}" alt="${escapeHtml(product.name)}" loading="${priority ? "eager" : "lazy"}" decoding="async"${priority ? ' fetchpriority="high"' : ""} onerror="if(this.dataset.original&&this.src!==this.dataset.original){this.src=this.dataset.original;this.dataset.original='';}else{this.onerror=null;this.src='${PRODUCT_PLACEHOLDER_IMAGE}';}"></a>${rank ? `<span class="rank-number">${rank}</span>` : ""}<button class="heart-button" data-wishlist="${product.id}" aria-label="${escapeHtml(product.name)} 찜하기">♡</button></div>
    <div class="card-info"><small>${escapeHtml(brand.enName)}</small><h3><a class="product-title-link" href="${detailUrl}">${escapeHtml(product.name)}</a></h3>${sales ? `<span class="sales-count">판매 ${Number(sales.units || 0).toLocaleString("ko-KR")}개 · 주문 ${Number(sales.orderCount || 0).toLocaleString("ko-KR")}건</span>` : ""}<strong>${won(product.price)}</strong><del>${won(product.oldPrice)}</del><button class="add-button" data-cart="${product.id}">장바구니 담기</button></div>
  </article>`;
}

function bindCardActions() {
  document.querySelectorAll(".product-card").forEach((card) => card.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    const productId = card.dataset.product;
    if (!productId) return;
    const product = products.find((item) => Number(item.id) === Number(productId));
    if (product) {
      const categoryGroup = categories.find((entry) => Number(entry.brandId) === Number(product.brandId));
      const category = categoryGroup?.items?.find((entry) => Number(entry.id) === Number(product.categoryId)) || null;
      try {
        sessionStorage.setItem(DETAIL_PREVIEW_KEY, JSON.stringify({
          savedAt: Date.now(),
          product,
          brand: brandOf(product),
          category
        }));
      } catch {}

      const imageSource = productPrimaryImage(product);
      if (imageSource && imageSource !== PRODUCT_PLACEHOLDER_IMAGE) {
        const preload = new Image();
        preload.fetchPriority = "high";
        preload.src = imageSource;
      }
    }
    if (!event.target.closest("a")) window.location.href = product ? productDetailUrl(product) : `/detail.html?id=${encodeURIComponent(productId)}`;
  }));
  document.querySelectorAll("[data-wishlist]").forEach((button) => {
    const active = cartStore()?.isWishlisted?.(Number(button.dataset.wishlist));
    button.classList.toggle("active", Boolean(active));
    button.textContent = active ? "♥" : "♡";
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function randomBestProducts(excludedProductIds = [], limit = 8) {
  const candidates = products.filter((product) => hasProductDisplayImage(product) && !["삭제", "판매중지"].includes(String(product.status || "")));
  const signature = candidates.map((product) => Number(product.id)).sort((a, b) => a - b).join(",");
  if (signature !== randomBestSignature) {
    randomBestSignature = signature;
    randomBestProductIds = candidates.map((product) => Number(product.id));
    for (let index = randomBestProductIds.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [randomBestProductIds[index], randomBestProductIds[target]] = [randomBestProductIds[target], randomBestProductIds[index]];
    }
  }
  const excludedIds = new Set(excludedProductIds.map(Number));
  return randomBestProductIds
    .filter((id) => !excludedIds.has(Number(id)))
    .slice(0, Math.max(0, Number(limit || 0)))
    .map((id) => products.find((product) => Number(product.id) === id))
    .filter(Boolean);
}

function renderBest(type = activeRank) {
  activeRank = type;
  const ranking = Array.isArray(salesRankings[type]) ? salesRankings[type] : [];
  const ranked = ranking.map((sales) => ({ sales, product: products.find((product) => Number(product.id) === Number(sales.productId)) }))
    .filter((entry) => entry.product && hasProductDisplayImage(entry.product))
    .slice(0, 8);
  const fallbackProducts = randomBestProducts(ranked.map((entry) => entry.product.id), 8 - ranked.length);
  const bestCards = [
    ...ranked.map((entry, index) => cardTemplate(entry.product, index + 1, entry.sales, index < 2)),
    ...fallbackProducts.map((product, index) => cardTemplate(product, undefined, undefined, ranked.length + index < 2))
  ];
  const description = document.querySelector("#bestPeriodDescription");
  if (description) description.textContent = ranked.length && fallbackProducts.length
    ? `${rankingPeriods[type] || "선택 기간"} 실제 판매순위 우선 · 부족한 상품은 임시 노출`
    : ranked.length
      ? `${rankingPeriods[type] || "선택 기간"} 판매 수량 기준 · 10초마다 갱신`
      : "판매 데이터가 쌓이는 동안 판매 상품을 임시로 보여드립니다.";
  document.querySelector("#bestGrid").innerHTML = bestCards.length
    ? bestCards.join("")
    : `<div class="best-empty-state"><strong>현재 노출할 판매 상품이 없습니다.</strong><span>관리자에서 판매 상품과 대표 이미지를 등록해 주세요.</span></div>`;
  bindCardActions();
}

async function loadBestSellers() {
  const response = await fetch("/api/best-sellers", { cache: "no-store" });
  if (!response.ok) throw new Error("BEST_SELLERS_FAILED");
  const data = await response.json();
  salesRankings = data.rankings || salesRankings;
  rankingPeriods = data.periods || rankingPeriods;
  renderBest(activeRank);
}

function filteredProducts() {
  let result = products.filter((product) => {
    const brand = brandOf(product);
    const brandMatch = !activeBrandId || Number(product.brandId) === Number(activeBrandId);
    const categoryMatch = !activeCategoryId || Number(product.categoryId) === Number(activeCategoryId);
    const searchMatch = `${brand.koName} ${brand.enName} ${product.name}`.toLowerCase().includes(query.toLowerCase());
    return brandMatch && categoryMatch && searchMatch;
  });
  const sort = document.querySelector("#sortSelect").value;
  if (sort === "featured") {
    result.sort((a, b) => {
      const createdDifference = (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
      return createdDifference || Number(b.id || 0) - Number(a.id || 0);
    });
  }
  if (sort === "low") result.sort((a, b) => a.price - b.price);
  if (sort === "high") result.sort((a, b) => b.price - a.price);
  return result;
}

function renderCatalog() {
  const result = filteredProducts();
  const visibleProducts = result;
  renderBrandCollectionHeader(visibleProducts.length);
  document.querySelector("#productGrid").innerHTML = visibleProducts.map((product, index) => cardTemplate(product, undefined, undefined, index < 4)).join("");
  document.querySelector("#productGrid").hidden = visibleProducts.length === 0;
  document.querySelector("#emptyState").hidden = visibleProducts.length !== 0;
  document.querySelector("#productTotal").textContent = `총 ${visibleProducts.length}개`;
  const activeBrand = brands.find((brand) => Number(brand.id) === Number(activeBrandId));
  document.querySelector("#activeFilter").textContent = activeBrand ? activeBrand.enName : "ALL COLLECTION";
  document.querySelectorAll(".brand-filter").forEach((button) => button.classList.toggle("active", Number(button.dataset.brandId) === Number(activeBrandId)));
  bindCardActions();
}

function categoryGroupOfBrand(brandId) {
  return categories.find((entry) => Number(entry.brandId) === Number(brandId));
}

function renderBrandCollectionHeader(totalCount) {
  const header = document.querySelector("#brandCollectionHeader");
  if (!header) return;
  const activeBrand = brands.find((brand) => Number(brand.id) === Number(activeBrandId));

  if (!activeBrand) {
    activeCategoryId = 0;
    header.hidden = true;
    header.innerHTML = "";
    return;
  }

  const categoryItems = categoryGroupOfBrand(activeBrand.id)?.items || [];
  const brandProducts = products.filter((product) => Number(product.brandId) === Number(activeBrand.id));
  const categoryTabs = [
    `<button type="button" class="brand-category-tab ${activeCategoryId ? "" : "active"}" data-category-id="0">전체<span>${brandProducts.length}</span></button>`,
    ...categoryItems.map((category) => {
      const count = brandProducts.filter((product) => Number(product.categoryId) === Number(category.id)).length;
      return `<button type="button" class="brand-category-tab ${Number(activeCategoryId) === Number(category.id) ? "active" : ""}" data-category-id="${category.id}">
        ${escapeHtml(category.name)}<span>${count}</span>
      </button>`;
    })
  ].join("");

  const activeCategory = categoryItems.find((category) => Number(category.id) === Number(activeCategoryId));
  header.hidden = false;
  header.innerHTML = `
    <div class="brand-title-block">
      <small>브랜드</small>
      <h2>${escapeHtml(activeBrand.koName)}</h2>
      <p>${escapeHtml(activeBrand.enName)}${activeCategory ? ` · ${escapeHtml(activeCategory.name)}` : ""} 컬렉션 ${totalCount}개 상품</p>
    </div>
    <div class="brand-category-tabs" aria-label="${escapeHtml(activeBrand.koName)} 소분류 카테고리">
      ${categoryTabs}
    </div>
  `;

  header.querySelectorAll("[data-category-id]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    selectBrandCategory(Number(button.dataset.categoryId));
  }));
}

function animateProductGrid() {
  const grid = document.querySelector("#productGrid");
  if (!grid) return;
  grid.classList.remove("is-filtering");
  void grid.offsetWidth;
  grid.classList.add("is-filtering");
  window.setTimeout(() => grid.classList.remove("is-filtering"), 520);
}

function scrollToProductGrid() {
  const target = document.querySelector("#productGrid:not([hidden])") || document.querySelector("#emptyState") || document.querySelector("#all");
  const header = document.querySelector(".lux-header");
  const topBanner = document.querySelector("#homeTopBanner:not([hidden])");
  const topBannerVisible = topBanner && !document.body.classList.contains("notice-collapsed");
  const headerOffset = (header?.offsetHeight || 0) + (topBannerVisible ? topBanner.offsetHeight : 0) + 18;
  const targetTop = target.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({ top: Math.max(targetTop, 0), behavior: "smooth" });
}

function closeMobileNavAfterBrandSelect() {
  if (window.matchMedia("(max-width: 850px)").matches) {
    document.querySelector("#mainNav")?.classList.remove("open");
  }
}

function renderBrandControls() {
  const sorted = [...brands].sort((a, b) => Number(a.order) - Number(b.order));
  const featured = sorted.filter((brand) => brand.featured);
  const headerBrands = sorted.slice(0, 8);
  const moreBrands = sorted.slice(8);
  const quickTagBrands = [...featured, ...sorted.filter((brand) => !featured.some((item) => Number(item.id) === Number(brand.id)))]
    .slice(0, 5);
  document.querySelector("#featuredBrandNav").innerHTML = headerBrands.map((brand) => `<button class="${Number(activeBrandId) === Number(brand.id) ? "active" : ""}" data-brand-id="${brand.id}">${escapeHtml(brand.koName)}</button>`).join("");
  document.querySelector("#quickTagList").innerHTML = quickTagBrands.map((brand) => `<button data-brand-id="${brand.id}">${escapeHtml(brand.koName)}</button>`).join("");
  const moreBrandPanel = document.querySelector("#moreBrandPanel");
  const moreMenu = document.querySelector(".more-menu");
  if (moreMenu) moreMenu.hidden = moreBrands.length === 0;
  if (moreBrandPanel) {
    moreBrandPanel.innerHTML = moreBrands.map((brand) => `<button type="button" class="${Number(activeBrandId) === Number(brand.id) ? "active" : ""}" data-brand-id="${brand.id}">${escapeHtml(brand.koName)}</button>`).join("");
  }
  const mobileBrandDrawerList = document.querySelector("#mobileBrandDrawerList");
  if (mobileBrandDrawerList) {
    mobileBrandDrawerList.innerHTML = sorted.map((brand) => `
      <button type="button" class="${Number(activeBrandId) === Number(brand.id) ? "active" : ""}" data-brand-id="${brand.id}">
        <span>${escapeHtml(brand.koName)}</span>
      </button>
    `).join("");
  }
  document.querySelector("#brandFilters").innerHTML = [
    `<button class="brand-filter ${activeBrandId ? "" : "active"}" data-brand-id="0">전체<span>${products.length}</span></button>`,
    ...sorted.map((brand) => `<button class="brand-filter ${Number(activeBrandId) === Number(brand.id) ? "active" : ""}" data-brand-id="${brand.id}">${brand.koName}<span>${products.filter((product) => Number(product.brandId) === Number(brand.id)).length}</span></button>`)
  ].join("");
  document.querySelectorAll("[data-brand-id]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectBrand(Number(button.dataset.brandId));
  }));
}

function selectBrand(brandId) {
  activeBrandId = Number(brandId);
  activeCategoryId = 0;
  query = "";
  document.querySelector("#searchInput").value = "";
  if (history.pushState) {
    const nextUrl = activeBrandId ? `/?brand=${encodeURIComponent(activeBrandId)}#all` : "/#all";
    history.pushState(null, "", nextUrl);
  }
  renderBrandControls();
  renderCatalog();
  animateProductGrid();
  closeMoreMenu();
  closeMobileDrawer();
  closeMobileNavAfterBrandSelect();
  scrollToProductGrid();
}

function selectBrandCategory(categoryId) {
  activeCategoryId = Number(categoryId);
  query = "";
  document.querySelector("#searchInput").value = "";
  renderCatalog();
  animateProductGrid();
  scrollToProductGrid();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
}

function promotionBenefitText(item) {
  if (item.type === "event" || item.benefitType === "text") return item.conditionText || "이벤트 혜택";
  if (item.benefitType === "amount") return `${won(item.benefitValue)} 할인`;
  return `${Number(item.benefitValue || 0).toLocaleString("ko-KR")}% 할인`;
}

function renderPromotions() {
  const section = document.querySelector("#promotionShowcase");
  const grid = document.querySelector("#promotionShowcaseGrid");
  if (!section || !grid) return;
  section.hidden = promotions.length === 0;
  if (!promotions.length) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = promotions.map((item) => `<article class="promotion-card ${item.type}">
    <div class="promotion-card-top"><span>${item.type === "event" ? "EVENT" : "COUPON"}</span><small>${escapeHtml(item.startAt || "")} ~ ${escapeHtml(item.endAt || "")}</small></div>
    <h3>${escapeHtml(item.title)}</h3>
    <strong>${escapeHtml(promotionBenefitText(item))}</strong>
    <p>${escapeHtml(item.description || item.conditionText || "윤슬마켓의 특별한 혜택을 만나보세요.")}</p>
    ${item.type === "coupon" && item.code ? `<button type="button" class="promotion-code-button" data-promotion-code="${escapeHtml(item.code)}"><span>${escapeHtml(item.code)}</span><b>코드 복사</b></button>` : `<div class="promotion-event-condition">${escapeHtml(item.conditionText || "이벤트 진행 중")}</div>`}
  </article>`).join("");
  document.querySelectorAll("[data-promotion-code]").forEach((button) => button.addEventListener("click", async () => {
    const code = button.dataset.promotionCode || "";
    try {
      await navigator.clipboard.writeText(code);
      showToast(`쿠폰 코드 ${code}가 복사되었습니다.`);
    } catch (_) {
      window.prompt("쿠폰 코드를 복사해 주세요.", code);
    }
  }));
}

async function loadPromotions() {
  const response = await fetch("/api/promotions", { cache: "no-store" });
  if (!response.ok) throw new Error("PROMOTIONS_FAILED");
  const data = await response.json();
  promotions = Array.isArray(data.promotions) ? data.promotions : [];
  const updated = document.querySelector("#promotionUpdatedAt");
  if (updated) updated.textContent = promotions.length ? `${data.today || ""} 기준` : "";
  renderPromotions();
}

function isDesignBannerActive(item) {
  return item?.active === true || item?.active === 1 || item?.active === "true" || item?.active === "1";
}

function normalizeDesignBanners(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item, active: isDesignBannerActive(item) }));
}

function getDesignBanners() {
  try {
    const saved = JSON.parse(localStorage.getItem(DESIGN_STORAGE_KEY) || "null");
    if (Array.isArray(saved)) return normalizeDesignBanners(saved);
  } catch (_) {}
  localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(DEFAULT_DESIGN_BANNERS));
  return [...DEFAULT_DESIGN_BANNERS];
}

function renderNoticeText(content) {
  return escapeHtml(content).replace(/\n/g, "<br>");
}

function todayKey() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function closeNoticePopup() {
  const popup = document.querySelector("#noticePopup");
  if (!popup) return;
  popup.hidden = true;
  syncModalOpenState();
}

function closeMoreMenu() {
  document.querySelector(".more-menu")?.classList.remove("open");
}

function openMobileDrawer() {
  document.body.classList.add("drawer-open");
  document.querySelector("#mobileCategoryDrawer")?.setAttribute("aria-hidden", "false");
}

function closeMobileDrawer() {
  document.body.classList.remove("drawer-open");
  document.querySelector("#mobileCategoryDrawer")?.setAttribute("aria-hidden", "true");
}

function updateHeaderScrollShadow() {
  const header = document.querySelector(".lux-header");
  const isScrolled = window.scrollY > 8;
  const isCompact = window.scrollY > 80;
  header?.classList.toggle("header-scrolled", isScrolled);
  header?.classList.toggle("header-compact", isCompact);
}

function openNoticePopup(item) {
  if (!item) return;
  const hideKey = localStorage.getItem(`yoonseulNoticeHidden:${item.id}`);
  if (hideKey === todayKey()) return;
  document.querySelector("#noticePopupTitle").textContent = item.title;
  document.querySelector("#noticePopupContent").innerHTML = renderNoticeText(item.content);
  document.querySelector("#noticePopup").hidden = false;
  syncModalOpenState();
}

function renderDesignBanners() {
  const activeItems = getDesignBanners().filter(isDesignBannerActive);
  const topItems = activeItems.filter((item) => item.position === "top");
  const bottomItems = activeItems.filter((item) => item.position === "bottom");
  const popupItem = activeItems.find((item) => item.position === "popup");
  const topBanner = document.querySelector("#homeTopBanner");
  const bottomBanner = document.querySelector("#homeBottomBanner");

  if (topBanner) {
    topBanner.hidden = topItems.length === 0;
    document.body.classList.toggle("has-home-top-banner", topItems.length > 0);
    topBanner.innerHTML = topItems.map((item) => `<div class="top-banner-track"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.content).replace(/\s+/g, " ")}</span></div>`).join("");
  }

  if (bottomBanner) {
    bottomBanner.hidden = bottomItems.length === 0;
    bottomBanner.innerHTML = bottomItems.map((item) => `<article><small>YOONSEUL NOTICE</small><h2>${escapeHtml(item.title)}</h2><p>${renderNoticeText(item.content)}</p></article>`).join("");
  }

  if (!document.querySelector("#noticePopup")?.hidden) closeNoticePopup();
  setTimeout(() => openNoticePopup(popupItem), 250);
}

async function loadCatalog(silent = false) {
  const response = await fetch("/api/catalog");
  if (!response.ok) throw new Error("CATALOG_FAILED");
  const data = await response.json();
  if (!Array.isArray(data.products) || !Array.isArray(data.brands)) throw new Error("CATALOG_INVALID");
  const signature = JSON.stringify([data.brands, data.products, data.categories]);
  if (silent && signature === catalogSignature) return;
  catalogSignature = signature;
  brands = data.brands;
  products = data.products;
  categories = data.categories || [];
  if (initialBrandId && brands.some((brand) => Number(brand.id) === Number(initialBrandId))) {
    activeBrandId = initialBrandId;
    activeCategoryId = 0;
    initialBrandId = 0;
  }
  if (activeBrandId && !brands.some((brand) => Number(brand.id) === Number(activeBrandId))) activeBrandId = 0;
  if (activeCategoryId && !categoryGroupOfBrand(activeBrandId)?.items?.some((category) => Number(category.id) === Number(activeCategoryId))) activeCategoryId = 0;
  renderBrandControls();
  renderBest();
  renderCatalog();
}

document.querySelector("#searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  query = document.querySelector("#searchInput").value.trim();
  activeBrandId = 0;
  activeCategoryId = 0;
  renderBrandControls();
  renderCatalog();
  if (query) {
    const matchedCount = filteredProducts().length;
    showToast(matchedCount ? `"${query}" 검색 결과 ${matchedCount}개` : `"${query}" 검색 결과가 없습니다.`);
  }
  document.querySelector("#all").scrollIntoView({ behavior: "smooth" });
});
document.querySelector("#bestTitleButton")?.addEventListener("click", () => {
  document.querySelector("#bestGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#allTitleButton")?.addEventListener("click", () => {
  document.querySelector("#sortSelect").value = "featured";
  selectBrand(0);
});
document.querySelector("#rankingTabs").addEventListener("click", (event) => {
  if (event.target.tagName !== "BUTTON") return;
  document.querySelectorAll("#rankingTabs button").forEach((button) => button.classList.remove("active"));
  event.target.classList.add("active");
  renderBest(event.target.dataset.rank);
});
document.querySelector("#sortSelect").addEventListener("change", renderCatalog);
document.querySelector("#filterReset").addEventListener("click", () => selectBrand(0));
document.querySelector("#emptyReset").addEventListener("click", () => selectBrand(0));
document.querySelector("#mobileMenu").addEventListener("click", openMobileDrawer);
document.querySelector("#mobileDrawerClose")?.addEventListener("click", closeMobileDrawer);
document.querySelector("#mobileDrawerOverlay")?.addEventListener("click", closeMobileDrawer);
document.querySelector("#moreButton").addEventListener("click", (event) => {
  event.stopPropagation();
  document.querySelector(".more-menu").classList.toggle("open");
});
document.addEventListener("click", (event) => {
  if (!event.target.closest?.(".more-menu")) closeMoreMenu();
});
window.addEventListener("scroll", updateHeaderScrollShadow, { passive: true });

const joinModal = document.querySelector("#joinModal");
const joinForm = document.querySelector("#joinForm");
const shippingGuideModal = document.querySelector("#shippingGuideModal");
const returnsGuideModal = document.querySelector("#returnsGuideModal");
const noticeGuideModal = document.querySelector("#noticeGuideModal");

function syncModalOpenState() {
  const modalVisible = [joinModal, shippingGuideModal, returnsGuideModal, noticeGuideModal, document.querySelector("#noticePopup")].some((modal) => modal && modal.hidden === false);
  document.body.classList.toggle("modal-open", modalVisible);
}

function openJoinModal() {
  joinModal.hidden = false;
  syncModalOpenState();
  setTimeout(() => joinForm.elements.name.focus(), 0);
}

function closeJoinModal() {
  joinModal.hidden = true;
  syncModalOpenState();
  document.querySelector("#joinFormMessage").textContent = "";
}

function openShippingGuideModal() {
  if (!shippingGuideModal) return;
  shippingGuideModal.hidden = false;
  shippingGuideModal.setAttribute("aria-hidden", "false");
  syncModalOpenState();
}

function closeShippingGuideModal() {
  if (!shippingGuideModal) return;
  shippingGuideModal.hidden = true;
  shippingGuideModal.setAttribute("aria-hidden", "true");
  syncModalOpenState();
}

function openReturnsGuideModal() {
  if (!returnsGuideModal) return;
  returnsGuideModal.hidden = false;
  returnsGuideModal.setAttribute("aria-hidden", "false");
  syncModalOpenState();
}

function closeReturnsGuideModal() {
  if (!returnsGuideModal) return;
  returnsGuideModal.hidden = true;
  returnsGuideModal.setAttribute("aria-hidden", "true");
  syncModalOpenState();
}

function openNoticeGuideModal() {
  if (!noticeGuideModal) return;
  noticeGuideModal.hidden = false;
  noticeGuideModal.setAttribute("aria-hidden", "false");
  syncModalOpenState();
}

function closeNoticeGuideModal() {
  if (!noticeGuideModal) return;
  noticeGuideModal.hidden = true;
  noticeGuideModal.setAttribute("aria-hidden", "true");
  syncModalOpenState();
}

document.querySelectorAll('[data-shipping-guide-trigger="true"], .footer-column a[href="/apply"]').forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openShippingGuideModal();
  });
});

document.querySelectorAll("[data-shipping-guide-close]").forEach((button) => {
  button.addEventListener("click", closeShippingGuideModal);
});

shippingGuideModal?.addEventListener("click", (event) => {
  if (event.target === shippingGuideModal) closeShippingGuideModal();
});

document.querySelectorAll('[data-returns-guide-trigger="true"]').forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openReturnsGuideModal();
  });
});

document.querySelectorAll("[data-returns-guide-close]").forEach((button) => {
  button.addEventListener("click", closeReturnsGuideModal);
});

returnsGuideModal?.addEventListener("click", (event) => {
  if (event.target === returnsGuideModal) closeReturnsGuideModal();
});

document.querySelectorAll("[data-notice-guide-close]").forEach((button) => {
  button.addEventListener("click", closeNoticeGuideModal);
});

noticeGuideModal?.addEventListener("click", (event) => {
  if (event.target === noticeGuideModal) closeNoticeGuideModal();
});

document.querySelectorAll(".footer-column").forEach((column) => {
  const heading = column.querySelector("h3")?.textContent?.trim() || "";
  if (!heading.includes("고객") && !heading.includes("怨좉컼")) return;
  const links = column.querySelectorAll("a");
  const returnsLink = links[2];
  const noticeLink = links[3];
  if (!returnsLink || returnsLink.dataset.returnsGuideBound === "true") return;
  returnsLink.dataset.returnsGuideBound = "true";
  returnsLink.addEventListener("click", (event) => {
    event.preventDefault();
    openReturnsGuideModal();
  });
  if (noticeLink && noticeLink.dataset.noticeGuideBound !== "true") {
    noticeLink.dataset.noticeGuideBound = "true";
    noticeLink.addEventListener("click", (event) => {
      event.preventDefault();
      openNoticeGuideModal();
    });
  }
});

document.querySelectorAll(".footer-column").forEach((column) => {
  const heading = column.querySelector("h3")?.textContent?.trim() || "";
  if (!heading.includes("회사") && !heading.includes("?뚯궗")) return;
  const introLink = column.querySelector("a");
  const legalLink = column.querySelectorAll("a")[1];
  if (!introLink || introLink.dataset.aboutPageBound === "true") return;
  introLink.dataset.aboutPageBound = "true";
  introLink.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.href = "/about.html";
  });
  if (legalLink && legalLink.dataset.legalPageBound !== "true") {
    legalLink.dataset.legalPageBound = "true";
    legalLink.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = "/legal.html";
    });
  }
});

document.querySelector("#memberJoinButton")?.addEventListener("click", (event) => {
  if (getCurrentMember()) {
    event.preventDefault();
    window.location.href = "/mypage.html";
    return;
  }
  event.preventDefault();
  window.location.href = buildMemberJoinUrl();
});
document.querySelector("#memberLogoutButton")?.addEventListener("click", logoutCurrentMember);
document.querySelector("#joinModalClose")?.addEventListener("click", closeJoinModal);
joinModal?.addEventListener("click", (event) => {
  if (event.target === joinModal) closeJoinModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && joinModal && !joinModal.hidden) closeJoinModal();
  if (event.key === "Escape" && shippingGuideModal && !shippingGuideModal.hidden) closeShippingGuideModal();
  if (event.key === "Escape" && returnsGuideModal && !returnsGuideModal.hidden) closeReturnsGuideModal();
  if (event.key === "Escape" && noticeGuideModal && !noticeGuideModal.hidden) closeNoticeGuideModal();
  if (event.key === "Escape" && document.querySelector("#noticePopup") && !document.querySelector("#noticePopup").hidden) closeNoticePopup();
  if (event.key === "Escape") closeMoreMenu();
  if (event.key === "Escape") closeMobileDrawer();
});
joinForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = joinForm.querySelector(".join-submit");
  const message = document.querySelector("#joinFormMessage");
  submitButton.disabled = true;
  submitButton.textContent = "가입 처리 중...";
  message.textContent = "";
  try {
    const response = await fetch("/api/members/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(joinForm)))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "회원가입을 완료하지 못했습니다.");
    const user = result.user || result;
    localStorage.setItem("yoonseulMembersUpdated", String(Date.now()));
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("yoonseul-members");
      channel.postMessage({ type: "member-registered", memberId: user.id });
      channel.close();
    }
    joinForm.reset();
    closeJoinModal();
    showToast(`${user.name}님, 회원가입이 완료되었습니다.`);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "회원가입 완료";
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === "yoonseulCatalogUpdated") loadCatalog(true).catch(() => {});
  if (event.key === DESIGN_STORAGE_KEY || event.key === "yoonseulDesignUpdated") renderDesignBanners();
  if (event.key === MEMBER_STORAGE_KEY) syncHeaderMemberState();
  if (event.key === INQUIRY_CHANNEL_STORAGE_KEY || event.key === "yoonseulInquiryChannelsUpdated") renderInquiryChannels();
});
if ("BroadcastChannel" in window) {
  const catalogUpdates = new BroadcastChannel("yoonseul-catalog");
  catalogUpdates.addEventListener("message", (event) => {
    if (event.data?.type === "brand-order-updated") loadCatalog(true).catch(() => {});
  });
  const designUpdates = new BroadcastChannel("yoonseul-design");
  designUpdates.addEventListener("message", (event) => {
    if (event.data?.type === "design-updated") renderDesignBanners();
  });
  const inquiryUpdates = new BroadcastChannel("yoonseul-inquiry-channels");
  inquiryUpdates.addEventListener("message", (event) => {
    if (event.data?.type === "inquiry-channels-updated") renderInquiryChannels();
  });
}

document.querySelector("#noticePopupClose")?.addEventListener("click", closeNoticePopup);
document.querySelector("#noticePopupCloseBottom")?.addEventListener("click", closeNoticePopup);
document.querySelector("#noticePopup")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeNoticePopup();
});
document.querySelector("#noticePopupToday")?.addEventListener("click", () => {
  const popupItem = getDesignBanners().filter(isDesignBannerActive).find((item) => item.position === "popup");
  if (popupItem) localStorage.setItem(`yoonseulNoticeHidden:${popupItem.id}`, todayKey());
  closeNoticePopup();
});

async function loadServerSiteSettings() {
  try {
    const response = await fetch("/api/site-settings", { cache: "no-store" });
    const settings = await response.json();
    if (Array.isArray(settings.designBanners)) localStorage.setItem(DESIGN_STORAGE_KEY, JSON.stringify(normalizeDesignBanners(settings.designBanners)));
    if (settings.inquiryChannels && Object.keys(settings.inquiryChannels).length) localStorage.setItem(INQUIRY_CHANNEL_STORAGE_KEY, JSON.stringify(settings.inquiryChannels));
  } catch (_) {}
  renderDesignBanners();
  renderInquiryChannels();
}
loadServerSiteSettings();
syncHeaderMemberState();
updateHeaderScrollShadow();
document.querySelector("#bestGrid").innerHTML = '<div class="best-empty-state" role="status"><strong>상품을 불러오는 중입니다.</strong><span>잠시만 기다려 주세요.</span></div>';
loadCatalog()
  .then(() => Promise.allSettled([loadBestSellers(), loadPromotions()]))
  .catch(() => {
    document.querySelector("#bestGrid").innerHTML = '<div class="best-empty-state"><strong>상품을 불러오지 못했습니다.</strong><span>잠시 후 새로고침해 주세요.</span></div>';
    showToast("홈페이지 정보를 불러오지 못했습니다.");
  });
setInterval(() => loadCatalog(true), 10000);
setInterval(() => loadBestSellers().catch(() => {}), 10000);
setInterval(() => loadPromotions().catch(() => {}), 10000);
setInterval(loadServerSiteSettings, 10000);
