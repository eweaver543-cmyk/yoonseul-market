const state = {
  product: null,
  brand: null,
  category: null,
  images: [],
  activeImage: 0,
  quantity: 1,
  selectedOption: "",
  selectedOptionIndex: -1,
  selectedColor: "",
  selectedSize: ""
};

const money = (value) => `\u20A9${Number(value || 0).toLocaleString("ko-KR")}`;

const safeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}[character]));

function showToast(message) {
  const toast = document.querySelector("#detailToast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function normalizeImages(product) {
  const mainSources = Array.isArray(product.images?.main)
    ? product.images.main.filter(Boolean)
    : [];
  const sources = mainSources.length ? mainSources : [product.image].filter(Boolean);
  return [...new Set(sources)];
}

function findCategory(categories, product) {
  const group = categories.find((entry) => Number(entry.brandId) === Number(product.brandId));
  return group?.items?.find((item) => Number(item.id) === Number(product.categoryId)) || null;
}

function getOptionLabel(option) {
  return [option?.color, option?.size].filter(Boolean).join(" / ") || option?.name || "기본 옵션";
}

function reviewStars(rating) {
  return "\u2605".repeat(Number(rating || 0)) + "\u2606".repeat(5 - Number(rating || 0));
}

function formatReviewDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function updateTotal() {
  const total = Number(state.product?.price || 0) * state.quantity;
  document.querySelector("#quantityValue").textContent = state.quantity;
  document.querySelector("#totalPrice").textContent = money(total);
}

function switchMainImage(index) {
  if (!state.images[index]) return;
  state.activeImage = index;
  const image = document.querySelector("#mainProductImage");
  image.classList.add("switching");
  window.setTimeout(() => {
    image.src = state.images[index];
    image.classList.remove("switching");
  }, 100);
  document.querySelectorAll(".thumbnail-button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.imageIndex) === index);
  });
}

function renderGallery() {
  state.images = normalizeImages(state.product);
  const mainImage = document.querySelector("#mainProductImage");
  mainImage.src = state.images[0] || "";
  mainImage.alt = `${state.product.name} ?? ???`;

  document.querySelector("#thumbnailStrip").innerHTML = state.images.map((source, index) => `
    <button type="button" class="thumbnail-button ${index === 0 ? "active" : ""}" data-image-index="${index}" aria-label="?? ??? ${index + 1} ??">
      <img src="${source}" alt="${safeHtml(state.product.name) } ?? ??? ??? ${index + 1}" loading="lazy">
    </button>
  `).join("");

  document.querySelectorAll(".thumbnail-button").forEach((button) => {
    const index = Number(button.dataset.imageIndex);
    button.addEventListener("mouseenter", () => switchMainImage(index));
    button.addEventListener("click", () => switchMainImage(index));
  });
}

function renderOptions() {
  const optionBox = document.querySelector("#optionBox");
  const options = Array.isArray(state.product.options) ? state.product.options : [];

  if (!options.length) {
    optionBox.hidden = true;
    state.selectedOption = "";
    state.selectedOptionIndex = -1;
    return;
  }

  const colors = [...new Set(options.map((option) => String(option.color || "").trim()).filter(Boolean))];
  const sizes = [...new Set(options.map((option) => String(option.size || "").trim()).filter(Boolean))];
  state.selectedColor = "";
  state.selectedSize = "";
  state.selectedOption = "";
  state.selectedOptionIndex = -1;
  optionBox.hidden = false;
  const renderChoiceGroup = (type, values) => {
    const group = document.querySelector(`#${type}OptionGroup`);
    const list = document.querySelector(`#${type}OptionChoices`);
    group.hidden = values.length === 0;
    list.innerHTML = values.map((value) => `<button type="button" data-option-type="${type}" data-option-value="${safeHtml(value)}">${safeHtml(value)}</button>`).join("");
  };
  renderChoiceGroup("color", colors);
  renderChoiceGroup("size", sizes);

  const updateSelection = () => {
    document.querySelectorAll('[data-option-type="color"]').forEach((button) => button.classList.toggle("active", button.dataset.optionValue === state.selectedColor));
    document.querySelectorAll('[data-option-type="size"]').forEach((button) => button.classList.toggle("active", button.dataset.optionValue === state.selectedSize));
    const complete = (!colors.length || state.selectedColor) && (!sizes.length || state.selectedSize);
    const index = complete ? options.findIndex((option) =>
      (!colors.length || String(option.color || "") === state.selectedColor) &&
      (!sizes.length || String(option.size || "") === state.selectedSize)
    ) : -1;
    state.selectedOptionIndex = index;
    state.selectedOption = index >= 0 ? getOptionLabel(options[index]) : "";
    const summary = document.querySelector("#selectedOptionSummary");
    summary.textContent = state.selectedOption
      ? `선택 옵션: ${state.selectedOption}`
      : [colors.length && "색상", sizes.length && "사이즈"].filter(Boolean).join("과 ") + "를 선택해 주세요.";
    summary.classList.toggle("selected", Boolean(state.selectedOption));
  };

  document.querySelectorAll("[data-option-type]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.optionType === "color") state.selectedColor = button.dataset.optionValue || "";
    if (button.dataset.optionType === "size") state.selectedSize = button.dataset.optionValue || "";
    updateSelection();
  }));
  updateSelection();
}

function focusMissingOption() {
  if (!state.selectedColor && !document.querySelector("#colorOptionGroup")?.hidden) {
    document.querySelector('#colorOptionChoices button')?.focus();
    return;
  }
  document.querySelector('#sizeOptionChoices button')?.focus();
}

function renderDetailImages() {
  const detailImages = Array.isArray(state.product.images?.detail) ? state.product.images.detail.filter(Boolean) : [];
  const list = document.querySelector("#detailImageList");

  if (!detailImages.length) {
    list.innerHTML = `<div class="detail-image-empty">등록된 상세 이미지가 없습니다.</div>`;
    return;
  }

  list.innerHTML = detailImages.map((source, index) => `
    <img src="${source}" alt="${safeHtml(state.product.name)} 상세 이미지 ${index + 1}" loading="lazy">
  `).join("");
}

function renderPrice() {
  const price = Number(state.product.price || 0);
  const oldPrice = Number(state.product.oldPrice || 0);
  const saleLine = document.querySelector("#saleLine");
  const saleRate = document.querySelector("#saleRate");
  const oldPriceElement = document.querySelector("#productOldPrice");

  document.querySelector("#productPrice").textContent = money(price);

  if (oldPrice > price) {
    const discount = Math.max(1, Math.round(((oldPrice - price) / oldPrice) * 100));
    saleLine.hidden = false;
    saleRate.textContent = `${discount}%`;
    oldPriceElement.textContent = money(oldPrice);
  } else {
    saleLine.hidden = true;
    saleRate.textContent = "";
    oldPriceElement.textContent = "";
  }
}

function renderReviews() {
  if (!state.product) return;

  const reviews = window.YoonseulCart?.getProductReviews?.(state.product.id) || [];
  const average = reviews.length
    ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
    : "0.0";
  const rounded = Math.max(0, Math.min(5, Math.round(Number(average))));

  const reviewSection = document.querySelector(".review-section");
  const reviewHead = reviewSection?.querySelector(".review-head");
  if (reviewSection && !document.querySelector("#reviewList")) {
    const existingEmpty = reviewSection.querySelector(".empty-review");
    const list = document.createElement("div");
    list.className = "review-list";
    list.id = "reviewList";
    if (existingEmpty) {
      list.appendChild(existingEmpty);
    }
    reviewSection.appendChild(list);
  }

  const summaryText = document.querySelector("#reviewSummaryText") || reviewHead?.querySelector("p");
  if (summaryText && !summaryText.id) summaryText.id = "reviewSummaryText";
  if (summaryText) {
    summaryText.innerHTML = `<span>${reviewStars(rounded)}</span> <b>${average}</b> · ${reviews.length}건`;
  }

  const reviewLine = document.querySelector(".review-line");
  if (reviewLine) {
    reviewLine.innerHTML = `
      <span class="stars">${reviewStars(rounded)}</span>
      <b>${average}</b>
      <span>· ${reviews.length}건 리뷰</span>
    `;
  }

  const member = window.YoonseulCart?.getCurrentMember?.();
  const hint = document.querySelector("#reviewWriteHint") || reviewHead?.querySelector("small");
  if (hint && !hint.id) hint.id = "reviewWriteHint";
  if (hint) {
    hint.textContent = member
      ? "배송완료 주문 후 마이페이지에서 리뷰 작성이 가능합니다"
      : "로그인 후 배송완료 주문 기준으로 마이페이지에서 리뷰 작성이 가능합니다";
  }

  const list = document.querySelector("#reviewList");
  if (!list) return;

  if (!reviews.length) {
    list.innerHTML = `<div class="empty-review">아직 리뷰가 없습니다</div>`;
    return;
  }

  list.innerHTML = reviews.map((review) => `
    <article class="review-card">
      <div class="review-meta">
        <div>
          <strong>${safeHtml(review.userName || "고객")}</strong>
          <span>${formatReviewDate(review.createdAt)}</span>
        </div>
        <b class="review-stars">${reviewStars(review.rating)}</b>
      </div>
      <small class="review-option">${safeHtml(review.option || "기본 옵션")}</small>
      ${review.images?.[0] || review.image ? `<img class="review-card-image" src="${review.images?.[0] || review.image}" alt="리뷰 첨부 이미지">` : ""}
      <p>${safeHtml(review.content || "")}</p>
      ${review.replyContent ? `
        <div class="review-reply-box">
          <b>윤슬마켓 답변</b>
          <p>${safeHtml(review.replyContent)}</p>
          <small>${review.repliedAt ? formatReviewDate(review.repliedAt) : ""}</small>
        </div>
      ` : ""}
    </article>
  `).join("");
}

function renderProduct() {
  const brandKo = state.brand?.koName || "브랜드";
  const brandEn = state.brand?.enName || "YOONSEUL";
  const brandName = state.brand ? `${brandKo} / ${brandEn}` : "브랜드 미지정";
  const categoryName = state.category?.name || "카테고리 미지정";
  const description = state.product.description || `${state.product.name} 상품 상세 정보입니다.`;

  document.title = `${state.product.name} | 윤슬마켓`;
  document.querySelector("#detailBreadcrumb").innerHTML = `
    <a href="/">홈</a><span>/</span>
    <a href="/#all">전체상품</a><span>/</span>
    <b>${safeHtml(state.product.name)}</b>
  `;
  document.querySelector("#brandKicker").textContent = brandKo;
  document.querySelector("#productName").textContent = state.product.name;
  document.querySelector("#productDescription").textContent = description;
  document.querySelector("#metaBrand").textContent = brandName;
  document.querySelector("#metaCategory").textContent = categoryName;
  document.querySelector("#metaId").textContent = `#${state.product.id}`;

  renderPrice();
  renderGallery();
  renderOptions();
  renderDetailImages();
  renderReviews();
  updateTotal();
}

async function loadDetail() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) throw new Error("NO_ID");

  const response = await fetch("/api/catalog");
  if (!response.ok) throw new Error("CATALOG_FAILED");

  const catalog = await response.json();
  const product = (catalog.products || []).find((item) => Number(item.id) === Number(id));
  if (!product) throw new Error("NOT_FOUND");

  state.product = product;
  state.brand = (catalog.brands || []).find((brand) => Number(brand.id) === Number(product.brandId)) || null;
  state.category = findCategory(catalog.categories || [], product);
  state.images = normalizeImages(product);

  if (!state.images.length) {
    state.images = ["https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=86"];
  }

  renderProduct();
}

document.querySelector("#quantityMinus").addEventListener("click", () => {
  state.quantity = Math.max(1, state.quantity - 1);
  updateTotal();
});

document.querySelector("#quantityPlus").addEventListener("click", () => {
  state.quantity += 1;
  updateTotal();
});

document.querySelector("#buyButton").addEventListener("click", () => {
  const hasOptions = Array.isArray(state.product?.options) && state.product.options.length > 0;
  if (hasOptions && !state.selectedOption) {
    showToast("옵션을 먼저 선택해 주세요.");
    focusMissingOption();
    return;
  }
  const params = new URLSearchParams({
    id: state.product.id,
    qty: state.quantity
  });
  if (state.selectedOptionIndex >= 0) params.set("option", state.selectedOptionIndex);
  window.location.href = `/checkout.html?${params.toString()}`;
});

document.querySelector("#chatButton").addEventListener("click", () => {
  const href = document.querySelector("#chatButton")?.dataset.href;
  if (!href) {
    showToast("현재 연결된 문의 채널이 없습니다.");
    return;
  }
  window.open(href, "_blank", "noopener");
});
document.querySelector("#cartButton").addEventListener("click", () => {
  const hasOptions = Array.isArray(state.product?.options) && state.product.options.length > 0;
  if (hasOptions && !state.selectedOption) {
    showToast("옵션을 먼저 선택해 주세요.");
    focusMissingOption();
    return;
  }

  window.YoonseulCart?.addCartItem?.({
    productId: state.product.id,
    brandId: state.product.brandId,
    brandName: state.brand?.koName || "",
    name: state.product.name,
    price: Number(state.product.price || 0),
    image: state.images[0] || "",
    optionIndex: state.selectedOptionIndex >= 0 ? state.selectedOptionIndex : "",
    optionLabel: state.selectedOption || "기본 옵션",
    quantity: state.quantity
  });
  showToast("장바구니에 담았습니다.");
});

window.addEventListener("storage", (event) => {
  if (event.key === "yoonseulReviews" || event.key === "yoonseulReviewsUpdated") {
    renderReviews();
  }
});

if ("BroadcastChannel" in window) {
  const reviewChannel = new BroadcastChannel("yoonseul-reviews");
  reviewChannel.addEventListener("message", () => renderReviews());
}

loadDetail().catch(() => {
  showToast("상품 정보를 불러오지 못했습니다.");
});
