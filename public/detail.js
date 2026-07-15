const state = {
  product: null,
  brand: null,
  category: null,
  images: [],
  activeImage: 0,
  quantity: 1,
  selectedColor: "",
  selectedSize: "",
  selectedItems: [],
  optionProductId: null,
  loadingFullDetails: false
};

const DETAIL_PREVIEW_KEY = "yoonseul-detail-preview";
const CHECKOUT_SELECTION_KEY = "yoonseul-checkout-selection";

function currentProductId() {
  const queryId = Number(new URLSearchParams(location.search).get("id") || 0);
  if (queryId) return queryId;
  const pathMatch = location.pathname.match(/^\/product\/(\d+)(?:\/|$)/);
  return Number(window.YOONSEUL_PRODUCT_ID || pathMatch?.[1] || 0);
}

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
  const hasOptions = Array.isArray(state.product?.options) && state.product.options.length > 0;
  const selectedQuantity = state.selectedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const quantity = hasOptions ? selectedQuantity : state.quantity;
  const total = Number(state.product?.price || 0) * quantity;
  document.querySelector("#quantityValue").textContent = state.quantity;
  document.querySelector("#totalPrice").textContent = money(total);
}

function thumbnailImageUrl(source) {
  return String(source || "").startsWith("/uploads/") ? `/thumbnail?src=${encodeURIComponent(source)}` : source;
}

function loadMainProductImage(source) {
  const image = document.querySelector("#mainProductImage");
  if (!image || !source) return;
  const preview = thumbnailImageUrl(source);
  image.src = preview;
  if (preview === source) return;
  const full = new Image();
  full.onload = () => {
    if (state.images[state.activeImage] === source) image.src = source;
  };
  full.src = source;
}

function switchMainImage(index) {
  if (!state.images[index]) return;
  state.activeImage = index;
  const image = document.querySelector("#mainProductImage");
  image.classList.add("switching");
  window.setTimeout(() => {
    loadMainProductImage(state.images[index]);
    image.classList.remove("switching");
  }, 100);
  document.querySelectorAll(".thumbnail-button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.imageIndex) === index);
  });
}

function renderGallery() {
  state.images = normalizeImages(state.product);
  const mainImage = document.querySelector("#mainProductImage");
  loadMainProductImage(state.images[0] || "");
  mainImage.alt = `${state.product.name} ?? ???`;

  document.querySelector("#thumbnailStrip").innerHTML = state.images.map((source, index) => `
    <button type="button" class="thumbnail-button ${index === 0 ? "active" : ""}" data-image-index="${index}" aria-label="?? ??? ${index + 1} ??">
      <img src="${thumbnailImageUrl(source)}" data-original="${source}" alt="${safeHtml(state.product.name) } 상품 이미지 ${index + 1}" loading="lazy" decoding="async" onerror="if(this.dataset.original){this.src=this.dataset.original;this.dataset.original='';}">
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
  const baseQuantityRow = document.querySelector("#baseQuantityRow");
  const options = Array.isArray(state.product.options) ? state.product.options : [];

  if (!options.length) {
    optionBox.hidden = true;
    baseQuantityRow.hidden = false;
    state.selectedItems = [];
    state.optionProductId = state.product.id;
    return;
  }

  const colors = [...new Set(options.map((option) => String(option.color || "").trim()).filter(Boolean))];
  const sizes = [...new Set(options.map((option) => String(option.size || "").trim()).filter(Boolean))];
  if (Number(state.optionProductId) !== Number(state.product.id)) {
    state.selectedItems = [];
    state.optionProductId = state.product.id;
  } else {
    state.selectedItems = state.selectedItems
      .filter((item) => options[item.optionIndex])
      .map((item) => ({ ...item, label: getOptionLabel(options[item.optionIndex]) }));
  }
  state.selectedColor = "";
  state.selectedSize = "";
  optionBox.hidden = false;
  baseQuantityRow.hidden = true;

  const colorGroup = document.querySelector("#colorOptionGroup");
  const sizeGroup = document.querySelector("#sizeOptionGroup");
  const colorSelect = document.querySelector("#colorOptionSelect");
  const sizeSelect = document.querySelector("#sizeOptionSelect");
  const sizeLabel = document.querySelector("#sizeOptionLabel");
  const summary = document.querySelector("#selectedOptionSummary");

  colorGroup.hidden = colors.length === 0;
  colorSelect.innerHTML = `<option value="">색상을 선택해 주세요</option>${colors.map((color) => `<option value="${safeHtml(color)}">${safeHtml(color)}</option>`).join("")}`;
  sizeGroup.hidden = colors.length > 0 && sizes.length === 0;
  sizeLabel.textContent = sizes.length ? "사이즈" : "옵션";

  const setSizeChoices = (color = "") => {
    const candidates = options
      .map((option, optionIndex) => ({ option, optionIndex }))
      .filter(({ option }) => !colors.length || String(option.color || "").trim() === color);
    const prompt = colors.length && !color
      ? "색상을 먼저 선택해 주세요"
      : sizes.length ? "사이즈를 선택해 주세요" : "옵션을 선택해 주세요";
    sizeSelect.innerHTML = `<option value="">${prompt}</option>${candidates.map(({ option, optionIndex }) => {
      const label = sizes.length ? String(option.size || "").trim() : getOptionLabel(option);
      return `<option value="${optionIndex}">${safeHtml(label)}</option>`;
    }).join("")}`;
    sizeSelect.disabled = Boolean(colors.length && !color);
  };

  const renderSelectedItems = () => {
    const list = document.querySelector("#selectedOptionList");
    list.hidden = state.selectedItems.length === 0;
    list.innerHTML = state.selectedItems.map((item) => `
      <article class="selected-option-item" data-selected-option="${item.optionIndex}">
        <div class="selected-option-head">
          <strong>${safeHtml(item.label)}</strong>
          <button type="button" class="selected-option-remove" data-option-remove="${item.optionIndex}" aria-label="${safeHtml(item.label)} 옵션 삭제">×</button>
        </div>
        <div class="selected-option-controls">
          <div class="quantity-control" aria-label="${safeHtml(item.label)} 수량 조절">
            <button type="button" data-option-minus="${item.optionIndex}" aria-label="수량 감소">−</button>
            <output>${item.quantity}</output>
            <button type="button" data-option-plus="${item.optionIndex}" aria-label="수량 증가">+</button>
          </div>
          <strong>${money(Number(state.product.price || 0) * Number(item.quantity || 1))}</strong>
        </div>
      </article>
    `).join("");
    summary.textContent = state.selectedItems.length
      ? `선택한 옵션 ${state.selectedItems.length}개 · 수량은 아래에서 조절할 수 있습니다.`
      : colors.length ? "색상을 먼저 선택한 후 사이즈를 선택해 주세요." : "옵션을 선택해 주세요.";
    summary.classList.toggle("selected", state.selectedItems.length > 0);
    list.querySelectorAll("[data-option-minus]").forEach((button) => button.addEventListener("click", () => {
      const item = state.selectedItems.find((entry) => entry.optionIndex === Number(button.dataset.optionMinus));
      if (item) item.quantity = Math.max(1, Number(item.quantity || 1) - 1);
      renderSelectedItems();
      updateTotal();
    }));
    list.querySelectorAll("[data-option-plus]").forEach((button) => button.addEventListener("click", () => {
      const item = state.selectedItems.find((entry) => entry.optionIndex === Number(button.dataset.optionPlus));
      if (item) item.quantity = Math.min(999, Number(item.quantity || 1) + 1);
      renderSelectedItems();
      updateTotal();
    }));
    list.querySelectorAll("[data-option-remove]").forEach((button) => button.addEventListener("click", () => {
      state.selectedItems = state.selectedItems.filter((entry) => entry.optionIndex !== Number(button.dataset.optionRemove));
      renderSelectedItems();
      updateTotal();
    }));
  };

  const addOption = (optionIndex) => {
    const index = Number(optionIndex);
    const option = options[index];
    if (!option) return;
    const existing = state.selectedItems.find((item) => item.optionIndex === index);
    if (existing) {
      showToast("이미 선택한 옵션입니다. 아래에서 수량을 조절해 주세요.");
      document.querySelector(`[data-selected-option="${index}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      state.selectedItems.push({ optionIndex: index, label: getOptionLabel(option), quantity: 1 });
      renderSelectedItems();
      updateTotal();
    }
    sizeSelect.value = "";
  };

  colorSelect.addEventListener("change", () => {
    state.selectedColor = colorSelect.value;
    state.selectedSize = "";
    setSizeChoices(state.selectedColor);
    if (state.selectedColor && !sizes.length) {
      const index = options.findIndex((option) => String(option.color || "").trim() === state.selectedColor);
      addOption(index);
    } else if (!sizeSelect.disabled) {
      sizeSelect.focus();
    }
  });
  sizeSelect.addEventListener("change", () => {
    if (sizeSelect.value === "") return;
    const index = Number(sizeSelect.value);
    state.selectedSize = String(options[index]?.size || "").trim();
    addOption(index);
  });

  setSizeChoices("");
  renderSelectedItems();
}

function focusMissingOption() {
  if (!document.querySelector("#colorOptionGroup")?.hidden && !document.querySelector("#colorOptionSelect")?.value) {
    document.querySelector("#colorOptionSelect")?.focus();
    return;
  }
  document.querySelector("#sizeOptionSelect")?.focus();
}

function renderDetailImages() {
  const detailImages = Array.isArray(state.product.images?.detail) ? state.product.images.detail.filter(Boolean) : [];
  const list = document.querySelector("#detailImageList");

  if (!detailImages.length) {
    list.innerHTML = `<div class="detail-image-empty">등록된 상세 이미지가 없습니다.</div>`;
    return;
  }

  list.innerHTML = detailImages.map((source, index) => `
    <img class="detail-progressive-image" src="${thumbnailImageUrl(source)}" data-original="${safeHtml(source)}" alt="${safeHtml(state.product.name)} 상세 이미지 ${index + 1}" loading="${index === 0 ? "eager" : "lazy"}" fetchpriority="${index === 0 ? "high" : "low"}" decoding="async">
  `).join("");

  const hydrateImage = (image) => {
    const original = image.dataset.original;
    if (!original || original === image.getAttribute("src")) return;
    const loadOriginal = () => {
      if (!image.dataset.original) return;
      image.classList.add("preview-ready");
      const full = new Image();
      full.decoding = "async";
      full.onload = () => {
        image.src = original;
        image.dataset.original = "";
        image.classList.add("full-ready");
      };
      full.onerror = () => image.classList.add("preview-only");
      full.src = original;
    };
    if (image.complete && image.naturalWidth > 0) loadOriginal();
    else image.addEventListener("load", loadOriginal, { once: true });
  };

  const images = [...list.querySelectorAll(".detail-progressive-image")];
  if (!("IntersectionObserver" in window)) {
    images.forEach(hydrateImage);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      hydrateImage(entry.target);
    });
  }, { rootMargin: "500px 0px" });
  images.forEach((image) => observer.observe(image));
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
  ["#buyButton", "#cartButton"].forEach((selector) => {
    const button = document.querySelector(selector);
    if (button) button.disabled = state.loadingFullDetails;
  });
}

async function loadDetail() {
  const id = currentProductId();
  if (!id) throw new Error("NO_ID");

  let renderedPreview = false;
  const bootstrap = window.YOONSEUL_PRODUCT_BOOTSTRAP;
  if (bootstrap?.product && Number(bootstrap.product.id) === Number(id)) {
    state.loadingFullDetails = false;
    state.product = bootstrap.product;
    state.brand = bootstrap.brand || null;
    state.category = bootstrap.category || null;
    state.images = normalizeImages(state.product);
    if (!state.images.length) {
      state.images = ["https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=86"];
    }
    renderProduct();
    renderedPreview = true;
  }
  try {
    const preview = JSON.parse(sessionStorage.getItem(DETAIL_PREVIEW_KEY) || "null");
    const isFresh = preview && Date.now() - Number(preview.savedAt || 0) < 10 * 60 * 1000;
    if (!renderedPreview && isFresh && Number(preview.product?.id) === Number(id)) {
      state.loadingFullDetails = true;
      state.product = preview.product;
      state.brand = preview.brand || null;
      state.category = preview.category || null;
      state.images = normalizeImages(state.product);
      if (!state.images.length) {
        state.images = ["https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=86"];
      }
      renderProduct();
      renderedPreview = true;
    }
  } catch {}

  const response = await fetch(`/api/products/${encodeURIComponent(id)}`).catch(() => null);
  if (!response?.ok) {
    if (renderedPreview) return;
    throw new Error("PRODUCT_DETAIL_FAILED");
  }

  const detailData = await response.json();
  const product = detailData.product;
  if (!product) throw new Error("NOT_FOUND");

  state.product = product;
  state.loadingFullDetails = false;
  state.brand = detailData.brand || null;
  state.category = detailData.category || null;
  state.images = normalizeImages(product);

  if (!state.images.length) {
    state.images = ["https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=1200&q=86"];
  }

  renderProduct();
  try {
    sessionStorage.setItem(DETAIL_PREVIEW_KEY, JSON.stringify({
      savedAt: Date.now(),
      product: state.product,
      brand: state.brand,
      category: state.category
    }));
  } catch {}
}

document.querySelector("#quantityMinus").addEventListener("click", () => {
  state.quantity = Math.max(1, state.quantity - 1);
  updateTotal();
});

document.querySelector("#quantityPlus").addEventListener("click", () => {
  state.quantity += 1;
  updateTotal();
});

function purchaseSelections() {
  const hasOptions = Array.isArray(state.product?.options) && state.product.options.length > 0;
  if (hasOptions) return state.selectedItems.map((item) => ({ ...item }));
  return [{ optionIndex: -1, label: "기본 옵션", quantity: state.quantity }];
}

document.querySelector("#buyButton").addEventListener("click", () => {
  const hasOptions = Array.isArray(state.product?.options) && state.product.options.length > 0;
  const selections = purchaseSelections();
  if (hasOptions && !selections.length) {
    showToast("옵션을 먼저 선택해 주세요.");
    focusMissingOption();
    return;
  }
  const totalQuantity = selections.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const params = new URLSearchParams({
    id: state.product.id,
    qty: totalQuantity
  });
  if (hasOptions) {
    try {
      sessionStorage.setItem(CHECKOUT_SELECTION_KEY, JSON.stringify({
        savedAt: Date.now(),
        productId: state.product.id,
        selections
      }));
      params.set("selection", "detail");
    } catch {
      params.set("option", selections[0].optionIndex);
      params.set("qty", selections[0].quantity);
    }
  }
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
  const selections = purchaseSelections();
  if (hasOptions && !selections.length) {
    showToast("옵션을 먼저 선택해 주세요.");
    focusMissingOption();
    return;
  }

  const cartItems = selections.map((selection) => ({
      productId: state.product.id,
      brandId: state.product.brandId,
      brandName: state.brand?.koName || "",
      name: state.product.name,
      price: Number(state.product.price || 0),
      image: state.images[0] || "",
      optionIndex: selection.optionIndex >= 0 ? selection.optionIndex : "",
      optionLabel: selection.label || "기본 옵션",
      quantity: selection.quantity
    }));
  if (window.YoonseulCart?.addCartItems) {
    window.YoonseulCart.addCartItems(cartItems);
  } else {
    cartItems.forEach((item) => window.YoonseulCart?.addCartItem?.(item));
  }
  showToast(hasOptions ? `선택한 옵션 ${selections.length}개를 장바구니에 담았습니다.` : "장바구니에 담았습니다.");
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
