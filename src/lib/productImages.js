/** Canonical product image slot keys in display order (slots 1–4). */
export const PRODUCT_IMAGE_SLOT_KEYS = ['image', 'secondaryImage', 'imageThree', 'imageFour'];

export function productImagesFromRecord(product = {}) {
  if (product.images?.length) {
    return [
      product.images[0] || '',
      product.images[1] || '',
      product.images[2] || '',
      product.images[3] || '',
    ];
  }
  return PRODUCT_IMAGE_SLOT_KEYS.map((key) => product[key] || '');
}

export function imagesToPayload(images = []) {
  return {
    image: images[0]?.trim?.() ? images[0].trim() : (images[0] || ''),
    secondaryImage: images[1]?.trim?.() ? images[1].trim() : (images[1] || ''),
    imageThree: images[2]?.trim?.() ? images[2].trim() : (images[2] || ''),
    imageFour: images[3]?.trim?.() ? images[3].trim() : (images[3] || ''),
  };
}

/** Swap adjacent slots (0-based index swaps slot i with i+1). */
export function swapAdjacentImageSlots(images, index) {
  if (index < 0 || index >= images.length - 1) return images;
  const next = [...images];
  [next[index], next[index + 1]] = [next[index + 1], next[index]];
  return next;
}

/** Move a slot to a new position (0-based). */
export function moveImageSlot(images, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return images;
  if (fromIndex >= images.length || toIndex >= images.length) return images;
  const next = [...images];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function applyImagePayloadToProduct(product, payload) {
  const images = PRODUCT_IMAGE_SLOT_KEYS.map((key) => payload[key] || '');
  return {
    ...product,
    ...payload,
    images: images.filter(Boolean),
  };
}
