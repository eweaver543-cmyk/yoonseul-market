const state = {
  product: null,
  brand: null,
  category: null,
  optionLabel: "\uAE30\uBCF8 \uC635\uC158",
  quantity: 1,
  paymentMethods: null
};

let daumPostcodeLoader = null;
let paymentMethodsChannel = null;

const PAYMENT_METHOD_STORAGE_KEY = "yoonseulPaymentMethods";
const DEFAULT_PAYMENT_METHODS = {
  bankEnabled: true,
  bankLabel: "\uBB34\uD1B5\uC7A5\uC785\uAE08",
  bankName: "\uAD6D\uBBFC\uC740\uD589",
  bankAccount: "448601-01-496883",
  bankHolder: "\uBC15\uC131\uD604",
  bankNotice: "\uC785\uAE08\uC790\uBA85\uACFC \uC8FC\uBB38\uC790\uBA85\uC774 \uB2E4\uB97C \uACBD\uC6B0 \uACE0\uAC1D\uC13C\uD130\uB85C \uAF2D \uC54C\uB824\uC8FC\uC138\uC694.",
  cardEnabled: true,
  cardLabel: "\uCE74\uB4DC\uACB0\uC81C",
  cardProvider: "\uAD6D\uB0B4\uC678 \uC8FC\uC694 \uCE74\uB4DC \uACB0\uC81C \uC9C0\uC6D0",
  cardNotice: "\uCE74\uB4DC\uC0AC\uBCC4 \uD560\uBD80 \uBC0F \uC2B9\uC778 \uC815\uCC45\uC5D0 \uB530\uB77C \uACB0\uC81C \uD654\uBA74\uC5D0\uC11C \uCD5C\uC885 \uC870\uAC74\uC774 \uC548\uB0B4\uB429\uB2C8\uB2E4."
};

const money = (value) => `₩${Number(value || 0).toLocaleString("ko-KR")}`;

function showToast(message) {
  const toast = document.querySelector("#checkoutToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function getOptionLabel(option) {
  return [option?.color, option?.size].filter(Boolean).join(" / ") || option?.name || "\uAE30\uBCF8 \uC635\uC158";
}

function findCategory(categories, product) {
  const group = categories.find((entry) => Number(entry.brandId) === Number(product.brandId));
  return group?.items?.find((item) => Number(item.id) === Number(product.categoryId)) || null;
}

function productImage(product) {
  return product?.images?.main?.[0] || product?.image || "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=86";
}

function orderTotal() {
  return Number(state.product?.price || 0) * state.quantity;
}

function getPaymentMethods() {
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

function setPaymentActive() {
  document.querySelectorAll(".payment-method").forEach((label) => {
    const input = label.querySelector("input");
    label.classList.toggle("active", !!input?.checked);
  });
}

function bindPaymentMethodEvents() {
  document.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => {
    radio.addEventListener("change", setPaymentActive);
  });
}

function renderPaymentMethods() {
  const paymentBox = document.querySelector("#paymentBox");
  if (!paymentBox) return;

  const methods = getPaymentMethods();
  state.paymentMethods = methods;
  const blocks = [];

  if (methods.bankEnabled) {
    blocks.push(`
      <label class="payment-method">
        <input type="radio" name="paymentMethod" value="${methods.bankLabel}" ${blocks.length === 0 ? "checked" : ""}>
        <strong>${methods.bankLabel}</strong>
      </label>
      <div class="bank-info">
        <p>${methods.bankName}</p>
        <b>${methods.bankAccount}</b>
        <span>(${methods.bankHolder})</span>
        ${methods.bankNotice ? `<small>${methods.bankNotice}</small>` : ""}
      </div>
    `);
  }

  if (methods.cardEnabled) {
    blocks.push(`
      <label class="payment-method">
        <input type="radio" name="paymentMethod" value="${methods.cardLabel}" ${blocks.length === 0 ? "checked" : ""}>
        <strong>${methods.cardLabel}</strong>
      </label>
      <div class="payment-info-card">
        <p>${methods.cardProvider}</p>
        ${methods.cardNotice ? `<small>${methods.cardNotice}</small>` : ""}
      </div>
    `);
  }

  paymentBox.innerHTML = blocks.length
    ? blocks.join("")
    : `<div class="payment-empty-state"><strong>\uD604\uC7AC \uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uACB0\uC81C \uC218\uB2E8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</strong><span>\uAD00\uB9AC\uC790\uC5D0\uAC8C \uACB0\uC81C \uC218\uB2E8 \uC124\uC815\uC744 \uC694\uCCAD\uD574 \uC8FC\uC138\uC694.</span></div>`;

  bindPaymentMethodEvents();
  setPaymentActive();
}

function subscribePaymentMethods() {
  if ("BroadcastChannel" in window) {
    paymentMethodsChannel = new BroadcastChannel("yoonseul-payment-methods");
    paymentMethodsChannel.addEventListener("message", () => renderPaymentMethods());
  }

  window.addEventListener("storage", (event) => {
    if (event.key === PAYMENT_METHOD_STORAGE_KEY || event.key === "yoonseulPaymentMethodsUpdated") {
      renderPaymentMethods();
    }
  });
}

function renderSummary() {
  const total = orderTotal();
  document.querySelector("#summaryImage").src = productImage(state.product);
  document.querySelector("#summaryImage").alt = `${state.product.name} 대표 이미지`;
  document.querySelector("#summaryQty").textContent = state.quantity;
  document.querySelector("#summaryName").textContent = state.product.name;
  document.querySelector("#summaryOption").textContent = state.optionLabel;
  document.querySelector("#summaryPrice").textContent = money(total);
  document.querySelector("#subtotalPrice").textContent = money(total);
  document.querySelector("#totalPrice").textContent = money(total);
  document.title = `주문서 작성 - ${state.product.name} | 윤슬마켓`;
}

async function loadCheckout() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  state.quantity = Math.max(1, Number(params.get("qty") || 1));
  if (!id) throw new Error("NO_PRODUCT_ID");

  const response = await fetch("/api/catalog");
  if (!response.ok) throw new Error("CATALOG_FAILED");
  const catalog = await response.json();
  const product = (catalog.products || []).find((item) => Number(item.id) === Number(id));
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  state.product = product;
  state.brand = (catalog.brands || []).find((brand) => Number(brand.id) === Number(product.brandId)) || null;
  state.category = findCategory(catalog.categories || [], product);

  const options = Array.isArray(product.options) ? product.options : [];
  const option = options[Number(params.get("option"))];
  state.optionLabel = option ? getOptionLabel(option) : "\uAE30\uBCF8 \uC635\uC158";

  renderSummary();
  renderPaymentMethods();
}

function destinationAddressFrom(form) {
  return [
    form.elements.province.value,
    form.elements.city.value,
    form.elements.addressBase.value,
    form.elements.addressDetail.value,
    form.elements.postcode.value ? `(${form.elements.postcode.value})` : ""
  ].filter(Boolean).join(" ");
}

function normalizeCustomsCode(value) {
  return String(value || "").toUpperCase().replace(/[\s-]/g, "");
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidRecipientName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 50 && /^[\p{L}\p{M}][\p{L}\p{M}\s.'·-]*[\p{L}\p{M}]$/u.test(name);
}

function isKoreanDestination(value) {
  return ["대한민국", "KR", "KOREA", "SOUTH KOREA"].includes(String(value || "").trim().toUpperCase());
}

function markInvalid(control) {
  control?.classList.add("input-error");
  control?.focus();
}

function checkoutPayload(form) {
  const paymentMethod = new FormData(form).get("paymentMethod") || DEFAULT_PAYMENT_METHODS.bankLabel;
  const member = window.YoonseulCart?.getCurrentMember?.();
  const itemType = [state.brand?.koName, state.category?.name].filter(Boolean).join(" / ") || "럭셔리 상품";
  return {
    serviceType: "상품주문",
    userId: member?.id || "GUEST",
    email: member?.email || "",
    name: form.elements.name.value.trim().replace(/\s+/g, " "),
    phone: normalizePhone(form.elements.phone.value),
    originCountry: state.brand?.enName || "OVERSEAS",
    originAddress: `${state.brand?.koName || "해외 브랜드"} 구매대행 출고지`,
    destinationCountry: form.elements.destinationCountry.value,
    destinationAddress: destinationAddressFrom(form),
    postcode: form.elements.postcode.value.trim(),
    bagCount: 0,
    boxCount: state.quantity,
    itemType,
    productId: state.product.id,
    productName: state.product.name,
    brandName: state.brand?.koName || "",
    option: state.optionLabel,
    quantity: state.quantity,
    image: productImage(state.product),
    customsCode: normalizeCustomsCode(form.elements.customsCode.value),
    customsMatchConfirmed: Boolean(form.elements.customsMatchConfirmed.checked),
    estimatedPrice: orderTotal(),
    confirmedPrice: orderTotal(),
    orderTotal: orderTotal(),
    paymentMethod
  };
}

function validateCheckout(form) {
  form.querySelectorAll(".input-error").forEach((element) => element.classList.remove("input-error"));
  const required = ["name", "postcode", "province", "city", "addressBase", "addressDetail", "customsCode", "phone"];
  const missing = required.find((name) => !String(form.elements[name]?.value || "").trim());
  if (missing) {
    markInvalid(form.elements[missing]);
    return "필수 배송 정보를 입력해 주세요.";
  }
  if (!isValidRecipientName(form.elements.name.value)) {
    markInvalid(form.elements.name);
    return "수취인 성명을 한글 또는 영문으로 정확히 입력해 주세요.";
  }
  const customsCode = normalizeCustomsCode(form.elements.customsCode.value);
  form.elements.customsCode.value = customsCode;
  if (!/^P\d{12}$/.test(customsCode)) {
    markInvalid(form.elements.customsCode);
    return "개인통관고유부호는 P로 시작하는 13자리로 입력해 주세요.";
  }
  const phone = normalizePhone(form.elements.phone.value);
  if (isKoreanDestination(form.elements.destinationCountry.value) && !/^01[016789]\d{7,8}$/.test(phone)) {
    markInvalid(form.elements.phone);
    return "관세청에 등록된 국내 휴대전화번호를 정확히 입력해 주세요.";
  }
  if (!isKoreanDestination(form.elements.destinationCountry.value) && !/^\d{8,15}$/.test(phone)) {
    markInvalid(form.elements.phone);
    return "휴대전화번호를 숫자 8~15자리로 입력해 주세요.";
  }
  if (!form.elements.customsMatchConfirmed.checked) {
    markInvalid(form.elements.customsMatchConfirmed.closest("label"));
    return "성명·휴대전화번호·개인통관고유부호가 모두 일치하는지 확인해 주세요.";
  }
  if (!new FormData(form).get("paymentMethod")) {
    return "결제 수단을 선택해 주세요.";
  }
  return "";
}

function ensureProvinceOption(value) {
  const select = document.querySelector('[name="province"]');
  if (!select || !value) return;
  const exists = [...select.options].some((option) => option.value === value);
  if (!exists) select.add(new Option(value, value));
  select.value = value;
}

function splitAdministrativeArea(data) {
  const sido = data.sido || "";
  const sigungu = data.sigungu || [data.sigunguCode, data.bname].filter(Boolean).join(" ");
  return { sido, sigungu };
}

function fillAddressFromDaum(data) {
  const form = document.querySelector("#checkoutForm");
  const { sido, sigungu } = splitAdministrativeArea(data);
  const baseAddress = data.roadAddress || data.jibunAddress || data.autoRoadAddress || data.autoJibunAddress || "";
  form.elements.postcode.value = data.zonecode || "";
  ensureProvinceOption(sido);
  form.elements.city.value = sigungu;
  form.elements.addressBase.value = baseAddress;
  window.setTimeout(() => form.elements.addressDetail.focus(), 80);
}

window.fillAddressFromDaum = fillAddressFromDaum;

function loadDaumPostcode() {
  if (window.daum?.Postcode) return Promise.resolve();
  if (daumPostcodeLoader) return daumPostcodeLoader;

  daumPostcodeLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="postcode.v2.js"]');
    const script = existing || document.createElement("script");
    script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("DAUM_POSTCODE_LOAD_FAILED"));
    if (!existing) document.head.appendChild(script);
  });

  return daumPostcodeLoader;
}

async function openPostcodeSearch() {
  try {
    await loadDaumPostcode();
  } catch (_) {
    showToast("주소 검색 서비스를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
    return;
  }

  if (!window.daum?.Postcode) {
    showToast("주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 눌러주세요.");
    return;
  }

  new window.daum.Postcode({
    oncomplete: fillAddressFromDaum
  }).open();
}

window.openPostcodeSearch = openPostcodeSearch;

document.querySelector("#addressSearch")?.addEventListener("click", openPostcodeSearch);
document.querySelector('[name="postcode"]')?.addEventListener("click", openPostcodeSearch);
document.querySelector('[name="addressBase"]')?.addEventListener("click", openPostcodeSearch);
document.querySelector("#provinceSelect")?.addEventListener("mousedown", (event) => {
  event.preventDefault();
  openPostcodeSearch();
});
document.querySelector("#provinceSelect")?.addEventListener("keydown", (event) => {
  if (["Enter", " ", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    openPostcodeSearch();
  }
});

document.querySelector('[name="customsCode"]')?.addEventListener("input", (event) => {
  event.currentTarget.value = normalizeCustomsCode(event.currentTarget.value);
  event.currentTarget.classList.remove("input-error");
});

document.querySelector('[name="phone"]')?.addEventListener("input", (event) => {
  event.currentTarget.classList.remove("input-error");
});

document.querySelector('[name="customsMatchConfirmed"]')?.addEventListener("change", (event) => {
  event.currentTarget.closest("label")?.classList.remove("input-error");
});

document.querySelector("#checkoutForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#formMessage");
  const submit = document.querySelector("#submitOrder");
  message.textContent = "";

  const validationMessage = validateCheckout(form);
  if (validationMessage) {
    message.textContent = validationMessage;
    showToast(validationMessage);
    return;
  }

  submit.disabled = true;
  submit.textContent = "주문 접수 중...";

  try {
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkoutPayload(form))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "ORDER_FAILED");

    const member = window.YoonseulCart?.getCurrentMember?.();
    window.YoonseulCart?.addOrderHistory?.({
      id: result.id,
      userId: member?.id || "GUEST",
      email: member?.email || "",
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      productId: state.product.id,
      productName: state.product.name,
      brandName: state.brand?.koName || "",
      option: state.optionLabel,
      quantity: state.quantity,
      orderTotal: orderTotal(),
      paymentMethod: new FormData(form).get("paymentMethod") || "",
      status: "주문접수",
      createdAt: new Date().toISOString(),
      image: productImage(state.product)
    });
    const cartItemId = new URLSearchParams(location.search).get("cartItem");
    if (cartItemId) window.YoonseulCart?.consumeCartItem?.(cartItemId);

    message.style.color = "#3F6F3D";
    message.textContent = `주문이 접수되었습니다. 주문번호: ${result.id}`;
    showToast("주문이 정상 접수되었습니다.");
    submit.textContent = "주문 완료";
  } catch (error) {
    message.style.color = "#A05249";
    message.textContent = error.message && error.message !== "ORDER_FAILED"
      ? error.message
      : "주문 접수 중 문제가 발생했습니다. 입력 정보를 확인해 주세요.";
    showToast("주문 접수에 실패했습니다.");
    submit.disabled = false;
    submit.textContent = "주문 완료";
  }
});

fetch("/api/site-settings", { cache: "no-store" }).then((response) => response.json()).then((settings) => {
  if (settings.paymentMethods && Object.keys(settings.paymentMethods).length) localStorage.setItem(PAYMENT_METHOD_STORAGE_KEY, JSON.stringify(settings.paymentMethods));
}).catch(() => {}).finally(() => loadCheckout().catch(() => {
  document.querySelector("#checkoutApp").innerHTML = `
    <section class="form-section">
      <div class="section-head">
        <h2>상품 정보를 불러오지 못했습니다.</h2>
        <p>상품 상세페이지에서 다시 구매하기를 눌러주세요.</p>
      </div>
      <a class="back-link" href="/">메인으로 돌아가기</a>
    </section>
  `;
}));

subscribePaymentMethods();
