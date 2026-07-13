const form = document.querySelector("#requestForm");
const money = (value) => `${Number(value).toLocaleString("ko-KR")}원`;
let pricing;

async function loadPricing() {
  pricing = await fetch("/api/pricing").then((response) => response.json());
  updateEstimate();
}

function updateEstimate() {
  if (!pricing) return;
  const values = Object.fromEntries(new FormData(form));
  const bags = Number(values.bagCount || 0);
  const boxes = Number(values.boxCount || 0);
  const surcharge = pricing.destinationSurcharges[values.destinationCountry] || 0;
  const total = pricing.baseFee + bags * pricing.bagFee + boxes * pricing.boxFee + surcharge;
  document.querySelector("#routeFrom").textContent = values.originCountry || "출발지 미선택";
  document.querySelector("#routeTo").textContent = values.destinationCountry || "도착지 미선택";
  document.querySelector("#baseFee").textContent = money(pricing.baseFee);
  document.querySelector("#bagLabel").textContent = `${bags}개`;
  document.querySelector("#bagFee").textContent = money(bags * pricing.bagFee);
  document.querySelector("#boxLabel").textContent = `${boxes}개`;
  document.querySelector("#boxFee").textContent = money(boxes * pricing.boxFee);
  document.querySelector("#surcharge").textContent = money(surcharge);
  document.querySelector("#totalPrice").textContent = money(total);
}

form.addEventListener("input", updateEstimate);
form.addEventListener("change", updateEstimate);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector(".submit-button");
  submit.disabled = true;
  submit.textContent = "접수 중...";
  const body = Object.fromEntries(new FormData(form));
  body.bagCount = Number(body.bagCount);
  body.boxCount = Number(body.boxCount);
  const response = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  submit.disabled = false;
  submit.innerHTML = "배송 신청 접수하기 <b>→</b>";
  if (!response.ok) {
    const toast = document.querySelector("#toast");
    toast.textContent = data.error || "신청을 접수하지 못했습니다.";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
    return;
  }
  document.querySelector("#successId").textContent = data.id;
  document.querySelector("#successModal").hidden = false;
});

loadPricing();
