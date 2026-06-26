import fs from "fs";
import path from "path";
import { db } from "../config/Database.js";

const productsUploadRoot = path.join(process.cwd(), "uploads", "products");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function productImagePublicPath(productId, fileName) {
  return `/uploads/products/${productId}/${fileName}`;
}

export async function listProductImages(productId) {
  const [rows] = await db.query(
    `SELECT id, product_id, file_name, image_seq, is_primary
     FROM product_images
     WHERE product_id = ? AND status = 1
     ORDER BY is_primary DESC, image_seq ASC, id ASC`,
    { replacements: [productId] }
  );
  return rows.map((r) => ({
    ...r,
    productid: r.product_id,
    imageseq: r.image_seq,
    image: r.file_name,
    url: productImagePublicPath(r.product_id, r.file_name),
  }));
}

export async function attachPrimaryImagesToProducts(products) {
  if (!products?.length) return products;
  const ids = products.map((p) => p.id).filter(Boolean);
  if (!ids.length) return products;

  const [images] = await db.query(
    `SELECT product_id, file_name, image_seq
     FROM product_images
     WHERE status = 1 AND product_id IN (?)
     ORDER BY is_primary DESC, image_seq ASC, id ASC`,
    { replacements: [ids] }
  );

  const byProduct = {};
  for (const img of images) {
    if (!byProduct[img.product_id]) byProduct[img.product_id] = img;
  }

  return products.map((p) => {
    const img = byProduct[p.id];
    if (!img) return p;
    return {
      ...p,
      image: img.file_name,
      imageseq: img.image_seq,
      image_url: productImagePublicPath(p.id, img.file_name),
    };
  });
}

export async function attachImagesToProductDetail(product) {
  if (!product?.id) return product;
  const images = await listProductImages(product.id);
  return {
    ...product,
    images,
    image: images[0]?.file_name ?? null,
    imageseq: images[0]?.image_seq ?? null,
    image_url: images[0]?.url ?? null,
  };
}

export async function saveProductImage(productId, file, { imageSeq = 1, isPrimary = true } = {}) {
  const dir = path.join(productsUploadRoot, String(productId));
  ensureDir(dir);

  const safeName = `${Date.now()}_${(file.originalname || "image").replace(/[^\w.\-]+/g, "_")}`;
  const dest = path.join(dir, safeName);
  fs.renameSync(file.path, dest);

  if (isPrimary) {
    await db.query(
      `UPDATE product_images SET is_primary = 0 WHERE product_id = ? AND status = 1`,
      { replacements: [productId] }
    );
  }

  const [result] = await db.query(
    `INSERT INTO product_images (product_id, file_name, image_seq, is_primary, status)
     VALUES (?, ?, ?, ?, 1)`,
    { replacements: [productId, safeName, imageSeq, isPrimary ? 1 : 0] }
  );

  return {
    id: result.insertId,
    product_id: productId,
    file_name: safeName,
    image_seq: imageSeq,
    url: productImagePublicPath(productId, safeName),
  };
}

export async function deleteProductImage(productId, imageId) {
  const [[row]] = await db.query(
    `SELECT id, file_name FROM product_images WHERE id = ? AND product_id = ? AND status = 1`,
    { replacements: [imageId, productId] }
  );
  if (!row) return false;

  await db.query(`UPDATE product_images SET status = 0 WHERE id = ?`, {
    replacements: [imageId],
  });

  const filePath = path.join(productsUploadRoot, String(productId), row.file_name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return true;
}
