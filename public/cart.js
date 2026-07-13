const cartStore = window.YoonseulCart;
const cartApp = document.querySelector("#cartApp");

const won = (value) => `₩${Number(value || 0).toLocaleString("ko-KR")}`;
const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

function productDetailUrl(productId) {
  return `/detail.html?id=${encodeURIComponent(productId || "")}`;
}

function checkoutUrl(item) {
  const params = new URLSearchParams({
    id: item.productId || "",
    qty: item.quantity || 1,
    cartItem: item.id || ""
  });
  if (item.optionIndex !== undefined && item.optionIndex !== null && item.optionIndex !== "") {
    params.set("option", item.optionIndex);
  }
  return `/checkout.html?${params.toString()}`;
}

function cartTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
}

function bindCartEvents() {
  document.querySelectorAll("[data-qty-minus]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.qtyMinus;
    const item = cartStore.getCart().find((entry) => entry.id === id);
    if (!item) return;
    cartStore.updateCartQuantity(id, Math.max(1, Number(item.quantity || 1) - 1));
    renderCartPage();
  }));

  document.querySelectorAll("[data-qty-plus]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.qtyPlus;
    const item = cartStore.getCart().find((entry) => entry.id === id);
    if (!item) return;
    cartStore.updateCartQuantity(id, Number(item.quantity || 1) + 1);
    renderCartPage();
  }));

  document.querySelectorAll("[data-remove-cart]").forEach((button) => button.addEventListener("click", () => {
    cartStore.removeCartItem(button.dataset.removeCart);
    renderCartPage();
  }));

  document.querySelector("#clearCartButton")?.addEventListener("click", () => {
    if (!confirm("장바구니를 모두 비우시겠습니까?")) return;
    cartStore.clearCart();
    renderCartPage();
  });
}

function renderCartPage() {
  const items = cartStore.getCart();
  const total = cartTotal(items);

  if (!items.length) {
    cartApp.innerHTML = `
      <section class="empty-box content-card">
        <small>CART</small>
        <h2>장바구니가 비어 있습니다.</h2>
        <p>관심 있는 상품을 장바구니에 담아두고 편하게 비교해 보세요.</p>
        <div class="hero-actions">
          <a class="primary-button" href="/#all">쇼핑 계속하기</a>
          <a class="ghost-button" href="/mypage.html">마이페이지</a>
        </div>
      </section>
    `;
    return;
  }

  cartApp.innerHTML = `
    <section class="page-hero">
      <div>
        <small>CART</small>
        <h1>장바구니</h1>
        <p>담아두신 상품을 확인하고, 각 상품별로 바로 주문을 진행할 수 있습니다.</p>
      </div>
      <div class="hero-actions">
        <a class="ghost-button" href="/#all">쇼핑 계속하기</a>
        <a class="ghost-button" href="/mypage.html">마이페이지</a>
        <button class="primary-button" id="clearCartButton" type="button">장바구니 비우기</button>
      </div>
    </section>

    <section class="summary-grid">
      <article class="summary-card"><small>담긴 상품</small><strong>${items.length}</strong><span>옵션별로 구분되어 저장됩니다.</span></article>
      <article class="summary-card"><small>총 수량</small><strong>${items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</strong><span>수량 조절 후 바로 주문 가능합니다.</span></article>
      <article class="summary-card"><small>예상 결제금액</small><strong>${won(total)}</strong><span>배송비와 추가 조건은 주문서에서 최종 확인됩니다.</span></article>
      <article class="summary-card"><small>마이페이지</small><strong>${cartStore.getCurrentMember() ? "연동중" : "비회원"}</strong><span>${cartStore.getCurrentMember() ? "주문 내역과 찜한 상품을 확인할 수 있습니다." : "로그인하면 주문 내역이 마이페이지에 정리됩니다."}</span></article>
    </section>

    <section class="cart-layout">
      <div class="content-card">
        <div class="content-card-head">
          <div><h2>담긴 상품 목록</h2><p>수량을 조절하거나 원하는 상품만 주문할 수 있습니다.</p></div>
        </div>
        <table class="cart-table">
          <thead><tr><th>상품 정보</th><th>수량</th><th>금액</th><th>관리</th></tr></thead>
          <tbody>
            ${items.map((item) => `
              <tr>
                <td>
                  <div class="cart-product">
                    <a class="product-link-thumb" href="${productDetailUrl(item.productId)}"><img src="${escapeHtml(item.image || "")}" alt="${escapeHtml(item.name || "상품 이미지")}"></a>
                    <div>
                      <a class="product-link-title" href="${productDetailUrl(item.productId)}"><b>${escapeHtml(item.name || "상품 정보")}</b></a>
                      <small>${escapeHtml(item.brandName || "윤슬마켓 컬렉션")} · ${escapeHtml(item.optionLabel || "기본 옵션")}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="qty-control">
                    <button type="button" data-qty-minus="${escapeHtml(item.id)}">-</button>
                    <output>${Number(item.quantity || 1)}</output>
                    <button type="button" data-qty-plus="${escapeHtml(item.id)}">+</button>
                  </div>
                </td>
                <td><strong>${won(Number(item.price || 0) * Number(item.quantity || 0))}</strong></td>
                <td>
                  <div class="row-actions">
                    <a class="mini-button dark" href="${checkoutUrl(item)}">주문하기</a>
                    <button class="mini-button" type="button" data-remove-cart="${escapeHtml(item.id)}">삭제</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <aside class="content-card order-summary-card">
        <div class="content-card-head">
          <div><h2>주문 요약</h2><p>현재 장바구니 기준 합계입니다.</p></div>
        </div>
        <div class="price-stack">
          <div class="price-row"><span>상품 합계</span><b>${won(total)}</b></div>
          <div class="price-row"><span>주문 가능 상품</span><b>${items.length}건</b></div>
          <div class="price-row price-total"><span>총 예상 금액</span><b>${won(total)}</b></div>
        </div>
      </aside>
    </section>
  `;

  bindCartEvents();
}

window.addEventListener("storage", (event) => {
  if (event.key === "yoonseulCartItems" || event.key === "yoonseulCartUpdated") renderCartPage();
});

if ("BroadcastChannel" in window) {
  const channel = new BroadcastChannel("yoonseul-cart");
  channel.addEventListener("message", () => renderCartPage());
}

renderCartPage();
