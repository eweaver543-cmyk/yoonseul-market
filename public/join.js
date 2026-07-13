const authCard = document.querySelector(".auth-card");
const authBadge = document.querySelector("#authBadge");
const authTitle = document.querySelector("#authTitle");
const authSubtitle = document.querySelector("#authSubtitle");
const loginPanel = document.querySelector("#loginPanel");
const joinPanel = document.querySelector("#joinPanel");
const loginForm = document.querySelector("#loginForm");
const joinForm = document.querySelector("#emailJoinForm");
const passwordInput = document.querySelector("#joinPassword");
const passwordGuide = document.querySelector("#passwordGuide");
const joinMessage = document.querySelector("#joinMessage");
const loginMessage = document.querySelector("#loginMessage");
const returnTo = new URLSearchParams(location.search).get("returnTo") || "/";
const legalModal = document.querySelector("#legalModal");
const legalModalTitle = document.querySelector("#legalModalTitle");
const legalModalBody = document.querySelector("#legalModalBody");
const CURRENT_MEMBER_STORAGE_KEY = "yoonseulCurrentMember";
const SOCIAL_AUTH_STORAGE_KEY = "yoonseulSocialAuthSeeds";
const SOCIAL_DEVICE_STORAGE_KEY = "yoonseulSocialDeviceId";

const LEGAL_CONTENT = {
  terms: {
    title: "이용약관",
    body: `
      <section>
        <h3>제1조 (목적)</h3>
        <p>본 약관은 윤슬마켓(이하 '회사')이 제공하는 해외 브랜드 제품 구매대행 서비스 및 관련 서비스(이하 '서비스')를 이용함에 있어 회사와 회원의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
      </section>
      <section>
        <h3>제2조 (구매대행 서비스의 특성 및 책임)</h3>
        <ul>
          <li>'회사'는 회원의 요청에 따라 해외 상품을 대신 구매하여 배송하는 '구매대행 업자'이며, 상품의 제조사가 아닙니다.</li>
          <li>'회사'가 중개하는 모든 브랜드 제품은 전 세계 유통망을 통해 정식 유통되는 상품만을 엄선하여 취급합니다.</li>
        </ul>
      </section>
      <section>
        <h3>제3조 (통관 및 관부가세)</h3>
        <ul>
          <li>회원은 해외 직배송 상품 수령을 위해 필수적인 '개인통관고유부호'를 정확하게 제공해야 할 의무가 있습니다.</li>
          <li>수입 통관 시 발생하는 관세 및 부가가세는 상품 가격에 포함되어 있지 않은 경우, 세관의 안내에 따라 수입자(회원)가 직접 납부해야 합니다.</li>
        </ul>
      </section>
      <section>
        <h3>제4조 (반품, 환불 및 취소)</h3>
        <ul>
          <li>해외 구매대행 특성상 현지 구매가 완료된 이후에는 단순 변심으로 인한 주문 취소 및 환불이 제한되거나, 왕복 국제 배송비 및 현지 반품 수수료 등의 비용이 청구될 수 있습니다.</li>
          <li>상품의 오배송, 하자품 접수의 경우 상품 수령 후 7일 이내에 고객센터를 통해 접수하여야 하며, '회사'의 안내에 따라 처리됩니다.</li>
        </ul>
      </section>
    `
  },
  privacy: {
    title: "개인정보처리방침",
    body: `
      <section>
        <p>윤슬마켓는 회원의 개인정보를 소중히 여기며, 「개인정보 보호법」 및 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관계 법령을 준수합니다.</p>
      </section>
      <section>
        <h3>1. 수집하는 개인정보 항목</h3>
        <ul>
          <li>이메일 주소 (아이디)</li>
          <li>비밀번호 (암호화 저장)</li>
          <li>이름 (수취인 명의)</li>
          <li>연락처 (휴대전화 번호)</li>
          <li>배송지 주소</li>
          <li>메신저 종류 및 ID (KakaoTalk, Telegram, LINE, WeChat 등 상담용)</li>
          <li>개인통관고유부호(PCCC) — 통관 절차 진행용</li>
          <li>결제 정보 (결제사 경유, 회사는 카드 원번호를 저장하지 않음)</li>
        </ul>
      </section>
      <section>
        <h3>2. 수집 및 이용 목적</h3>
        <ul>
          <li>회원 식별, 로그인 및 계정 관리</li>
          <li>1:1 맞춤형 고객 상담(C/S) 및 주문 진행 안내</li>
          <li>상품 배송, 반품/교환 처리</li>
          <li>관세청 전자통관시스템(UNI-PASS) 신고 등 세관 통관 절차 대행</li>
          <li>결제 처리 및 부정 이용 방지</li>
        </ul>
      </section>
      <section>
        <h3>3. 보유 및 이용 기간</h3>
        <p>회원 탈퇴 요청 시 개인정보는 지체 없이 파기됩니다. 다만, 관계 법령에 따라 아래 정보는 명시된 기간 동안 보관됩니다.</p>
        <ul>
          <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
          <li>대금 결제 및 재화 공급에 관한 기록: 5년</li>
          <li>소비자 불만 또는 분쟁 처리에 관한 기록: 3년</li>
          <li>로그인 기록(통신비밀보호법): 3개월</li>
        </ul>
      </section>
      <section>
        <h3>4. 개인정보의 제3자 제공</h3>
        <p>회사는 원활한 해외 배송 및 국내 통관 절차 진행을 위해 아래와 같이 필요한 최소한의 개인정보를 제3자에게 제공합니다.</p>
        <ul>
          <li>제공받는 자: 국내외 물류사, 배송대행지(배대지), 관세사 및 통관 대행사, 국내 택배사</li>
          <li>제공 항목: 수취인 이름, 연락처, 배송지 주소, 개인통관고유부호(PCCC), 주문 내역</li>
          <li>이용 목적: 국제/국내 배송 및 세관 통관 신고</li>
          <li>보유 기간: 배송 및 통관 완료 후 관련 법령에 따른 보관 기간까지</li>
        </ul>
        <p class="legal-note">※ 위 개인정보 제공에 동의하지 않으실 경우 해외 배송 및 통관이 불가능하여 서비스 이용이 제한될 수 있습니다.</p>
      </section>
      <section>
        <h3>5. 이용자의 권리</h3>
        <p>회원은 언제든지 자신의 개인정보를 열람·수정·삭제·처리정지 요청할 수 있으며, 회원 탈퇴를 통해 개인정보 이용 동의를 철회할 수 있습니다.</p>
      </section>
      <section>
        <h3>6. 개인정보 보호책임자</h3>
        <p>개인정보 관련 문의는 회사 고객센터 또는 서비스 내 메신저 상담 채널을 통해 접수해 주시기 바랍니다.</p>
      </section>
    `
  }
};

function setMessage(target, text, type = "") {
  target.textContent = text;
  target.classList.toggle("success", type === "success");
}

function switchAuthMode(mode) {
  const isJoin = mode === "join";
  authCard.classList.toggle("is-join-mode", isJoin);
  loginPanel.classList.toggle("is-active", !isJoin);
  joinPanel.classList.toggle("is-active", isJoin);
  loginPanel.setAttribute("aria-hidden", String(isJoin));
  joinPanel.setAttribute("aria-hidden", String(!isJoin));
  authBadge.textContent = isJoin ? "QUICK JOIN" : "MEMBER LOGIN";
  authTitle.textContent = isJoin ? "회원가입" : "로그인";
  authSubtitle.textContent = isJoin
    ? "소셜 또는 이메일로 빠르게 시작하고, 가입 즉시 관리자 회원 관리에 반영됩니다."
    : "윤슬마켓의 럭셔리 셀렉션을 더 편하게 이용해 보세요.";
  setMessage(loginMessage, "");
  setMessage(joinMessage, "");
  window.history.replaceState(null, "", isJoin ? "#join" : location.pathname);
  setTimeout(() => {
    const focusTarget = isJoin ? joinForm.elements.email : loginForm.elements.email;
    focusTarget?.focus();
  }, 160);
}

function normalizeRegisterResult(result) {
  return result.user || result;
}

function notifyAdminMemberList(user) {
  localStorage.setItem("yoonseulMembersUpdated", String(Date.now()));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("yoonseul-members");
    channel.postMessage({ type: "member-registered", memberId: user.id });
    channel.close();
  }
}

function validatePassword(showGuide = true) {
  const isValid = passwordInput.value.length >= 4;
  passwordGuide.hidden = isValid || !showGuide;
  return isValid;
}

function setCurrentMember(user) {
  localStorage.setItem(CURRENT_MEMBER_STORAGE_KEY, JSON.stringify(user));
}

function getSocialDeviceId() {
  let deviceId = localStorage.getItem(SOCIAL_DEVICE_STORAGE_KEY);
  if (!deviceId) {
    deviceId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SOCIAL_DEVICE_STORAGE_KEY, deviceId);
  }
  return deviceId;
}

function readSocialSeeds() {
  try {
    return JSON.parse(localStorage.getItem(SOCIAL_AUTH_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSocialSeeds(seeds) {
  localStorage.setItem(SOCIAL_AUTH_STORAGE_KEY, JSON.stringify(seeds));
}

function ensureSocialSeed(provider) {
  const seeds = readSocialSeeds();
  if (seeds[provider]?.email && seeds[provider]?.password) return seeds[provider];

  const deviceId = getSocialDeviceId();
  const normalizedProvider = provider === "kakao" ? "kakao" : "google";
  const name = normalizedProvider === "kakao" ? "카카오 회원" : "Google 회원";
  const seed = {
    provider: normalizedProvider,
    email: `${normalizedProvider}.${deviceId}@yoonseul-social.local`,
    password: `social-${normalizedProvider}-${deviceId}`.slice(0, 40),
    name
  };

  seeds[provider] = seed;
  writeSocialSeeds(seeds);
  return seed;
}

async function requestJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

async function signInWithSocial(provider, button) {
  const label = provider === "kakao" ? "카카오" : "Google";
  const originalHtml = button.innerHTML;
  const seed = ensureSocialSeed(provider);

  button.disabled = true;
  button.innerHTML = `${label} 연결 중...`;
  setMessage(joinMessage, "");
  setMessage(loginMessage, "");

  try {
    let user;

    try {
      const registerResult = await requestJson("/api/members/register", {
        email: seed.email,
        password: seed.password,
        name: seed.name
      });
      user = normalizeRegisterResult(registerResult);
      notifyAdminMemberList(user);
    } catch (error) {
      if (!String(error.message).includes("이미 가입된 이메일")) throw error;
      const loginResult = await requestJson("/api/members/login", {
        email: seed.email,
        password: seed.password
      });
      user = loginResult.user;
    }

    setCurrentMember(user);
    setMessage(joinMessage, `${user.name}님, ${label} 간편가입이 완료되었습니다.`, "success");
    setTimeout(() => {
      window.location.href = returnTo;
    }, 260);
  } catch (error) {
    setMessage(joinMessage, `${label} 간편가입 중 문제가 발생했습니다. ${error.message}`);
  } finally {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

function openLegalModal(type) {
  const content = LEGAL_CONTENT[type];
  if (!content) return;
  legalModalTitle.textContent = content.title;
  legalModalBody.innerHTML = content.body;
  legalModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLegalModal() {
  legalModal.hidden = true;
  document.body.style.overflow = "";
}

window.openLegalModal = openLegalModal;
window.closeLegalModal = closeLegalModal;

document.querySelectorAll("[data-auth-switch]").forEach((button) => {
  button.addEventListener("click", () => switchAuthMode(button.dataset.authSwitch));
});

document.querySelectorAll("[data-legal-open]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openLegalModal(link.dataset.legalOpen);
  });
});

document.addEventListener("click", (event) => {
  const legalLink = event.target.closest?.("[data-legal-open]");
  if (!legalLink) return;
  event.preventDefault();
  event.stopPropagation();
  openLegalModal(legalLink.dataset.legalOpen);
}, true);

document.querySelector("#legalModalClose").addEventListener("click", closeLegalModal);
document.querySelector("#legalModalConfirm").addEventListener("click", closeLegalModal);
legalModal.addEventListener("click", (event) => {
  if (event.target === legalModal) closeLegalModal();
});

passwordInput.addEventListener("input", () => validatePassword(passwordInput.value.length > 0));
passwordInput.addEventListener("blur", () => validatePassword(true));

document.querySelectorAll("[data-social]").forEach((button) => {
  button.addEventListener("click", () => {
    signInWithSocial(button.dataset.social, button);
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "");
  const submitButton = loginForm.querySelector(".join-submit-button");
  submitButton.disabled = true;
  submitButton.textContent = "로그인 중...";

  try {
    const response = await fetch("/api/members/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm)))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "로그인하지 못했습니다.");
    setCurrentMember(result.user);
    setMessage(loginMessage, `${result.user.name}님, 로그인되었습니다.`, "success");
    setTimeout(() => {
      window.location.href = returnTo;
    }, 320);
  } catch (error) {
    setMessage(loginMessage, error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "로그인";
  }
});

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(joinMessage, "");

  if (!validatePassword(true)) {
    passwordInput.focus();
    return;
  }

  if (!joinForm.elements.terms.checked) {
    setMessage(joinMessage, "이용약관 및 개인정보처리방침 동의가 필요합니다.");
    joinForm.elements.terms.focus();
    return;
  }

  const submitButton = joinForm.querySelector(".join-submit-button");
  submitButton.disabled = true;
  submitButton.textContent = "가입 처리 중...";

  try {
    const payload = Object.fromEntries(new FormData(joinForm));
    delete payload.terms;

    const response = await fetch("/api/members/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "회원가입을 완료하지 못했습니다.");

    const user = normalizeRegisterResult(result);
    notifyAdminMemberList(user);
    joinForm.reset();
    passwordGuide.hidden = true;
    switchAuthMode("login");
    setMessage(loginMessage, `${user.name}님, 회원가입이 완료되었습니다. 로그인 화면에서 이용해 주세요.`, "success");
  } catch (error) {
    setMessage(joinMessage, error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "회원가입 완료";
  }
});

if (location.hash === "#join") switchAuthMode("join");

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !legalModal.hidden) closeLegalModal();
});
