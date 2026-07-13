const mypageStore = window.YoonseulCart;
const mypageApp = document.querySelector("#mypageApp");
let mypageCatalogProducts = [];

const mypageWon = (value) => `\u20A9${Number(value || 0).toLocaleString("ko-KR")}`;
const reviewStars = (rating) => "\u2605".repeat(Number(rating || 0)) + "\u2606".repeat(5 - Number(rating || 0));

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[character]));
}

function formatOrderDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function productDetailUrl(productId) {
  return `/detail.html?id=${encodeURIComponent(productId)}`;
}

async function loadMypageCatalog() {
  try {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    if (!response.ok) return;
    const catalog = await response.json();
    mypageCatalogProducts = Array.isArray(catalog.products) ? catalog.products : [];
  } catch (_) {}
}

function catalogProductForOrder(order) {
  const productId = Number(order.productId || 0);
  if (productId) {
    const byId = mypageCatalogProducts.find((product) => Number(product.id) === productId);
    if (byId) return byId;
  }
  const productName = String(order.productName || "").trim();
  return productName ? mypageCatalogProducts.find((product) => String(product.name || "").trim() === productName) : null;
}

function bindOrderImageFallbacks() {
  document.querySelectorAll(".product-link-thumb img").forEach((image) => {
    const showFallback = () => {
      image.hidden = true;
      image.nextElementSibling?.removeAttribute("hidden");
    };
    image.addEventListener("error", showFallback, { once: true });
    if (image.complete && !image.naturalWidth) showFallback();
  });
}

function renderGuestMypage() {
  const wishlistItems = mypageStore.getWishlist?.() || [];
  mypageApp.innerHTML = `
    <section class="locked-box content-card">
      <small>MY PAGE</small>
      <h2>로그인 후 이용 가능합니다.</h2>
      <p>주문 내역과 회원 정보를 안전하게 확인하려면 로그인해 주세요. 비회원으로 저장한 관심상품은 아래에서 확인할 수 있습니다.</p>
      <div class="hero-actions">
        <a class="primary-button" href="/join?returnTo=%2Fmypage.html">로그인 / 회원가입</a>
        <a class="ghost-button" href="/#all">상품 보러가기</a>
      </div>
    </section>
    <section class="content-card">
      <div class="content-card-head">
        <div>
          <h2>관심상품 미리보기</h2>
          <p>비회원으로 찜한 상품도 이 브라우저에 안전하게 저장됩니다.</p>
        </div>
        <a class="mini-button" href="/#all">상품 더보기</a>
      </div>
      <div class="cart-preview-list">
        ${wishlistItems.length
          ? wishlistItems.slice(0, 6).map((item) => `
            <article class="cart-preview-item">
              <a href="/detail.html?id=${encodeURIComponent(item.productId)}">
                <b>${escapeHtml(item.name || "상품")}</b>
                <small>${escapeHtml(item.brandName || "윤슬마켓")} ? ${mypageWon(item.price || 0)}</small>
              </a>
              <button class="mini-button" type="button" data-remove-wishlist="${item.productId}">삭제</button>
            </article>
          `).join("")
          : `<div class="empty-box"><h2>찜한 상품이 없습니다</h2><p>상품 카드의 하트 버튼을 눌러 관심상품을 저장해 보세요.</p></div>`}
      </div>
    </section>
  `;
  bindWishlistPreviewEvents();
}

function getReviewsByMember(member) {
  if (!member) return [];
  return (mypageStore.getReviews?.() || []).filter((review) => {
    if (member.id && review.userId === member.id) return true;
    if (member.name && review.userName === member.name) return true;
    return false;
  });
}

function reviewButtonLabel(order) {
  return mypageStore.getOrderReview(order.id) ? "리뷰 수정" : "리뷰 작성";
}

function canWriteReview(order) {
  return ["배송완료", "구매확정"].includes(String(order.status || "").trim());
}

function reviewModalTemplate() {
  return `
    <div class="member-review-modal-backdrop" id="reviewModal" hidden>
      <section class="member-review-modal" role="dialog" aria-modal="true" aria-labelledby="reviewModalTitle">
        <button class="member-review-close" id="reviewModalClose" type="button" aria-label="리뷰 작성 닫기">×</button>
        <form id="reviewForm">
          <input type="hidden" name="orderId">
          <input type="hidden" name="productId">
          <input type="hidden" name="productName">
          <input type="hidden" name="option">
          <p>ORDER REVIEW</p>
          <h2 id="reviewModalTitle">상품 리뷰 작성</h2>
          <span id="reviewTargetText"></span>
          <label>
            평점
            <select name="rating" required>
              <option value="5">★★★★★ 5점</option>
              <option value="4">★★★★☆ 4점</option>
              <option value="3">★★★☆☆ 3점</option>
              <option value="2">★★☆☆☆ 2점</option>
              <option value="1">★☆☆☆☆ 1점</option>
            </select>
          </label>
          <label class="review-textarea-label">
            리뷰 내용
            <textarea name="content" rows="6" maxlength="600" required placeholder="상품 퀄리티, 배송 만족도, 실제 사용 후기를 자유롭게 남겨주세요."></textarea>
          </label>
          <label>
            포토 리뷰 이미지
            <input type="file" name="reviewImage" id="reviewImageInput" accept="image/*">
            <small class="review-upload-guide">이미지는 1장까지 업로드할 수 있습니다.</small>
          </label>
          <div class="review-image-preview" id="reviewImagePreview" hidden></div>
          <div class="join-form-message" id="reviewFormMessage" aria-live="polite"></div>
          <button class="join-submit" type="submit">리뷰 저장</button>
        </form>
      </section>
    </div>
  `;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

function renderReviewImagePreview(source) {
  const preview = document.querySelector("#reviewImagePreview");
  if (!preview) return;
  if (!source) {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }
  preview.hidden = false;
  preview.innerHTML = `<img src="${source}" alt="리뷰 이미지 미리보기">`;
}

function orderCardTemplate(order) {
  const review = mypageStore.getOrderReview(order.id);
  const productName = order.productName || "상품 정보";
  const catalogProduct = catalogProductForOrder(order);
  const productId = catalogProduct?.id || order.productId || "";
  const productImage = catalogProduct?.images?.main?.[0] || catalogProduct?.image || order.image || "";
  const reviewBlock = review ? `
    <div class="order-review-summary">
      <span>${reviewStars(review.rating)}</span>
      <b>${Number(review.rating)}점 리뷰 작성됨</b>
      <small>${escapeHtml(review.content)}</small>
    </div>
  ` : "";

  return `
    <article class="mypage-order-item">
      <a class="product-link-thumb" href="${productDetailUrl(productId)}">
        <img src="${escapeHtml(productImage)}" alt="${escapeHtml(productName)} 상품 이미지">
        <span class="product-image-placeholder" hidden aria-hidden="true">윤슬<br>마켓</span>
      </a>
      <div>
        <a class="product-link-title" href="${productDetailUrl(productId)}"><b>${escapeHtml(productName)}</b></a>
        <small>옵션 · ${escapeHtml(order.option || "기본 옵션")}</small>
        <small>수량 · ${Number(order.quantity || 1)}개 / 주문일 · ${formatOrderDate(order.createdAt)}</small>
        <small>결제 · ${escapeHtml(order.paymentMethod || "-")} / ${mypageWon(order.orderTotal)}</small>
        ${reviewBlock}
      </div>
      <div class="mypage-order-side">
        <span class="status-badge">${escapeHtml(order.status || "주문접수")}</span>
        ${canWriteReview(order)
          ? `<button class="mini-button review-trigger" type="button" data-order-id="${escapeHtml(order.id)}">${reviewButtonLabel(order)}</button>`
          : `<small class="review-waiting">배송완료 후 리뷰 작성 가능</small>`}
      </div>
    </article>
  `;
}

function renderMypage() {
  const member = mypageStore.getCurrentMember?.();
  if (!member) {
    renderGuestMypage();
    return;
  }

  const orders = mypageStore.getMemberOrders?.(member) || [];
  const cartItems = mypageStore.getCart?.() || [];
  const wishlistItems = mypageStore.getWishlist?.() || [];
  const reviews = getReviewsByMember(member);
  const totalSpent = orders.reduce((sum, order) => sum + Number(order.orderTotal || 0), 0);

  mypageApp.innerHTML = `
    <section class="page-hero">
      <div>
        <small>ACCOUNT OVERVIEW</small>
        <h1>${escapeHtml(member.name || member.email || "고객")}님의 마이페이지</h1>
        <p>주문 상태와 장바구니, 작성한 리뷰까지 한 번에 확인할 수 있습니다.</p>
      </div>
      <div class="hero-actions">
        <a class="ghost-button" href="/cart.html">장바구니 보기</a>
        <a class="primary-button" href="/#all">쇼핑 계속하기</a>
      </div>
    </section>

    <section class="summary-grid">
      <a class="summary-card" href="#recent-orders" aria-label="최근 주문 내역으로 이동">
        <small>누적 주문</small>
        <strong>${orders.length}</strong>
        <span>완료/진행중 주문을 포함한 전체 주문 수</span>
      </a>
      <a class="summary-card" href="/cart.html" aria-label="장바구니 페이지로 이동">
        <small>장바구니 상품</small>
        <strong>${cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</strong>
        <span>현재 담아둔 상품 수량 기준</span>
      </a>
      <a class="summary-card" href="#recent-orders" aria-label="구매 주문 내역으로 이동">
        <small>총 구매금액</small>
        <strong>${mypageWon(totalSpent)}</strong>
        <span>취소 제외 기준으로 계산된 누적 결제 금액</span>
      </a>
      <a class="summary-card" href="#recent-orders" aria-label="작성한 리뷰가 있는 주문 내역으로 이동">
        <small>작성한 리뷰</small>
        <strong>${reviews.length}</strong>
        <span>구매 상품 기준으로 남긴 리뷰 수</span>
      </a>
      <a class="summary-card" href="#wishlist-preview" aria-label="관심상품 목록으로 이동">
        <small>관심상품</small>
        <strong>${wishlistItems.length}</strong>
        <span>찜해둔 상품을 마이페이지에서 빠르게 확인합니다.</span>
      </a>
    </section>

    <section class="mypage-grid">
      <article class="content-card profile-card">
        <small>PROFILE</small>
        <strong>${escapeHtml(member.name || member.email || "고객")}</strong>
        <p>${escapeHtml(member.email || "-")}</p>
        <ul>
          <li>연락처 · ${escapeHtml(member.phone || "미등록")}</li>
          <li>등급 · ${escapeHtml(member.grade || "일반")}</li>
          <li>가입일 · ${formatOrderDate(member.joinedAt || member.createdAt || new Date().toISOString())}</li>
        </ul>
      </article>

      <div>
        <section class="content-card" id="recent-orders">
          <div class="content-card-head">
            <div>
              <h2>최근 주문 내역</h2>
              <p>배송완료된 주문은 상품 아래에서 바로 리뷰를 작성할 수 있습니다.</p>
            </div>
          </div>
          <div class="mypage-order-list">
            ${orders.length
              ? orders.map(orderCardTemplate).join("")
              : `<div class="empty-box"><h2>주문 내역이 없습니다</h2><p>첫 주문을 시작하면 이곳에서 주문 현황을 확인할 수 있습니다.</p></div>`}
          </div>
        </section>

        <section class="content-card" id="cart-preview">
          <div class="content-card-head">
            <div>
              <h2>장바구니 미리보기</h2>
              <p>결제 전 다시 확인할 상품들입니다.</p>
            </div>
            <a class="mini-button" href="/cart.html">전체 보기</a>
          </div>
          <div class="cart-preview-list">
            ${cartItems.length
              ? cartItems.slice(0, 4).map((item) => `
                <article class="cart-preview-item">
                  <div>
                    <b>${escapeHtml(item.name || "상품")}</b>
                    <small>${escapeHtml(item.optionLabel || "기본 옵션")} · ${Number(item.quantity || 1)}개</small>
                  </div>
                  <strong>${mypageWon(Number(item.price || 0) * Number(item.quantity || 1))}</strong>
                </article>
              `).join("")
              : `<div class="empty-box"><h2>장바구니가 비어 있습니다</h2><p>마음에 드는 상품을 담아두면 이곳에서 빠르게 확인할 수 있습니다.</p></div>`}
          </div>
        </section>

        <section class="content-card" id="wishlist-preview">
          <div class="content-card-head">
            <div>
              <h2>관심상품 미리보기</h2>
              <p>마음에 드는 상품을 저장해두고 나중에 다시 확인할 수 있습니다.</p>
            </div>
            <a class="mini-button" href="/#all">상품 더보기</a>
          </div>
          <div class="cart-preview-list">
            ${wishlistItems.length
              ? wishlistItems.slice(0, 6).map((item) => `
                <article class="cart-preview-item">
                  <a href="/detail.html?id=${encodeURIComponent(item.productId)}">
                    <b>${escapeHtml(item.name || "상품")}</b>
                    <small>${escapeHtml(item.brandName || "윤슬마켓")} · ${mypageWon(item.price || 0)}</small>
                  </a>
                  <button class="mini-button" type="button" data-remove-wishlist="${item.productId}">삭제</button>
                </article>
              `).join("")
              : `<div class="empty-box"><h2>찜한 상품이 없습니다</h2><p>상품 카드의 하트 버튼을 눌러 관심상품을 저장해 보세요.</p></div>`}
          </div>
        </section>
      </div>
    </section>

    ${reviewModalTemplate()}
  `;

  bindOrderImageFallbacks();
  bindWishlistPreviewEvents();
  bindReviewEvents(member, orders);
}

function bindWishlistPreviewEvents() {
  document.querySelectorAll("[data-remove-wishlist]").forEach((button) => button.addEventListener("click", () => {
    mypageStore.removeWishlistItem?.(Number(button.dataset.removeWishlist));
    renderMypage();
  }));
}

function openReviewModal(member, order) {
  const modal = document.querySelector("#reviewModal");
  const form = document.querySelector("#reviewForm");
  const message = document.querySelector("#reviewFormMessage");
  const review = mypageStore.getOrderReview(order.id);

  form.reset();
  form.elements.orderId.value = order.id;
  form.elements.productId.value = order.productId || "";
  form.elements.productName.value = order.productName || "";
  form.elements.option.value = order.option || "기본 옵션";
  form.elements.rating.value = String(review?.rating || 5);
  form.elements.content.value = review?.content || "";
  form.dataset.existingImage = review?.image || "";
  const imageInput = document.querySelector("#reviewImageInput");
  if (imageInput) imageInput.value = "";
  renderReviewImagePreview(review?.image || "");
  document.querySelector("#reviewTargetText").textContent = `${order.productName || "상품"} · ${order.option || "기본 옵션"}`;
  message.textContent = "";
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  form.elements.content.focus();
}

function closeReviewModal() {
  const modal = document.querySelector("#reviewModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = "";
}

function bindReviewEvents(member, orders) {
  document.querySelectorAll(".review-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      const order = orders.find((item) => item.id === button.dataset.orderId);
      if (!order) return;
      openReviewModal(member, order);
    });
  });

  document.querySelector("#reviewModalClose")?.addEventListener("click", closeReviewModal);
  document.querySelector("#reviewModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeReviewModal();
  });
  document.querySelector("#reviewImageInput")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      renderReviewImagePreview(document.querySelector("#reviewForm")?.dataset.existingImage || "");
      return;
    }
    try {
      const imageSource = await readFileAsDataUrl(file);
      renderReviewImagePreview(imageSource);
    } catch (_) {}
  });

  document.querySelector("#reviewForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const message = document.querySelector("#reviewFormMessage");
    const order = orders.find((item) => item.id === payload.orderId);

    if (!String(payload.content || "").trim()) {
      message.textContent = "리뷰 내용을 입력해 주세요.";
      form.elements.content.focus();
      return;
    }

    if (!order || !canWriteReview(order)) {
      message.textContent = "배송완료된 주문에 대해서만 리뷰를 작성할 수 있습니다.";
      return;
    }

    let imageSource = form.dataset.existingImage || "";
    const reviewImageFile = form.elements.reviewImage?.files?.[0];
    if (reviewImageFile) {
      try {
        imageSource = await readFileAsDataUrl(reviewImageFile);
      } catch (_) {
        message.textContent = "리뷰 이미지를 읽지 못했습니다. 다시 시도해 주세요.";
        return;
      }
    }

    const deliveryCompletedAt = ["배송완료", "구매확정"].includes(String(order?.status || "").trim())
      ? (order?.createdAt || new Date().toISOString())
      : "";

    try {
      await mypageStore.upsertReview?.({
        orderId: payload.orderId,
        productId: payload.productId,
        userId: member.id,
        userName: member.name || member.email || "고객",
        productName: payload.productName,
        option: payload.option,
        rating: Number(payload.rating || 5),
        content: String(payload.content || "").trim(),
        image: imageSource,
        images: imageSource ? [imageSource] : [],
        status: "published",
        deliveryCompletedAt,
        isEligibleOrder: canWriteReview(order)
      });
    } catch (error) {
      message.textContent = error.message || "리뷰를 저장하지 못했습니다.";
      return;
    }

    closeReviewModal();
    renderMypage();
  });
}

window.addEventListener("storage", (event) => {
  if ([
    "yoonseulCartItems",
    "yoonseulCartUpdated",
    "yoonseulWishlistItems",
    "yoonseulWishlistUpdated",
    "yoonseulOrderHistory",
    "yoonseulOrderHistoryUpdated",
    "yoonseulCurrentMember",
    "yoonseulReviews",
    "yoonseulReviewsUpdated"
  ].includes(event.key)) {
    renderMypage();
  }
});

if ("BroadcastChannel" in window) {
  ["yoonseul-cart", "yoonseul-wishlist", "yoonseul-orders", "yoonseul-reviews"].forEach((channelName) => {
    const channel = new BroadcastChannel(channelName);
    channel.addEventListener("message", () => renderMypage());
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeReviewModal();
});

async function refreshMemberOrders() {
  const member = mypageStore.getCurrentMember?.();
  await loadMypageCatalog();
  if (member) {
    await Promise.all([
      mypageStore.hydrateMemberOrdersFromServer?.(member),
      mypageStore.hydrateMemberReviewsFromServer?.(member)
    ]);
  }
  renderMypage();
}

refreshMemberOrders();
setInterval(refreshMemberOrders, 15000);
