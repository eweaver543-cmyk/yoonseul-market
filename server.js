const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Busboy = require("busboy");
const sharp = require("sharp");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";
const SITE_URL = String(process.env.SITE_URL || "https://yoonseulmarket.com").replace(/\/+$/, "");
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const ADMIN_SESSION_SECRET = String(process.env.ADMIN_SESSION_SECRET || "");
const ADMIN_SESSION_TTL_HOURS = Number(process.env.ADMIN_SESSION_TTL_HOURS || 24);
const ADMIN_SESSION_TTL_MS = Math.max(1, ADMIN_SESSION_TTL_HOURS) * 60 * 60 * 1000;
const MAX_BODY_MB = Number(process.env.MAX_BODY_MB || 80);
const MAX_BODY_SIZE = Math.max(5, MAX_BODY_MB) * 1024 * 1024;
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 20);
const MAX_UPLOAD_SIZE = Math.max(5, MAX_UPLOAD_MB) * 1024 * 1024;
const IMAGE_MAX_WIDTH = Number(process.env.IMAGE_MAX_WIDTH || 1800);
const IMAGE_WEBP_QUALITY = Number(process.env.IMAGE_WEBP_QUALITY || 82);
const IMAGE_THUMB_WIDTH = Number(process.env.IMAGE_THUMB_WIDTH || 720);
const IMAGE_THUMB_QUALITY = Number(process.env.IMAGE_THUMB_QUALITY || 74);
const MAX_IMAGE_PIXELS = Number(process.env.MAX_IMAGE_PIXELS || 40000000);
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_SESSION_SECRET.length < 32) {
  throw new Error("ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_SESSION_SECRET(32자 이상) 환경변수를 설정해 주세요.");
}

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const CUSTOMS_KEY_PATH = path.join(DATA_DIR, ".customs-data-key");
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(PUBLIC_DIR, "uploads");
const PRODUCT_UPLOAD_DIR = path.join(UPLOAD_DIR, "products");
const PRODUCT_THUMBNAIL_DIR = path.join(UPLOAD_DIR, "thumbnails");
const thumbnailTasks = new Map();
let customsDataKey = null;
let memoryDbCache = null;
let memoryDbMtimeMs = 0;

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

function getCustomsDataKey() {
  if (customsDataKey) return customsDataKey;
  ensureDir(DATA_DIR);

  if (!fs.existsSync(CUSTOMS_KEY_PATH)) {
    try {
      fs.writeFileSync(CUSTOMS_KEY_PATH, crypto.randomBytes(32).toString("base64url"), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx"
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }

  const storedKey = String(fs.readFileSync(CUSTOMS_KEY_PATH, "utf8") || "").trim();
  if (!storedKey) throw new Error("개인통관고유부호 암호화 키를 불러올 수 없습니다.");
  customsDataKey = crypto.createHash("sha256").update(storedKey).digest();
  return customsDataKey;
}

function maskCustomsCode(value) {
  const normalized = String(value || "").toUpperCase().replace(/[\s-]/g, "");
  return normalized.length > 4
    ? `${normalized.slice(0, 1)}${"*".repeat(normalized.length - 3)}${normalized.slice(-2)}`
    : "****";
}

function encryptCustomsCode(value) {
  const normalized = String(value || "").toUpperCase().replace(/[\s-]/g, "");
  if (!normalized) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getCustomsDataKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptCustomsCode(value) {
  try {
    const [version, iv, tag, encrypted] = String(value || "").split(".");
    if (version !== "v1" || !iv || !tag || !encrypted) return "";
    const decipher = crypto.createDecipheriv("aes-256-gcm", getCustomsDataKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function adminRequestView(item) {
  const { customsCodeEncrypted, ...visible } = item;
  const decryptedCustomsCode = decryptCustomsCode(customsCodeEncrypted);
  return {
    ...visible,
    customsCode: decryptedCustomsCode || visible.customsCode || "-",
    customsCodeAvailable: Boolean(decryptedCustomsCode)
  };
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
  ensureDir(PRODUCT_THUMBNAIL_DIR);
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
  db.siteSettings.designBanners = (Array.isArray(db.siteSettings.designBanners) ? db.siteSettings.designBanners : [])
    .map((item) => ({ ...item, active: parseBoolean(item.active, false) }));
  db.siteSettings.promotions = (Array.isArray(db.siteSettings.promotions) ? db.siteSettings.promotions : [])
    .map(normalizePromotion);
  return db;
}

function readDb() {
  ensureRuntime();
  const fileStat = fs.statSync(DB_PATH);
  if (memoryDbCache && memoryDbMtimeMs === fileStat.mtimeMs) return memoryDbCache;
  const db = normalizeDbShape(JSON.parse(fs.readFileSync(DB_PATH, "utf8")));
  if (migrateLegacyProductImages(db)) {
    writeDb(db);
    return memoryDbCache;
  }
  memoryDbCache = db;
  memoryDbMtimeMs = fileStat.mtimeMs;
  return db;
}

function writeDb(db) {
  ensureRuntime();
  const next = normalizeDbShape(db);
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tempPath, DB_PATH);
  memoryDbCache = next;
  memoryDbMtimeMs = fs.statSync(DB_PATH).mtimeMs;
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

function escapeHtmlAttribute(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function escapeXml(value = "") {
  return escapeHtmlAttribute(value);
}

function productPublicPath(product) {
  return `/product/${Number(product?.id || 0)}/${encodeURIComponent(slugify(product?.name || "product"))}`;
}

function absoluteSiteUrl(value = "/") {
  try {
    return new URL(String(value || "/"), `${SITE_URL}/`).href;
  } catch {
    return `${SITE_URL}/`;
  }
}

function productPublicImages(product) {
  const mainImages = Array.isArray(product?.images?.main) ? product.images.main : [];
  return [...new Set([...mainImages, product?.image].map((item) => String(item || "").trim()).filter(Boolean))];
}

function productSeoDescription(product, brand) {
  const rawDescription = String(product?.description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = `${brand?.koName || brand?.enName || "윤슬마켓"} ${product?.name || "상품"}의 가격, 옵션과 상세 이미지를 확인해 보세요.`;
  return (rawDescription || fallback).slice(0, 160);
}

function productStructuredData(db, product, brand, description, canonicalUrl, imageUrls) {
  const availability = String(product?.status || "") === "품절"
    ? "https://schema.org/OutOfStock"
    : "https://schema.org/InStock";
  const publishedReviews = (db?.siteSettings?.reviews || []).filter((review) => {
    const rating = Number(review?.rating || 0);
    return Number(review?.productId || 0) === Number(product?.id || 0)
      && String(review?.status || "published") !== "hidden"
      && rating >= 1
      && rating <= 5
      && String(review?.content || "").trim();
  });
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: String(product?.name || "윤슬마켓 상품"),
    description,
    sku: `YS-P${Number(product?.id || 0)}`,
    url: canonicalUrl,
    brand: {
      "@type": "Brand",
      name: String(brand?.koName || brand?.enName || "윤슬마켓")
    },
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "KRW",
      price: Number(product?.price || 0),
      availability,
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: "KR"
        },
        shippingRate: {
          "@type": "MonetaryAmount",
          value: 0,
          currency: "KRW"
        },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: 7,
            maxValue: 14,
            unitCode: "DAY"
          }
        }
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "KR",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 7,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnFeesCustomerResponsibility"
      }
    }
  };
  if (imageUrls.length) data.image = imageUrls;
  if (publishedReviews.length) {
    const ratingTotal = publishedReviews.reduce((sum, review) => sum + Number(review.rating), 0);
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number((ratingTotal / publishedReviews.length).toFixed(2)),
      reviewCount: publishedReviews.length,
      bestRating: 5,
      worstRating: 1
    };
    data.review = publishedReviews.map((review) => ({
      "@type": "Review",
      author: {
        "@type": "Person",
        name: String(review.userName || "구매 고객")
      },
      datePublished: String(review.createdAt || "").slice(0, 10) || undefined,
      reviewBody: String(review.content).trim(),
      reviewRating: {
        "@type": "Rating",
        ratingValue: Number(review.rating),
        bestRating: 5,
        worstRating: 1
      }
    }));
  }
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function renderProductDetailHtml(db, product) {
  const template = fs.readFileSync(path.join(PUBLIC_DIR, "detail.html"), "utf8");
  const brand = db.brands.find((item) => Number(item.id) === Number(product.brandId));
  const categoryGroup = db.categories.find((entry) => Number(entry.brandId) === Number(product.brandId));
  const category = categoryGroup?.items?.find((item) => Number(item.id) === Number(product.categoryId)) || null;
  const title = `${product.name} | 윤슬마켓`;
  const description = productSeoDescription(product, brand);
  const canonicalUrl = absoluteSiteUrl(productPublicPath(product));
  const imageUrls = productPublicImages(product).map(absoluteSiteUrl);
  const representativeImage = imageUrls[0] || absoluteSiteUrl("/images/product-placeholder.svg");
  const structuredData = productStructuredData(db, product, brand, description, canonicalUrl, imageUrls);
  const bootstrapData = JSON.stringify({ product, brand: brand || null, category }).replace(/</g, "\\u003c");
  const primarySource = productPrimarySource(product);
  const primaryPreview = String(primarySource || "").startsWith("/uploads/")
    ? `/thumbnail?src=${encodeURIComponent(primarySource)}`
    : primarySource;
  const firstDetailSource = Array.isArray(product.images?.detail) ? product.images.detail.find(Boolean) : "";
  const firstDetailPreview = String(firstDetailSource || "").startsWith("/uploads/")
    ? `/thumbnail?src=${encodeURIComponent(firstDetailSource)}`
    : firstDetailSource;
  const seoMarkup = `
  <meta name="description" content="${escapeHtmlAttribute(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="윤슬마켓">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="${escapeHtmlAttribute(title)}">
  <meta property="og:description" content="${escapeHtmlAttribute(description)}">
  <meta property="og:url" content="${escapeHtmlAttribute(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtmlAttribute(representativeImage)}">
  <meta property="product:price:amount" content="${Number(product.price || 0)}">
  <meta property="product:price:currency" content="KRW">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtmlAttribute(title)}">
  <meta name="twitter:description" content="${escapeHtmlAttribute(description)}">
  <meta name="twitter:image" content="${escapeHtmlAttribute(representativeImage)}">
  ${primaryPreview ? `<link rel="preload" as="image" href="${escapeHtmlAttribute(primaryPreview)}" fetchpriority="high">` : ""}
  ${firstDetailPreview ? `<link rel="preload" as="image" href="${escapeHtmlAttribute(firstDetailPreview)}">` : ""}
  <script>window.YOONSEUL_PRODUCT_ID=${Number(product.id)};window.YOONSEUL_PRODUCT_BOOTSTRAP=${bootstrapData};</script>
  <script type="application/ld+json">${structuredData}</script>`;
  return template
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtmlAttribute(title)}</title>`)
    .replace("</head>", `${seoMarkup}\n</head>`);
}

function sitemapXml(db) {
  const staticPages = [
    { path: "/", priority: "1.0", frequency: "daily" },
    { path: "/about", priority: "0.6", frequency: "monthly" },
    { path: "/legal", priority: "0.3", frequency: "yearly" }
  ];
  const products = db.products.filter((product) => !["삭제", "판매중지"].includes(String(product.status || "")));
  const urls = [
    ...staticPages.map((page) => ({
      loc: absoluteSiteUrl(page.path),
      changefreq: page.frequency,
      priority: page.priority
    })),
    ...products.map((product) => ({
      loc: absoluteSiteUrl(productPublicPath(product)),
      lastmod: String(product.updatedAt || product.createdAt || "").slice(0, 10),
      changefreq: "weekly",
      priority: "0.8"
    }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>${item.lastmod ? `\n    <lastmod>${escapeXml(item.lastmod)}</lastmod>` : ""}
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
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

function productPrimarySource(product) {
  return product?.images?.main?.[0] || product?.image || "";
}

function thumbnailDescriptor(source) {
  const value = String(source || "");
  if (!value.startsWith("/uploads/")) return null;
  const relative = value.replace(/^\/uploads\//, "");
  const originalPath = path.resolve(UPLOAD_DIR, relative);
  if (!originalPath.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return null;
  const name = `${crypto.createHash("sha256").update(value).digest("hex")}.webp`;
  return { originalPath, thumbnailPath: path.join(PRODUCT_THUMBNAIL_DIR, name), url: `/uploads/thumbnails/${name}` };
}

async function ensureProductThumbnail(source) {
  const descriptor = thumbnailDescriptor(source);
  if (!descriptor || !fs.existsSync(descriptor.originalPath)) return "";
  if (fs.existsSync(descriptor.thumbnailPath)) return descriptor.url;
  if (thumbnailTasks.has(descriptor.thumbnailPath)) return thumbnailTasks.get(descriptor.thumbnailPath);
  const task = (async () => {
    const temporaryPath = `${descriptor.thumbnailPath}.${process.pid}.tmp.webp`;
    try {
      await sharp(descriptor.originalPath, { failOn: "none", limitInputPixels: MAX_IMAGE_PIXELS })
        .rotate()
        .resize({ width: IMAGE_THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: IMAGE_THUMB_QUALITY, effort: 4 })
        .toFile(temporaryPath);
      fs.renameSync(temporaryPath, descriptor.thumbnailPath);
      return descriptor.url;
    } finally {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      thumbnailTasks.delete(descriptor.thumbnailPath);
    }
  })();
  thumbnailTasks.set(descriptor.thumbnailPath, task);
  return task;
}

function productThumbnailStatus(db) {
  const sources = [...new Set((db.products || []).map(productPrimarySource).filter(Boolean))];
  const pending = sources.filter((source) => {
    const descriptor = thumbnailDescriptor(source);
    return descriptor && fs.existsSync(descriptor.originalPath) && !fs.existsSync(descriptor.thumbnailPath);
  });
  return { total: sources.length, completed: sources.length - pending.length, pending };
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

  const processed = sharp(buffer, { failOn: "none", limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: IMAGE_WEBP_QUALITY, effort: 4 });

  const metadata = await processed.metadata();
  await processed.toFile(absoluteFilePath);
  const fileStat = fs.statSync(absoluteFilePath);

  const url = normalizeUploadWebPath(path.posix.join("uploads", folder, finalName));
  const thumbnailUrl = await ensureProductThumbnail(url);
  return {
    url,
    thumbnailUrl,
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
        .slice(0, 400)
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

function normalizePromotion(item = {}) {
  const type = item.type === "event" ? "event" : "coupon";
  const benefitType = ["percent", "amount", "text"].includes(item.benefitType) ? item.benefitType : (type === "event" ? "text" : "percent");
  return {
    id: String(item.id || `promotion-${Date.now()}`).trim(),
    type,
    title: String(item.title || "").trim().slice(0, 80),
    code: type === "coupon" ? String(item.code || "").trim().toUpperCase().slice(0, 30) : "",
    benefitType: type === "event" ? "text" : benefitType,
    benefitValue: type === "event" ? 0 : Math.max(0, Number(item.benefitValue || 0)),
    conditionText: String(item.conditionText || "").trim().slice(0, 120),
    startAt: String(item.startAt || "").trim().slice(0, 10),
    endAt: String(item.endAt || "").trim().slice(0, 10),
    active: parseBoolean(item.active, false),
    description: String(item.description || "").trim().slice(0, 1000)
  };
}

function seoulDateKey(value = new Date()) {
  return new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function isPromotionVisible(item, today = seoulDateKey()) {
  return item.active === true && Boolean(item.title) && (!item.startAt || item.startAt <= today) && (!item.endAt || item.endAt >= today);
}

function normalizeSalesProductName(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function resolveSalesProductId(order, products) {
  const directId = Number(order.productId || 0);
  if (directId && products.some((product) => Number(product.id) === directId)) return directId;
  const orderName = normalizeSalesProductName(order.productName || order.itemType);
  if (!orderName) return 0;
  return Number(products.find((product) => normalizeSalesProductName(product.name) === orderName)?.id || 0);
}

function calculateBestSellerRankings(requests, products, now = Date.now()) {
  const windows = {
    realtime: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000
  };
  const countedStatuses = new Set(["입금완료", "결제완료", "배송준비중", "배송중", "배송완료"]);
  const activeProducts = products.filter((product) => !["삭제", "판매중지"].includes(String(product.status || "")));
  const counters = Object.fromEntries(Object.keys(windows).map((key) => [key, new Map()]));

  for (const order of requests) {
    if (!countedStatuses.has(String(order.status || ""))) continue;
    const soldAt = Date.parse(order.createdAt || "");
    if (!Number.isFinite(soldAt) || soldAt > now) continue;
    const productId = resolveSalesProductId(order, activeProducts);
    if (!productId) continue;
    const quantity = Math.max(1, Number(order.quantity || order.boxCount || 1));

    for (const [period, duration] of Object.entries(windows)) {
      if (now - soldAt > duration) continue;
      const current = counters[period].get(productId) || { productId, units: 0, orderCount: 0, lastSoldAt: "" };
      current.units += quantity;
      current.orderCount += 1;
      if (!current.lastSoldAt || soldAt > Date.parse(current.lastSoldAt)) current.lastSoldAt = new Date(soldAt).toISOString();
      counters[period].set(productId, current);
    }
  }

  return Object.fromEntries(Object.entries(counters).map(([period, counter]) => [period, [...counter.values()]
    .sort((a, b) => b.units - a.units || b.orderCount - a.orderCount || Date.parse(b.lastSoldAt) - Date.parse(a.lastSoldAt) || a.productId - b.productId)
    .slice(0, 8)]));
}

function storefrontProduct(product) {
  const primaryImage = productPrimarySource(product);
  return {
    id: Number(product.id || 0),
    brandId: Number(product.brandId || 0),
    categoryId: Number(product.categoryId || 0),
    name: String(product.name || ""),
    price: Number(product.price || 0),
    oldPrice: Number(product.oldPrice || product.price || 0),
    image: primaryImage,
    status: String(product.status || "판매중"),
    createdAt: product.createdAt || ""
  };
}

function visiblePromotions(db) {
  const today = seoulDateKey();
  const promotions = (db.siteSettings.promotions || [])
    .filter((item) => isPromotionVisible(item, today))
    .sort((a, b) => String(a.endAt || "9999-12-31").localeCompare(String(b.endAt || "9999-12-31")) || String(b.startAt || "").localeCompare(String(a.startAt || "")));
  return { today, promotions };
}

function storefrontPayload(db) {
  const promotionData = visiblePromotions(db);
  return {
    generatedAt: new Date().toISOString(),
    brands: [...db.brands].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    categories: db.categories,
    products: db.products.filter((product) => product.status !== "삭제").map(storefrontProduct),
    periods: { realtime: "최근 24시간", weekly: "최근 7일", monthly: "최근 30일" },
    rankings: calculateBestSellerRankings(db.requests, db.products),
    promotions: promotionData.promotions,
    today: promotionData.today,
    siteSettings: {
      designBanners: db.siteSettings.designBanners || [],
      inquiryChannels: db.siteSettings.inquiryChannels || {}
    }
  };
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

  if (url.pathname === "/api/storefront" && req.method === "GET") {
    return send(res, 200, storefrontPayload(db), "application/json; charset=utf-8", {
      "Cache-Control": "public, max-age=15, stale-while-revalidate=120"
    });
  }

  const publicProductMatch = url.pathname.match(/^\/api\/products\/(\d+)$/);
  if (publicProductMatch && req.method === "GET") {
    const product = db.products.find((item) => Number(item.id) === Number(publicProductMatch[1]) && !["삭제", "판매중지"].includes(String(item.status || "")));
    if (!product) return sendError(res, 404, "상품을 찾을 수 없습니다.");
    const brand = db.brands.find((item) => Number(item.id) === Number(product.brandId)) || null;
    const categoryGroup = db.categories.find((entry) => Number(entry.brandId) === Number(product.brandId));
    const category = categoryGroup?.items?.find((item) => Number(item.id) === Number(product.categoryId)) || null;
    return send(res, 200, { product, brand, category }, "application/json; charset=utf-8", {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=120"
    });
  }

  if (url.pathname === "/api/catalog" && req.method === "GET") {
    return send(res, 200, {
      brands: [...db.brands].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
      categories: db.categories,
      products: db.products.filter((product) => product.status !== "삭제")
    });
  }

  if (url.pathname === "/api/best-sellers" && req.method === "GET") {
    return send(res, 200, {
      generatedAt: new Date().toISOString(),
      periods: { realtime: "최근 24시간", weekly: "최근 7일", monthly: "최근 30일" },
      rankings: calculateBestSellerRankings(db.requests, db.products)
    });
  }

  if (url.pathname === "/api/pricing" && req.method === "GET") {
    return send(res, 200, db.pricing);
  }

  if (url.pathname === "/api/site-settings" && req.method === "GET") {
    return send(res, 200, db.siteSettings || {});
  }

  if (url.pathname === "/api/promotions" && req.method === "GET") {
    return send(res, 200, visiblePromotions(db));
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

  if (url.pathname === "/api/member/reviews" && req.method === "GET") {
    const userId = String(url.searchParams.get("userId") || "").trim();
    const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
    const member = db.users.find((user) =>
      String(user.id || "") === userId && String(user.email || "").trim().toLowerCase() === email
    );
    if (!member) return sendError(res, 404, "회원 정보를 찾을 수 없습니다.");
    const reviews = (db.siteSettings.reviews || []).filter((review) => String(review.userId || "") === userId);
    return send(res, 200, { reviews });
  }

  if (url.pathname === "/api/reviews" && req.method === "POST") {
    const body = await readBody(req);
    const userId = String(body.userId || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const orderId = String(body.orderId || "").trim();
    const content = String(body.content || "").trim();
    const member = db.users.find((user) =>
      String(user.id || "") === userId && String(user.email || "").trim().toLowerCase() === email
    );
    if (!member) return sendError(res, 401, "회원 로그인이 필요합니다.");
    const order = db.requests.find((item) =>
      String(item.id || "") === orderId && String(item.userId || "") === userId &&
      String(item.email || "").trim().toLowerCase() === email
    );
    if (!order || order.status !== "배송완료") {
      return sendError(res, 400, "배송완료된 본인 주문에 대해서만 리뷰를 작성할 수 있습니다.");
    }
    if (!content) return sendError(res, 400, "리뷰 내용을 입력해 주세요.");

    const image = String(body.image || "");
    if (image.length > 7_000_000) return sendError(res, 413, "리뷰 이미지는 5MB 이하로 등록해 주세요.");
    db.siteSettings.reviews ||= [];
    const existingIndex = db.siteSettings.reviews.findIndex((review) =>
      String(review.orderId || "") === orderId && String(review.userId || "") === userId
    );
    const existing = existingIndex >= 0 ? db.siteSettings.reviews[existingIndex] : null;
    const now = new Date().toISOString();
    const review = {
      id: existing?.id || `review-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      orderId,
      productId: Number(order.productId || body.productId || 0),
      userId,
      userName: member.name || member.email || "고객",
      rating: Math.min(5, Math.max(1, Number(body.rating || 5))),
      content,
      image,
      images: image ? [image] : [],
      productName: order.productName || body.productName || order.itemType || "상품 정보",
      option: order.option || body.option || "기본 옵션",
      status: existing?.status || "published",
      replyContent: existing?.replyContent || "",
      repliedAt: existing?.repliedAt || "",
      deliveryCompletedAt: order.updatedAt || order.createdAt,
      isEligibleOrder: true,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    if (existingIndex >= 0) db.siteSettings.reviews[existingIndex] = review;
    else db.siteSettings.reviews.unshift(review);
    db.siteSettings.updatedAt = now;
    writeDb(db);
    return send(res, existing ? 200 : 201, review);
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

    const recipientName = String(body.name || "").trim().replace(/\s+/g, " ");
    const phone = String(body.phone || "").replace(/\D/g, "");
    const customs = String(body.customsCode || "").toUpperCase().replace(/[\s-]/g, "");
    const koreanDestination = ["대한민국", "KR", "KOREA", "SOUTH KOREA"].includes(String(body.destinationCountry || "").trim().toUpperCase());
    const isProductOrder = String(body.serviceType || "").trim() === "상품주문";
    if (isProductOrder && (recipientName.length < 2 || recipientName.length > 50 || !/^[\p{L}\p{M}][\p{L}\p{M}\s.'·-]*[\p{L}\p{M}]$/u.test(recipientName))) {
      return sendError(res, 400, "수취인 성명을 한글 또는 영문으로 정확히 입력해 주세요.");
    }
    if (isProductOrder && !/^P\d{12}$/.test(customs)) {
      return sendError(res, 400, "개인통관고유부호는 P로 시작하는 13자리여야 합니다.");
    }
    if (isProductOrder && koreanDestination && !/^01[016789]\d{7,8}$/.test(phone)) {
      return sendError(res, 400, "관세청에 등록된 국내 휴대전화번호를 확인해 주세요.");
    }
    if (isProductOrder && !koreanDestination && !/^\d{8,15}$/.test(phone)) {
      return sendError(res, 400, "휴대전화번호 형식을 확인해 주세요.");
    }
    if (isProductOrder && body.customsMatchConfirmed !== true) {
      return sendError(res, 400, "통관 정보 일치 확인이 필요합니다.");
    }
    const request = {
      id: nextRequestId(db.requests),
      userId: body.userId || "GUEST",
      createdAt: new Date().toISOString(),
      serviceType: String(body.serviceType || "상품주문"),
      name: recipientName,
      phone,
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
      customsCode: maskCustomsCode(customs),
      customsCodeEncrypted: encryptCustomsCode(customs),
      estimatedPrice: Number(body.estimatedPrice || body.orderTotal || 0) || calculatePrice(body, db.pricing),
      confirmedPrice: Number(body.confirmedPrice || body.orderTotal || 0) || null,
      status: "입금대기",
      adminMemo: ""
    };

    db.requests.unshift(request);
    writeDb(db);
    const { customsCodeEncrypted, ...publicRequest } = request;
    return send(res, 201, publicRequest);
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

  if (url.pathname === "/api/admin/product-thumbnails" && req.method === "GET") {
    const status = productThumbnailStatus(db);
    return send(res, 200, { total: status.total, completed: status.completed, pending: status.pending.length });
  }

  if (url.pathname === "/api/admin/product-thumbnails" && req.method === "POST") {
    const body = await readBody(req);
    const limit = Math.min(10, Math.max(1, Number(body.limit || 5)));
    const before = productThumbnailStatus(db);
    let created = 0;
    let failed = 0;
    for (const source of before.pending.slice(0, limit)) {
      try {
        if (await ensureProductThumbnail(source)) created += 1;
      } catch (error) {
        failed += 1;
        console.error("[THUMBNAIL_ERROR]", source, error.message);
      }
    }
    const after = productThumbnailStatus(db);
    return send(res, 200, { total: after.total, completed: after.completed, pending: after.pending.length, created, failed });
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
        url: saved.url,
        thumbnailUrl: saved.thumbnailUrl
      });
    }

    return send(res, 201, { files: uploaded });
  }

  if (url.pathname === "/api/admin/dashboard" && req.method === "GET") {
    const byStatus = Object.fromEntries(
      allowedStatuses.map((status) => [status, db.requests.filter((item) => item.status === status).length])
    );

    return send(res, 200, {
      requests: db.requests.map(adminRequestView),
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
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      db.siteSettings[key] = key === "designBanners"
        ? (Array.isArray(body[key]) ? body[key] : []).map((item) => ({ ...item, active: parseBoolean(item.active, false) }))
        : key === "promotions"
          ? (Array.isArray(body[key]) ? body[key] : []).map(normalizePromotion)
          : body[key];
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

  if (url.pathname === "/api/admin/categories/reorder" && req.method === "POST") {
    const body = await readBody(req);
    const brandId = Number(body.brandId);
    const categoryIds = Array.isArray(body.categoryIds) ? body.categoryIds.map(Number) : [];
    const group = db.categories.find((item) => Number(item.brandId) === brandId);
    if (!group) return sendError(res, 404, "카테고리 그룹을 찾을 수 없습니다.");
    const currentIds = (group.items || []).map((item) => Number(item.id));
    const isSameSet = categoryIds.length === currentIds.length
      && new Set(categoryIds).size === categoryIds.length
      && categoryIds.every((id) => currentIds.includes(id));
    if (!isSameSet) return sendError(res, 400, "소분류 순서 정보가 올바르지 않습니다.");
    const itemMap = new Map(group.items.map((item) => [Number(item.id), item]));
    group.items = categoryIds.map((id, index) => ({ ...itemMap.get(id), order: index + 1 }));
    writeDb(db);
    return send(res, 200, { ok: true, brandId, items: group.items });
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
    return send(res, 200, adminRequestView(item));
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

async function serveStatic(req, res, url) {
  if (url.pathname === "/thumbnail") {
    const source = String(url.searchParams.get("src") || "");
    try {
      const thumbnailUrl = await ensureProductThumbnail(source);
      const descriptor = thumbnailDescriptor(source);
      if (!thumbnailUrl || !descriptor) return send(res, 404, "썸네일을 찾을 수 없습니다.", "text/plain; charset=utf-8");
      const data = await fs.promises.readFile(descriptor.thumbnailPath);
      return send(res, 200, data, "image/webp", { "Cache-Control": "public, max-age=31536000, immutable" });
    } catch (error) {
      return send(res, 404, "썸네일을 만들 수 없습니다.", "text/plain; charset=utf-8");
    }
  }
  if (url.pathname === "/robots.txt") {
    return send(res, 200, `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${absoluteSiteUrl("/sitemap.xml")}
`, "text/plain; charset=utf-8", { "Cache-Control": "public, max-age=3600" });
  }

  if (url.pathname === "/sitemap.xml") {
    return send(res, 200, sitemapXml(readDb()), "application/xml; charset=utf-8", { "Cache-Control": "public, max-age=300" });
  }

  const productRoute = url.pathname.match(/^\/product\/(\d+)(?:\/[^/]*)?\/?$/);
  const isLegacyProductRoute = ["/detail", "/detail.html"].includes(url.pathname);
  const legacyProductId = isLegacyProductRoute
    ? Number(url.searchParams.get("id") || 0)
    : 0;
  const requestedProductId = Number(productRoute?.[1] || legacyProductId || 0);
  if (productRoute || isLegacyProductRoute) {
    const db = readDb();
    const product = db.products.find((item) => Number(item.id) === requestedProductId && !["삭제", "판매중지"].includes(String(item.status || "")));
    if (!product) {
      return send(res, 404, "상품을 찾을 수 없습니다.", "text/plain; charset=utf-8", { "X-Robots-Tag": "noindex" });
    }
    return send(res, 200, renderProductDetailHtml(db, product), "text/html; charset=utf-8");
  }

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
      send(res, 200, data, type, { "Cache-Control": "public, max-age=31536000, immutable" });
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
    const noindexPages = new Set(["/admin.html", "/join.html", "/mypage.html", "/cart.html", "/checkout.html", "/apply.html"]);
    const extraHeaders = noindexPages.has(safeTarget) ? { "X-Robots-Tag": "noindex, nofollow" } : {};
    const cacheHeaders = isHtml
      ? { "Cache-Control": "public, max-age=60, stale-while-revalidate=300", ...extraHeaders }
      : isUiAsset
        ? { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400", ...extraHeaders }
        : { "Cache-Control": "public, max-age=86400, immutable", ...extraHeaders };
    let responseData = data;
    if (safeTarget === "/index.html") {
      const db = readDb();
      const bootstrap = JSON.stringify(storefrontPayload(db)).replace(/</g, "\\u003c");
      const mobileBrands = [...db.brands]
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        .map((brand) => `<button type="button" data-brand-id="${Number(brand.id)}"><span>${escapeHtmlAttribute(brand.koName)}</span></button>`)
        .join("");
      responseData = data.toString("utf8")
        .replace("</head>", `<script>window.YOONSEUL_STOREFRONT_BOOTSTRAP=${bootstrap};</script></head>`)
        .replace(
          '<nav class="mobile-brand-list" id="mobileBrandDrawerList" aria-label="모바일 브랜드 목록"></nav>',
          `<nav class="mobile-brand-list" id="mobileBrandDrawerList" aria-label="모바일 브랜드 목록">${mobileBrands}</nav>`
        );
    }
    send(
      res,
      200,
      responseData,
      type,
      cacheHeaders
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

    return await serveStatic(req, res, url);
  } catch (error) {
    console.error("[SERVER_ERROR]", error);
    return send(res, 500, { error: error.message || "서버 오류가 발생했습니다." });
  }
}).listen(PORT, HOST, () => {
  console.log(`[YOONSEUL] ${NODE_ENV} server running at http://${HOST}:${PORT}`);
  console.log(`[YOONSEUL] admin login: ${ADMIN_EMAIL}`);
});
