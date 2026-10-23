import { getCurrentUserId, supabase } from "@/src/lib/supabase";
import {
  ACCOUNT_IMAGE_BUCKET,
  buildAccountImagePath,
  isAccountImagePathOwnedBy,
  validateAccountImage,
} from "@/src/utils/accountImage";

/** Validade das URLs assinadas (bucket privado). */
const SIGNED_URL_SECONDS = 60 * 60;

/** Valida tipo, tamanho e conteúdo antes de qualquer envio. */
export async function checkAccountImageFile(file: File) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return validateAccountImage({ type: file.type, size: file.size, header });
}

/**
 * Envia a imagem para <dono>/<conta>/<novo arquivo>. Nunca sobrescreve: a
 * imagem anterior continua existindo até o cadastro apontar para a nova.
 */
export async function uploadAccountImage(accountId: string, file: File) {
  const validation = await checkAccountImageFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const ownerId = await getCurrentUserId();
  const path = buildAccountImagePath(ownerId, accountId, validation.extension, crypto.randomUUID());
  const { error } = await supabase.storage
    .from(ACCOUNT_IMAGE_BUCKET)
    .upload(path, file, { contentType: validation.type, upsert: false, cacheControl: "3600" });

  if (error) throw new Error(error.message);
  return path;
}

/**
 * Remove arquivos de imagem de contas. Só apaga caminhos da pasta do próprio
 * usuário (e da conta, se informada); qualquer outro caminho é ignorado.
 */
export async function removeAccountImageFiles(paths: (string | null | undefined)[], accountId?: string) {
  const ownerId = await getCurrentUserId();
  const owned = paths.filter((path): path is string => isAccountImagePathOwnedBy(path, ownerId, accountId));
  if (owned.length === 0) return;

  const { error } = await supabase.storage.from(ACCOUNT_IMAGE_BUCKET).remove(owned);
  if (error) throw new Error(error.message);
}

/** URLs temporárias para exibir as imagens do bucket privado. */
export async function createAccountImageUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(ACCOUNT_IMAGE_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error) throw new Error(error.message);

  const urls: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
  }
  return urls;
}
