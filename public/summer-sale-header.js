(function () {
  const brandUrl = (brand) => `/?brand=${encodeURIComponent(brand.id)}#all`;
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  let currentSaleName = "시즌세일";

  function renderBrands(brands) {
    const sorted = [...(brands || [])].filter((brand) => brand.active !== false).sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || Number(a.id) - Number(b.id));
    const featuredNode = document.querySelector("#featuredBrandNav");
    const moreNode = document.querySelector("#moreBrandPanel");
    const mobileNode = document.querySelector("#mobileBrandDrawerList");
    if (featuredNode) featuredNode.innerHTML = sorted.slice(0, 8).map((brand) => `<a href="${brandUrl(brand)}">${safe(brand.koName)}</a>`).join("");
    if (moreNode) moreNode.innerHTML = sorted.slice(8).map((brand) => `<a href="${brandUrl(brand)}">${safe(brand.koName)}</a>`).join("");
    if (mobileNode) mobileNode.innerHTML = `<a class="mobile-summer-sale-link" href="/summer-sale"><span>${safe(currentSaleName)}</span><small>SEASON SALE</small></a>` + sorted.map((brand) => `<a class="summer-mobile-brand" href="${brandUrl(brand)}"><span>${safe(brand.koName)}</span></a>`).join("");
  }

  async function loadBrands() {
    try {
      const cached = JSON.parse(localStorage.getItem("yoonseulStorefrontCache") || "null");
      if (cached?.brands?.length) renderBrands(cached.brands);
    } catch (_) {}
    try {
      const response = await fetch("/api/storefront", { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const data = await response.json();
      currentSaleName = String(data.summerSale?.name || "여름세일");
      renderBrands(data.brands);
    } catch (_) {}
  }

  function setDrawer(open) {
    document.body.classList.toggle("drawer-open", open);
    document.querySelector("#mobileCategoryDrawer")?.setAttribute("aria-hidden", open ? "false" : "true");
  }

  document.querySelector("#mobileMenu")?.addEventListener("click", () => setDrawer(true));
  document.querySelector("#mobileDrawerClose")?.addEventListener("click", () => setDrawer(false));
  document.querySelector("#mobileDrawerOverlay")?.addEventListener("click", () => setDrawer(false));
  document.querySelector("#moreButton")?.addEventListener("click", () => document.querySelector(".more-menu")?.classList.toggle("open"));
  document.querySelector("#cartButton")?.addEventListener("click", () => { location.href = "/cart.html"; });
  loadBrands();
}());
