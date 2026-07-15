const won = (value) => `₩${Number(value || 0).toLocaleString("ko-KR")}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
let expiresAt = 0;
let refreshTimer = null;
let saleName = "시즌세일";

function productPath(product) {
  return `/product/${Number(product.id)}`;
}

function thumbnail(product) {
  const source = String(product.image || "");
  return source.startsWith("/uploads/") ? `/thumbnail?src=${encodeURIComponent(source)}` : (source || "/images/product-placeholder.svg");
}

function renderCountdown() {
  const target = document.querySelector("#saleCountdown");
  const remaining = Math.max(0, expiresAt - Date.now());
  if (!remaining) {
    target.textContent = `새로운 ${saleName} 상품으로 교체 중입니다.`;
    clearInterval(refreshTimer);
    setTimeout(loadSale, 800);
    return;
  }
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  target.textContent = `${saleName} 상품 교체까지 ${days}일 ${String(hours).padStart(2, "0")}시간 ${String(minutes).padStart(2, "0")}분 ${String(seconds).padStart(2, "0")}초`;
}

async function loadSale() {
  const response = await fetch("/api/storefront", { cache: "no-store" });
  if (!response.ok) throw new Error("세일 상품을 불러오지 못했습니다.");
  const data = await response.json();
  saleName = String(data.summerSale?.name || "여름세일");
  const englishNames = { "봄세일": "SPRING CLASSIC SALE", "여름세일": "SUMMER CLASSIC SALE", "가을세일": "AUTUMN CLASSIC SALE", "겨울세일": "WINTER CLASSIC SALE" };
  document.title = `${saleName} | 윤슬마켓`;
  document.querySelectorAll(".summer-sale-nav").forEach((node) => { node.textContent = saleName; });
  const heroName = document.querySelector("#seasonalSaleHeroName");
  const englishTitle = document.querySelector("#seasonalSaleEnglishTitle");
  if (heroName) heroName.textContent = saleName;
  if (englishTitle) englishTitle.textContent = englishNames[saleName] || "SEASON CLASSIC SALE";
  expiresAt = Date.parse(data.summerSale?.expiresAt || "");
  const saleProducts = (data.products || []).filter((product) => product.summerSale);
  const brands = (data.brands || []).filter((brand) => saleProducts.some((product) => Number(product.brandId) === Number(brand.id)));
  const content = document.querySelector("#saleContent");
  content.innerHTML = brands.length ? brands.map((brand) => {
    const items = saleProducts.filter((product) => Number(product.brandId) === Number(brand.id)).slice(0, 4);
    return `<section class="sale-brand"><header class="sale-brand-head"><div><p>CURATED BRAND SELECTION</p><h2>${escapeHtml(brand.koName)}</h2></div><a href="/?brand=${Number(brand.id)}#all">브랜드 전체보기 →</a></header><div class="sale-grid">${items.map((product) => `<article class="sale-card"><a href="${productPath(product)}"><span class="discount">${product.summerSale.discountRate}% OFF</span><img src="${escapeHtml(thumbnail(product))}" data-original="${escapeHtml(product.image || "")}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="if(this.dataset.original){this.src=this.dataset.original;this.dataset.original=''}"><small>${escapeHtml(brand.enName || brand.koName)}</small><h3>${escapeHtml(product.name)}</h3><div class="sale-prices"><del>${won(product.summerSale.regularPrice)}</del><strong>${won(product.summerSale.salePrice)}</strong></div></a></article>`).join("")}</div></section>`;
  }).join("") : `<div class="sale-loading">현재 준비된 ${escapeHtml(saleName)} 상품이 없습니다.</div>`;
  clearInterval(refreshTimer);
  renderCountdown();
  refreshTimer = setInterval(renderCountdown, 1000);
}

loadSale().catch((error) => { document.querySelector("#saleContent").innerHTML = `<div class="sale-loading">${escapeHtml(error.message)}</div>`; });
