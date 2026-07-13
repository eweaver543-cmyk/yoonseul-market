(function () {
  const CART_STORAGE_KEY = "yoonseulCartItems";
  const CART_UPDATED_KEY = "yoonseulCartUpdated";
  const CART_CLIENT_KEY = "yoonseulCartClientId";
  const CART_SERVER_SYNC_KEY = "yoonseulCartServerSyncedAt";
  const WISHLIST_STORAGE_KEY = "yoonseulWishlistItems";
  const WISHLIST_UPDATED_KEY = "yoonseulWishlistUpdated";
  const WISHLIST_SERVER_SYNC_KEY = "yoonseulWishlistServerSyncedAt";
  const ORDER_HISTORY_STORAGE_KEY = "yoonseulOrderHistory";
  const ORDER_HISTORY_UPDATED_KEY = "yoonseulOrderHistoryUpdated";
  const MEMBER_STORAGE_KEY = "yoonseulCurrentMember";
  const REVIEW_STORAGE_KEY = "yoonseulReviews";
  const REVIEW_UPDATED_KEY = "yoonseulReviewsUpdated";

  function parseJson(key, fallback) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      return saved == null ? fallback : saved;
    } catch (_) {
      return fallback;
    }
  }

  function emit(channelName, type) {
    const key = channelName === "yoonseul-cart"
      ? CART_UPDATED_KEY
      : channelName === "yoonseul-wishlist"
        ? WISHLIST_UPDATED_KEY
        : channelName === "yoonseul-orders"
          ? ORDER_HISTORY_UPDATED_KEY
          : REVIEW_UPDATED_KEY;
    localStorage.setItem(key, String(Date.now()));
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(channelName);
      channel.postMessage({ type });
      channel.close();
    }
  }

  function getCurrentMember() {
    return parseJson(MEMBER_STORAGE_KEY, null);
  }

  function getCartClientId() {
    let id = localStorage.getItem(CART_CLIENT_KEY);
    if (!id) {
      const random = Math.random().toString(36).slice(2, 10);
      id = `guest-${Date.now()}-${random}`;
      localStorage.setItem(CART_CLIENT_KEY, id);
    }
    return id;
  }

  function getCartOwnerId() {
    const member = getCurrentMember();
    return member?.id || member?.email || getCartClientId();
  }

  function getCart() {
    const items = parseJson(CART_STORAGE_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveCart(items) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    emit("yoonseul-cart", "cart-updated");
    syncCartToServer(items);
    return items;
  }

  function getCartCount() {
    return getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  function addCartItem(item) {
    const items = getCart();
    const match = items.find((entry) =>
      Number(entry.productId) === Number(item.productId) &&
      String(entry.optionLabel || "") === String(item.optionLabel || "")
    );

    if (match) {
      match.quantity = Number(match.quantity || 0) + Number(item.quantity || 1);
    } else {
      items.unshift({
        id: item.id || `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: Number(item.productId),
        brandId: Number(item.brandId || 0),
        brandName: String(item.brandName || ""),
        name: String(item.name || ""),
        price: Number(item.price || 0),
        image: String(item.image || ""),
        optionIndex: item.optionIndex == null ? "" : String(item.optionIndex),
        optionLabel: String(item.optionLabel || "기본 옵션"),
        quantity: Math.max(1, Number(item.quantity || 1)),
        addedAt: new Date().toISOString()
      });
    }

    return saveCart(items);
  }

  function mergeCartItems(localItems, serverItems) {
    const merged = [];
    [...(serverItems || []), ...(localItems || [])].forEach((item) => {
      const key = `${Number(item.productId || 0)}::${String(item.optionLabel || "")}`;
      const existing = merged.find((entry) => `${Number(entry.productId || 0)}::${String(entry.optionLabel || "")}` === key);
      if (existing) {
        existing.quantity = Math.max(Number(existing.quantity || 1), Number(item.quantity || 1));
        existing.addedAt = existing.addedAt || item.addedAt || new Date().toISOString();
      } else {
        merged.push({ ...item });
      }
    });
    return merged;
  }

  async function syncCartToServer(items = getCart()) {
    try {
      const response = await fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: getCartOwnerId(),
          clientId: getCartClientId(),
          items
        })
      });
      if (response.ok) {
        localStorage.setItem(CART_SERVER_SYNC_KEY, new Date().toISOString());
      }
    } catch (_) {
      // 서버 연결이 끊겨도 비회원 장바구니는 localStorage에 그대로 유지합니다.
    }
  }

  async function hydrateCartFromServer() {
    try {
      const ownerId = encodeURIComponent(getCartOwnerId());
      const response = await fetch(`/api/cart?ownerId=${ownerId}`);
      if (!response.ok) return getCart();
      const payload = await response.json();
      const merged = mergeCartItems(getCart(), Array.isArray(payload.items) ? payload.items : []);
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(merged));
      localStorage.setItem(CART_SERVER_SYNC_KEY, new Date().toISOString());
      emit("yoonseul-cart", "cart-updated");
      if (merged.length) syncCartToServer(merged);
      return merged;
    } catch (_) {
      return getCart();
    }
  }

  function updateCartQuantity(id, quantity) {
    const items = getCart();
    const target = items.find((item) => item.id === id);
    if (!target) return items;
    target.quantity = Math.max(1, Number(quantity || 1));
    return saveCart(items);
  }

  function removeCartItem(id) {
    return saveCart(getCart().filter((item) => item.id !== id));
  }

  function clearCart() {
    return saveCart([]);
  }

  function getWishlist() {
    const items = parseJson(WISHLIST_STORAGE_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveWishlist(items) {
    const seen = new Set();
    const normalized = (Array.isArray(items) ? items : []).filter((item) => {
      const productId = Number(item?.productId || 0);
      if (!productId || seen.has(productId)) return false;
      seen.add(productId);
      return true;
    });
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(normalized));
    emit("yoonseul-wishlist", "wishlist-updated");
    syncWishlistToServer(normalized);
    return normalized;
  }

  function isWishlisted(productId) {
    return getWishlist().some((item) => Number(item.productId) === Number(productId));
  }

  function addWishlistItem(item) {
    const items = getWishlist();
    if (items.some((entry) => Number(entry.productId) === Number(item.productId))) return items;
    items.unshift({
      id: item.id || `wish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId: Number(item.productId),
      brandId: Number(item.brandId || 0),
      brandName: String(item.brandName || ""),
      name: String(item.name || ""),
      price: Number(item.price || 0),
      image: String(item.image || ""),
      addedAt: new Date().toISOString()
    });
    return saveWishlist(items);
  }

  function removeWishlistItem(productId) {
    return saveWishlist(getWishlist().filter((item) => Number(item.productId) !== Number(productId)));
  }

  function toggleWishlistItem(item) {
    if (isWishlisted(item.productId)) {
      removeWishlistItem(item.productId);
      return false;
    }
    addWishlistItem(item);
    return true;
  }

  function clearWishlist() {
    return saveWishlist([]);
  }

  function mergeWishlistItems(localItems, serverItems) {
    const seen = new Set();
    return [...(serverItems || []), ...(localItems || [])].filter((item) => {
      const productId = Number(item?.productId || 0);
      if (!productId || seen.has(productId)) return false;
      seen.add(productId);
      return true;
    });
  }

  async function syncWishlistToServer(items = getWishlist()) {
    try {
      const response = await fetch("/api/wishlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: getCartOwnerId(),
          clientId: getCartClientId(),
          items
        })
      });
      if (response.ok) {
        localStorage.setItem(WISHLIST_SERVER_SYNC_KEY, new Date().toISOString());
      }
    } catch (_) {
      // 서버 연결과 무관하게 비회원 찜 목록은 localStorage에 유지됩니다.
    }
  }

  async function hydrateWishlistFromServer() {
    try {
      const ownerId = encodeURIComponent(getCartOwnerId());
      const response = await fetch(`/api/wishlist?ownerId=${ownerId}`);
      if (!response.ok) return getWishlist();
      const payload = await response.json();
      const merged = mergeWishlistItems(getWishlist(), Array.isArray(payload.items) ? payload.items : []);
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(merged));
      localStorage.setItem(WISHLIST_SERVER_SYNC_KEY, new Date().toISOString());
      emit("yoonseul-wishlist", "wishlist-updated");
      if (merged.length) syncWishlistToServer(merged);
      return merged;
    } catch (_) {
      return getWishlist();
    }
  }

  function getOrderHistory() {
    const items = parseJson(ORDER_HISTORY_STORAGE_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveOrderHistory(items) {
    localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(items));
    emit("yoonseul-orders", "orders-updated");
    return items;
  }

  function addOrderHistory(order) {
    const items = getOrderHistory();
    items.unshift({
      id: order.id || `order-${Date.now()}`,
      userId: order.userId || "GUEST",
      email: order.email || "",
      name: order.name || "",
      phone: order.phone || "",
      productId: Number(order.productId || 0),
      productName: order.productName || "",
      brandName: order.brandName || "",
      option: order.option || "기본 옵션",
      quantity: Math.max(1, Number(order.quantity || 1)),
      orderTotal: Number(order.orderTotal || 0),
      paymentMethod: order.paymentMethod || "",
      status: order.status || "주문접수",
      createdAt: order.createdAt || new Date().toISOString(),
      image: order.image || ""
    });
    return saveOrderHistory(items);
  }

  function getMemberOrders(member) {
    if (!member) return [];
    return getOrderHistory().filter((order) => {
      if (member.id && order.userId === member.id) return true;
      if (member.email && order.email === member.email) return true;
      return false;
    });
  }

  function consumeCartItem(id) {
    const items = getCart().filter((item) => item.id !== id);
    return saveCart(items);
  }

  function getReviews() {
    const items = parseJson(REVIEW_STORAGE_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveReviews(items) {
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(items));
    emit("yoonseul-reviews", "reviews-updated");
    return items;
  }

  function getProductReviews(productId) {
    return getReviews()
      .filter((review) => Number(review.productId) === Number(productId) && review.status !== "hidden")
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  function getOrderReview(orderId) {
    return getReviews().find((review) => review.orderId === orderId) || null;
  }

  function upsertReview(review) {
    const items = getReviews();
    const existingIndex = items.findIndex((item) => item.orderId === review.orderId);
    const nextItem = {
      id: review.id || `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      orderId: review.orderId,
      productId: Number(review.productId || 0),
      userId: review.userId || "",
      userName: review.userName || "",
      rating: Math.min(5, Math.max(1, Number(review.rating || 5))),
      content: String(review.content || "").trim(),
      image: review.image || "",
      images: Array.isArray(review.images) ? review.images.filter(Boolean) : (review.image ? [review.image] : []),
      productName: review.productName || "",
      option: review.option || "기본 옵션",
      status: review.status || "published",
      replyContent: String(review.replyContent || "").trim(),
      repliedAt: review.repliedAt || "",
      deliveryCompletedAt: review.deliveryCompletedAt || "",
      isEligibleOrder: review.isEligibleOrder == null ? true : Boolean(review.isEligibleOrder),
      createdAt: review.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      items[existingIndex] = {
        ...items[existingIndex],
        ...nextItem,
        id: items[existingIndex].id,
        createdAt: items[existingIndex].createdAt || nextItem.createdAt
      };
    } else {
      items.unshift(nextItem);
    }

    return saveReviews(items);
  }

  function updateReviewStatus(id, status) {
    const items = getReviews();
    const target = items.find((item) => item.id === id);
    if (!target) return items;
    target.status = status;
    target.updatedAt = new Date().toISOString();
    return saveReviews(items);
  }

  function updateReviewReply(id, replyContent) {
    const items = getReviews();
    const target = items.find((item) => item.id === id);
    if (!target) return items;
    target.replyContent = String(replyContent || "").trim();
    target.repliedAt = target.replyContent ? new Date().toISOString() : "";
    target.updatedAt = new Date().toISOString();
    return saveReviews(items);
  }

  function deleteReview(id) {
    return saveReviews(getReviews().filter((item) => item.id !== id));
  }

  window.YoonseulCart = {
    CART_STORAGE_KEY,
    CART_CLIENT_KEY,
    WISHLIST_STORAGE_KEY,
    ORDER_HISTORY_STORAGE_KEY,
    REVIEW_STORAGE_KEY,
    getCartClientId,
    getCartOwnerId,
    getCurrentMember,
    getCart,
    saveCart,
    getCartCount,
    addCartItem,
    updateCartQuantity,
    removeCartItem,
    clearCart,
    syncCartToServer,
    hydrateCartFromServer,
    getWishlist,
    saveWishlist,
    isWishlisted,
    addWishlistItem,
    removeWishlistItem,
    toggleWishlistItem,
    clearWishlist,
    syncWishlistToServer,
    hydrateWishlistFromServer,
    getOrderHistory,
    saveOrderHistory,
    addOrderHistory,
    getMemberOrders,
    consumeCartItem,
    getReviews,
    saveReviews,
    getProductReviews,
    getOrderReview,
    upsertReview,
    updateReviewStatus,
    updateReviewReply,
    deleteReview
  };

  hydrateCartFromServer();
  hydrateWishlistFromServer();
})();
