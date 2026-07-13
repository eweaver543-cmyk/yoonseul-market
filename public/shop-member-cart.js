(function () {
  const store = () => window.YoonseulCart;
  let catalogCache = null;

  async function loadCatalog() {
    if (catalogCache) return catalogCache;
    const response = await fetch("/api/catalog");
    if (!response.ok) throw new Error("CATALOG_FAILED");
    catalogCache = await response.json();
    return catalogCache;
  }

  function currentMember() {
    return store()?.getCurrentMember?.() || null;
  }

  function syncHeaderMemberLink() {
    const loginButton = document.querySelector("#memberJoinButton");
    const member = currentMember();
    if (!loginButton || !member) return;
    const memberName = member.name || member.email || "회원";
    loginButton.textContent = memberName;
    loginButton.setAttribute("href", "/mypage.html");
    loginButton.setAttribute("aria-label", `${memberName} 마이페이지로 이동`);
  }

  function syncCartCounters() {
    let count = store()?.getCartCount?.() || 0;
    if (!count) {
      try {
        const items = JSON.parse(localStorage.getItem("yoonseulCartItems") || "[]");
        count = Array.isArray(items) ? items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) : 0;
      } catch (_) {}
    }
    document.querySelectorAll("#cartCount, #sharedCartCount").forEach((node) => {
      node.textContent = count;
    });
  }

  function wishlistPayload(product, brand) {
    return {
      productId: product.id,
      brandId: product.brandId,
      brandName: brand?.koName || "",
      name: product.name,
      price: product.price,
      image: product.images?.main?.[0] || product.image || ""
    };
  }

  function syncWishlistButtons() {
    document.querySelectorAll("[data-wishlist]").forEach((button) => {
      const productId = Number(button.dataset.wishlist);
      const active = store()?.isWishlisted?.(productId) || fallbackIsWishlisted(productId);
      button.classList.toggle("active", Boolean(active));
      button.textContent = active ? "♥" : "♡";
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const detailButton = document.querySelector("#wishButton");
    const detailProductId = Number(new URLSearchParams(location.search).get("id") || 0);
    if (detailButton && detailProductId) {
      const active = store()?.isWishlisted?.(detailProductId) || fallbackIsWishlisted(detailProductId);
      detailButton.classList.toggle("active", Boolean(active));
      detailButton.innerHTML = active ? `<i class="fa-solid fa-heart"></i> 찜 해제` : `<i class="fa-regular fa-heart"></i> 찜하기`;
    }
  }



  function persistCartItem(payload) {
    if (store()?.addCartItem) {
      store().addCartItem(payload);
      return;
    }
    try {
      const items = JSON.parse(localStorage.getItem("yoonseulCartItems") || "[]");
      const match = items.find((entry) => Number(entry.productId) === Number(payload.productId) && String(entry.optionLabel || "") === String(payload.optionLabel || ""));
      if (match) {
        match.quantity = Number(match.quantity || 0) + Number(payload.quantity || 1);
      } else {
        items.unshift({ id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...payload, addedAt: new Date().toISOString() });
      }
      localStorage.setItem("yoonseulCartItems", JSON.stringify(items));
      localStorage.setItem("yoonseulCartUpdated", String(Date.now()));
    } catch (_) {}
  }

  function fallbackWishlistItems() {
    try {
      const items = JSON.parse(localStorage.getItem("yoonseulWishlistItems") || "[]");
      return Array.isArray(items) ? items : [];
    } catch (_) {
      return [];
    }
  }

  function fallbackIsWishlisted(productId) {
    return fallbackWishlistItems().some((item) => Number(item.productId) === Number(productId));
  }

  function fallbackToggleWishlistItem(payload) {
    const items = fallbackWishlistItems();
    const index = items.findIndex((item) => Number(item.productId) === Number(payload.productId));
    let active = true;
    if (index >= 0) {
      items.splice(index, 1);
      active = false;
    } else {
      items.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...payload, addedAt: new Date().toISOString() });
    }
    try {
      localStorage.setItem("yoonseulWishlistItems", JSON.stringify(items));
      localStorage.setItem("yoonseulWishlistUpdated", String(Date.now()));
    } catch (_) {}
    return active;
  }

  function navigateCart(event) {
    event.preventDefault();
    window.location.href = "/cart.html";
  }

  function bindHeaderCartButtons() {
    document.querySelector(".lux-header #cartButton")?.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      navigateCart(event);
    }, true);
    document.querySelector("#sharedCartButton")?.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      navigateCart(event);
    }, true);
  }

  async function addCatalogItemToCart(productId) {
    const catalog = await loadCatalog();
    const product = (catalog.products || []).find((item) => Number(item.id) === Number(productId));
    if (!product) return false;
    const brand = (catalog.brands || []).find((item) => Number(item.id) === Number(product.brandId));
    persistCartItem({
      productId: product.id,
      brandId: product.brandId,
      brandName: brand?.koName || "",
      name: product.name,
      price: product.price,
      image: product.images?.main?.[0] || product.image || "",
      optionIndex: "",
      optionLabel: "기본 옵션",
      quantity: 1
    });
    syncCartCounters();
    return true;
  }

  async function toggleCatalogWishlist(productId) {
    const catalog = await loadCatalog();
    const product = (catalog.products || []).find((item) => Number(item.id) === Number(productId));
    if (!product) return null;
    const brand = (catalog.brands || []).find((item) => Number(item.id) === Number(product.brandId));
    const payload = wishlistPayload(product, brand);
    const active = store()?.toggleWishlistItem ? store().toggleWishlistItem(payload) : fallbackToggleWishlistItem(payload);
    syncWishlistButtons();
    return active;
  }

  function bindCatalogAddButtons() {
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-cart]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const ok = await addCatalogItemToCart(Number(button.dataset.cart));
      if (ok && typeof window.showToast === "function") {
        window.showToast("상품을 장바구니에 담았습니다.");
      }
    }, true);
  }

  function bindWishlistButtons() {
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-wishlist]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const active = await toggleCatalogWishlist(Number(button.dataset.wishlist));
      if (active !== null && typeof window.showToast === "function") {
        window.showToast(active ? "찜한 상품에 추가했습니다." : "찜 목록에서 삭제했습니다.");
      }
    }, true);
  }

  function bindDetailCartButton() {
    const detailButton = document.querySelector(".sub-actions #cartButton");
    if (!detailButton) return;
    detailButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const productId = Number(new URLSearchParams(location.search).get("id") || 0);
      if (!productId) return;
      const catalog = await loadCatalog();
      const product = (catalog.products || []).find((item) => Number(item.id) === productId);
      if (!product) return;
      const brand = (catalog.brands || []).find((item) => Number(item.id) === Number(product.brandId));
      const optionSelect = document.querySelector("#optionSelect");
      const optionIndex = optionSelect && optionSelect.value !== "" ? optionSelect.value : "";
      const option = Array.isArray(product.options) ? product.options[Number(optionIndex)] : null;
      const quantity = Math.max(1, Number(document.querySelector("#quantityValue")?.textContent || 1));
      persistCartItem({
        productId: product.id,
        brandId: product.brandId,
        brandName: brand?.koName || "",
        name: product.name,
        price: product.price,
        image: product.images?.main?.[0] || product.image || "",
        optionIndex,
        optionLabel: [option?.color, option?.size].filter(Boolean).join(" / ") || option?.name || "기본 옵션",
        quantity
      });
      syncCartCounters();
      if (typeof window.showToast === "function") {
        window.showToast("상품을 장바구니에 담았습니다.");
      }
    }, true);
  }

  function bindDetailWishButton() {
    const detailButton = document.querySelector("#wishButton");
    if (!detailButton) return;
    detailButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const productId = Number(new URLSearchParams(location.search).get("id") || 0);
      if (!productId) return;
      const active = await toggleCatalogWishlist(productId);
      if (active !== null && typeof window.showToast === "function") {
        window.showToast(active ? "찜한 상품에 추가했습니다." : "찜 목록에서 삭제했습니다.");
      }
    }, true);
  }

  function subscribeCartUpdates() {
    window.addEventListener("storage", (event) => {
      if (event.key === "yoonseulCartItems" || event.key === "yoonseulCartUpdated") {
        syncCartCounters();
      }
    });
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("yoonseul-cart");
      channel.addEventListener("message", () => syncCartCounters());
      const wishlistChannel = new BroadcastChannel("yoonseul-wishlist");
      wishlistChannel.addEventListener("message", () => syncWishlistButtons());
    }
  }

  syncHeaderMemberLink();
  syncCartCounters();
  syncWishlistButtons();
  bindHeaderCartButtons();
  bindCatalogAddButtons();
  bindWishlistButtons();
  bindDetailCartButton();
  bindDetailWishButton();
  subscribeCartUpdates();
})();
