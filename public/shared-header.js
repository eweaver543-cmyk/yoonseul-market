function sharedEscapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[character]));
}

const SHARED_INQUIRY_CHANNEL_STORAGE_KEY = "yoonseulInquiryChannels";
const SHARED_DEFAULT_INQUIRY_CHANNELS = {
  kakao: "https://pf.kakao.com/",
  line: "https://line.me/",
  telegram: "https://t.me/",
  google: "https://forms.google.com/",
  liveChannel: "https://channel.io/"
};

function getSharedCurrentMember() {
  try {
    return JSON.parse(localStorage.getItem("yoonseulCurrentMember") || "null");
  } catch (_) {
    return null;
  }
}

function getSharedInquiryChannels() {
  try {
    const saved = JSON.parse(localStorage.getItem(SHARED_INQUIRY_CHANNEL_STORAGE_KEY) || "null");
    if (saved && typeof saved === "object") {
      return {
        kakao: saved.kakao == null ? SHARED_DEFAULT_INQUIRY_CHANNELS.kakao : String(saved.kakao),
        line: saved.line == null ? SHARED_DEFAULT_INQUIRY_CHANNELS.line : String(saved.line),
        telegram: saved.telegram == null ? SHARED_DEFAULT_INQUIRY_CHANNELS.telegram : String(saved.telegram),
        google: saved.google == null ? SHARED_DEFAULT_INQUIRY_CHANNELS.google : String(saved.google),
        liveChannel: saved.liveChannel == null ? SHARED_DEFAULT_INQUIRY_CHANNELS.liveChannel : String(saved.liveChannel)
      };
    }
  } catch (_) {}
  localStorage.setItem(SHARED_INQUIRY_CHANNEL_STORAGE_KEY, JSON.stringify(SHARED_DEFAULT_INQUIRY_CHANNELS));
  return { ...SHARED_DEFAULT_INQUIRY_CHANNELS };
}

function getSharedInquiryEntries() {
  const channels = getSharedInquiryChannels();
  return [
    { key: "kakao", label: "카톡문의", short: "Kakao", href: channels.kakao },
    { key: "line", label: "라인문의", short: "LINE", href: channels.line },
    { key: "telegram", label: "텔레문의", short: "Telegram", href: channels.telegram },
    { key: "google", label: "구글문의", short: "Google", href: channels.google },
    { key: "liveChannel", label: "라이브채널", short: "Live", href: channels.liveChannel }
  ];
}

function ensureSharedInquiryFloatingDock() {
  let dock = document.querySelector("#inquiryFloatingDock");
  if (dock) return dock;
  dock = document.createElement("aside");
  dock.className = "inquiry-floating-dock";
  dock.id = "inquiryFloatingDock";
  dock.setAttribute("aria-label", "문의 채널 바로가기");
  document.body.appendChild(dock);
  return dock;
}

function renderSharedInquiryChannels() {
  const entries = getSharedInquiryEntries();
  const dock = ensureSharedInquiryFloatingDock();
  const activeEntries = entries.filter((entry) => String(entry.href || "").trim());
  dock.hidden = activeEntries.length === 0;
  dock.innerHTML = activeEntries.map((entry) => `<a href="${sharedEscapeHtml(entry.href)}" target="_blank" rel="noopener" aria-label="${sharedEscapeHtml(entry.label)}" title="${sharedEscapeHtml(entry.label)}">${sharedEscapeHtml(entry.short)}</a>`).join("");

  const chatButton = document.querySelector("#chatButton");
  const kakaoEntry = entries.find((entry) => entry.key === "kakao");
  if (chatButton) {
    const visible = Boolean(String(kakaoEntry?.href || "").trim());
    chatButton.hidden = !visible;
    chatButton.disabled = !visible;
    if (visible) {
      chatButton.dataset.href = kakaoEntry.href;
    } else {
      delete chatButton.dataset.href;
    }
  }
}

function buildSharedJoinUrl() {
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  return `/join?returnTo=${encodeURIComponent(returnTo)}`;
}

function logoutSharedCurrentMember() {
  localStorage.removeItem("yoonseulCurrentMember");
  syncSharedHeaderMemberState();
}

function syncSharedHeaderMemberState() {
  const member = getSharedCurrentMember();
  const loginButton = document.querySelector("#memberJoinButton");
  const logoutButton = document.querySelector("#memberLogoutButton");
  const drawer = document.querySelector("#mobileCategoryDrawer");
  const drawerAccount = document.querySelector("#mobileDrawerAccount");
  const memberName = member?.name || member?.email || "회원";
  document.body.classList.toggle("member-logged-in", Boolean(member));
  document.body.classList.toggle("member-guest", !member);
  if (loginButton) {
    loginButton.textContent = member ? memberName : "로그인";
    loginButton.setAttribute("href", member ? "/mypage.html" : buildSharedJoinUrl());
    loginButton.setAttribute("aria-label", member ? `${memberName} 마이페이지로 이동` : "로그인");
  }
  if (logoutButton) {
    logoutButton.hidden = !member;
    logoutButton.textContent = "로그아웃";
    logoutButton.setAttribute("aria-label", "로그아웃");
  }
  if (drawer) drawer.dataset.authState = member ? "member" : "guest";
  if (drawerAccount) {
    drawerAccount.innerHTML = member ? `
      <a href="/mypage.html"><i class="fa-regular fa-user"></i>마이페이지</a>
      <button type="button" id="sharedMobileDrawerLogoutButton"><i class="fa-solid fa-arrow-right-from-bracket"></i>로그아웃</button>
    ` : `
      <a href="${buildSharedJoinUrl()}"><i class="fa-regular fa-user"></i>로그인</a>
    `;
    document.querySelector("#sharedMobileDrawerLogoutButton")?.addEventListener("click", () => {
      closeSharedMobileDrawer();
      logoutSharedCurrentMember();
    });
  }
}

function closeSharedMoreMenu() {
  document.querySelector(".more-menu")?.classList.remove("open");
}

function openSharedMobileDrawer() {
  document.body.classList.add("drawer-open");
  document.querySelector("#mobileCategoryDrawer")?.setAttribute("aria-hidden", "false");
}

function closeSharedMobileDrawer() {
  document.body.classList.remove("drawer-open");
  document.querySelector("#mobileCategoryDrawer")?.setAttribute("aria-hidden", "true");
}

function updateSharedHeaderScrollShadow() {
  const header = document.querySelector(".lux-header");
  header?.classList.toggle("header-scrolled", window.scrollY > 8);
  header?.classList.toggle("header-compact", window.scrollY > 80);
}

function goSharedBrand(brandId) {
  const id = Number(brandId || 0);
  closeSharedMoreMenu();
  closeSharedMobileDrawer();
  if (!id) {
    window.location.href = "/#all";
    return;
  }
  window.location.href = `/?brand=${encodeURIComponent(id)}#all`;
}

function renderSharedBrandMenus(brands, products) {
  const moreBrandPanel = document.querySelector("#moreBrandPanel");
  const featuredNav = document.querySelector("#featuredBrandNav");
  const mobileBrandDrawerList = document.querySelector("#mobileBrandDrawerList");
  if (!moreBrandPanel || !featuredNav) return;

  const sorted = [...brands].sort((a, b) => Number(a.order) - Number(b.order));
  const headerBrands = sorted.slice(0, 8);
  const moreBrands = sorted.slice(8);
  const moreMenu = document.querySelector(".more-menu");

  featuredNav.innerHTML = headerBrands.map((brand) => `<button type="button" data-brand-id="${brand.id}">${sharedEscapeHtml(brand.koName)}</button>`).join("");
  if (moreMenu) moreMenu.hidden = moreBrands.length === 0;
  moreBrandPanel.innerHTML = moreBrands.map((brand) => `<button type="button" data-brand-id="${brand.id}">${sharedEscapeHtml(brand.koName)}</button>`).join("");
  if (mobileBrandDrawerList) {
    mobileBrandDrawerList.innerHTML = sorted.map((brand) => `
      <button type="button" data-brand-id="${brand.id}">
        <span>${sharedEscapeHtml(brand.koName)}</span>
      </button>
    `).join("");
  }

  document.querySelectorAll("[data-brand-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      goSharedBrand(button.dataset.brandId);
    });
  });
}

async function initSharedHeader() {
  try {
    const settingsResponse = await fetch("/api/site-settings", { cache: "no-store" });
    const settings = await settingsResponse.json();
    if (settings.inquiryChannels && Object.keys(settings.inquiryChannels).length) localStorage.setItem(SHARED_INQUIRY_CHANNEL_STORAGE_KEY, JSON.stringify(settings.inquiryChannels));
  } catch (_) {}
  const mobileButton = document.querySelector("#mobileMenu");
  const moreButton = document.querySelector("#moreButton");
  const loginButton = document.querySelector("#memberJoinButton");
  const logoutButton = document.querySelector("#memberLogoutButton");

  mobileButton?.addEventListener("click", openSharedMobileDrawer);
  document.querySelector("#mobileDrawerClose")?.addEventListener("click", closeSharedMobileDrawer);
  document.querySelector("#mobileDrawerOverlay")?.addEventListener("click", closeSharedMobileDrawer);
  moreButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelector(".more-menu")?.classList.toggle("open");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".more-menu")) closeSharedMoreMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSharedMoreMenu();
      closeSharedMobileDrawer();
    }
  });
  loginButton?.addEventListener("click", (event) => {
    if (getSharedCurrentMember()) {
      event.preventDefault();
      window.location.href = "/mypage.html";
      return;
    }
    event.preventDefault();
    window.location.href = buildSharedJoinUrl();
  });
  logoutButton?.addEventListener("click", logoutSharedCurrentMember);
  window.addEventListener("scroll", updateSharedHeaderScrollShadow, { passive: true });
  window.addEventListener("storage", (event) => {
    if (event.key === "yoonseulCurrentMember") syncSharedHeaderMemberState();
    if (event.key === SHARED_INQUIRY_CHANNEL_STORAGE_KEY || event.key === "yoonseulInquiryChannelsUpdated") renderSharedInquiryChannels();
  });
  syncSharedHeaderMemberState();
  renderSharedInquiryChannels();
  updateSharedHeaderScrollShadow();

  try {
    const response = await fetch("/api/catalog");
    const catalog = await response.json();
    renderSharedBrandMenus(catalog.brands || [], catalog.products || []);
  } catch (_) {
    renderSharedBrandMenus([], []);
  }

  if ("BroadcastChannel" in window) {
    const inquiryUpdates = new BroadcastChannel("yoonseul-inquiry-channels");
    inquiryUpdates.addEventListener("message", (event) => {
      if (event.data?.type === "inquiry-channels-updated") renderSharedInquiryChannels();
    });
  }
}

initSharedHeader();
