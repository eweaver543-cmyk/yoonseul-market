const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Busboy = require("busboy");
const sharp = require("sharp");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const ADMIN_SESSION_SECRET = String(process.env.ADMIN_SESSION_SECRET || "");
const ADMIN_SESSION_TTL_HOURS = Number(process.env.ADMIN_SESSION_TTL_HOURS || 24);
const ADMIN_SESSION_TTL_MS = Math.max(1, ADMIN_SESSION_TTL_HOURS) * 60 * 60 * 1000;
const MAX_BODY_MB = Number(process.env.MAX_BODY_MB || 80);
const MAX_BODY_SIZE = Math.max(5, MAX_BODY_MB) * 1024 * 1024;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 50);
const MAX_UPLOAD_SIZE = Math.max(5, MAX_UPLOAD_MB) * 1024 * 1024;
const IMAGE_MAX_WIDTH = Number(process.env.IMAGE_MAX_WIDTH || 1800);
const IMAGE_WEBP_QUALITY = Number(process.env.IMAGE_WEBP_QUALITY || 82);
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_SESSION_SECRET.length < 32) {
  throw new Error("ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_SESSION_SECRET(32자 이상) 환경변수를 설정해 주세요.");
}

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(PUBLIC_DIR, "uploads");
const PRODUCT_UPLOAD_DIR = path.join(UPLOAD_DIR, "products");

const allowedStatuses = ["입금대기", "배송준비중", "배송중", "배송완료", "취소/반품"];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirectoryContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath);
    } else if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function ensureRuntime() {
  ensureDir(DATA_DIR);
  ensureDir(PRODUCT_UPLOAD_DIR);
  if (!fs.existsSync(DB_PATH)) {
    const bundledDbPath = path.join(ROOT_DIR, "data", "db.json");
    if (fs.existsSync(bundledDbPath) && path.resolve(bundledDbPath) !== path.resolve(DB_PATH)) {
      fs.copyFileSync(bundledDbPath, DB_PATH);
    } else {
      const emptyDb = {
        users: [],
        requests: [],
        inquiries: [],
        brands: [],
        categories: [],
        products: [],
        carts: [],
        wishlists: [],
        pricing: {
          baseFee: 0,
          bagFee: 0,
          boxFee: 0,
          destinationSurcharges: {}
        },
        siteSettings: { designBanners: [], inquiryChannels: {}, paymentMethods: {}, promotions: [], reviews: [] }
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(emptyDb, null, 2), "utf8");
    }
  }

  const bundledUploadDir = path.join(PUBLIC_DIR, "uploads", "products");
  if (path.resolve(bundledUploadDir) !== path.resolve(PRODUCT_UPLOAD_DIR)) {
    copyDirectoryContents(bundledUploadDir, PRODUCT_UPLOAD_DIR);
  }
}

function normalizeDbShape(db) {
  db.users ||= [];
  db.requests ||= [];
  db.inquiries ||= [];
  db.brands ||= [];
  db.categories ||= [];
  db.products ||= [];
  db.carts ||= [];
  db.wishlists ||= [];
  db.pricing ||= { baseFee: 0, bagFee: 0, boxFee: 0, destinationSurcharges: {} };
  db.pricing.destinationSurcharges ||= {};
  db.siteSettings ||= { designBanners: [], inquiryChannels: {}, paymentMethods: {}, promotions: [], reviews: [] };
  return db;
}

function readDb() {
  ensureRuntime();
  const db = normalizeDbShape(JSON.parse(fs.readFileSync(DB_PATH, "utf8")));
  if (migrateLegacyProductImages(db)) {
    writeDb(db);
  }
  return db;
}

function writeDb(db) {
  ensureRuntime();
  const next = normalizeDbShape(db);
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tempPath, DB_PATH);
}

function send(res, status, body, type = "application/json; charset=utf-8", extraHeaders = {}) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": type.includes("html") || type.includes("json") || type.includes("javascript") || type.includes("css") ? "no-store" : "public, max-age=86400",
    "Content-Type": type,
    ...extraHeaders
  };
  res.writeHead(status, headers);
  res.end(type.includes("json") ? JSON.stringify(body) : body);
}

function sendError(res, status, message) {
  return send(res, status, { error: message });
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function signAdminTokenPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function createAdminToken() {
  const now = Date.now();
  const payload = {
    sub: "admin",
    role: "ADMIN",
    email: ADMIN_EMAIL,
    iat: now,
    exp: now + ADMIN_SESSION_TTL_MS,
    nonce: crypto.randomBytes(12).toString("hex")
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signAdminTokenPayload(encodedPayload)}`;
}

function verifyAdminToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) return false;
  const expected = signAdminTokenPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    return payload?.sub === "admin" &&
      payload?.role === "ADMIN" &&
      String(payload?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
      Number(payload?.exp || 0) > Date.now();
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;

    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error(`요청 본문이 너무 큽니다. 최대 ${MAX_BODY_MB}MB까지 허용됩니다.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("올바른 JSON 형식으로 요청해 주세요."));
      }
    });

    req.on("error", reject);
  });
}

function isAdmin(req) {
  const token = String(req.headers.authorization || "").replace("Bearer ", "").trim();
  return verifyAdminToken(token);
}

function secureTextEqual(left, right) {
  const leftHash = crypto.createHash("sha256").update(String(left)).digest();
  const rightHash = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function calculatePrice(body, pricing) {
  const bags = Math.max(0, Number(body.bagCount || 0));
  const boxes = Math.max(0, Number(body.boxCount || 0));
  const surcharge = Number(pricing.destinationSurcharges?.[body.destinationCountry] || 0);
  return Number(pricing.baseFee || 0) + bags * Number(pricing.bagFee || 0) + boxes * Number(pricing.boxFee || 0) + surcharge;
}

function nextRequestId(requests) {
  const date = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const sequence = String((requests || []).length + 1).padStart(3, "0");
  return `YS-${date}-${sequence}`;
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "item";
}

function extFromMime(mime = "") {
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return ".bin";
}

function normalizeUploadWebPath(value = "") {
  const normalized = String(value || "").replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized.replace(/^\/+/, "")}`;
}

function looksLikeImagePath(value) {
  return typeof value === "string" && (
    value.startsWith("/uploads/") ||
    value.startsWith("uploads/") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  );
}

function persistImageSource(source, prefix = "product") {
  if (typeof source !== "string" || !source.trim()) return "";
  const trimmed = source.trim();
  if (looksLikeImagePath(trimmed)) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed.replace(/^\/+/, "")}`;
  }
  if (!trimmed.startsWith("data:image/")) return "";

  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return "";

  const [, mimeType, base64] = match;
  const extension = extFromMime(mimeType);
  const fileName = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`;
  const absoluteFilePath = path.join(PRODUCT_UPLOAD_DIR, fileName);
  fs.writeFileSync(absoluteFilePath, Buffer.from(base64, "base64"));
  return `/uploads/products/${fileName}`;
}

function migrateLegacyProductImages(db) {
  let changed = false;

  db.products = (db.products || []).map((product) => {
    if (!product || typeof product !== "object") return product;

    const nextProduct = { ...product };
    const nextImages = typeof nextProduct.images === "object" && nextProduct.images
      ? { ...nextProduct.images }
      : {};

    const mainSources = Array.isArray(nextImages.main)
      ? nextImages.main
      : [nextProduct.image].filter(Boolean);
    const detailSources = Array.isArray(nextImages.detail) ? nextImages.detail : [];

    const migratedMain = mainSources
      .map((source, index) => persistImageSource(source, `product-${nextProduct.id}-main-${index + 1}`))
      .filter(Boolean);
    const migratedDetail = detailSources
      .map((source, index) => persistImageSource(source, `product-${nextProduct.id}-detail-${index + 1}`))
      .filter(Boolean);
    const normalizedPrimary = migratedMain[0] || persistImageSource(nextProduct.image, `product-${nextProduct.id}-main-primary`);

    const imageChanged =
      JSON.stringify(mainSources) !== JSON.stringify(migratedMain) ||
      JSON.stringify(detailSources) !== JSON.stringify(migratedDetail) ||
      String(nextProduct.image || "") !== String(normalizedPrimary || "");

    if (imageChanged) {
      changed = true;
      nextImages.main = migratedMain;
      nextImages.detail = migratedDetail;
      nextProduct.images = nextImages;
      nextProduct.image = normalizedPrimary || "";
    } else if (!nextProduct.images) {
      nextProduct.images = {
        main: migratedMain,
        detail: migratedDetail
      };
    }

    return nextProduct;
  });

  return changed;
}

async function optimizeAndStoreImageBuffer(buffer, {
  fileName = "product",
  folder = "products"
} = {}) {
  const slug = slugify(fileName);
  const targetDir = path.join(UPLOAD_DIR, folder);
  ensureDir(targetDir);
  const finalName = `${slug}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.webp`;
  const absoluteFilePath = path.join(targetDir, finalName);

  const processed = sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: IMAGE_WEBP_QUALITY, effort: 4 });

  const metadata = await processed.metadata();
  await processed.toFile(absoluteFilePath);
  const fileStat = fs.statSync(absoluteFilePath);

  return {
    url: normalizeUploadWebPath(path.posix.join("uploads", folder, finalName)),
    width: metadata.width || 0,
    height: metadata.height || 0,
    size: fileStat.size,
    format: "webp"
  };
}

function readMultipartFiles(req) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers["content-type"] || "");
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      reject(new Error("multipart/form-data 형식으로 업로드해 주세요."));
      return;
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_UPLOAD_SIZE,
        files: 30,
        fields: 50
      }
    });

    const fields = {};
    const files = [];
    let aborted = false;

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, file, info) => {
      const chunks = [];
      let fileTooLarge = false;

      file.on("limit", () => {
        fileTooLarge = true;
      });

      file.on("data", (chunk) => {
        if (!fileTooLarge) chunks.push(chunk);
      });

      file.on("end", () => {
        if (fileTooLarge || aborted) return;
        files.push({
          fieldName: name,
          originalName: info.filename || "image",
          mimeType: info.mimeType || "application/octet-stream",
          buffer: Buffer.concat(chunks)
        });
      });
    });

    busboy.on("error", (error) => {
      aborted = true;
      reject(error);
    });

    busboy.on("finish", () => {
      if (aborted) return;
      const oversized = files.some((file) => file.buffer.length > MAX_UPLOAD_SIZE);
      if (oversized) {
        reject(new Error(`이미지 1장 최대 ${MAX_UPLOAD_MB}MB까지 업로드할 수 있습니다.`));
        return;
      }
      resolve({ fields, files });
    });

    req.pipe(busboy);
  });
}

function normalizeProductImages(images, fallbackImage = "", productName = "product") {
  const inputMain = Array.isArray(images?.main) ? images.main : [];
  const inputDetail = Array.isArray(images?.detail) ? images.detail : [];
  const normalizedMain = inputMain
    .map((item, index) => persistImageSource(item, `${slugify(productName)}-main-${index + 1}`))
    .filter(Boolean)
    .slice(0, 10);
  const normalizedDetail = inputDetail
    .map((item, index) => persistImageSource(item, `${slugify(productName)}-detail-${index + 1}`))
    .filter(Boolean)
    .slice(0, 20);

  const primaryImage = normalizedMain[0] || persistImageSource(fallbackImage, `${slugify(productName)}-cover`) || "";
  if (!primaryImage) return { image: "", images: { main: [], detail: normalizedDetail } };
  if (!normalizedMain.length) normalizedMain.push(primaryImage);
  const mainImageSet = new Set(normalizedMain);
  const safeDetail = normalizedDetail.filter((source) => !mainImageSet.has(source));
  return { image: primaryImage, images: { main: normalizedMain, detail: safeDetail } };
}

function normalizeOptions(options) {
  return Array.isArray(options)
    ? options
        .slice(0, 200)
        .map((option) => ({
          color: String(option?.color || "").trim(),
          size: String(option?.size || "").trim()
        }))
        .filter((option) => option.color || option.size)
    : [];
}

function normalizeCartOwner(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9@._:-]/g, "")
    .slice(0, 120);
}

function normalizeCartItems(items) {
  return Array.isArray(items)
    ? items
        .slice(0, 100)
        .map((item) => ({
          id: String(item?.id || `cart-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`),
          productId: Number(item?.productId || 0),
          brandId: Number(item?.brandId || 0),
          brandName: String(item?.brandName || ""),
          name: String(item?.name || "").trim(),
          price: Number(item?.price || 0),
          image: String(item?.image || ""),
          optionIndex: item?.optionIndex == null ? "" : String(item.optionIndex),
          optionLabel: String(item?.optionLabel || "기본 옵션"),
          quantity: Math.max(1, Math.min(999, Number(item?.quantity || 1))),
          addedAt: item?.addedAt || new Date().toISOString()
        }))
        .filter((item) => item.productId && item.name)
    : [];
}

function findCartRecord(db, ownerId) {
  return db.carts.find((cart) => cart.ownerId === ownerId);
}

function upsertCartRecord(db, ownerId, items) {
  const normalizedItems = normalizeCartItems(items);
  const now = new Date().toISOString();
  let cart = findCartRecord(db, ownerId);
  if (!cart) {
    cart = { ownerId, items: [], createdAt: now, updatedAt: now };
    db.carts.push(cart);
  }
  cart.items = normalizedItems;
  cart.updatedAt = now;
  return cart;
}

function normalizeWishlistItems(items) {
  const seen = new Set();
  return Array.isArray(items)
    ? items
        .slice(0, 300)
        .map((item) => ({
          id: String(item?.id || `wish-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`),
          productId: Number(item?.productId || 0),
          brandId: Number(item?.brandId || 0),
          brandName: String(item?.brandName || ""),
          name: String(item?.name || "").trim(),
          price: Number(item?.price || 0),
          image: String(item?.image || ""),
          addedAt: item?.addedAt || new Date().toISOString()
        }))
        .filter((item) => {
          if (!item.productId || !item.name || seen.has(item.productId)) return false;
          seen.add(item.productId);
          return true;
        })
    : [];
}

function findWishlistRecord(db, ownerId) {
  return db.wishlists.find((wishlist) => wishlist.ownerId === ownerId);
}

function upsertWishlistRecord(db, ownerId, items) {
  const normalizedItems = normalizeWishlistItems(items);
  const now = new Date().toISOString();
  let wishlist = findWishlistRecord(db, ownerId);
  if (!wishlist) {
    wishlist = { ownerId, items: [], createdAt: now, updatedAt: now };
    db.wishlists.push(wishlist);
  }
  wishlist.items = normalizedItems;
  wishlist.updatedAt = now;
  return wishlist;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

async function handleApi(req, res, url) {
  const db = readDb();

  if (url.pathname === "/api/health" && req.method === "GET") {
    return send(res, 200, {
      ok: true,
      env: NODE_ENV,
      uptime: Math.round(process.uptime()),
      now: new Date().toISOString()
    });
  }

  if (url.pathname === "/api/catalog" && req.method === "GET") {
    return send(res, 200, {
      brands: [...db.brands].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
      categories: db.categories,
      products: db.products.filter((product) => product.status !== "삭제")
    });
  }

  if (url.pathname === "/api/pricing" && req.method === "GET") {
    return send(res, 200, db.pricing);
  }

  if (url.pathname === "/api/site-settings" && req.method === "GET") {
    return send(res, 200, db.siteSettings || {});
  }

  if (url.pathname === "/api/member/orders" && req.method === "GET") {
    const userId = String(url.searchParams.get("userId") || "").trim();
    const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
    if (!userId || !email) return sendError(res, 400, "회원 주문 조회 정보가 필요합니다.");

    const member = db.users.find((user) =>
      String(user.id || "") === userId && String(user.email || "").trim().toLowerCase() === email
    );
    if (!member) return sendError(res, 404, "회원 정보를 찾을 수 없습니다.");

    const orders = db.requests
      .filter((order) => String(order.userId || "") === userId && String(order.email || "").trim().toLowerCase() === email)
      .map((order) => ({
        id: order.id,
        userId: order.userId,
        email: order.email,
        productId: Number(order.productId || 0),
        productName: order.productName || order.itemType || "상품 정보",
        brandName: order.brandName || "",
        option: order.option || "기본 옵션",
        quantity: Math.max(1, Number(order.quantity || order.boxCount || 1)),
        orderTotal: Number(order.confirmedPrice || order.estimatedPrice || 0),
        paymentMethod: order.paymentMethod || "",
        status: order.status || "입금대기",
        createdAt: order.createdAt,
        updatedAt: order.updatedAt || order.createdAt,
        image: order.image || ""
      }));
    return send(res, 200, { orders });
  }

  if (url.pathname === "/api/members/register" && req.method === "POST") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim() || email.split("@")[0] || "회원";
    const phone = String(body.phone || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 4) {
      return sendError(res, 400, "이메일과 4자리 이상 비밀번호를 확인해 주세요.");
    }
    if (db.users.some((user) => String(user.email || "").toLowerCase() === email)) {
      return sendError(res, 409, "이미 가입된 이메일입니다.");
    }

    const maxId = db.users
      .filter((user) => /^U\d+$/.test(String(user.id || "")))
      .reduce((max, user) => Math.max(max, Number(String(user.id).slice(1))), 1000);

    const user = {
      id: `U${maxId + 1}`,
      email,
      name,
      phone,
      passwordHash: crypto.createHash("sha256").update(password).digest("hex"),
      role: "USER",
      grade: "GENERAL",
      status: "ACTIVE",
      createdAt: new Date().toISOString()
    };

    db.users.push(user);
    writeDb(db);
    return send(res, 201, { user: safeUser(user) });
  }

  if (url.pathname === "/api/members/login" && req.method === "POST") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const passwordHash = crypto.createHash("sha256").update(String(body.password || "")).digest("hex");
    const user = db.users.find((item) => String(item.email || "").toLowerCase() === email && item.passwordHash === passwordHash);
    if (!user) return sendError(res, 401, "이메일 또는 비밀번호를 확인해 주세요.");
    return send(res, 200, { user: safeUser(user) });
  }

  if (url.pathname === "/api/estimate" && req.method === "POST") {
    const body = await readBody(req);
    return send(res, 200, { estimatedPrice: calculatePrice(body, db.pricing) });
  }

  if (url.pathname === "/api/requests" && req.method === "POST") {
    const body = await readBody(req);
    const required = ["name", "phone", "originCountry", "originAddress", "destinationCountry", "destinationAddress", "itemType", "customsCode"];
    const missing = required.find((field) => !String(body[field] || "").trim());
    if (missing) return sendError(res, 400, "필수 입력 항목을 확인해 주세요.");
    if (Number(body.bagCount || 0) + Number(body.boxCount || 0) < 1) {
      return sendError(res, 400, "가방 또는 박스 수량을 1개 이상 입력해 주세요.");
    }

    const customs = String(body.customsCode || "").trim();
    const request = {
      id: nextRequestId(db.requests),
      userId: body.userId || "GUEST",
      createdAt: new Date().toISOString(),
      serviceType: String(body.serviceType || "상품주문"),
      name: String(body.name || "").trim(),
      phone: String(body.phone || "").trim(),
      originCountry: String(body.originCountry || "").trim(),
      originAddress: String(body.originAddress || "").trim(),
      destinationCountry: String(body.destinationCountry || "").trim(),
      destinationAddress: String(body.destinationAddress || "").trim(),
      bagCount: Number(body.bagCount || 0),
      boxCount: Number(body.boxCount || 0),
      itemType: String(body.itemType || "").trim(),
      productId: Number(body.productId || 0),
      productName: String(body.productName || "").trim(),
      brandName: String(body.brandName || "").trim(),
      option: String(body.option || "").trim(),
      quantity: Math.max(1, Number(body.quantity || body.boxCount || 1)),
      image: String(body.image || "").trim(),
      email: String(body.email || "").trim(),
      postcode: String(body.postcode || "").trim(),
      paymentMethod: String(body.paymentMethod || "무통장입금").trim(),
      customsCode: customs.length > 4 ? `${customs.slice(0, 1)}${"*".repeat(customs.length - 3)}${customs.slice(-2)}` : "****",
      estimatedPrice: Number(body.estimatedPrice || body.orderTotal || 0) || calculatePrice(body, db.pricing),
      confirmedPrice: Number(body.confirmedPrice || body.orderTotal || 0) || null,
      status: "입금대기",
      adminMemo: ""
    };

    db.requests.unshift(request);
    writeDb(db);
    return send(res, 201, request);
  }

  if (url.pathname === "/api/cart" && req.method === "GET") {
    const ownerId = normalizeCartOwner(url.searchParams.get("ownerId") || url.searchParams.get("clientId") || "");
    if (!ownerId) return sendError(res, 400, "장바구니 식별값이 필요합니다.");
    const cart = findCartRecord(db, ownerId);
    return send(res, 200, {
      ownerId,
      items: cart?.items || [],
      updatedAt: cart?.updatedAt || null
    });
  }

  if (url.pathname === "/api/cart" && (req.method === "PUT" || req.method === "POST")) {
    const body = await readBody(req);
    const ownerId = normalizeCartOwner(body.ownerId || body.clientId || "");
    if (!ownerId) return sendError(res, 400, "장바구니 식별값이 필요합니다.");
    const cart = upsertCartRecord(db, ownerId, body.items || []);
    writeDb(db);
    return send(res, 200, cart);
  }

  if (url.pathname === "/api/cart/clear" && req.method === "POST") {
    const body = await readBody(req);
    const ownerId = normalizeCartOwner(body.ownerId || body.clientId || "");
    if (!ownerId) return sendError(res, 400, "장바구니 식별값이 필요합니다.");
    const cart = upsertCartRecord(db, ownerId, []);
    writeDb(db);
    return send(res, 200, cart);
  }

  if (url.pathname === "/api/wishlist" && req.method === "GET") {
    const ownerId = normalizeCartOwner(url.searchParams.get("ownerId") || url.searchParams.get("clientId") || "");
    if (!ownerId) return sendError(res, 400, "찜하기 식별값이 필요합니다.");
    const wishlist = findWishlistRecord(db, ownerId);
    return send(res, 200, {
      ownerId,
      items: wishlist?.items || [],
      updatedAt: wishlist?.updatedAt || null
    });
  }

  if (url.pathname === "/api/wishlist" && (req.method === "PUT" || req.method === "POST")) {
    const body = await readBody(req);
    const ownerId = normalizeCartOwner(body.ownerId || body.clientId || "");
    if (!ownerId) return sendError(res, 400, "찜하기 식별값이 필요합니다.");
    const wishlist = upsertWishlistRecord(db, ownerId, body.items || []);
    writeDb(db);
    return send(res, 200, wishlist);
  }

  if (url.pathname === "/api/wishlist/clear" && req.method === "POST") {
    const body = await readBody(req);
    const ownerId = normalizeCartOwner(body.ownerId || body.clientId || "");
    if (!ownerId) return sendError(res, 400, "찜하기 식별값이 필요합니다.");
    const wishlist = upsertWishlistRecord(db, ownerId, []);
    writeDb(db);
    return send(res, 200, wishlist);
  }

  if (url.pathname === "/api/admin/login" && req.method === "POST") {
    const body = await readBody(req);
    const emailMatches = secureTextEqual(String(body.email || "").trim().toLowerCase(), ADMIN_EMAIL.toLowerCase());
    const passwordMatches = secureTextEqual(String(body.password || ""), ADMIN_PASSWORD);
    if (!emailMatches || !passwordMatches) {
      return sendError(res, 401, "관리자 이메일 또는 비밀번호를 확인해 주세요.");
    }
    const token = createAdminToken();
    return send(res, 200, {
      token,
      expiresInHours: ADMIN_SESSION_TTL_HOURS,
      concurrentLogin: true,
      user: { name: "윤슬마켓 관리자", role: "ADMIN", email: ADMIN_EMAIL }
    });
  }

  if (!url.pathname.startsWith("/api/admin/")) {
    return sendError(res, 404, "API를 찾을 수 없습니다.");
  }

  if (!isAdmin(req)) {
    return sendError(res, 401, "관리자 로그인이 필요합니다.");
  }

  if (url.pathname === "/api/admin/uploads" && req.method === "POST") {
    const { fields, files } = await readMultipartFiles(req);
    const kind = String(fields.kind || "product").trim().toLowerCase();
    const validFiles = files.filter((file) => String(file.mimeType || "").startsWith("image/") && file.buffer.length);
    if (!validFiles.length) {
      return sendError(res, 400, "???? ??? ??? ??? ???.");
    }

    const uploaded = [];
    for (const file of validFiles) {
      const saved = await optimizeAndStoreImageBuffer(file.buffer, {
        fileName: file.originalName,
        folder: "products"
      });
      uploaded.push({
        kind,
        originalName: file.originalName,
        originalSize: file.buffer.length,
        optimizedSize: saved.size,
        width: saved.width,
        height: saved.height,
        format: saved.format,
        url: saved.url
      });
    }

    return send(res, 201, { files: uploaded });
  }

  if (url.pathname === "/api/admin/dashboard" && req.method === "GET") {
    const byStatus = Object.fromEntries(
      allowedStatuses.map((status) => [status, db.requests.filter((item) => item.status === status).length])
    );

    return send(res, 200, {
      requests: db.requests,
      users: db.users.map(safeUser),
      inquiries: db.inquiries,
      brands: db.brands,
      categories: db.categories,
      products: db.products,
      siteSettings: db.siteSettings || {},
      stats: {
        total: db.requests.length,
        active: db.requests.filter((item) => !["배송완료", "취소/반품"].includes(item.status)).length,
        estimatedRevenue: db.requests.reduce((sum, item) => sum + Number(item.confirmedPrice || item.estimatedPrice || 0), 0),
        byStatus
      }
    });
  }


  if (url.pathname === "/api/admin/site-settings" && req.method === "PUT") {
    const body = await readBody(req);
    const allowedKeys = ["designBanners", "inquiryChannels", "paymentMethods", "promotions", "reviews"];
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(body, key)) db.siteSettings[key] = body[key];
    }
    db.siteSettings.updatedAt = new Date().toISOString();
    writeDb(db);
    return send(res, 200, db.siteSettings);
  }

  if (url.pathname === "/api/admin/brands" && req.method === "POST") {
    const body = await readBody(req);
    const koName = String(body.koName || "").trim();
    const enName = String(body.enName || "").trim().toUpperCase();
    if (!koName || !enName) return sendError(res, 400, "브랜드 국문명과 영문명을 입력해 주세요.");

    const brand = {
      id: db.brands.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1,
      koName,
      enName,
      featured: Boolean(body.featured),
      order: Math.max(1, Number(body.order || db.brands.length + 1))
    };
    db.brands.push(brand);
    writeDb(db);
    return send(res, 201, brand);
  }

  if (url.pathname === "/api/admin/brands/order" && req.method === "PUT") {
    const body = await readBody(req);
    if (!Array.isArray(body.items) || body.items.length !== db.brands.length) {
      return sendError(res, 400, "전체 브랜드 순서 정보가 필요합니다.");
    }
    const ids = body.items.map((item) => Number(item.id));
    if (new Set(ids).size !== ids.length || !db.brands.every((brand) => ids.includes(Number(brand.id)))) {
      return sendError(res, 400, "브랜드 순서 데이터가 올바르지 않습니다.");
    }
    body.items.forEach((entry, index) => {
      const brand = db.brands.find((item) => Number(item.id) === Number(entry.id));
      if (brand) brand.order = index + 1;
    });
    writeDb(db);
    return send(res, 200, { brands: [...db.brands].sort((a, b) => Number(a.order) - Number(b.order)) });
  }

  const brandMatch = url.pathname.match(/^\/api\/admin\/brands\/(\d+)$/);
  if (brandMatch && req.method === "PUT") {
    const brand = db.brands.find((item) => Number(item.id) === Number(brandMatch[1]));
    if (!brand) return sendError(res, 404, "브랜드를 찾을 수 없습니다.");
    const body = await readBody(req);
    Object.assign(brand, {
      koName: String(body.koName || brand.koName).trim(),
      enName: String(body.enName || brand.enName).trim().toUpperCase(),
      featured: body.featured === undefined ? brand.featured : Boolean(body.featured),
      order: body.order === undefined ? brand.order : Math.max(1, Number(body.order || brand.order))
    });
    writeDb(db);
    return send(res, 200, brand);
  }

  if (brandMatch && req.method === "DELETE") {
    const brandId = Number(brandMatch[1]);
    if (db.products.some((product) => Number(product.brandId) === brandId)) {
      return sendError(res, 409, "등록된 상품이 있는 브랜드는 삭제할 수 없습니다.");
    }
    db.brands = db.brands.filter((item) => Number(item.id) !== brandId);
    writeDb(db);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/admin/categories" && req.method === "POST") {
    const body = await readBody(req);
    const brandId = Number(body.brandId);
    const name = String(body.name || "").trim();
    if (!db.brands.some((brand) => Number(brand.id) === brandId)) {
      return sendError(res, 400, "등록된 브랜드를 선택해 주세요.");
    }
    if (!name) return sendError(res, 400, "카테고리명을 입력해 주세요.");

    let group = db.categories.find((item) => Number(item.brandId) === brandId);
    if (!group) {
      group = { brandId, items: [] };
      db.categories.push(group);
    }
    if (group.items.some((item) => String(item.name).toLowerCase() === name.toLowerCase())) {
      return sendError(res, 409, "이미 등록된 카테고리입니다.");
    }
    const maxId = db.categories.flatMap((item) => item.items || []).reduce((max, item) => Math.max(max, Number(item.id || 0)), 0);
    const category = { id: maxId + 1, name };
    group.items.push(category);
    writeDb(db);
    return send(res, 201, category);
  }

  const categoryMatch = url.pathname.match(/^\/api\/admin\/categories\/(\d+)$/);
  if (categoryMatch && req.method === "PUT") {
    const categoryId = Number(categoryMatch[1]);
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    const group = db.categories.find((entry) => (entry.items || []).some((item) => Number(item.id) === categoryId));
    const category = group?.items?.find((item) => Number(item.id) === categoryId);
    if (!category) return sendError(res, 404, "카테고리를 찾을 수 없습니다.");
    if (!name) return sendError(res, 400, "카테고리명을 입력해 주세요.");
    if (group.items.some((item) => Number(item.id) !== categoryId && String(item.name).toLowerCase() === name.toLowerCase())) {
      return sendError(res, 409, "이미 등록된 카테고리입니다.");
    }
    category.name = name;
    writeDb(db);
    return send(res, 200, category);
  }

  if (categoryMatch && req.method === "DELETE") {
    const categoryId = Number(categoryMatch[1]);
    if (db.products.some((product) => Number(product.categoryId) === categoryId)) {
      return sendError(res, 409, "등록된 상품이 있는 카테고리는 삭제할 수 없습니다.");
    }
    let found = false;
    db.categories.forEach((group) => {
      const before = (group.items || []).length;
      group.items = (group.items || []).filter((item) => Number(item.id) !== categoryId);
      if (before !== group.items.length) found = true;
    });
    if (!found) return sendError(res, 404, "카테고리를 찾을 수 없습니다.");
    writeDb(db);
    return send(res, 200, { ok: true });
  }

  if (url.pathname === "/api/admin/products" && req.method === "POST") {
    const body = await readBody(req);
    const brandId = Number(body.brandId);
    const categoryId = Number(body.categoryId);
    const name = String(body.name || "").trim();
    const price = Number(body.price || 0);

    if (!db.brands.some((brand) => Number(brand.id) === brandId)) {
      return sendError(res, 400, "브랜드를 선택해 주세요.");
    }
    const categoryGroup = db.categories.find((group) => Number(group.brandId) === brandId);
    if (!categoryGroup?.items?.some((category) => Number(category.id) === categoryId)) {
      return sendError(res, 400, "해당 브랜드에 맞는 카테고리를 선택해 주세요.");
    }
    if (!name || !price) return sendError(res, 400, "상품명과 판매가를 입력해 주세요.");

    const normalizedImages = normalizeProductImages(body.images, body.image, name);
    if (!normalizedImages.image) {
      return sendError(res, 400, "대표 이미지를 한 장 이상 등록해 주세요.");
    }

    const options = normalizeOptions(body.options);
    const singleProduct = parseBoolean(body.singleProduct, options.length === 0) || options.length === 0;

    const product = {
      id: db.products.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0) + 1,
      brandId,
      categoryId,
      name,
      description: String(body.description || body.name || "").trim(),
      price,
      oldPrice: Number(body.oldPrice || body.price || 0),
      image: normalizedImages.image,
      images: normalizedImages.images,
      singleProduct,
      options,
      status: String(body.status || "판매중"),
      score: body.score || { realtime: 0, weekly: 0, monthly: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.products.push(product);
    writeDb(db);
    return send(res, 201, product);
  }

  const productMatch = url.pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (productMatch && req.method === "PUT") {
    const product = db.products.find((item) => Number(item.id) === Number(productMatch[1]));
    if (!product) return sendError(res, 404, "상품을 찾을 수 없습니다.");

    const body = await readBody(req);
    const brandId = Number(body.brandId);
    const categoryId = Number(body.categoryId);
    const name = String(body.name || "").trim();
    const price = Number(body.price || 0);

    if (!db.brands.some((brand) => Number(brand.id) === brandId)) {
      return sendError(res, 400, "브랜드를 선택해 주세요.");
    }
    const categoryGroup = db.categories.find((group) => Number(group.brandId) === brandId);
    if (!categoryGroup?.items?.some((category) => Number(category.id) === categoryId)) {
      return sendError(res, 400, "해당 브랜드에 맞는 카테고리를 선택해 주세요.");
    }
    if (!name || !price) return sendError(res, 400, "상품명과 판매가를 입력해 주세요.");

    const normalizedImages = normalizeProductImages(body.images, body.image || product.image, name);
    if (!normalizedImages.image) {
      return sendError(res, 400, "대표 이미지를 한 장 이상 등록해 주세요.");
    }

    const options = normalizeOptions(body.options);
    const singleProduct = parseBoolean(body.singleProduct, options.length === 0) || options.length === 0;

    Object.assign(product, {
      brandId,
      categoryId,
      name,
      description: String(body.description || body.name || "").trim(),
      price,
      oldPrice: Number(body.oldPrice || body.price || 0),
      image: normalizedImages.image,
      images: normalizedImages.images,
      singleProduct,
      options,
      status: String(body.status || product.status || "판매중"),
      updatedAt: new Date().toISOString()
    });

    writeDb(db);
    return send(res, 200, product);
  }

  if (productMatch && req.method === "DELETE") {
    const productId = Number(productMatch[1]);
    const before = db.products.length;
    db.products = db.products.filter((item) => Number(item.id) !== productId);
    if (db.products.length === before) return sendError(res, 404, "상품을 찾을 수 없습니다.");
    writeDb(db);
    return send(res, 200, { ok: true });
  }

  const requestMatch = url.pathname.match(/^\/api\/admin\/requests\/([^/]+)$/);
  if (requestMatch && req.method === "PUT") {
    const body = await readBody(req);
    const item = db.requests.find((entry) => entry.id === decodeURIComponent(requestMatch[1]));
    if (!item) return sendError(res, 404, "주문/신청 건을 찾을 수 없습니다.");
    if (body.status && !allowedStatuses.includes(body.status)) {
      return sendError(res, 400, "지원하지 않는 상태값입니다.");
    }
    if (body.status) item.status = body.status;
    if (body.confirmedPrice !== undefined) item.confirmedPrice = Number(body.confirmedPrice) || null;
    if (body.adminMemo !== undefined) item.adminMemo = String(body.adminMemo || "");
    item.updatedAt = new Date().toISOString();
    writeDb(db);
    return send(res, 200, item);
  }

  return sendError(res, 404, "API를 찾을 수 없습니다.");
}

function resolveRoute(pathname) {
  const routes = {
    "/": "/index.html",
    "/apply": "/apply.html",
    "/admin": "/admin.html",
    "/join": "/join.html",
    "/detail": "/detail.html",
    "/checkout": "/checkout.html",
    "/cart": "/cart.html",
    "/mypage": "/mypage.html",
    "/about": "/about.html",
    "/legal": "/legal.html"
  };
  return routes[pathname] || pathname;
}

function serveStatic(req, res, url) {
  if (url.pathname.startsWith("/uploads/")) {
    const uploadFilePath = path.normalize(path.join(UPLOAD_DIR, url.pathname.replace(/^\/uploads\/?/, "")));
    if (!uploadFilePath.startsWith(UPLOAD_DIR)) {
      return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    }

    return fs.readFile(uploadFilePath, (error, data) => {
      if (error) {
        return send(res, 404, "파일을 찾을 수 없습니다.", "text/plain; charset=utf-8");
      }
      const ext = path.extname(uploadFilePath).toLowerCase();
      const type = mimeTypes[ext] || "application/octet-stream";
      send(res, 200, data, type, { "Cache-Control": "public, max-age=86400, immutable" });
    });
  }

  const target = resolveRoute(url.pathname);
  const safeTarget = target === "/" ? "/index.html" : target;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safeTarget.replace(/^\/+/, "")));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      return send(res, 404, "페이지를 찾을 수 없습니다.", "text/plain; charset=utf-8");
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes[ext] || "application/octet-stream";
    const isHtml = ext === ".html";
    const isUiAsset = [".js", ".css", ".json"].includes(ext);
    send(
      res,
      200,
      data,
      type,
      isHtml || isUiAsset ? {} : { "Cache-Control": "public, max-age=86400, immutable" }
    );
  });
}

ensureRuntime();

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

    if (req.method === "OPTIONS") {
      return send(res, 204, "", "text/plain; charset=utf-8", {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }

    return serveStatic(req, res, url);
  } catch (error) {
    console.error("[SERVER_ERROR]", error);
    return send(res, 500, { error: error.message || "서버 오류가 발생했습니다." });
  }
}).listen(PORT, HOST, () => {
  console.log(`[YOONSEUL] ${NODE_ENV} server running at http://${HOST}:${PORT}`);
  console.log(`[YOONSEUL] admin login: ${ADMIN_EMAIL}`);
});
